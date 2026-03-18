/**
 * Sanitizes a company name for use in Google Drive folder names.
 * Preserves readability while ensuring filesystem compatibility.
 *
 * Examples:
 *   "Sunday Natural GmbH" → "Sunday Natural GmbH"
 *   "Acme Corp." → "Acme Corp"
 *   "My Company™" → "My Company"
 *   "Test/Co" → "Test-Co"
 */
export function sanitizeCompanyName(name: string): string {
  return name
    .trim()
    // Remove or replace problematic characters for filesystem
    .replace(/[<>:"|?*\\\/]/g, '-') // Replace filesystem-unsafe chars with hyphen
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .replace(/\.+$/g, '') // Remove trailing dots
    .replace(/\s+$/g, '') // Remove trailing spaces
    .trim()
}
