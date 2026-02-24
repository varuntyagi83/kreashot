#!/usr/bin/env node
import { join } from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: join(process.cwd(), '.env.local') })

const db = postgres(process.env.DATABASE_URL)

console.log('🔄 Updating final_assets table schema for Phase 6...')
console.log('')

try {
  // Add missing columns
  console.log('📝 Adding missing columns...')

  await db.unsafe(`
    -- Add template_id if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id) ON DELETE SET NULL;

    -- Add description if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS description TEXT;

    -- Add format if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '1:1';

    -- Add width if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 1080;

    -- Add height if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 1080;

    -- Add composition_data if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS composition_data JSONB NOT NULL DEFAULT '{}';

    -- Add slug if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS slug TEXT;

    -- Add updated_at if missing
    ALTER TABLE final_assets
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `)

  console.log('✅ Columns added successfully')
  console.log('')

  // Add missing indexes
  console.log('📑 Adding missing indexes...')

  await db.unsafe(`
    -- Add indexes if they don't exist
    CREATE INDEX IF NOT EXISTS idx_final_assets_user ON final_assets(user_id);
    CREATE INDEX IF NOT EXISTS idx_final_assets_template ON final_assets(template_id);
    CREATE INDEX IF NOT EXISTS idx_final_assets_storage_provider ON final_assets(storage_provider);
    CREATE INDEX IF NOT EXISTS idx_final_assets_created_at ON final_assets(created_at DESC);
  `)

  console.log('✅ Indexes created successfully')
  console.log('')

  // Add updated_at trigger
  console.log('⚡ Adding updated_at trigger...')

  await db.unsafe(`
    CREATE OR REPLACE FUNCTION update_final_assets_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS final_assets_updated_at ON final_assets;

    CREATE TRIGGER final_assets_updated_at
      BEFORE UPDATE ON final_assets
      FOR EACH ROW
      EXECUTE FUNCTION update_final_assets_updated_at();
  `)

  console.log('✅ Trigger created successfully')
  console.log('')

  // Add deletion queue trigger
  console.log('🗑️  Adding deletion queue trigger...')

  await db.unsafe(`
    CREATE OR REPLACE FUNCTION queue_final_asset_deletion()
    RETURNS TRIGGER AS $$
    DECLARE
      v_user_id UUID;
    BEGIN
      SELECT user_id INTO v_user_id
      FROM categories WHERE id = OLD.category_id;

      IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
        INSERT INTO deletion_queue (
          resource_type, resource_id, user_id,
          storage_provider, storage_path, storage_url,
          gdrive_file_id, metadata
        ) VALUES (
          'final_asset', OLD.id, v_user_id,
          OLD.storage_provider, OLD.storage_path, OLD.storage_url,
          OLD.gdrive_file_id,
          jsonb_build_object(
            'category_id', OLD.category_id,
            'name', OLD.name,
            'format', OLD.format,
            'deleted_at', NOW()
          )
        );
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS final_assets_deletion_queue ON final_assets;

    CREATE TRIGGER final_assets_deletion_queue
      BEFORE DELETE ON final_assets
      FOR EACH ROW
      EXECUTE FUNCTION queue_final_asset_deletion();
  `)

  console.log('✅ Deletion queue trigger created successfully')
  console.log('')

  console.log('✅ Schema update complete!')
  console.log('')

  // Verify final structure
  const columns = await db`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'final_assets'
    AND table_schema = 'public'
    ORDER BY ordinal_position
  `

  console.log(`📋 Updated table structure (${columns.length} columns):`)
  columns.forEach(col => {
    const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
    console.log(`   ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}`)
  })

  await db.end()
  process.exit(0)

} catch (error) {
  console.error('❌ Schema update failed:', error.message)
  console.error(error)
  await db.end()
  process.exit(1)
}
