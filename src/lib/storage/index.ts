import { GoogleDriveAdapter } from './gdrive-adapter'
import { GCSAdapter } from './gcs-adapter'
import { SupabaseAdapter } from './supabase-adapter'
import type { StorageAdapter, StorageProvider } from './types'

export * from './types'
export { GoogleDriveAdapter } from './gdrive-adapter'
export { GCSAdapter } from './gcs-adapter'
export { SupabaseAdapter } from './supabase-adapter'

/**
 * Get storage adapter based on configuration.
 * Defaults to GCS. Set STORAGE_PROVIDER=gdrive to keep using Google Drive.
 */
export function getStorageAdapter(
  provider?: StorageProvider,
  bucket?: string
): StorageAdapter {
  const selectedProvider =
    provider || (process.env.STORAGE_PROVIDER as StorageProvider) || 'gcs'

  switch (selectedProvider) {
    case 'gcs':
      return new GCSAdapter()

    case 'gdrive':
      return new GoogleDriveAdapter()

    case 'supabase':
      return new SupabaseAdapter(bucket || 'product-images')

    case 's3':
      throw new Error('S3 adapter not yet implemented')

    case 'local':
      throw new Error('Local adapter not yet implemented')

    default:
      return new GCSAdapter()
  }
}

/**
 * Upload a file using the configured storage provider
 */
export async function uploadFile(
  file: Buffer | Blob,
  path: string,
  options?: {
    contentType?: string
    provider?: StorageProvider
    bucket?: string
  }
) {
  const adapter = getStorageAdapter(options?.provider, options?.bucket)
  return adapter.upload(file, path, {
    contentType: options?.contentType,
  })
}

/**
 * Download a file using the configured storage provider
 */
export async function downloadFile(
  path: string,
  options?: {
    provider?: StorageProvider
    bucket?: string
  }
) {
  const adapter = getStorageAdapter(options?.provider, options?.bucket)
  return adapter.download(path)
}

/**
 * Delete a file using the configured storage provider
 */
export async function deleteFile(
  path: string,
  options?: {
    provider?: StorageProvider
    bucket?: string
  }
) {
  const adapter = getStorageAdapter(options?.provider, options?.bucket)
  return adapter.delete(path)
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(
  path: string,
  options?: {
    provider?: StorageProvider
    bucket?: string
  }
) {
  const adapter = getStorageAdapter(options?.provider, options?.bucket)
  return adapter.getPublicUrl(path)
}
