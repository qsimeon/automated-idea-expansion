/**
 * NextAuth API Route Handler
 *
 * This catch-all route handles all NextAuth endpoints:
 * - GET  /api/auth/signin        - Sign-in page
 * - POST /api/auth/signin/:provider  - Initiate OAuth flow
 * - GET  /api/auth/callback/:provider - OAuth callback
 * - GET  /api/auth/signout       - Sign-out page
 * - POST /api/auth/signout       - Sign out
 * - GET  /api/auth/session       - Get current session
 * - GET  /api/auth/csrf          - Get CSRF token
 * - GET  /api/auth/providers     - List available providers
 *
 * Usage:
 * - Client-side: import { signIn, signOut, useSession } from 'next-auth/react'
 * - Server-side: import { getServerSession } from 'next-auth/next'
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Create handler with our auth options
const handler = NextAuth(authOptions);

// Export for App Router (Next.js 13+)
export { handler as GET, handler as POST };
