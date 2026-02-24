# Google Drive Integration (Optional)

## When to Use Google Drive

Use Google Drive as a storage backend if:
1. You exceed Supabase storage limits (1GB free, 100GB Pro)
2. You want unlimited storage (15GB free per account, $2/mo for 100GB)
3. You want user-accessible file sharing (download links, folders)
4. You need very large files (>100MB per file)

## Architecture with Google Drive

### Hybrid Approach (Recommended)
```
Small files (<10MB)     → Supabase Storage (fast CDN)
Large files (>10MB)     → Google Drive (unlimited)
All metadata            → Supabase Database (always)
```

### Implementation Plan

1. **Create Google Drive Service Account**
   - Go to Google Cloud Console
   - Create service account
   - Download credentials JSON
   - Share Google Drive folder with service account email

2. **Install Google Drive SDK**
   ```bash
   npm install googleapis
   ```

3. **Create Storage Adapter**
   ```typescript
   // src/lib/storage/adapter.ts
   interface StorageAdapter {
     upload(file: File, path: string): Promise<string>
     download(path: string): Promise<Blob>
     delete(path: string): Promise<void>
     getPublicUrl(path: string): string
   }

   class SupabaseAdapter implements StorageAdapter { ... }
   class GoogleDriveAdapter implements StorageAdapter { ... }
   ```

4. **Use Strategy Pattern**
   ```typescript
   const storage = fileSize > 10_000_000
     ? new GoogleDriveAdapter()
     : new SupabaseAdapter()

   await storage.upload(file, path)
   ```

5. **Update Database Schema**
   ```sql
   ALTER TABLE product_images
   ADD COLUMN storage_provider TEXT DEFAULT 'supabase';

   -- Values: 'supabase' | 'gdrive' | 's3' | 'cloudinary'
   ```

## Pros & Cons

### Supabase Storage
**Pros:**
- ✅ Integrated with auth (RLS works automatically)
- ✅ Fast CDN delivery
- ✅ Built-in image transformations
- ✅ Simple API

**Cons:**
- ❌ Storage limits (paid plans)
- ❌ Costs scale with usage

### Google Drive
**Pros:**
- ✅ Generous free tier (15GB)
- ✅ Cheap paid plans ($2/mo for 100GB)
- ✅ No per-file size limits (except 5TB max)
- ✅ Built-in sharing/collaboration

**Cons:**
- ❌ Slower than CDN (not optimized for image serving)
- ❌ More complex auth setup
- ❌ API rate limits
- ❌ Requires service account management

## Recommendation

**For now: Stick with Supabase**
- Your 20MB files work fine (100MB limit per file)
- Simpler architecture
- Better performance
- Built-in security

**Later: Add Google Drive if needed**
- Implement when you hit storage limits
- Easy to add as alternative adapter
- Can migrate files gradually

## Cost Comparison

**Scenario: 1000 products, 10 images each, 20MB average**

Total: 10,000 images × 20MB = 200GB

| Provider | Cost |
|----------|------|
| Supabase Free | ❌ Exceeds 1GB limit |
| Supabase Pro | $25/mo + $4.20/mo (100GB extra) = **$29.20/mo** |
| Google Drive | $2/mo (100GB) + $2/mo (100GB) = **$4/mo** |
| AWS S3 | ~$4.60/mo (200GB storage + transfer) |

**Winner for large files: Google Drive** 💰

## Implementation Status

- [ ] Google Cloud project created
- [ ] Service account configured
- [ ] Google Drive API enabled
- [ ] Storage adapter created
- [ ] Database schema updated
- [ ] Upload logic updated
- [ ] Download logic updated
- [ ] Migration script for existing files

**Status:** Not needed yet, but ready to implement when storage grows.
