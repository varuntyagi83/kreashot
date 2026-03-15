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

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all categories for this user
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[categories GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Get counts for each category — two batched queries instead of 2N
    const categoryIds = (categories || []).map((c) => c.id)

    const [{ data: productRows }, { data: angledShotRows }] = await Promise.all([
      categoryIds.length > 0
        ? supabase.from('products').select('category_id').in('category_id', categoryIds)
        : Promise.resolve({ data: [] }),
      categoryIds.length > 0
        ? supabase.from('angled_shots').select('category_id').in('category_id', categoryIds)
        : Promise.resolve({ data: [] }),
    ])

    const productCountMap: Record<string, number> = {}
    for (const row of productRows || []) {
      productCountMap[row.category_id] = (productCountMap[row.category_id] || 0) + 1
    }

    const angledShotCountMap: Record<string, number> = {}
    for (const row of angledShotRows || []) {
      angledShotCountMap[row.category_id] = (angledShotCountMap[row.category_id] || 0) + 1
    }

    const categoriesWithCounts = (categories || []).map((category) => ({
      ...category,
      counts: {
        products: productCountMap[category.id] || 0,
        angled_shots: angledShotCountMap[category.id] || 0,
      },
    }))

    return NextResponse.json({ categories: categoriesWithCounts })
  } catch (error: any) {
    console.error('[categories GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, look_and_feel } = body

    // Validation
    if (!name || !description) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 }
      )
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }
    if (description.length > 500) {
      return NextResponse.json({ error: 'description must be 500 characters or fewer' }, { status: 400 })
    }
    if (look_and_feel && look_and_feel.length > 10000) {
      return NextResponse.json({ error: 'look_and_feel must be 10000 characters or fewer' }, { status: 400 })
    }

    // Generate slug
    const slug = generateSlug(name)

    // Create category
    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        user_id: user.id,
        name,
        slug,
        description,
        look_and_feel: look_and_feel || null,
      })
      .select()
      .single()

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A category with this name already exists' },
          { status: 409 }
        )
      }
      console.error('[categories POST] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ category }, { status: 201 })
  } catch (error: any) {
    console.error('[categories POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
