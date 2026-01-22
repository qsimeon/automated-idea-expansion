import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/supabase';

/**
 * GET /api/outputs
 * Fetch all outputs for the authenticated user
 *
 * REQUIRES AUTHENTICATION
 */
export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('outputs')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      outputs: data || [],
    });
  } catch (error: any) {
    console.error('GET /api/outputs error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch outputs',
      },
      { status: 500 }
    );
  }
}
