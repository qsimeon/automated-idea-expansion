/**
 * Sign-In Page
 *
 * Custom sign-in page for NextAuth
 * Users click a button to sign in with GitHub
 */

'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Get callbackUrl from query params (set by middleware)
  const callbackUrl = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('callbackUrl') || '/ideas'
    : '/ideas';

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      console.log('🔐 SignIn: Starting GitHub OAuth with callbackUrl:', callbackUrl);
      // Redirect to GitHub OAuth
      // The callbackUrl comes from middleware (which was triggered when user tried to access protected route)
      const result = await signIn('github', {
        callbackUrl: callbackUrl, // Redirect back to original page after sign-in
        redirect: true, // Ensure redirect happens
      });
      console.log('🔐 SignIn: GitHub OAuth result:', result);
    } catch (error) {
      console.error('❌ Sign-in error:', error);
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '48px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 'bold',
          marginBottom: '16px',
          color: '#111827',
        }}>
          Welcome Back! 👋
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '32px',
        }}>
          Sign in to start expanding your ideas into polished content
        </p>

        <button
          onClick={handleSignIn}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '14px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: 'white',
            backgroundColor: isLoading ? '#9ca3af' : '#24292f',
            border: 'none',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'background-color 0.2s',
          }}
          onMouseOver={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = '#1b1f23';
            }
          }}
          onMouseOut={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = '#24292f';
            }
          }}
        >
          <svg
            height="20"
            width="20"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {isLoading ? 'Signing in...' : 'Sign in with GitHub'}
        </button>

        <p style={{
          marginTop: '24px',
          fontSize: '14px',
          color: '#9ca3af',
        }}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>

        <div style={{
          marginTop: '32px',
          paddingTop: '24px',
          borderTop: '1px solid #e5e7eb',
        }}>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            marginBottom: '8px',
          }}>
            ✨ <strong>5 free expansions</strong> when you sign up
          </p>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
          }}>
            💡 Generate blog posts, code projects, and more
          </p>
        </div>
      </div>
    </div>
  );
}
