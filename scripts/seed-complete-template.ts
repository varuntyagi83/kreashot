#!/usr/bin/env tsx
/**
 * Seed a complete template example for Gummy Bear category
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
const CATEGORY_SLUG = 'gummy-bear'

async function seedCompleteTemplate() {
  console.log('🎨 Seeding complete template with all layer types...\n')

  try {
    // Get user ID from category
    const { data: category } = await supabase
      .from('categories')
      .select('user_id')
      .eq('id', CATEGORY_ID)
      .single()

    if (!category) {
      console.error('❌ Category not found')
      return
    }

    const userId = category.user_id
    console.log(`✅ Using user ID: ${userId}\n`)

    // Create template with all layer types
    console.log('Creating complete template...')

    const templateData = {
      layers: [
        {
          id: 'layer-background',
          type: 'background',
          name: 'Background',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          z_index: 0,
          locked: false,
          visible: true
        },
        {
          id: 'layer-product',
          type: 'product',
          name: 'Product Image',
          x: 45,
          y: 35,
          width: 40,
          height: 45,
          z_index: 1,
          locked: false,
          visible: true,
          alignment: 'center'
        },
        {
          id: 'layer-headline',
          type: 'text',
          name: 'Headline',
          x: 10,
          y: 10,
          width: 80,
          height: 15,
          z_index: 2,
          locked: false,
          visible: true,
          font_size: 36,
          font_family: 'Arial',
          font_weight: 'bold',
          color: '#2d3748',
          text_align: 'center',
          bounding_box: { x: 10, y: 10, width: 80, height: 15 }
        },
        {
          id: 'layer-cta',
          type: 'text',
          name: 'Call to Action',
          x: 30,
          y: 82,
          width: 40,
          height: 8,
          z_index: 3,
          locked: false,
          visible: true,
          font_size: 24,
          font_family: 'Arial',
          font_weight: 'bold',
          color: '#ffffff',
          background_color: '#f56565',
          text_align: 'center',
          bounding_box: { x: 30, y: 82, width: 40, height: 8 }
        },
        {
          id: 'layer-logo',
          type: 'logo',
          name: 'Brand Logo',
          x: 80,
          y: 5,
          width: 15,
          height: 15,
          z_index: 4,
          locked: true,
          visible: true,
          position: 'top-right',
          padding: 10
        }
      ],
      safe_zones: [
        {
          id: 'safe-product',
          name: 'Product Safe Zone',
          type: 'safe',
          x: 40,
          y: 25,
          width: 50,
          height: 60,
          color: '#00ff00'
        },
        {
          id: 'safe-text',
          name: 'Text Safe Zone',
          type: 'safe',
          x: 5,
          y: 5,
          width: 70,
          height: 20,
          color: '#00ff00'
        },
        {
          id: 'restricted-top',
          name: 'Top Margin',
          type: 'restricted',
          x: 0,
          y: 0,
          width: 100,
          height: 3,
          color: '#ff0000'
        },
        {
          id: 'restricted-bottom',
          name: 'Bottom Legal Area',
          type: 'restricted',
          x: 0,
          y: 92,
          width: 100,
          height: 8,
          color: '#ff0000'
        }
      ],
      global_settings: {
        background_color: '#ffffff',
        grid_enabled: true,
        grid_size: 10
      }
    }

    const { data: template, error } = await supabase
      .from('templates')
      .insert({
        category_id: CATEGORY_ID,
        user_id: userId,
        name: 'Complete Instagram Template',
        description: 'Full template with background, product, headline, CTA, logo + safe zones',
        format: '1:1',
        width: 1080,
        height: 1080,
        template_data: templateData,
        storage_provider: 'gdrive',
        storage_path: `${CATEGORY_SLUG}/templates/complete_${Date.now()}.json`,
        storage_url: 'https://drive.google.com/sample/template',
        slug: 'complete-instagram-template'
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Failed:', error.message)
      return
    }

    console.log('\n✅ Template created successfully!')
    console.log(`\n📊 Template: ${template.name}`)
    console.log(`   ID: ${template.id}`)
    console.log(`   Layers: ${templateData.layers.length}`)
    console.log(`     • Background (Z:0) - full canvas`)
    console.log(`     • Product (Z:1) - 45%, 35%, 40×45%`)
    console.log(`     • Headline (Z:2) - 10%, 10%, 80×15%`)
    console.log(`     • CTA (Z:3) - 30%, 82%, 40×8%, red bg`)
    console.log(`     • Logo (Z:4) - 80%, 5%, 15×15%, locked`)
    console.log(`   Safe Zones: ${templateData.safe_zones.length}`)
    console.log(`     • Product safe (green, 40-90%, 25-85%)`)
    console.log(`     • Text safe (green, 5-75%, 5-25%)`)
    console.log(`     • Top restricted (red, 0-100%, 0-3%)`)
    console.log(`     • Bottom restricted (red, 0-100%, 92-100%)`)
    console.log('\n🎨 Refresh browser to see the template!')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

seedCompleteTemplate()
