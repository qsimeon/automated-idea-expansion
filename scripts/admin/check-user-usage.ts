/**
 * Admin Script: Check User Usage
 *
 * View a user's current credit balance and usage history
 *
 * Usage:
 *   npx tsx scripts/admin/check-user-usage.ts <email>
 *
 * Example:
 *   npx tsx scripts/admin/check-user-usage.ts user@example.com
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Supabase
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Usage: npx tsx scripts/admin/check-user-usage.ts <email>');
    console.error('\nExample:');
    console.error('  npx tsx scripts/admin/check-user-usage.ts user@example.com');
    process.exit(1);
  }

  const email = args[0];

  console.log('🔍 Looking up user...');
  console.log(`   Email: ${email}\n`);

  // Find user
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, created_at')
    .eq('email', email)
    .single();

  if (userError || !user) {
    console.error('❌ User not found:', email);
    process.exit(1);
  }

  console.log('👤 User Information:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Name: ${user.name || 'N/A'}`);
  console.log(`   Signed up: ${new Date(user.created_at).toLocaleDateString()}\n`);

  // Get usage tracking
  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!usage) {
    console.error('❌ Usage tracking not found');
    console.error('   Run migration: scripts/migrations/002-add-usage-tracking-simple.sql');
    process.exit(1);
  }

  console.log('💳 Credit Balance:');
  console.log(`   Free expansions remaining: ${usage.free_expansions_remaining}`);
  console.log(`   Paid credits remaining: ${usage.paid_credits_remaining}`);
  console.log(`   ─────────────────────────────────`);
  console.log(`   Total available: ${usage.free_expansions_remaining + usage.paid_credits_remaining}\n`);

  console.log('📊 Usage Statistics:');
  console.log(`   Total expansions used: ${usage.total_expansions_used}`);
  console.log(`   Free expansions used: ${usage.total_free_used}`);
  console.log(`   Paid expansions used: ${usage.total_paid_used}\n`);

  // Get payment history
  const { data: payments } = await supabaseAdmin
    .from('payment_receipts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (payments && payments.length > 0) {
    console.log('💰 Payment History:');
    payments.forEach((payment, index) => {
      console.log(`   ${index + 1}. $${payment.amount_usd} - ${payment.credits_purchased} credit(s)`);
      console.log(`      Date: ${new Date(payment.created_at).toLocaleDateString()}`);
      if (payment.bmc_reference) {
        console.log(`      Reference: ${payment.bmc_reference}`);
      }
      if (payment.notes) {
        console.log(`      Notes: ${payment.notes}`);
      }
      console.log('');
    });
  } else {
    console.log('💰 Payment History: None\n');
  }

  // Get recent expansions
  const { data: outputs } = await supabaseAdmin
    .from('outputs')
    .select('id, format, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (outputs && outputs.length > 0) {
    console.log(`📝 Recent Expansions (last ${outputs.length}):`);
    outputs.forEach((output, index) => {
      console.log(`   ${index + 1}. ${output.format} - ${new Date(output.created_at).toLocaleDateString()}`);
    });
  } else {
    console.log('📝 Recent Expansions: None');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
