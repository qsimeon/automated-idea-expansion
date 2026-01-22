/**
 * GET /api/usage
 *
 * Get current user's usage and credit balance
 *
 * Returns:
 * - 401: Not authenticated
 * - 200: Usage details
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getUserUsageDetails } from '@/lib/usage/check-usage';

export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get usage details
    const usage = await getUserUsageDetails(session.user.id);

    return NextResponse.json({
      success: true,
      usage: {
        freeRemaining: usage.free_expansions_remaining,
        paidRemaining: usage.paid_credits_remaining,
        totalRemaining: usage.free_expansions_remaining + usage.paid_credits_remaining,
        totalUsed: usage.total_expansions_used,
        freeUsed: usage.total_free_used,
        paidUsed: usage.total_paid_used,
      },
    });
  } catch (error: any) {
    console.error('Failed to fetch usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
