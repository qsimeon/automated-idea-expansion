/**
 * Usage Tracking and Credit Management
 *
 * Simplified payment model:
 * - 5 free expansions for new users
 * - $1 per expansion after that (via Buy Me a Coffee)
 * - Admin manually verifies payments and grants credits
 *
 * Usage flow:
 * 1. Before expansion: checkUsageLimit() - Is user allowed?
 * 2. After expansion: consumeExpansion() - Deduct credit
 * 3. When user pays: addPaidCredits() - Admin grants credits
 */

import { supabaseAdmin } from '../db/supabase';

/**
 * Usage status returned by checkUsageLimit()
 */
export interface UsageStatus {
  allowed: boolean;              // Can user expand an idea?
  freeRemaining: number;         // Free expansions left
  paidRemaining: number;         // Paid credits left
  totalUsed: number;             // Total expansions used
  reason?: string;               // Why denied (if allowed=false)
}

/**
 * Check if user has available credits for expansion
 *
 * @param userId - Database user ID (from session)
 * @returns UsageStatus object
 *
 * @example
 * ```typescript
 * const status = await checkUsageLimit(session.user.id);
 * if (!status.allowed) {
 *   return NextResponse.json(
 *     { error: 'No credits remaining' },
 *     { status: 402 }
 *   );
 * }
 * ```
 */
export async function checkUsageLimit(userId: string): Promise<UsageStatus> {
  try {
    // Fetch user's usage tracking record
    const { data: usage, error } = await supabaseAdmin
      .from('usage_tracking')
      .select('free_expansions_remaining, paid_credits_remaining, total_expansions_used')
      .eq('user_id', userId)
      .single();

    if (error || !usage) {
      console.error('Failed to fetch usage tracking:', error);
      throw new Error('Usage tracking not found for user');
    }

    const freeRemaining = usage.free_expansions_remaining;
    const paidRemaining = usage.paid_credits_remaining;
    const totalUsed = usage.total_expansions_used;

    // User has credits if either free or paid > 0
    const hasCredits = freeRemaining > 0 || paidRemaining > 0;

    if (hasCredits) {
      return {
        allowed: true,
        freeRemaining,
        paidRemaining,
        totalUsed,
      };
    } else {
      return {
        allowed: false,
        freeRemaining: 0,
        paidRemaining: 0,
        totalUsed,
        reason: 'No free expansions or paid credits remaining. Purchase more credits to continue.',
      };
    }
  } catch (error) {
    console.error('Error checking usage limit:', error);
    throw error;
  }
}

/**
 * Consume an expansion credit
 *
 * Deducts 1 credit from user's account. Prioritizes free expansions over paid credits.
 *
 * @param userId - Database user ID
 * @returns The type of credit consumed ('free' | 'paid')
 *
 * @throws Error if user has no credits remaining
 *
 * @example
 * ```typescript
 * const creditType = await consumeExpansion(session.user.id);
 * console.log(`Used ${creditType} credit`);
 * ```
 */
export async function consumeExpansion(userId: string): Promise<'free' | 'paid'> {
  try {
    // Use database function to atomically consume credit
    const { data, error } = await supabaseAdmin.rpc('consume_expansion_credit', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Failed to consume expansion credit:', error);

      // Check if error is "no credits remaining"
      if (error.message?.includes('No credits remaining')) {
        throw new Error('No credits remaining');
      }

      throw new Error(`Failed to consume credit: ${error.message}`);
    }

    // Return credit type ('free' or 'paid')
    return data as 'free' | 'paid';
  } catch (error) {
    console.error('Error consuming expansion:', error);
    throw error;
  }
}

/**
 * Add paid credits to user account (admin operation)
 *
 * Called after verifying Buy Me a Coffee payment.
 * Creates a payment_receipt record and adds credits.
 *
 * @param params - Payment details
 * @returns Payment receipt ID
 *
 * @example
 * ```typescript
 * // Admin verifies BMC payment of $1 and grants 1 credit
 * const receiptId = await addPaidCredits({
 *   userId: 'user-uuid',
 *   credits: 1,
 *   amountUsd: 1.00,
 *   bmcReference: 'John Doe via BMC',
 *   verifiedBy: 'admin@example.com'
 * });
 * ```
 */
export async function addPaidCredits(params: {
  userId: string;
  credits: number;
  amountUsd: number;
  bmcReference?: string;
  verifiedBy?: string;
  notes?: string;
}): Promise<string> {
  const { userId, credits, amountUsd, bmcReference, verifiedBy = 'admin', notes } = params;

  try {
    // Use database function to add credits and create receipt
    const { data: receiptId, error } = await supabaseAdmin.rpc('add_paid_credits', {
      p_user_id: userId,
      p_credits: credits,
      p_amount_usd: amountUsd,
      p_bmc_reference: bmcReference || null,
      p_verified_by: verifiedBy,
      p_notes: notes || null,
    });

    if (error) {
      console.error('Failed to add paid credits:', error);
      throw new Error(`Failed to add credits: ${error.message}`);
    }

    console.log(`✅ Added ${credits} credits to user ${userId} (receipt: ${receiptId})`);
    return receiptId as string;
  } catch (error) {
    console.error('Error adding paid credits:', error);
    throw error;
  }
}

/**
 * Get full usage details for a user (for dashboard display)
 *
 * @param userId - Database user ID
 * @returns Full usage tracking record
 */
export async function getUserUsageDetails(userId: string) {
  try {
    const { data: usage, error } = await supabaseAdmin
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !usage) {
      console.error('Failed to fetch usage details:', error);
      throw new Error('Usage details not found');
    }

    return usage;
  } catch (error) {
    console.error('Error getting usage details:', error);
    throw error;
  }
}

/**
 * Get payment history for a user
 *
 * @param userId - Database user ID
 * @returns Array of payment receipts
 */
export async function getPaymentHistory(userId: string) {
  try {
    const { data: receipts, error } = await supabaseAdmin
      .from('payment_receipts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch payment history:', error);
      throw new Error('Payment history not found');
    }

    return receipts || [];
  } catch (error) {
    console.error('Error getting payment history:', error);
    throw error;
  }
}
