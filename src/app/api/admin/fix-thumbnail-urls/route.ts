import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Fix background thumbnail URLs: migrate from deprecated
 * drive.google.com/thumbnail to lh3.googleusercontent.com/d/
 * POST /api/admin/fix-thumbnail-urls
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find all backgrounds using the old thumbnail URL format
    const { data: backgrounds, error } = await supabase
      .from('backgrounds')
      .select('id, storage_url, gdrive_file_id')
      .like('storage_url', '%drive.google.com/thumbnail%')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!backgrounds || backgrounds.length === 0) {
      return NextResponse.json({ message: 'No URLs to fix', updated: 0 })
    }

    let updated = 0
    let skipped = 0

    for (const bg of backgrounds) {
      // Extract file ID from either gdrive_file_id column or from the URL
      let fileId = bg.gdrive_file_id
      if (!fileId && bg.storage_url) {
        const match = bg.storage_url.match(/[?&]id=([^&]+)/)
        if (match) fileId = match[1]
      }

      if (!fileId) {
        skipped++
        continue
      }

      const newUrl = `https://lh3.googleusercontent.com/d/${fileId}=w2000`

      const { error: updateError } = await supabase
        .from('backgrounds')
        .update({ storage_url: newUrl })
        .eq('id', bg.id)

      if (updateError) {
        console.error(`Failed to update ${bg.id}:`, updateError)
        skipped++
      } else {
        updated++
      }
    }

    // Also fix shot URLs in the same pattern
    const { data: shots } = await supabase
      .from('shots')
      .select('id, storage_url, gdrive_file_id')
      .like('storage_url', '%drive.google.com/thumbnail%')

    let shotsUpdated = 0
    if (shots && shots.length > 0) {
      for (const shot of shots) {
        let fileId = shot.gdrive_file_id
        if (!fileId && shot.storage_url) {
          const match = shot.storage_url.match(/[?&]id=([^&]+)/)
          if (match) fileId = match[1]
        }
        if (!fileId) continue

        const newUrl = `https://lh3.googleusercontent.com/d/${fileId}=w2000`
        const { error: updateError } = await supabase
          .from('shots')
          .update({ storage_url: newUrl })
          .eq('id', shot.id)

        if (!updateError) shotsUpdated++
      }
    }

    return NextResponse.json({
      message: 'URL migration complete',
      backgrounds: { found: backgrounds.length, updated, skipped },
      shots: { found: shots?.length || 0, updated: shotsUpdated },
    })
  } catch (error) {
    console.error('Fix thumbnail URLs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
