import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// Generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// GET /api/categories/[id]/products/[productId] - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get product and verify it belongs to user's category
    const { data: product, error } = await supabase
      .from('products')
      .select('*, category:categories!inner(user_id)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (error || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/categories/[id]/products/[productId] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId } = await params
    const body = await request.json()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify product belongs to user's category
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*, category:categories!inner(user_id)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (fetchError || !existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Validate required fields
    if (body.name && !body.name.trim()) {
      return NextResponse.json(
        { error: 'Product name cannot be empty' },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData: any = {}
    if (body.name) {
      updateData.name = body.name.trim()
      updateData.slug = generateSlug(body.name)
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null
    }

    // Update product
    const { data: product, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single()

    if (error) {
      console.error('[products/[productId] PUT] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Pre-queue GDrive files owned by a product before cascade delete.
 * Safety net — DB triggers also queue on cascade, but this handles edge cases.
 */
async function preQueueProductGDriveFiles(productId: string, userId: string): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return 0

  const admin = createClient(supabaseUrl, serviceKey)
  let queued = 0

  // Tables with gdrive_file_id that reference product_id
  const tables = [
    { table: 'product_images', type: 'product_image', fk: 'product_id' },
    { table: 'angled_shots', type: 'angled_shot', fk: 'product_id' },
  ]

  for (const { table, type, fk } of tables) {
    const { data: rows } = await admin
      .from(table)
      .select('id, storage_provider, storage_path, gdrive_file_id, storage_url')
      .eq(fk, productId)
      .eq('storage_provider', 'gdrive')
      .not('gdrive_file_id', 'is', null)

    if (!rows || rows.length === 0) continue

    const entries = rows.map((row: any) => ({
      resource_type: type,
      resource_id: row.id,
      storage_provider: 'gdrive',
      storage_path: row.storage_path,
      gdrive_file_id: row.gdrive_file_id,
      storage_url: row.storage_url,
      user_id: userId,
      metadata: { product_id: productId, pre_queued: true },
    }))

    const { error } = await admin.from('deletion_queue').insert(entries)
    if (!error) {
      queued += entries.length
    } else {
      console.error(`Failed to pre-queue ${table} deletions:`, error.message)
    }
  }

  return queued
}

// DELETE /api/categories/[id]/products/[productId] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify product belongs to user's category
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('*, category:categories!inner(user_id)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (fetchError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Pre-queue GDrive files before cascade delete (safety net)
    const queuedCount = await preQueueProductGDriveFiles(productId, user.id)
    if (queuedCount > 0) {
      console.log(`Pre-queued ${queuedCount} GDrive files for deletion (product: ${productId})`)
    }

    // Delete product (cascade will handle related records)
    const { error } = await supabase.from('products').delete().eq('id', productId)

    if (error) {
      console.error('[products/[productId] DELETE] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
