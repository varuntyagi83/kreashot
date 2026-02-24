import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
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

    // Delete product (cascade will handle related records)
    const { error } = await supabase.from('products').delete().eq('id', productId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
