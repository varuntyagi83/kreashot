import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * GET /api/categories/[id]/copy-docs
 * Lists all copy docs for a category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const { data: copyDocs, error } = await supabase
      .from('copy_docs')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching copy docs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      category,
      copy_docs: copyDocs || [],
    })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/categories/[id]/copy-docs
 * Saves a copy doc to Google Drive + database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      originalText,
      generatedText,
      copyType,
      tone,
      language = 'en',
      promptUsed,
    } = body

    if (!name || !generatedText || !copyType) {
      return NextResponse.json(
        { error: 'name, generatedText, and copyType are required' },
        { status: 400 }
      )
    }

    const slug = generateSlug(name)

    // Check if copy doc with this slug already exists
    const { data: existing } = await supabase
      .from('copy_docs')
      .select('id')
      .eq('category_id', categoryId)
      .eq('copy_type', copyType)
      .eq('generated_text', generatedText)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'This copy variation already exists' },
        { status: 409 }
      )
    }

    // Save as JSON file to Google Drive
    const copyData = {
      name,
      original_text: originalText || '',
      generated_text: generatedText,
      copy_type: copyType,
      language,
      prompt_used: promptUsed || null,
      created_at: new Date().toISOString(),
    }

    const fileName = `${category.slug}/copy-docs/${copyType}/${slug}_${Date.now()}.json`
    const buffer = Buffer.from(JSON.stringify(copyData, null, 2), 'utf-8')

    console.log(`Uploading copy doc to Google Drive: ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: 'application/json',
      provider: 'gdrive',
    })

    // Save to database
    const { data: copyDoc, error: dbError } = await supabase
      .from('copy_docs')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        original_text: originalText || '',
        generated_text: generatedText,
        copy_type: copyType,
        tone: tone || null,
        language,
        prompt_used: promptUsed || null,
        storage_provider: 'gdrive',
        storage_path: storageFile.path,
        storage_url: storageFile.publicUrl,
        gdrive_file_id: storageFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save copy doc' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: 'Copy doc saved successfully', copy_doc: copyDoc },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error saving copy doc:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
