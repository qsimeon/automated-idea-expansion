/**
 * Admin Script: Grant Credits to User
 *
 * DESCRIPTION:
 * Grants paid credits to a user after verifying Buy Me a Coffee payment.
 * Creates a payment receipt for audit trail and sends confirmation.
 *
 * USAGE:
 *   npx tsx scripts/admin/grant-credits.ts <email> <credits> <amount> [bmc_reference] [notes]
 *
 * EXAMPLES:
 *   # Grant 1 credit after $1 payment from John Doe
 *   npx tsx scripts/admin/grant-credits.ts user@example.com 1 1.00 "John Doe via BMC"
 *
 *   # Grant 10 credits (bulk purchase) with BMC reference
 *   npx tsx scripts/admin/grant-credits.ts user@example.com 10 10.00 "BMC-12345" "Bulk purchase"
 *
 *   # Grant 5 credits with detailed notes
 *   npx tsx scripts/admin/grant-credits.ts jane@example.com 5 5.00 "BMC-12346" "Email verification successful"
 *
 * ARGUMENTS:
 *   email           - User email (must be registered)
 *   credits         - Number of credits to grant (positive integer)
 *   amount          - USD amount paid (positive number)
 *   bmc_reference   - (Optional) BMC reference or supporter name
 *   notes           - (Optional) Admin notes for audit trail
 *
 * PREREQUISITES:
 *   - User must already exist in database (must have signed up)
 *   - .env.local with SUPABASE_SERVICE_ROLE_KEY
 *   - Database must have usage_tracking table (run migration 002)
 *   - You must have verified the Buy Me a Coffee payment first!
 *
 * PROCESS:
 *   1. Look up user by email
 *   2. Verify user exists and has usage tracking
 *   3. Show current credits
 *   4. Call add_paid_credits() database function
 *   5. Verify credits were added
 *   6. Display confirmation and email template
 *
 * WORKFLOW:
 *   1. User visits Buy Me a Coffee and makes payment
 *   2. You receive email notification from Buy Me a Coffee
 *   3. Verify the payment details match
 *   4. Run this script: npx tsx scripts/admin/grant-credits.ts user@email.com 5 5.00 "BMC-xxx"
 *   5. Script displays email template to send to user
 *   6. (Optional) Send the email to user
 *
 * OUTPUT:
 *   ✅ Credits granted successfully!
 *   Receipt ID: <uuid>
 *   New paid credits: 100
 *   Total available: 105
 *
 *   📧 Consider emailing the user...
 *
 * TROUBLESHOOTING:
 *   - "User not found" → Check email spelling, user must sign up first
 *   - "Usage tracking not found" → Run migration 002 first
 *   - "Failed to grant credits" → Check .env.local credentials
 *   - "Amount must be positive" → Use format: 5.00 (not 500)
 *
 * See Also:
 *   - Admin tools: docs/ADMIN_TOOLS.md
 *   - Database setup: docs/DATABASE.md
 *   - Deployment guide: docs/DEPLOYMENT.md
 *   - Payment process: docs/ADMIN_TOOLS.md#payment-verification
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Supabase client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Main function
 */
async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('❌ Usage: npx tsx scripts/admin/grant-credits.ts <email> <credits> <amount> [bmc_reference] [notes]');
    console.error('\nExamples:');
    console.error('  npx tsx scripts/admin/grant-credits.ts user@example.com 1 1.00 "John Doe via BMC"');
    console.error('  npx tsx scripts/admin/grant-credits.ts user@example.com 10 10.00 "BMC-12345" "Bulk purchase"');
    process.exit(1);
  }

  const email = args[0];
  const credits = parseInt(args[1]);
  const amountUsd = parseFloat(args[2]);
  const bmcReference = args[3] || null;
  const notes = args[4] || null;

  // Validate inputs
  if (isNaN(credits) || credits <= 0) {
    console.error('❌ Credits must be a positive number');
    process.exit(1);
  }

  if (isNaN(amountUsd) || amountUsd <= 0) {
    console.error('❌ Amount must be a positive number');
    process.exit(1);
  }

  console.log('🔍 Looking up user...');
  console.log(`   Email: ${email}`);

  // Find user by email
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, name')
    .eq('email', email)
    .single();

  if (userError || !user) {
    console.error('❌ User not found:', email);
    console.error('   Make sure the user has signed up first!');
    process.exit(1);
  }

  console.log('✅ User found:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Name: ${user.name || 'N/A'}`);

  // Check current usage
  const { data: usage, error: usageError } = await supabaseAdmin
    .from('usage_tracking')
    .select('free_expansions_remaining, paid_credits_remaining, total_expansions_used')
    .eq('user_id', user.id)
    .single();

  if (usageError || !usage) {
    console.error('❌ Usage tracking not found for user');
    console.error('   Run the database migration first: scripts/migrations/002-add-usage-tracking-simple.sql');
    process.exit(1);
  }

  console.log('\n📊 Current Usage:');
  console.log(`   Free remaining: ${usage.free_expansions_remaining}`);
  console.log(`   Paid remaining: ${usage.paid_credits_remaining}`);
  console.log(`   Total used: ${usage.total_expansions_used}`);

  // Confirm with admin
  console.log('\n💰 About to grant credits:');
  console.log(`   Credits: ${credits}`);
  console.log(`   Amount: $${amountUsd.toFixed(2)}`);
  console.log(`   BMC Reference: ${bmcReference || 'N/A'}`);
  console.log(`   Notes: ${notes || 'N/A'}`);

  // Call database function to add credits
  console.log('\n🔄 Adding credits...');

  const { data: receiptId, error: grantError } = await supabaseAdmin.rpc('add_paid_credits', {
    p_user_id: user.id,
    p_credits: credits,
    p_amount_usd: amountUsd,
    p_bmc_reference: bmcReference,
    p_verified_by: 'admin-script',
    p_notes: notes,
  });

  if (grantError) {
    console.error('❌ Failed to grant credits:', grantError.message);
    process.exit(1);
  }

  // Verify credits were added
  const { data: newUsage } = await supabaseAdmin
    .from('usage_tracking')
    .select('paid_credits_remaining')
    .eq('user_id', user.id)
    .single();

  console.log('\n✅ Credits granted successfully!');
  console.log(`   Receipt ID: ${receiptId}`);
  console.log(`   New paid credits: ${newUsage?.paid_credits_remaining || 'Unknown'}`);
  console.log(`   Total available: ${(usage.free_expansions_remaining + (newUsage?.paid_credits_remaining || 0))}`);

  console.log('\n📧 Consider emailing the user:');
  console.log(`   To: ${email}`);
  console.log(`   Subject: Your credits have been added!`);
  console.log(`   Body: Hi ${user.name || 'there'}, I've verified your $${amountUsd.toFixed(2)} payment and added ${credits} credit(s) to your account. Thanks for supporting the project! 🎉`);

  process.exit(0);
}

// Run main function
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
