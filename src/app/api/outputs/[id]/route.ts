import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';

// Temporarily use test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/outputs/[id]
 * Fetch a single output by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('outputs')
      .select('*')
      .eq('id', id)
      .eq('user_id', TEST_USER_ID)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          {
            success: false,
            error: 'Output not found',
          },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      output: data,
    });
  } catch (error: any) {
    console.error(`GET /api/outputs/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch output',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/outputs/[id]
 * Delete a specific output
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log(`🗑️  Deleting output: ${id}`);

    // Delete the output
    const { error } = await supabaseAdmin
      .from('outputs')
      .delete()
      .eq('id', id)
      .eq('user_id', TEST_USER_ID);

    if (error) {
      console.error('Error deleting output:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete output',
        },
        { status: 500 }
      );
    }

    console.log(`✅ Output deleted: ${id}`);

    return NextResponse.json({
      success: true,
      message: 'Output deleted successfully',
    });
  } catch (error: any) {
    console.error('Failed to delete output:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete output',
      },
      { status: 500 }
    );
  }
}
