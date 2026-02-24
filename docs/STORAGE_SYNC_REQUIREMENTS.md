# Storage Sync Requirements - Universal Pattern

## 🎯 Core Principle

**ALL asset types in AdForge MUST implement the same 3-layer storage sync system:**

```
UI ↔ Supabase Metadata ↔ Google Drive Files
```

**No exceptions.** Every table that stores file metadata must follow this pattern.

---

## ✅ Asset Types Requiring Sync

### Currently Synced
- [x] **angled_shots** - Full sync implemented (Phase 2)

### Needs Immediate Implementation
- [ ] **product_images** - Products tab assets
- [ ] **brand_assets** - User uploaded brand assets

### Future Implementation (Phases 3-6)
- [ ] **backgrounds** - AI-generated backgrounds (Phase 3)
- [ ] **composites** - Product + background composites (Phase 3)
- [ ] **copy_docs** - Marketing copy (Phase 4)
- [ ] **final_assets** - Final ad creatives (Phase 6)

---

## 📋 Implementation Checklist

For **EACH** new asset type, you MUST implement:

### 1. Database Schema
- [ ] Add `storage_provider` field ('gdrive' or 'supabase')
- [ ] Add `storage_path` field (file path in storage)
- [ ] Add `storage_url` field (public URL - Google Drive thumbnail API)
- [ ] Add `gdrive_file_id` field (Google Drive file ID for fast deletion)
- [ ] Add `user_id` field for RLS
- [ ] Create database trigger to queue deletions:
  ```sql
  CREATE TRIGGER trigger_queue_{table}_deletion
  AFTER DELETE ON {table}
  FOR EACH ROW
  EXECUTE FUNCTION queue_file_deletion();
  ```

### 2. Storage Adapter Integration
- [ ] Use `GoogleDriveAdapter` for uploads
- [ ] Use `deleteFile()` for deletions (multi-storage support)
- [ ] Store both `gdrive_file_id` AND `storage_url` in database
- [ ] Use thumbnail API URLs: `https://drive.google.com/thumbnail?id={ID}&sz=w2000`

### 3. API Endpoints
- [ ] **GET** endpoint:
  - Check `storage_provider` field
  - If 'gdrive', use `storage_url` from database (NOT generated URLs)
  - If 'supabase', generate Supabase Storage URL
- [ ] **DELETE** endpoint:
  - Delete from Google Drive FIRST (using `gdrive_file_id`)
  - Then delete Supabase metadata
  - Trigger will queue any failures

### 4. Deletion Queue Integration
- [ ] Database trigger auto-queues deletions
- [ ] Trigger uses `gdrive_file_id` for fast deletion
- [ ] Cron job processes queue every 5 minutes
- [ ] Retry logic for failed deletions (max 3 retries)

### 5. Cleanup Scripts
- [ ] Support for cleanup in reconciliation API
- [ ] Support for cleanup in orphaned metadata script
- [ ] Handle trashed files in Google Drive

### 6. UI Components
- [ ] Display images using `storage_url` from database
- [ ] Loading states for image display
- [ ] Delete button triggers synced deletion
- [ ] Error states for missing/broken images

---

## 🚨 Critical Rules

1. **NEVER delete from database without deleting from storage**
   - Always delete storage FIRST, metadata SECOND
   - If storage deletion fails, don't delete metadata

2. **NEVER use generated Supabase Storage URLs for Google Drive files**
   - Always use `storage_url` from database
   - Check `storage_provider` field first

3. **NEVER skip the deletion queue**
   - Database triggers handle orphaned files
   - Don't try to delete directly from Drive in triggers

4. **NEVER forget to update cleanup scripts**
   - Add new table to reconciliation API
   - Add new table to orphaned metadata cleanup
   - Add new trigger for deletion queue

5. **ALWAYS use thumbnail API URLs**
   - Format: `https://drive.google.com/thumbnail?id={ID}&sz=w2000`
   - NOT download URLs: `https://drive.google.com/uc?export=download&id={ID}`

