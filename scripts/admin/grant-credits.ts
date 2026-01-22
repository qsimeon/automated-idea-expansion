/**
 * Admin Script: Grant Credits
 *
 * Run this after verifying a Buy Me a Coffee payment to grant credits to a user
 *
 * Usage:
 *   npx tsx scripts/admin/grant-credits.ts <email> <credits> <amount> [bmc_reference] [notes]
 *
 * Examples:
 *   # Grant 1 credit after $1 payment
 *   npx tsx scripts/admin/grant-credits.ts user@example.com 1 1.00 "John Doe via BMC"
 *
 *   # Grant 10 credits (bulk purchase)
 *   npx tsx scripts/admin/grant-credits.ts user@example.com 10 10.00 "BMC-12345" "Bulk purchase"
 *
 * Requirements:
 *   - User must already exist in database (signed up)
 *   - You must verify BMC payment before running this
 *   - Database connection must be configured (.env.local)
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
