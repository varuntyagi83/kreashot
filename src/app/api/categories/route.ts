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

    // Get counts for each category
    const categoriesWithCounts = await Promise.all(
      (categories || []).map(async (category) => {
        const { count: productsCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', category.id)

        const { count: angledShotsCount } = await supabase
          .from('angled_shots')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', category.id)

        return {
          ...category,
          counts: {
            products: productsCount || 0,
            angled_shots: angledShotsCount || 0,
          },
        }
      })
    )

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
