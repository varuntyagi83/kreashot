import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

try {
  await client.connect();
  
  console.log('='.repeat(80));
  console.log('DATABASE SCHEMA VERIFICATION');
  console.log('='.repeat(80));
  
  // Check all tables exist
  const tablesQuery = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  
  const tables = await client.query(tablesQuery);
  console.log('\n✓ Tables in database:');
  tables.rows.forEach((row, idx) => {
    console.log(`  ${idx + 1}. ${row.table_name}`);
  });
  
  // Check storage buckets
  const bucketsQuery = `
    SELECT name, public 
    FROM storage.buckets 
    ORDER BY name;
  `;
  
  const buckets = await client.query(bucketsQuery);
  console.log('\n✓ Storage buckets:');
  buckets.rows.forEach((row, idx) => {
    console.log(`  ${idx + 1}. ${row.name} (public: ${row.public})`);
  });
  
  // Check RLS is enabled
  const rlsQuery = `
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;
  
  const rls = await client.query(rlsQuery);
  console.log('\n✓ RLS Status:');
  rls.rows.forEach(row => {
    console.log(`  ${row.tablename}: ${row.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
  });
  
  // Check policies count
  const policiesQuery = `
    SELECT schemaname, tablename, COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY schemaname, tablename
    ORDER BY tablename;
  `;
  
  const policies = await client.query(policiesQuery);
  console.log('\n✓ RLS Policies:');
  policies.rows.forEach(row => {
    console.log(`  ${row.tablename}: ${row.policy_count} policies`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE VERIFICATION COMPLETE');
  console.log('='.repeat(80));
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await client.end();
}
