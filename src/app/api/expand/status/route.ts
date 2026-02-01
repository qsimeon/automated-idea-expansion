import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/supabase';

/**
 * GET /api/expand/status?executionId=xxx
 *
 * Check the status of a running expansion
 *
 * Query params:
 * - executionId: The execution ID to check
 *
 * Returns:
 * - status: 'running' | 'completed' | 'failed' | 'partial'
 * - progress: Estimated progress percentage (0-100)
 * - outputId: Only present when status is 'completed'
 * - durationSoFar: Seconds elapsed since start
 */
export async function GET(request: Request) {
  try {
    // 1. CHECK AUTHENTICATION
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

    const userId = session.user.id;

    // 2. GET EXECUTION ID FROM QUERY PARAMS
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get('executionId');

    if (!executionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'executionId is required',
        },
        { status: 400 }
      );
    }

    // 3. FETCH EXECUTION FROM DATABASE
    const { data: execution, error: executionError } = await supabaseAdmin
      .from('executions')
      .select('id, user_id, status, started_at, completed_at, duration_seconds, error_message')
      .eq('id', executionId)
      .single();

    if (executionError || !execution) {
      return NextResponse.json(
        {
          success: false,
          error: 'Execution not found',
        },
        { status: 404 }
      );
    }

    // 4. VERIFY USER OWNS THIS EXECUTION
    if (execution.user_id !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Access denied',
        },
        { status: 403 }
      );
    }

    // 5. CALCULATE PROGRESS
    const now = new Date();
    const startTime = new Date(execution.started_at);
    const durationSoFar = Math.floor((now.getTime() - startTime.getTime()) / 1000);

    let progress = 0;

    if (execution.status === 'running') {
      // Estimate progress based on typical duration
      // Typical expansion takes 60-300 seconds
      // Use a logarithmic curve so progress moves faster initially then slows
      const TYPICAL_DURATION = 180; // 3 minutes average
      const MAX_PROGRESS_WHILE_RUNNING = 95; // Don't show 100% until actually done

      if (durationSoFar < TYPICAL_DURATION) {
        // Linear progression up to typical duration
        progress = Math.floor((durationSoFar / TYPICAL_DURATION) * MAX_PROGRESS_WHILE_RUNNING);
      } else {
        // If taking longer than typical, slowly approach max but never reach it
        const overtime = durationSoFar - TYPICAL_DURATION;
        progress = MAX_PROGRESS_WHILE_RUNNING + Math.floor(Math.min(overtime / 60, 4)); // +1% per minute, max 99%
      }
    } else if (execution.status === 'completed') {
      progress = 100;
    } else if (execution.status === 'failed' || execution.status === 'partial') {
      // For failed/partial, show where it got to
      progress = execution.duration_seconds
        ? Math.min(Math.floor((execution.duration_seconds / 180) * 100), 99)
        : 50;
    }

    // 6. GET OUTPUT ID IF COMPLETED
    let outputId: string | null = null;

    if (execution.status === 'completed') {
      const { data: output } = await supabaseAdmin
        .from('outputs')
        .select('id')
        .eq('execution_id', executionId)
        .single();

      outputId = output?.id || null;
    }

    // 7. RETURN STATUS
    return NextResponse.json({
      success: true,
      status: execution.status,
      progress,
      durationSoFar,
      outputId,
      errorMessage: execution.error_message || undefined,
    });

  } catch (error: any) {
    console.error('❌ Status check failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to check status',
      },
      { status: 500 }
    );
  }
}
