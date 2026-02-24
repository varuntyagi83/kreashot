#!/usr/bin/env node
import { join } from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: join(process.cwd(), '.env.local') })

const databaseUrl = process.env.DATABASE_URL
const db = postgres(databaseUrl)

console.log('🔍 Verifying final_assets table...')
console.log('')

// Check if table exists
const tables = await db`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'final_assets'
`

if (tables.length === 0) {
  console.log('❌ Table final_assets does not exist')
  await db.end()
  process.exit(1)
}

console.log('✅ Table final_assets exists')
console.log('')

// Get columns
const columns = await db`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'final_assets'
  AND table_schema = 'public'
  ORDER BY ordinal_position
`

console.log(`📋 Table structure (${columns.length} columns):`)
columns.forEach(col => {
  const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
  console.log(`   ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${nullable}`)
})
console.log('')

// Get indexes
const indexes = await db`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'final_assets'
  AND schemaname = 'public'
`

console.log(`📑 Indexes (${indexes.length} total):`)
indexes.forEach(idx => {
  console.log(`   - ${idx.indexname}`)
})
console.log('')

// Check RLS policies
const policies = await db`
  SELECT policyname, cmd, qual
  FROM pg_policies
  WHERE tablename = 'final_assets'
  AND schemaname = 'public'
`

console.log(`🔒 RLS Policies (${policies.length} total):`)
policies.forEach(pol => {
  console.log(`   - ${pol.policyname} (${pol.cmd})`)
})
console.log('')

console.log('✅ Migration verification complete!')

await db.end()
