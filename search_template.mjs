#!/usr/bin/env node
import { join } from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

const adforgeDir = '/Users/varuntyagi/Downloads/Claude Research/AdForge/adforge'
dotenv.config({ path: join(adforgeDir, '.env.local') })

const db = postgres(process.env.DATABASE_URL)

console.log('🔍 Searching for template with name containing "complete_1771706802156"...')
console.log('')

const templates = await db`
  SELECT id, name, format, category_id, storage_path, created_at
  FROM templates
  WHERE name ILIKE ${'%complete_1771706802156%'}
  ORDER BY created_at DESC
`

console.log(`Found ${templates.length} template(s):`)
console.log('')

templates.forEach((t, i) => {
  console.log(`Template ${i + 1}:`)
  console.log(`  ID: ${t.id}`)
  console.log(`  Name: ${t.name}`)
  console.log(`  Format: ${t.format}`)
  console.log(`  Category ID: ${t.category_id}`)
  console.log(`  Storage Path: ${t.storage_path}`)
  console.log(`  Created: ${t.created_at}`)
  console.log('')
})

// Also search all templates for the category
const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
console.log('📋 All templates for category:', categoryId)
console.log('')

const allTemplates = await db`
  SELECT id, name, format, storage_path, created_at
  FROM templates
  WHERE category_id = ${categoryId}
  ORDER BY created_at DESC
`

console.log(`Found ${allTemplates.length} total template(s):`)
allTemplates.forEach((t, i) => {
  console.log(`  ${i + 1}. ${t.name} (${t.format}) - ${t.storage_path}`)
})

await db.end()
