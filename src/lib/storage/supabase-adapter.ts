import { createClient } from '@supabase/supabase-js'
import type { StorageAdapter, StorageFile, UploadOptions } from './types'

/**
 * Supabase storage adapter
 * Stores files in Supabase Storage buckets
 */
export class SupabaseAdapter implements StorageAdapter {
  private supabase
  private bucket: string

  constructor(bucket: string = 'product-images') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    this.bucket = bucket
  }

  async upload(
    file: Buffer | Blob,
    path: string,
    options?: UploadOptions
  ): Promise<StorageFile> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(path, file, {
          contentType: options?.contentType,
          cacheControl: options?.cacheControl || '3600',
          upsert: false,
        })

      if (error) {
        throw error
      }

      const {
        data: { publicUrl },
      } = this.supabase.storage.from(this.bucket).getPublicUrl(path)

      const fileSize =
        file instanceof Buffer ? file.length : (file as Blob).size

      return {
        path,
        publicUrl,
        size: fileSize,
        mimeType: options?.contentType || 'application/octet-stream',
      }
    } catch (error) {
      console.error('Supabase upload error:', error)
      throw new Error(`Failed to upload to Supabase: ${error}`)
    }
  }

  async download(path: string): Promise<Buffer> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .download(path)

      if (error) {
        throw error
      }

      const arrayBuffer = await data.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      console.error('Supabase download error:', error)
      throw new Error(`Failed to download from Supabase: ${error}`)
    }
  }

  async delete(path: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove([path])

      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Supabase delete error:', error)
      throw new Error(`Failed to delete from Supabase: ${error}`)
    }
  }

  getPublicUrl(path: string): string {
    const {
      data: { publicUrl },
    } = this.supabase.storage.from(this.bucket).getPublicUrl(path)
    return publicUrl
  }

  async exists(path: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .list(path.split('/').slice(0, -1).join('/'))

      if (error) {
        return false
      }

      const fileName = path.split('/').pop()
      return data?.some((file) => file.name === fileName) || false
    } catch {
      return false
    }
  }
}
