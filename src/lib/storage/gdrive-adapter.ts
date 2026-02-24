import { google } from 'googleapis'
import type { StorageAdapter, StorageFile, UploadOptions } from './types'
import { Readable } from 'stream'

// Process-level folder ID cache: "parentId/folderName" → Drive folder ID
// Survives across requests in the same Node.js process, eliminating redundant
// drive.files.list() calls for folders that already exist.
const folderCache = new Map<string, string>()

// In-flight creation locks: prevents concurrent uploads from racing to create
// the same folder simultaneously (which would produce duplicate folders).
const folderCreating = new Map<string, Promise<string>>()

/**
 * Google Drive storage adapter
 * Stores files in a shared Google Drive folder
 */
export class GoogleDriveAdapter implements StorageAdapter {
  private drive
  private folderId: string

  constructor() {
    // Initialize Google Drive API client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    this.drive = google.drive({ version: 'v3', auth })
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || ''

    if (!this.folderId) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set')
    }
  }

  /**
   * Get or create a single folder level, with caching and creation locking.
   * Cache key = "parentId/folderName" so it's unique across the folder tree.
   */
  private async getOrCreateSingleFolder(parentId: string, folderName: string): Promise<string> {
    const cacheKey = `${parentId}/${folderName}`

    // 1. Cache hit — no API call needed
    if (folderCache.has(cacheKey)) {
      return folderCache.get(cacheKey)!
    }

    // 2. Another concurrent call is already creating this folder — wait for it
    if (folderCreating.has(cacheKey)) {
      return folderCreating.get(cacheKey)!
    }

    // 3. First caller: do the lookup/create and hold the promise so others wait
    const promise = (async () => {
      const { data } = await this.drive.files.list({
        q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

      let folderId: string
      if (data.files && data.files.length > 0) {
        folderId = data.files[0].id!
      } else {
        const { data: folder } = await this.drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
          },
          fields: 'id',
          supportsAllDrives: true,
        })
        folderId = folder.id!
      }

      folderCache.set(cacheKey, folderId)
      folderCreating.delete(cacheKey)
      return folderId
    })()

    folderCreating.set(cacheKey, promise)
    return promise
  }

  /**
   * Get or create the full folder hierarchy for a file path.
   * e.g. "gummy-bear/angled-shots/16x9/shot.jpg" → resolves the 16x9 folder ID.
   */
  private async getOrCreateFolder(path: string): Promise<string> {
    const folders = path.split('/').filter(Boolean).slice(0, -1) // strip filename

    let currentFolderId = this.folderId
    for (const folderName of folders) {
      currentFolderId = await this.getOrCreateSingleFolder(currentFolderId, folderName)
    }
    return currentFolderId
  }

  /**
   * Upload a file to Google Drive
   */
  async upload(
    file: Buffer | Blob,
    path: string,
    options?: UploadOptions
  ): Promise<StorageFile> {
    try {
      // Get or create folder structure
      const parentFolderId = await this.getOrCreateFolder(path)
      const fileName = path.split('/').pop()!

      // Convert file to stream
      let buffer: Buffer
      if (file instanceof Buffer) {
        buffer = file
      } else {
        // file is Blob (type assertion needed for TypeScript)
        const arrayBuffer = await (file as Blob).arrayBuffer()
        buffer = Buffer.from(arrayBuffer)
      }
      const stream = Readable.from(buffer)

      // Upload file (support Shared Drives)
      const { data } = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentFolderId],
          mimeType: options?.contentType || 'application/octet-stream',
        },
        media: {
          mimeType: options?.contentType || 'application/octet-stream',
          body: stream,
        },
        fields: 'id, name, size, webViewLink, webContentLink, thumbnailLink',
        supportsAllDrives: true,
      })

      // Make file publicly accessible (support Shared Drives)
      await this.drive.permissions.create({
        fileId: data.id!,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      })

      // Use Google Drive thumbnail API for image embedding
      // This format works in <img> tags without CORS issues and doesn't expire
      // sz=w2000 ensures high quality (max 2000px width)
      const publicUrl = `https://drive.google.com/thumbnail?id=${data.id}&sz=w2000`

      return {
        path,
        publicUrl,
        size: parseInt(data.size || '0'),
        mimeType: options?.contentType || 'application/octet-stream',
        fileId: data.id!, // Include file ID for faster deletion
      }
    } catch (error) {
      console.error('Google Drive upload error:', error)
      throw new Error(`Failed to upload to Google Drive: ${error}`)
    }
  }

  /**
   * Download a file from Google Drive
   */
  async download(path: string): Promise<Buffer> {
    try {
      // Find file by path
      const fileId = await this.findFileByPath(path)

      if (!fileId) {
        throw new Error(`File not found: ${path}`)
      }

      // Download file (support Shared Drives)
      const { data } = await this.drive.files.get(
        {
          fileId,
          alt: 'media',
          supportsAllDrives: true,
        },
        { responseType: 'arraybuffer' }
      )

      return Buffer.from(data as ArrayBuffer)
    } catch (error) {
      console.error('Google Drive download error:', error)
      throw new Error(`Failed to download from Google Drive: ${error}`)
    }
  }

  /**
   * Delete a file from Google Drive
   * Can delete by path or by file ID
   */
  async delete(pathOrFileId: string): Promise<void> {
    try {
      let fileId: string | null = null

      // Check if input is a file ID (starts with 1 and contains no slashes) or a path
      if (!pathOrFileId.includes('/') && pathOrFileId.length > 20) {
        // Likely a file ID
        fileId = pathOrFileId
      } else {
        // It's a path, need to find the file
        fileId = await this.findFileByPath(pathOrFileId)
      }

      if (!fileId) {
        console.warn(`File not found for deletion: ${pathOrFileId}`)
        return
      }

      // Try to delete the file
      try {
        await this.drive.files.delete({
          fileId,
          supportsAllDrives: true,
        })
      } catch (deleteError: any) {
        // If file not found during delete, it might already be deleted
        if (deleteError.code === 404) {
          console.warn(`File already deleted or not found: ${fileId}`)
          return
        }
        throw deleteError
      }
    } catch (error) {
      console.error('Google Drive delete error:', error)
      // Don't throw error for 404s - file might already be deleted
      if ((error as any).code !== 404) {
        throw new Error(`Failed to delete from Google Drive: ${error}`)
      }
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(path: string): string {
    // Note: This returns a placeholder URL
    // The actual URL is generated during upload
    // For real usage, store the fileId in the database
    return `https://drive.google.com/file/d/${path}/view`
  }

  /**
   * Check if a file exists
   */
  async exists(path: string): Promise<boolean> {
    try {
      const fileId = await this.findFileByPath(path)
      return !!fileId
    } catch {
      return false
    }
  }

  /**
   * Find a file by its path (helper method)
   * Traverses the folder structure to find the file
   */
  private async findFileByPath(path: string): Promise<string | null> {
    try {
      const pathParts = path.split('/').filter(Boolean)
      const fileName = pathParts.pop()!
      let currentFolderId = this.folderId

      // Traverse folders (support Shared Drives)
      for (const folderName of pathParts) {
        const { data } = await this.drive.files.list({
          q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

        if (!data.files || data.files.length === 0) {
          return null
        }

        currentFolderId = data.files[0].id!
      }

      // Find file (support Shared Drives)
      const { data } = await this.drive.files.list({
        q: `name='${fileName}' and '${currentFolderId}' in parents and trashed=false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

      return data.files && data.files.length > 0 ? data.files[0].id! : null
    } catch (error) {
      console.error('Error finding file:', error)
      return null
    }
  }
}
