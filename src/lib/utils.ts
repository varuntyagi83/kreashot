import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the best src URL for a Google Drive image.
 * Prefers the server-side proxy (works regardless of public sharing settings).
 * Falls back to the raw storage_url if no Drive file ID can be determined.
 */
export function driveImgSrc(
  storageUrl: string | null | undefined,
  gdriveFileId?: string | null
): string {
  const fileId = gdriveFileId || extractDriveFileId(storageUrl)
  if (fileId) return `/api/image-proxy?fileId=${fileId}`
  // Data URLs must be returned verbatim — encodeURI corrupts base64 characters
  if (storageUrl?.startsWith('data:')) return storageUrl
  return storageUrl ? encodeURI(storageUrl) : ''
}

/** Extract a Google Drive file ID from any known Drive URL format */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
  if (lh3) return lh3[1]
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (drive) return drive[1]
  const thumb = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (thumb) return thumb[1]
  return null
}
