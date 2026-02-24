#!/usr/bin/env node
import { join } from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

const adforgeDir = '/Users/varuntyagi/Downloads/Claude Research/AdForge/adforge'
dotenv.config({ path: join(adforgeDir, '.env.local') })

const db = postgres(process.env.DATABASE_URL)

const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

console.log('🔍 Checking templates for category:', categoryId)
console.log('')

const templates = await db`
  SELECT id, name, format, category_id, created_at
  FROM templates
  WHERE category_id = ${categoryId}
  ORDER BY created_at DESC
`

console.log(`Found ${templates.length} template(s):`)
console.log('')

templates.forEach((t, i) => {
  console.log(`Template ${i + 1}:`)
  console.log(`  ID: ${t.id}`)
  console.log(`  Name: ${t.name}`)
  console.log(`  Format: ${t.format}`)
  console.log(`  Created: ${t.created_at}`)
  console.log('')
})

if (templates.length === 0) {
  console.log('❌ No templates found in database for this category')
} else {
  console.log('✅ Templates exist in database')
}

await db.end()
