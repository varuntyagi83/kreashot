#!/usr/bin/env tsx
/**
 * Re-translates the color description for Sunday Natural brand guidelines
 * using the updated prompt that produces vivid, green-forward color names.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { translateGuidelinesToColorDescription } from '../src/lib/pdf'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const GUIDELINE_ID = '2a2409a5-b4ec-4f4a-970f-05fcf013751d'

async function main() {
  console.log('🎨 Re-translating Sunday Natural color description\n')

  // 1. Fetch existing guideline
  const { data: guideline, error } = await supabase
    .from('brand_guidelines')
    .select('id, name, extracted_text, color_description')
    .eq('id', GUIDELINE_ID)
    .single()

  if (error || !guideline) {
    console.error('Failed to fetch guideline:', error)
    process.exit(1)
  }

  console.log(`📄 Guideline: ${guideline.name}`)
  console.log(`\n--- OLD color_description ---`)
  console.log(guideline.color_description || '(none)')
  console.log('---\n')

  // 2. Re-run translation with updated prompt
  console.log('⏳ Running translation with updated prompt...')
  const newColorDesc = await translateGuidelinesToColorDescription(guideline.extracted_text)

  if (!newColorDesc) {
    console.error('❌ Translation returned null')
    process.exit(1)
  }

  console.log(`\n--- NEW color_description ---`)
  console.log(newColorDesc)
  console.log('---\n')

  // 3. Save to DB
  const { error: updateError } = await supabase
    .from('brand_guidelines')
    .update({ color_description: newColorDesc })
    .eq('id', GUIDELINE_ID)

  if (updateError) {
    console.error('❌ Failed to update DB:', updateError)
    process.exit(1)
  }

  console.log('✅ Color description updated in database!')
}

main().catch(console.error)
