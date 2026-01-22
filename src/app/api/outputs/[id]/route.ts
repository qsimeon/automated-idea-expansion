import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/supabase';

/**
 * GET /api/outputs/[id]
 * Fetch a single output by ID
 *
 * REQUIRES AUTHENTICATION
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('outputs')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
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
 *
 * REQUIRES AUTHENTICATION
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    console.log(`🗑️  Deleting output: ${id}`);

    // Delete the output
    const { error } = await supabaseAdmin
      .from('outputs')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

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
