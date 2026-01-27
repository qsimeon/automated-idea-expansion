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
      // On initial sign-in, account and profile are available
      if (account && profile) {
        // Get or create user in database
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', token.email!)
          .single();

        let userId: string;

        if (existingUser) {
          // User exists
          userId = existingUser.id;
          console.log('✅ JWT callback: User already exists', { userId, email: token.email });
        } else {
          // Create new user
          try {
            const { data: newUser, error } = await supabaseAdmin
              .from('users')
              .insert({
                email: token.email!,
                name: token.name || (profile as any).login || 'GitHub User',
                timezone: 'UTC',
              })
              .select('id')
              .single();

            if (error || !newUser) {
              console.error('❌ JWT callback: Failed to create user:', error);
              throw new Error(`Failed to create user account: ${error?.message || 'Unknown error'}`);
            }

            userId = newUser.id;
            console.log('✅ JWT callback: New user created', { userId, email: token.email });

            // Create usage tracking record (5 free expansions)
            const { error: usageError } = await supabaseAdmin.from('usage_tracking').insert({
              user_id: userId,
              free_expansions_remaining: 5,
            });

            if (usageError) {
              console.error('❌ JWT callback: Failed to create usage tracking:', usageError);
              throw new Error(`Failed to create usage tracking: ${usageError.message}`);
            }
            console.log('✅ JWT callback: Usage tracking created');
          } catch (err) {
            console.error('❌ JWT callback error during user creation:', err);
            throw err;
          }
        }

        // Store GitHub token (encrypted)
        if (account.access_token) {
          try {
            const encryptedToken = encryptToJSON(account.access_token);

            // Upsert credential (insert or update if exists)
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
          console.warn('⚠️ JWT callback: No GitHub access token in account object');
        }

        // Add userId to token for session
        token.userId = userId;
        token.sub = userId; // Add standard OpenID Connect 'sub' claim
        console.log('✅ JWT callback: Token created with userId', { userId });
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
