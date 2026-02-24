import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: assets, error } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ assets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const name = formData.get('name') as string
    const assetType = formData.get('asset_type') as string

    if (!file || !name || !assetType) {
      return NextResponse.json(
        { error: 'File, name, and asset type are required' },
        { status: 400 }
      )
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${uuidv4()}.${fileExt}`
    const filePath = `${user.id}/${fileName}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('brand-assets')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('brand-assets')
      .getPublicUrl(filePath)

    // Insert into brand_assets table
    const { data: asset, error: dbError } = await supabase
      .from('brand_assets')
      .insert({
        user_id: user.id,
        name,
        asset_type: assetType,
        storage_path: filePath,
        storage_url: publicUrl,
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        },
      })
      .select()
      .single()

    if (dbError) {
      // Cleanup uploaded file if database insert fails
      await supabase.storage.from('brand-assets').remove([filePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Create asset_references entry
    const slug = generateSlug(name)
    const referenceId = `@global/${assetType}/${slug}`

    const { error: refError } = await supabase
      .from('asset_references')
      .insert({
        user_id: user.id,
        category_id: null, // Global asset
        reference_id: referenceId,
        asset_type: 'brand_asset',
        asset_table_id: asset.id,
        storage_url: publicUrl,
        display_name: name,
        searchable_text: `${name} ${assetType} ${slug}`,
      })

    if (refError) {
      console.error('Failed to create asset reference:', refError)
      // Don't fail the whole operation, just log it
    }

    return NextResponse.json({ asset }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
