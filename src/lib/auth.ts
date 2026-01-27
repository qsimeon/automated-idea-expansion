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

        // CRITICAL: Add userId to token
        token.userId = userId;
        token.sub = userId;
        console.log('✅ JWT callback: Token configured with userId', { userId, email: token.email });
      } else {
        // User ID exists in token - verify it still exists in database
        // This handles the case where:
        // 1. User had old JWT token with userId
        // 2. Database was reset (user was deleted)
        // 3. JWT token still contains the old userId
        // 4. We need to recreate the user
        console.log('🔍 Verifying user still exists in database...', { userId: token.userId });

        const { data: existingUser, error: verifyError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', token.userId as string)
          .maybeSingle();

        if (verifyError) {
          console.error('❌ JWT callback: Error verifying user existence:', verifyError);
          throw new Error(`Failed to verify user: ${verifyError.message}`);
        }

        if (!existingUser) {
          // User was deleted - this is a stale token situation
          // Recreate the user from the email in the token
          console.warn('⚠️  User ID in token not found in database, recreating user...', {
            staleUserId: token.userId,
            email: token.email,
          });

          token.userId = undefined; // Clear the stale userId

          // Fallback to user creation logic by recursing with cleared userId
          // Check if user exists by email
          const { data: userByEmail, error: selectError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', token.email!)
            .single();

          if (selectError && selectError.code !== 'PGRST116') {
            console.error('❌ JWT callback: Error checking user by email:', selectError);
            throw new Error(`Failed to check user: ${selectError.message}`);
          }

          if (userByEmail) {
            // User exists by email - use that account
            token.userId = userByEmail.id;
            console.log('✅ JWT callback: User recreated from email match', {
              userId: token.userId,
              email: token.email
            });
          } else {
            // Create new user
            console.log('📝 Creating new user after stale token:', token.email);

            const { data: newUser, error: createError } = await supabaseAdmin
              .from('users')
              .insert({
                email: token.email!,
                name: token.name || 'GitHub User',
                timezone: 'UTC',
              })
              .select('id')
              .single();

            if (createError || !newUser) {
              console.error('❌ JWT callback: Failed to create user:', {
                error: createError,
                message: createError?.message,
              });
              throw new Error(`Failed to create user: ${createError?.message || 'Unknown error'}`);
            }

            token.userId = newUser.id;
            console.log('✅ JWT callback: New user created after stale token', {
              userId: token.userId,
              email: token.email
            });

            // Ensure usage tracking exists
            const { data: usage } = await supabaseAdmin
              .from('usage_tracking')
              .select('id')
              .eq('user_id', token.userId)
              .single();

            if (!usage) {
              console.warn('⚠️  Usage tracking trigger didn\'t fire, creating manually...');
              const { error: manualUsageError } = await supabaseAdmin
                .from('usage_tracking')
                .insert({
                  user_id: token.userId,
                  free_expansions_remaining: 5,
                });

              if (manualUsageError) {
                console.error('❌ JWT callback: Failed to create usage tracking:', manualUsageError);
                throw new Error(`Failed to create usage tracking: ${manualUsageError.message}`);
              }
            }
          }
        } else {
          console.log('✅ JWT callback: User verified in database', { userId: token.userId });
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
  }
}
