import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// PATCH /api/categories/[id]/products/[productId]/images/[imageId] - Set as primary
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; productId: string; imageId: string }>
  }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId, imageId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify image belongs to user's product
    const { data: image } = await supabase
      .from('product_images')
      .select('*, product:products!inner(category:categories!inner(user_id))')
      .eq('id', imageId)
      .eq('product_id', productId)
      .eq('product.category_id', categoryId)
      .eq('product.category.user_id', user.id)
      .single()

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Remove primary flag from all images for this product
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId)

    // Set this image as primary
    const { data: updatedImage, error } = await supabase
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', imageId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ image: updatedImage })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/categories/[id]/products/[productId]/images/[imageId] - Delete image
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; productId: string; imageId: string }>
  }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId, imageId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify image belongs to user's product
    const { data: image } = await supabase
      .from('product_images')
      .select('*, product:products!inner(category:categories!inner(user_id))')
      .eq('id', imageId)
      .eq('product_id', productId)
      .eq('product.category_id', categoryId)
      .eq('product.category.user_id', user.id)
      .single()

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('product-images')
      .remove([image.file_path])

    if (storageError) {
      console.error('Storage deletion error:', storageError)
    }

    // If this was the primary image, set another image as primary
    if (image.is_primary) {
      const { data: nextImage } = await supabase
        .from('product_images')
        .select('id')
        .eq('product_id', productId)
        .neq('id', imageId)
        .limit(1)
        .single()

      if (nextImage) {
        await supabase
          .from('product_images')
          .update({ is_primary: true })
          .eq('id', nextImage.id)
      }
    }

    // Delete from database
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId)

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
