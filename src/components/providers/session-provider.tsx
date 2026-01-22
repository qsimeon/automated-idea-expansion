/**
 * Session Provider Wrapper
 *
 * Wraps the app with NextAuth's SessionProvider to make session available throughout the app
 * Must be a Client Component (uses React Context)
 */

'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
