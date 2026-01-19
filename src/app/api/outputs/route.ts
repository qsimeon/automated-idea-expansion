import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';

// Temporarily use test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/outputs
 * Fetch all outputs for the user
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('outputs')
      .select('*')
      .eq('user_id', TEST_USER_ID)
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
