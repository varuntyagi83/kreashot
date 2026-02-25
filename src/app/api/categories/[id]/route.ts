import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
