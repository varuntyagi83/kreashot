import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GoogleDriveAdapter } from '@/lib/storage/gdrive-adapter'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyInfo } from '@/lib/get-company'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: categoryId, templateId } = await params
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId } = companyInfo

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('company_id', companyId)
      .single()
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .eq('category_id', categoryId)
      .single()

    if (error) {
      console.error('Error fetching template:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Error in template GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: categoryId, templateId } = await params
    const supabase = await createServerSupabaseClient()

    // Get user ID
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId, company_slug: companySlug } = companyInfo

    const body = await request.json()

    const {
      name,
      description,
      format,
      width,
      height,
      template_data,
    } = body

    if (name && name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }

    // Get category slug for storage path
    const { data: category } = await supabase
      .from('categories')
      .select('slug')
      .eq('id', categoryId)
      .eq('company_id', companyId)
      .single()

    const categorySlug = category?.slug || 'unknown'

    // Update template in database
    // Convert format from "4:5" to "4x5" for folder naming
    const formatFolder = format?.replace(':', 'x')
    const { data: template, error } = await supabase
      .from('templates')
      .update({
        name,
        description,
        format,
        width,
        height,
        template_data,
        slug: name?.toLowerCase().replace(/\s+/g, '-'),
        storage_path: `${companySlug}/${categorySlug}/templates/${formatFolder}/${name?.toLowerCase().replace(/\s+/g, '-')}.json`,
      })
      .eq('id', templateId)
      .eq('company_id', companyId)
      .select()
      .single()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found or unauthorized' }, { status: 404 })
    }

    console.log('🟢 Template updated in database, checking for Google Drive upload...')
    console.log('  template_data exists?', !!template_data)
    console.log('  template_data type:', typeof template_data)

    // Upload/update template JSON to Google Drive
    if (template_data) {
      try {
        const gdrive = new GoogleDriveAdapter()
        const templateJson = JSON.stringify(template_data, null, 2)
        const templateBuffer = Buffer.from(templateJson, 'utf-8')

        // Convert format from "4:5" to "4x5" for folder naming
        const formatFolder = format?.replace(':', 'x')
        const storagePath = `${companySlug}/${categorySlug}/templates/${formatFolder}/${name?.toLowerCase().replace(/\s+/g, '-')}.json`

        console.log('🔵 Google Drive Upload Debug:')
        console.log('  Company ID:', companyId)
        console.log('  Category Slug:', categorySlug)
        console.log('  Format:', format, '→', formatFolder)
        console.log('  Storage Path:', storagePath)
        console.log('  Template Name:', name)

        // Delete old file if it exists (in case name changed)
        if (template.storage_path && template.storage_path !== storagePath) {
          try {
            console.log('  Deleting old file:', template.storage_path)
            await gdrive.delete(template.storage_path)
          } catch (deleteError) {
            console.log('  Could not delete old template file:', deleteError)
          }
        }

        // Upload new/updated template
        console.log('  Starting upload...')
        const uploadResult = await gdrive.upload(templateBuffer, storagePath, {
          contentType: 'application/json',
        })
        console.log('  ✅ Upload successful!')
        console.log('  File ID:', uploadResult.fileId)
        console.log('  Public URL:', uploadResult.publicUrl)

        // Update template with Google Drive URL
        const { data: updatedTemplate } = await supabase
          .from('templates')
          .update({ storage_url: uploadResult.publicUrl })
          .eq('id', template.id)
          .select()
          .single()

        return NextResponse.json({ template: updatedTemplate || template })
      } catch (uploadError) {
        console.error('Error uploading to Google Drive:', uploadError)
        // Return template anyway, upload failure shouldn't block the update
        return NextResponse.json({
          template,
          warning: 'Template updated but failed to upload to Google Drive'
        })
      }
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Error in template PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params
    const supabase = await createServerSupabaseClient()

    // Get user ID
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId } = companyInfo

    const rateLimit = checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    // Delete template
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', templateId)
      .eq('company_id', companyId)

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error('Error in template DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
