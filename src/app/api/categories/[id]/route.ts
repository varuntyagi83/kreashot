import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Optional format filter — when provided, counts reflect only that format
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')

    // Get category with counts
    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get counts for various assets (filtered by format when provided)
    // Products don't have a format column
    const { count: productsCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    // Angled shots — format-filterable
    let angledShotsQuery = supabase
      .from('angled_shots')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    if (format) angledShotsQuery = angledShotsQuery.eq('format', format)
    const { count: angledShotsCount } = await angledShotsQuery

    // Backgrounds — format-filterable
    let backgroundsQuery = supabase
      .from('backgrounds')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    if (format) backgroundsQuery = backgroundsQuery.eq('format', format)
    const { count: backgroundsCount } = await backgroundsQuery

    // Composites — format-filterable
    let compositesQuery = supabase
      .from('composites')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    if (format) compositesQuery = compositesQuery.eq('format', format)
    const { count: compositesCount } = await compositesQuery

    const { count: copyDocsCount } = await supabase
      .from('copy_docs')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    const { count: guidelinesCount } = await supabase
      .from('guidelines')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    // Final assets — format-filterable
    let finalAssetsQuery = supabase
      .from('final_assets')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    if (format) finalAssetsQuery = finalAssetsQuery.eq('format', format)
    const { count: finalAssetsCount } = await finalAssetsQuery

    return NextResponse.json({
      category: {
        ...category,
        counts: {
          products: productsCount || 0,
          angled_shots: angledShotsCount || 0,
          backgrounds: backgroundsCount || 0,
          composites: compositesCount || 0,
          copy_docs: copyDocsCount || 0,
          guidelines: guidelinesCount || 0,
          final_assets: finalAssetsCount || 0,
        },
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, look_and_feel } = body

    const updateData: any = {}
    if (name !== undefined) {
      updateData.name = name
      updateData.slug = generateSlug(name)
    }
    if (description !== undefined) updateData.description = description
    if (look_and_feel !== undefined) updateData.look_and_feel = look_and_feel

    // Update category
    const { data: category, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A category with this name already exists' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ category })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Helper: collect all GDrive file IDs from child tables before cascade delete.
 * Uses service role client to bypass RLS for complete enumeration.
 * Returns the count of files queued for deletion.
 */
async function preQueueGDriveFiles(categoryId: string, userId: string): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return 0

  const admin = createClient(supabaseUrl, serviceKey)

  // All tables with gdrive_file_id that reference category_id
  const tables = [
    { table: 'backgrounds', type: 'background' },
    { table: 'angled_shots', type: 'angled_shot' },
    { table: 'composites', type: 'composite' },
    { table: 'final_assets', type: 'final_asset' },
    { table: 'copy_docs', type: 'copy_doc' },
    { table: 'templates', type: 'template' },
    { table: 'guidelines', type: 'guideline' },
    { table: 'collages', type: 'collage' },
  ]

  let queued = 0

  for (const { table, type } of tables) {
    const { data: rows } = await admin
      .from(table)
      .select('id, storage_provider, storage_path, gdrive_file_id, storage_url')
      .eq('category_id', categoryId)
      .eq('storage_provider', 'gdrive')
      .not('gdrive_file_id', 'is', null)

    if (!rows || rows.length === 0) continue

    // Batch insert into deletion_queue
    const entries = rows.map((row: any) => ({
      resource_type: type,
      resource_id: row.id,
      storage_provider: 'gdrive',
      storage_path: row.storage_path,
      gdrive_file_id: row.gdrive_file_id,
      storage_url: row.storage_url,
      user_id: userId,
      metadata: { category_id: categoryId, pre_queued: true },
    }))

    const { error } = await admin.from('deletion_queue').insert(entries)
    if (!error) {
      queued += entries.length
    } else {
      console.error(`Failed to pre-queue ${table} deletions:`, error.message)
    }
  }

  // Also handle product_images (linked via products → category)
  const { data: products } = await admin
    .from('products')
    .select('id')
    .eq('category_id', categoryId)

  if (products && products.length > 0) {
    const productIds = products.map((p: any) => p.id)
    const { data: images } = await admin
      .from('product_images')
      .select('id, storage_provider, storage_path, gdrive_file_id, storage_url, user_id')
      .in('product_id', productIds)
      .eq('storage_provider', 'gdrive')
      .not('gdrive_file_id', 'is', null)

    if (images && images.length > 0) {
      const entries = images.map((img: any) => ({
        resource_type: 'product_image',
        resource_id: img.id,
        storage_provider: 'gdrive',
        storage_path: img.storage_path,
        gdrive_file_id: img.gdrive_file_id,
        storage_url: img.storage_url,
        user_id: img.user_id || userId,
        metadata: { category_id: categoryId, pre_queued: true },
      }))

      const { error } = await admin.from('deletion_queue').insert(entries)
      if (!error) {
        queued += entries.length
      } else {
        console.error('Failed to pre-queue product_images deletions:', error.message)
      }
    }
  }

  return queued
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify category belongs to user before proceeding
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Pre-queue all GDrive files for deletion BEFORE cascade delete.
    // DB triggers also fire on cascade, but this is a safety net in case
    // triggers fail or are missing (e.g. newly added tables).
    // Duplicate queue entries are harmless — the cleanup cron handles 404s gracefully.
    const queuedCount = await preQueueGDriveFiles(id, user.id)
    if (queuedCount > 0) {
      console.log(`Pre-queued ${queuedCount} GDrive files for deletion (category: ${id})`)
    }

    // Delete category (cascade will handle related data)
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Category deleted successfully' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
