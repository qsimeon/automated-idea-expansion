#!/usr/bin/env tsx
/**
 * Seed Admin User with 100 Credits
 *
 * DESCRIPTION:
 * Creates or updates the admin user (qsimeon@mit.edu) with 100 total credits.
 * This is the TypeScript version that can be run locally from the command line.
 *
 * PREREQUISITES:
 * - .env.local file with Supabase credentials
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - Database tables: users, usage_tracking
 *
 * USAGE:
 * npm run db:seed-admin
 * Or:
 * tsx scripts/admin/seed-admin-user.ts
 *
 * OPTIONS:
 * - DEFAULT: Seeds qsimeon@mit.edu with 100 credits
 * - To use different email: ADMIN_EMAIL=user@example.com tsx scripts/admin/seed-admin-user.ts
 *
 * EXPECTED OUTPUT:
 * ✨ Admin user seeding complete!
 * Email: qsimeon@mit.edu
 * Name: Quilee Simeon
 * Free Credits: 5
 * Paid Credits: 95
 * Total Credits: 100
 *
 * TROUBLESHOOTING:
 * - "Invalid credentials" → Check .env.local SUPABASE_SERVICE_ROLE_KEY
 * - "users table does not exist" → Run scripts/setup-db.sql first
 * - "usage_tracking table does not exist" → Run migration 002 first
 *
 * See Also:
 * - SQL version: scripts/seed-admin-user.sql
 * - Database guide: docs/DATABASE.md
 * - Admin tools: docs/ADMIN_TOOLS.md
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AdminUserConfig {
  email: string;
  name: string;
  timezone: string;
  freeCredits: number;
  paidCredits: number;
}

// Default admin configuration
const DEFAULT_ADMIN: AdminUserConfig = {
  email: 'qsimeon@mit.edu',
  name: 'Quilee Simeon',
  timezone: 'America/New_York',
  freeCredits: 5,
  paidCredits: 95,
};

async function seedAdminUser(config: AdminUserConfig = DEFAULT_ADMIN): Promise<void> {
  console.log('🌱 Seeding admin user...\n');
  console.log(`Email: ${config.email}`);
  console.log(`Name: ${config.name}`);
  console.log(`Timezone: ${config.timezone}`);
  console.log(`Credits: ${config.freeCredits} free + ${config.paidCredits} paid = ${config.freeCredits + config.paidCredits} total\n`);

  try {
    // Step 1: Create or update user
    console.log('Step 1: Creating/updating user...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert(
        {
          email: config.email,
          name: config.name,
          timezone: config.timezone,
        },
        { onConflict: 'email' }
      )
      .select();

    if (userError) {
      console.error('❌ Error creating user:', userError);
      process.exit(1);
    }

    if (!userData || userData.length === 0) {
      console.error('❌ No user data returned');
      process.exit(1);
    }

    const userId = userData[0].id;
    console.log(`✅ User created/updated: ${config.email}\n`);

    // Step 2: Create or update usage tracking
    console.log('Step 2: Setting up usage tracking...');
    const { data: usageData, error: usageError } = await supabase
      .from('usage_tracking')
      .upsert(
        {
          user_id: userId,
          free_expansions_remaining: config.freeCredits,
          paid_credits_remaining: config.paidCredits,
          total_expansions_used: 0,
          total_free_used: 0,
          total_paid_used: 0,
        },
        { onConflict: 'user_id' }
      )
      .select();

    if (usageError) {
      console.error('❌ Error setting up usage tracking:', usageError);
      process.exit(1);
    }

    console.log(`✅ Usage tracking configured\n`);

    // Step 3: Verify results
    console.log('Step 3: Verifying...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('users')
      .select(`
        email,
        name,
        timezone,
        usage_tracking (
          free_expansions_remaining,
          paid_credits_remaining
        )
      `)
      .eq('email', config.email)
      .single();

    if (verifyError || !verifyData) {
      console.error('❌ Error verifying user:', verifyError);
      process.exit(1);
    }

    // Type assertion for the nested data structure
    const userData_typed = verifyData as any;
    const usage = userData_typed.usage_tracking?.[0];

    if (!usage) {
      console.error('❌ Usage tracking not found after creation');
      process.exit(1);
    }

    console.log(`✅ Verification successful\n`);

    // Step 4: Display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✨ Admin user seeding complete!\n');
    console.log(`Email:         ${userData_typed.email}`);
    console.log(`Name:          ${userData_typed.name}`);
    console.log(`Timezone:      ${userData_typed.timezone}`);
    console.log(`Free Credits:  ${usage.free_expansions_remaining}`);
    console.log(`Paid Credits:  ${usage.paid_credits_remaining}`);
    console.log(`Total Credits: ${usage.free_expansions_remaining + usage.paid_credits_remaining}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('✅ Ready to deploy! Admin user can now log in via GitHub.\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run if executed directly
seedAdminUser().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
