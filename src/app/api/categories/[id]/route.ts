import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyId } from '@/lib/get-company'

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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Optional format filter — when provided, counts reflect only that format
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')

    // Get category with counts
    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      console.error('[categories/[id] GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Get counts for various assets (filtered by format when provided)
    // Build format-filterable queries before passing to Promise.all
    const angledShotsQuery = supabase
      .from('angled_shots')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    const backgroundsQuery = supabase
      .from('backgrounds')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    const compositesQuery = supabase
      .from('composites')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    const finalAssetsQuery = supabase
      .from('final_assets')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    if (format) {
      angledShotsQuery.eq('format', format)   // builder is mutable; chain appends filter in place
      backgroundsQuery.eq('format', format)
      compositesQuery.eq('format', format)
      finalAssetsQuery.eq('format', format)
    }

    // Run all 7 count queries concurrently instead of sequentially
    const [
      { count: productsCount },
      { count: angledShotsCount },
      { count: backgroundsCount },
      { count: compositesCount },
      { count: copyDocsCount },
      { count: guidelinesCount },
      { count: finalAssetsCount },
    ] = await Promise.all([
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', id),
      angledShotsQuery,
      backgroundsQuery,
      compositesQuery,
      supabase
        .from('copy_docs')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', id),
      supabase
        .from('guidelines')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', id),
      finalAssetsQuery,
    ])

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
    console.error('[categories/[id] GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const body = await request.json()
    const { name, description, look_and_feel } = body

    if (name !== undefined && name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }
    if (description !== undefined && description.length > 500) {
      return NextResponse.json({ error: 'description must be 500 characters or fewer' }, { status: 400 })
    }
    if (look_and_feel !== undefined && look_and_feel.length > 10000) {
      return NextResponse.json({ error: 'look_and_feel must be 10000 characters or fewer' }, { status: 400 })
    }

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
      .eq('company_id', companyId)
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
      console.error('[categories/[id] PUT] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ category })
  } catch (error: any) {
    console.error('[categories/[id] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

  // Service role required: deletion_queue INSERT must bypass RLS so the queued
  // file IDs survive the cascade-delete of the parent record. The calling route
  // has already verified user ownership before invoking this helper.
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }
    console.log(`[audit] DELETE category ${id} by user ${user.id} at ${new Date().toISOString()}`)

    // Verify category belongs to company before proceeding
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
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
      .eq('company_id', companyId)

    if (error) {
      console.error('[categories/[id] DELETE] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Category deleted successfully' })
  } catch (error: any) {
    console.error('[categories/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
