import { createClient } from '@supabase/supabase-js';

// Server-side client with service role key (bypasses RLS)
// Use this ONLY on the server, never on the client
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Client-side Supabase client (respects RLS)
// Use this for user-specific queries
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
