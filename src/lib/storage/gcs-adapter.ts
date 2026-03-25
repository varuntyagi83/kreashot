import { Storage } from '@google-cloud/storage'
import type { StorageAdapter, StorageFile, UploadOptions } from './types'

/**
 * Google Cloud Storage adapter
 * Uploads to a public GCS bucket — no proxy needed, permanent CDN URLs.
 *
 * Required env vars:
 *   GCS_BUCKET_NAME    — bucket name (must be public or have uniform public access)
 *   GCS_CLIENT_EMAIL   — service account email
 *   GCS_PRIVATE_KEY    — service account private key (with literal \n sequences)
 *   GCS_PROJECT_ID     — GCP project ID
 */
export class GCSAdapter implements StorageAdapter {
  private storage: Storage
  private bucketName: string

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME || ''
    if (!this.bucketName) throw new Error('GCS_BUCKET_NAME is not set')

    this.storage = new Storage({
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      projectId: process.env.GCS_PROJECT_ID,
    })
  }

  async upload(file: Buffer | Blob, path: string, options?: UploadOptions): Promise<StorageFile> {
    const buffer =
      file instanceof Buffer ? file : Buffer.from(await (file as Blob).arrayBuffer())

    const contentType = options?.contentType || 'application/octet-stream'
    const gcsFile = this.storage.bucket(this.bucketName).file(path)

    await gcsFile.save(buffer, {
      metadata: { contentType },
      // Makes the object publicly readable — bucket must allow object-level ACLs,
      // OR set uniform bucket-level public access and remove this line.
      predefinedAcl: 'publicRead',
    })

    return {
      path,
      publicUrl: `https://storage.googleapis.com/${this.bucketName}/${path}`,
      size: buffer.length,
      mimeType: contentType,
      // GCS uses the object path as the identifier (no separate fileId)
    }
  }

  async download(path: string): Promise<Buffer> {
    const [contents] = await this.storage.bucket(this.bucketName).file(path).download()
    return contents
  }

  async delete(path: string): Promise<void> {
    try {
      await this.storage.bucket(this.bucketName).file(path).delete()
    } catch (err: any) {
      if (err.code === 404) return // already deleted — treat as success
      throw new Error(`Failed to delete from GCS: ${err.message}`)
    }
  }

  getPublicUrl(path: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${path}`
  }

  async exists(path: string): Promise<boolean> {
    const [exists] = await this.storage.bucket(this.bucketName).file(path).exists()
    return exists
  }
}
