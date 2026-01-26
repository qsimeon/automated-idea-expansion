/**
 * NextAuth Middleware - Protect routes by redirecting to signin if not authenticated
 *
 * This middleware checks if a user has a valid JWT token before allowing access to
 * protected routes. If no token exists, they're redirected to /auth/signin.
 *
 * Protected routes:
 * - /ideas (manage ideas)
 * - /outputs (view outputs)
 * - /api/ideas (ideas API)
 * - /api/outputs (outputs API)
 * - /api/expand (expansion API)
 * - /api/usage (usage API)
 */

import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// List of protected routes (regex patterns)
const protectedRoutes = [
  /^\/ideas($|\/)/,      // /ideas and /ideas/*
  /^\/outputs($|\/)/,    // /outputs and /outputs/*
  /^\/api\/ideas($|\/)/,
  /^\/api\/outputs($|\/)/,
  /^\/api\/expand($|\/)/,
  /^\/api\/usage($|\/)/,
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if this is a protected route
  const isProtectedRoute = protectedRoutes.some((pattern) => pattern.test(pathname));

  if (!isProtectedRoute) {
    // Not a protected route, allow through
    return NextResponse.next();
  }

  // This is a protected route - check authentication
  // Use getToken to check the NextAuth JWT token
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.sub) {
    // Not authenticated (no valid token) - redirect to signin
    const signInUrl = new URL('/auth/signin', request.url);
    // Keep the original URL so we can redirect back after signin
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Authenticated - allow through
  return NextResponse.next();
}

// Configure which routes trigger middleware
export const config = {
  matcher: [
    // Protected pages
    '/ideas/:path*',
    '/outputs/:path*',
    // Protected API routes
    '/api/ideas/:path*',
    '/api/outputs/:path*',
    '/api/expand/:path*',
    '/api/usage/:path*',
  ],
};
