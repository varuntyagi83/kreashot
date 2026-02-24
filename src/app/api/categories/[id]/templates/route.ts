import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GoogleDriveAdapter } from '@/lib/storage/gdrive-adapter'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params
    const supabase = await createServerSupabaseClient()
    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format')

    // Build query
    let query = supabase
      .from('templates')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    // Filter by format if specified
    if (format) {
      query = query.eq('format', format)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error('Error in templates GET:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params
    const supabase = await createServerSupabaseClient()
    const body = await request.json()

    const {
      name,
      description,
      format,
      width,
      height,
      template_data,
    } = body

    // Get user ID
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get category slug for storage path
    const { data: category } = await supabase
      .from('categories')
      .select('slug')
      .eq('id', categoryId)
      .single()

    const categorySlug = category?.slug || 'unknown'

    // Create template
    // Convert format from "4:5" to "4x5" for folder naming
    const formatFolder = format.replace(':', 'x')
    const { data: template, error } = await supabase
      .from('templates')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        name,
        description,
        format,
        width,
        height,
        template_data,
        storage_provider: 'gdrive',
        storage_path: `${categorySlug}/templates/${formatFolder}/${name.toLowerCase().replace(/\s+/g, '-')}.json`,
        storage_url: '', // Will be updated after upload
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        metadata: {},
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Upload template JSON to Google Drive
    try {
      const gdrive = new GoogleDriveAdapter()
      const templateJson = JSON.stringify(template_data, null, 2)
      const templateBuffer = Buffer.from(templateJson, 'utf-8')

      // Convert format from "4:5" to "4x5" for folder naming
      const formatFolder = format.replace(':', 'x')
      const storagePath = `${categorySlug}/templates/${formatFolder}/${name.toLowerCase().replace(/\s+/g, '-')}.json`
      const uploadResult = await gdrive.upload(templateBuffer, storagePath, {
        contentType: 'application/json',
      })

      // Update template with Google Drive URL
      const { data: updatedTemplate } = await supabase
        .from('templates')
        .update({ storage_url: uploadResult.publicUrl })
        .eq('id', template.id)
        .select()
        .single()

      return NextResponse.json({ template: updatedTemplate || template }, { status: 201 })
    } catch (uploadError) {
      console.error('Error uploading to Google Drive:', uploadError)
      // Template is created in DB but not in GDrive - return template anyway
      return NextResponse.json({
        template,
        warning: 'Template created but failed to upload to Google Drive'
      }, { status: 201 })
    }
  } catch (error: any) {
    console.error('Error in templates POST:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
