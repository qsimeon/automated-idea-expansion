import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'clear':
      await clearAllData();
      break;
    case 'check-ideas':
      await checkIdeas();
      break;
    case 'check-outputs':
      await checkOutputs();
      break;
    case 'check-join':
      await checkJoinQuery();
      break;
    case 'check-fk':
      await checkForeignKeys();
      break;
    default:
      console.log('Usage:');
      console.log('  npm run db clear          - Clear all test data');
      console.log('  npm run db check-ideas    - Check ideas');
      console.log('  npm run db check-outputs  - Check outputs');
      console.log('  npm run db check-join     - Check join query');
      console.log('  npm run db check-fk       - Check foreign keys');
  }
}

async function checkForeignKeys() {
  console.log('🔑 Checking foreign key constraints...\n');

  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('outputs', 'executions', 'ideas')
      ORDER BY tc.table_name;
    `
  });

  if (error) {
    console.log('Note: RPC function not available, this is normal.');
    console.log('Foreign keys should be defined in your migrations/schema.\n');
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No foreign keys found!');
    console.log('This might be why the join query isn\'t working.\n');
    return;
  }

  data.forEach((fk: any) => {
    console.log(`${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
  });
  console.log();
}

async function clearAllData() {
  console.log('🗑️  Clearing all data for test user...');

  // Delete in order (respecting foreign keys)
  const { error: outputsError } = await supabase
    .from('outputs')
    .delete()
    .eq('user_id', TEST_USER_ID);

  if (outputsError) {
    console.error('Error deleting outputs:', outputsError);
  } else {
    console.log('✅ Outputs cleared');
  }

  const { error: executionsError } = await supabase
    .from('executions')
    .delete()
    .eq('user_id', TEST_USER_ID);

  if (executionsError) {
    console.error('Error deleting executions:', executionsError);
  } else {
    console.log('✅ Executions cleared');
  }

  const { error: ideasError } = await supabase
    .from('ideas')
    .delete()
    .eq('user_id', TEST_USER_ID);

  if (ideasError) {
    console.error('Error deleting ideas:', ideasError);
  } else {
    console.log('✅ Ideas cleared');
  }

  console.log('✨ All data cleared!');
}

async function checkIdeas() {
  console.log('📋 Checking ideas...\n');

  const { data, error } = await supabase
    .from('ideas')
    .select('id, title, status, created_at')
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No ideas found.');
    return;
  }

  console.log(`Found ${data.length} ideas:\n`);
  data.forEach((idea, i) => {
    console.log(`${i + 1}. [${idea.status}] ${idea.title}`);
    console.log(`   ID: ${idea.id}`);
    console.log(`   Created: ${new Date(idea.created_at).toLocaleString()}\n`);
  });
}

async function checkOutputs() {
  console.log('📄 Checking outputs...\n');

  const { data, error } = await supabase
    .from('outputs')
    .select('id, idea_id, format, created_at')
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No outputs found.');
    return;
  }

  console.log(`Found ${data.length} outputs:\n`);
  data.forEach((output, i) => {
    console.log(`${i + 1}. [${output.format}] Output ID: ${output.id}`);
    console.log(`   Idea ID: ${output.idea_id}`);
    console.log(`   Created: ${new Date(output.created_at).toLocaleString()}\n`);
  });
}

async function checkJoinQuery() {
  console.log('🔗 Testing join query...\n');

  const { data, error } = await supabase
    .from('ideas')
    .select(`
      id,
      title,
      status,
      outputs (
        id,
        format,
        created_at
      )
    `)
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No ideas found.');
    return;
  }

  console.log(`Found ${data.length} ideas with outputs:\n`);
  data.forEach((idea: any, i) => {
    console.log(`${i + 1}. [${idea.status}] ${idea.title}`);
    console.log(`   ID: ${idea.id}`);
    if (idea.outputs && idea.outputs.length > 0) {
      console.log(`   ✅ Has ${idea.outputs.length} output(s):`);
      idea.outputs.forEach((output: any) => {
        console.log(`      - [${output.format}] ${output.id}`);
      });
    } else {
      console.log(`   ❌ No outputs linked`);
    }
    console.log();
  });
}

main().catch(console.error);