---

## 📝 Code Templates

### Database Trigger Template

```sql
-- Trigger function (shared across all tables)
CREATE OR REPLACE FUNCTION queue_file_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if it's a Google Drive file
  IF OLD.storage_provider = 'gdrive' AND OLD.gdrive_file_id IS NOT NULL THEN
    INSERT INTO deletion_queue (
      resource_type,
      resource_id,
      user_id,
      storage_provider,
      storage_path,
      storage_url,
      gdrive_file_id
    ) VALUES (
      TG_TABLE_NAME,           -- 'product_images', 'backgrounds', etc.
      OLD.id,
      OLD.user_id,
      OLD.storage_provider,
      OLD.storage_path,
      OLD.storage_url,
      OLD.gdrive_file_id
    );
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for each table
CREATE TRIGGER trigger_queue_{table}_deletion
AFTER DELETE ON {table}
FOR EACH ROW
EXECUTE FUNCTION queue_file_deletion();
```

### DELETE Endpoint Template

```typescript
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = await createServerSupabaseClient()

  // Get the record
  const { data: record, error: fetchError } = await supabase
    .from('{table}')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete from storage FIRST
  if (record.storage_provider === 'gdrive' && record.gdrive_file_id) {
    await deleteFile(record.gdrive_file_id, { provider: 'gdrive' })
  } else if (record.storage_provider === 'supabase') {
    await supabase.storage
      .from('{bucket}')
      .remove([record.storage_path])
  }

  // Delete from database SECOND
  const { error: deleteError } = await supabase
    .from('{table}')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'Deleted successfully' })
}
```

### GET Endpoint Template

```typescript
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: records, error } = await supabase
    .from('{table}')
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Add public URLs
  const recordsWithUrls = (records || []).map((record) => {
    let publicUrl: string

    // Check storage provider
    if (record.storage_provider === 'gdrive' && record.storage_url) {
      // Use URL from database (Google Drive thumbnail API)
      publicUrl = record.storage_url
    } else {
      // Generate Supabase Storage URL
      const { data: { publicUrl: supabaseUrl } } = supabase.storage
        .from('{bucket}')
        .getPublicUrl(record.storage_path)
      publicUrl = supabaseUrl
    }

    return {
      ...record,
      public_url: publicUrl
    }
  })

  return NextResponse.json({ records: recordsWithUrls })
}
```

---

## 🔄 Migration Checklist

When adding a new asset type to existing system:

1. [ ] Create migration file in `supabase/migrations/`
2. [ ] Add storage fields to table (provider, path, url, gdrive_file_id)
3. [ ] Create deletion trigger
4. [ ] Update API endpoints (GET, DELETE)
5. [ ] Update cleanup scripts
6. [ ] Update documentation
7. [ ] Test all 4 deletion scenarios:
   - UI delete (immediate sync)
   - Manual Drive delete (reconciliation)
   - Drive trash (cleanup script)
   - Manual DB delete (deletion queue)

---

## 📚 Reference Implementation

See **angled_shots** for complete reference:
- Schema: `supabase/migrations/006_add_deletion_queue.sql`
- API: `src/app/api/categories/[id]/angled-shots/[angleId]/route.ts`
- Cleanup: `scripts/cleanup-orphaned-local.ts`
- Documentation: `docs/STORAGE_SYNC.md`

---

## 🎯 Success Criteria

For each asset type, ALL of these must pass:

- ✅ Can delete from UI → Both Drive & DB deleted
- ✅ Delete from Drive → Can run cleanup to sync DB
- ✅ Move to Drive trash → Cleanup script removes metadata
- ✅ Delete from DB → File queued for Drive deletion
- ✅ Images display without "Loading..." errors
- ✅ No hardcoded URLs or generated URLs for Drive files
- ✅ Deletion queue processes successfully
- ✅ Cleanup scripts identify and remove orphaned records

---

**Remember:** Every file in the system needs this sync. No shortcuts. No exceptions.
