/**
 * Storage adapter types for multi-provider file storage
 * Supports Supabase, Google Drive, S3, and other providers
 */

export interface UploadOptions {
  contentType?: string
  metadata?: Record<string, string>
  cacheControl?: string
}

export interface StorageFile {
  path: string
  publicUrl: string
  size: number
  mimeType: string
  fileId?: string // Provider-specific file ID (e.g., Google Drive file ID)
}

export interface StorageAdapter {
  /**
   * Upload a file to storage
   * @param file - File buffer or Blob
   * @param path - Storage path (e.g., "product-images/user-id/product-id/image.jpg")
   * @param options - Upload options
   * @returns Storage file information
   */
  upload(
    file: Buffer | Blob,
    path: string,
    options?: UploadOptions
  ): Promise<StorageFile>

  /**
   * Download a file from storage
   * @param path - Storage path
   * @returns File buffer
   */
  download(path: string): Promise<Buffer>

  /**
   * Delete a file from storage
   * @param path - Storage path
   */
  delete(path: string): Promise<void>

  /**
   * Get public URL for a file
   * @param path - Storage path
   * @returns Public URL
   */
  getPublicUrl(path: string): string

  /**
   * Check if a file exists
   * @param path - Storage path
   * @returns True if file exists
   */
  exists(path: string): Promise<boolean>
}

export type StorageProvider = 'supabase' | 'gdrive' | 's3' | 'local'
