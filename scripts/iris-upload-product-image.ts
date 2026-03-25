#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
dotenv.config({ path: path.join(__dirname, '..', 'adforge/.env.local') })

import { Storage } from '@google-cloud/storage'
import { createClient } from '@supabase/supabase-js'

async function main() {
  const storage = new Storage({
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    projectId: process.env.GCS_PROJECT_ID,
  })

  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const PROD_ID = '7c49f04f-08ee-4455-a0cf-5d45f8797d10'
  const COMPANY_ID = '103065c2-74e5-474a-866a-ade77e83c22e'
  const ADMIN_ID = '189a8d40-744d-452c-b716-66bdf3cf8976'
  const CAT_ID = '95b630ca-7910-4b95-afdf-7fcfef64289d'
  const TS = Date.now()

  console.log('Uploading test.jpeg to GCS...')
  const buf = fs.readFileSync('/Users/varuntyagi/Downloads/test.jpeg')
  const gcsPath = `Iris Test Co/iris-test-co/iris-test-category/iris-test-bottle/product-images/test-bottle-${TS}.jpeg`
  const file = bucket.file(gcsPath)
  await file.save(buf, { metadata: { contentType: 'image/jpeg' } })
  const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`
  console.log('Uploaded:', publicUrl)

  const { data, error } = await sb.from('product_images').insert({
    product_id: PROD_ID,
    company_id: COMPANY_ID,
    storage_provider: 'gcs',
    file_path: gcsPath,
    storage_path: gcsPath,
    storage_url: publicUrl,
    is_primary: true,
    file_name: `test-bottle-${TS}.jpeg`,
    mime_type: 'image/jpeg',
    file_size: buf.length,
  }).select().single()

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  console.log('product_image_id=' + data.id)
  console.log('storage_url=' + publicUrl)
}

main().catch(e => { console.error(e); process.exit(1) })
