/**
 * NextAuth Configuration
 *
 * Handles user authentication via GitHub OAuth
 *
 * Why GitHub OAuth?
 * 1. Authenticates users
 * 2. Captures GitHub access_token for publishing code to user's repos
 * 3. Natural fit for developer-focused product
 *
 * Setup:
 * 1. Create GitHub OAuth App: https://github.com/settings/developers
 * 2. Set callback URL: http://localhost:3000/api/auth/callback/github
 * 3. Add to .env.local:
 *    GITHUB_CLIENT_ID=your_client_id
 *    GITHUB_CLIENT_SECRET=your_client_secret
 *    NEXTAUTH_SECRET=your_nextauth_secret (generate with: openssl rand -base64 32)
 *    NEXTAUTH_URL=http://localhost:3000
 */

import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { supabaseAdmin } from './db/supabase';
import { encryptToJSON } from './crypto/encryption';
import { getDatabaseVersion } from './db/queries';

/**
 * NextAuth configuration options
 *
 * Providers: GitHub OAuth (primary)
 * Session: JWT-based (no database session storage)
 * Callbacks: Handle user creation, token storage, session management
 */
export const authOptions: NextAuthOptions = {
  // Authentication providers
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      authorization: {
        params: {
          // Request these scopes from GitHub
          scope: 'read:user user:email public_repo', // public_repo for publishing code
        },
      },
    }),
  ],

  // Session strategy (JWT is stateless, no database round-trip)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Secret for signing JWTs (REQUIRED in production)
  secret: process.env.NEXTAUTH_SECRET,

  // Custom pages
  pages: {
    signIn: '/auth/signin',  // Custom sign-in page (create later)
    error: '/auth/error',    // Error page
  },

  // Callbacks customize the auth flow
  callbacks: {
    /**
     * JWT Callback
     *
     * Runs when JWT is created or updated
     * Add custom fields to the token (like userId from database)
     */
    async jwt({ token, account, profile }) {
      console.log('🔐 JWT callback triggered', {
        hasAccount: !!account,
        hasProfile: !!profile,
        email: token.email
      });

      // CRITICAL: Ensure we always have a userId on token
      // This is used by RLS policies to isolate user data
      if (!token.userId) {
        console.log('📋 First time sign-in detected, creating/getting user...');

        // Get or create user in database
        const { data: existingUser, error: selectError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', token.email!)
          .single();

        let userId: string;

        if (selectError && selectError.code !== 'PGRST116') {
          // PGRST116 = no rows found (expected if user doesn't exist)
          console.error('❌ JWT callback: Error checking user existence:', selectError);
          throw new Error(`Failed to check user: ${selectError.message}`);
        }

        if (existingUser) {
          // User already exists
          userId = existingUser.id;
          console.log('✅ JWT callback: User already exists', { userId, email: token.email });
        } else {
          // Create new user (this is required)
          console.log('📝 Creating new user:', token.email);

          const { data: newUser, error: createError } = await supabaseAdmin
            .from('users')
            .insert({
              email: token.email!,
              name: token.name || (profile as any)?.login || 'GitHub User',
              timezone: 'UTC',
            })
            .select('id')
            .single();

          if (createError || !newUser) {
            console.error('❌ JWT callback: Failed to create user:', {
              error: createError,
              message: createError?.message,
              details: createError?.details,
            });
            throw new Error(`Failed to create user: ${createError?.message || 'Unknown error'}`);
          }

          userId = newUser.id;
          console.log('✅ JWT callback: New user created', { userId, email: token.email });

          // IMPORTANT: Trigger should auto-create usage_tracking, but verify it exists
          const { data: usage, error: usageCheckError } = await supabaseAdmin
            .from('usage_tracking')
            .select('id')
            .eq('user_id', userId)
            .single();

          if (!usage) {
            // Trigger didn't work, create it manually
            console.warn('⚠️  Usage tracking trigger didn\'t fire, creating manually...');
            const { error: manualUsageError } = await supabaseAdmin
              .from('usage_tracking')
              .insert({
                user_id: userId,
                free_expansions_remaining: 5,
              });

            if (manualUsageError) {
              console.error('❌ JWT callback: Failed to create usage tracking:', manualUsageError);
              throw new Error(`Failed to create usage tracking: ${manualUsageError.message}`);
            }
          }
          console.log('✅ JWT callback: Usage tracking ensured', { userId });
        }

        // Store GitHub token (encrypted)
        if (account?.access_token) {
          try {
            console.log('🔒 Encrypting and storing GitHub token...');
            const encryptedToken = encryptToJSON(account.access_token);

            const { error: credError } = await supabaseAdmin
              .from('credentials')
              .upsert(
                {
                  user_id: userId,
                  provider: 'github',
                  encrypted_value: encryptedToken,
                  is_active: true,
                  validation_status: 'valid',
                },
                {
                  onConflict: 'user_id,provider',
                }
              );

            if (credError) {
              console.error('❌ JWT callback: Failed to store GitHub token:', credError);
              throw new Error(`Failed to store credentials: ${credError.message}`);
            }
            console.log('✅ JWT callback: GitHub token stored (encrypted)');
          } catch (err) {
            console.error('❌ JWT callback error during token storage:', err);
            throw err;
          }
        } else {
          console.warn('⚠️  No GitHub access token available');
        }

        // CRITICAL: Add userId and database version to token
        // dbVersion is used to detect stale tokens after database resets
        try {
          const dbVersion = await getDatabaseVersion();
          token.dbVersion = dbVersion;
        } catch (error) {
          console.warn('⚠️ Could not get database version, defaulting to 1');
          token.dbVersion = 1;
        }

        token.userId = userId;
        token.sub = userId;
        console.log('✅ JWT callback: Token configured with userId', {
          userId,
          email: token.email,
          dbVersion: token.dbVersion,
        });
      } else {
        // User ID exists in token - verify database hasn't been reset
        // via the database_version epoch system
        try {
          const dbVersion = await getDatabaseVersion();
          const tokenDbVersion = token.dbVersion as number | undefined;

          if (tokenDbVersion !== undefined && tokenDbVersion !== dbVersion) {
            // Database was reset since this token was issued
            // Token is stale - require user to sign in again
            console.warn('⚠️ Stale JWT detected: database was reset', {
              tokenVersion: tokenDbVersion,
              currentVersion: dbVersion,
              userId: token.userId,
            });

            // Clear token to force re-authentication
            return {
              ...token,
              userId: undefined,
              dbVersion: undefined,
            };
          }

          // Token is still valid, keep the database version in token
          token.dbVersion = dbVersion;
          console.log('✅ JWT callback: Token verified with current database version', {
            userId: token.userId,
            dbVersion,
          });
        } catch (error) {
          console.error('❌ JWT callback: Error checking database version:', error);
          // Fail open - allow token to continue (database might be in setup)
          // Log the error but don't break auth
          token.dbVersion = 1;
        }
      }

      return token;
    },

    /**
     * Session Callback
     *
     * Runs whenever session is checked
     * Add custom fields to the session object (available client-side)
     */
    async session({ session, token }) {
      if (session.user) {
        // Add userId to session (available in getServerSession())
        session.user.id = token.userId as string;
      }
      return session;
    },

    /**
     * Sign-in Callback
     *
     * Controls whether user is allowed to sign in
     * Return false to deny access
     */
    async signIn({ user, account, profile }) {
      // Allow all GitHub users (can add restrictions later)
      return true;
    },
  },

  // Event handlers (for logging, analytics, etc.)
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('✅ User signed in:', {
        email: user.email,
        isNewUser,
        provider: account?.provider,
      });
    },
    async signOut({ session, token }) {
      console.log('👋 User signed out:', {
        email: token.email,
      });
    },
  },

  // Enable debug messages in development
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Type augmentation for NextAuth
 *
 * Adds custom fields to JWT and Session types
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;       // Database user ID
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;    // Database user ID
    dbVersion?: number; // Database epoch version (detects stale tokens)
  }
}
