/**
 * NextAuth Configuration
 *
 * Handles user authentication via GitHub OAuth
 *
 * Why GitHub OAuth?
 * 1. Authenticates users (replaces TEST_USER_ID)
 * 2. Captures GitHub access_token for publishing code to user's repos
 * 3. Natural fit for developer-focused product
 *
 * Future: Add Twitter/LinkedIn/Mastodon for social posting
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
        } else {
          // Create new user
          const { data: newUser, error } = await supabaseAdmin
            .from('users')
            .insert({
              // Use GitHub login as temporary clerk_user_id (will remove this field later)
              clerk_user_id: `github_${(profile as any).login || token.email || Date.now()}`,
              email: token.email!,
              name: token.name || (profile as any).login || 'GitHub User',
              timezone: 'UTC',
            })
            .select('id')
            .single();

          if (error || !newUser) {
            console.error('Failed to create user:', error);
            throw new Error('Failed to create user account');
          }

          userId = newUser.id;

          // Create usage tracking record (5 free expansions)
          await supabaseAdmin.from('usage_tracking').insert({
            user_id: userId,
            free_expansions_remaining: 5,
          });
        }

        // Store GitHub token (encrypted)
        if (account.access_token) {
          const encryptedToken = encryptToJSON(account.access_token);

          // Upsert credential (insert or update if exists)
          await supabaseAdmin
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
        }

        // Add userId to token
        token.userId = userId;
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
