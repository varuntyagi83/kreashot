import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyId } from '@/lib/get-company'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { data: asset, error } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      }
      console.error('[brand-assets/[id] GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ asset })
  } catch (error: any) {
    console.error('[brand-assets/[id] GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }
    console.log(`[audit] DELETE brand-asset ${id} by user ${user.id} at ${new Date().toISOString()}`)

    // Get asset first to get storage path
    const { data: asset, error: fetchError } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      }
      console.error('[brand-assets/[id] DELETE] fetchError:', fetchError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Delete from storage (Supabase for fonts, GDrive for other assets)
    if (asset.storage_provider === 'supabase') {
      const { error: storageError } = await supabase.storage
        .from('brand-assets')
        .remove([asset.storage_path])
      if (storageError) {
        console.error('Failed to delete from Supabase storage:', storageError)
      }
    } else if (asset.storage_provider === 'gdrive' && (asset.gdrive_file_id || asset.storage_path)) {
      try {
        const { deleteFile } = await import('@/lib/storage')
        await deleteFile(asset.gdrive_file_id || asset.storage_path, { provider: 'gdrive' })
      } catch (e) {
        console.error('Failed to delete from GDrive:', e)
      }
    }

    // Delete asset_references entry
    await supabase
      .from('asset_references')
      .delete()
      .eq('asset_table_id', id)
      .eq('company_id', companyId)
      .eq('asset_type', 'brand_asset')

    // Delete from database
    const { error: deleteError } = await supabase
      .from('brand_assets')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)

    if (deleteError) {
      console.error('[brand-assets/[id] DELETE] deleteError:', deleteError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Asset deleted successfully' })
  } catch (error: any) {
    console.error('[brand-assets/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
