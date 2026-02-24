# Storage Sync System

AdForge uses **Google Drive** for image storage and **Supabase** for metadata. This document explains how the sync system keeps them in sync across all deletion scenarios.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Google Drive   │ ◄─────► │    Supabase DB   │
│  (Images)       │         │   (Metadata)     │
└─────────────────┘         └──────────────────┘
         │                           │
         │                           │
         └───────────┬───────────────┘
                     │
              Sync Mechanisms:
              1. UI Deletion
              2. Database Triggers
              3. Reconciliation API
              4. Cron Job
```

## Storage Fields

Each `angled_shots` record contains:
- `storage_provider`: `'gdrive'` or `'supabase'`
- `storage_path`: File path (e.g., `product-images/user/product/angle.jpg`)
- `storage_url`: Public URL for the image
- `gdrive_file_id`: **Google Drive file ID** (key for fast deletion!)

## Deletion Scenarios & Solutions

### 1. ✅ **Delete via UI** (Fully Synced)

**What happens:**
1. User clicks "Delete" on an angled shot
2. API deletes file from **Google Drive** (using `gdrive_file_id`)
3. API deletes metadata from **Supabase**

**Implementation:** [`/api/categories/[id]/angled-shots/[angleId]/route.ts`](../src/app/api/categories/[id]/angled-shots/[angleId]/route.ts)

```typescript
// 1. Delete from Google Drive
await deleteFile(angledShot.gdrive_file_id, { provider: 'gdrive' })

// 2. Delete from Supabase
await supabase.from('angled_shots').delete().eq('id', angleId)
```

**Status:** ✅ **Fully synced** - no orphans

---

### 2. ⚠️ **Delete from Google Drive Manually** (Orphaned Metadata)

**Problem:** User deletes file directly in Google Drive → Supabase metadata still exists → UI shows broken images

**Solution:** Run **Reconciliation API** to cleanup orphaned records

**How to fix:**

```bash
# 1. Dry run (check what would be deleted)
curl -X POST https://your-app.vercel.app/api/categories/{categoryId}/angled-shots/sync \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# 2. Review the orphaned records in the response

# 3. Actually delete orphaned metadata
curl -X POST https://your-app.vercel.app/api/categories/{categoryId}/angled-shots/sync \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

**What it does:**
- Checks each Supabase record
- Verifies if Google Drive file exists
- Deletes orphaned Supabase records (where Drive file is missing)

**Status:** ⚠️ **Manual sync required** - run reconciliation API

---

### 3. 🔄 **Delete from Supabase Manually** (Queued Cleanup)

**Problem:** User/admin deletes Supabase record directly → Google Drive file still exists → orphaned file

**Solution:** **Database Trigger** + **Deletion Queue** + **Cron Job**

**How it works:**

1. **Trigger fires** when `angled_shots` record is deleted
   ```sql
   -- Automatically queues the file for deletion
   INSERT INTO deletion_queue (...)
   ```

2. **Cron job processes queue** (runs every 5 minutes)
   ```bash
   POST /api/admin/process-deletion-queue
   ```

3. **File deleted from Google Drive**

**Status:** 🔄 **Auto-synced** - deletion queue processed by cron job

---

### 4. 🗑️ **Google Drive Trash Cleanup** (Automated)

**Problem:** Files moved to Google Drive trash still have metadata in Supabase → UI shows "broken" images

**Solution:** **Cleanup Orphaned Metadata** endpoint + scripts

**How it works:**

1. **Script checks each record** against Google Drive API
   ```typescript
   // Check if file exists and is not trashed
   const response = await drive.files.get({
     fileId,
     fields: 'id, trashed'
   })

   if (response.data.trashed) {
     // Mark as orphaned
   }
   ```

2. **Deletes orphaned metadata** from Supabase
3. **Keeps database in sync** with Google Drive state

**Status:** 🗑️ **Run cleanup script** - removes metadata for trashed/deleted files

---

## API Endpoints

### 1. Delete Angled Shot (UI)

```
DELETE /api/categories/{categoryId}/angled-shots/{angleId}
```

Deletes from **both** Google Drive and Supabase in one atomic operation.

**Usage:** Handled automatically by the UI

---

### 2. Reconciliation (Cleanup Orphans)

```
POST /api/categories/{categoryId}/angled-shots/sync
```

**Request:**
```json
{
  "dryRun": true  // false to actually delete
}
```

**Response:**
```json
{
  "message": "Sync complete - deleted 5 orphaned records",
  "stats": {
    "total": 42,
    "valid": 37,
    "orphanedRecords": 5,
    "deleted": 5
  },
  "orphanedRecords": [
    {
      "id": "uuid",
      "angle_name": "front",
      "product_id": "uuid",
      "storage_path": "path/to/file.jpg",
      "gdrive_file_id": "1ABC..."
    }
  ]
}
```

**When to use:**
- After manually deleting files from Google Drive
- Periodic cleanup (monthly/weekly)
- When UI shows broken images

---

### 3. Process Deletion Queue (Cron)

```
POST /api/admin/process-deletion-queue
Authorization: Bearer {CRON_SECRET}
```

**Response:**
```json
{
  "message": "Deletion queue processed",
  "total": 10,
  "successful": 8,
  "failed": 2
}
```

**Get Queue Status:**
```
GET /api/admin/process-deletion-queue
Authorization: Bearer {CRON_SECRET}
```

**Response:**
```json
{
  "queue": {
    "pending": 5,
    "processing": 0,
    "completed": 120,
    "failed": 2
  }
}
```

---

### 4. Cleanup Orphaned Metadata (Admin)

```
POST /api/admin/cleanup-orphaned-metadata
Authorization: Bearer {CRON_SECRET}
```

**Purpose:** Remove Supabase metadata for files that are trashed or permanently deleted in Google Drive.

**Request:**
```json
{
  "dryRun": true  // false to actually delete
}
```

**Response:**
```json
{
  "message": "Cleanup complete - 28 records deleted",
  "dryRun": false,
  "stats": {
    "total": 42,
    "valid": 14,
    "orphaned": 28,
    "deleted": 28
  },
  "orphanedRecords": [
    {
      "id": "uuid",
      "angle_name": "front",
      "gdrive_file_id": "1ABC..."
    }
  ]
}
```

**When to use:**
- After moving files to Google Drive trash
- Periodic cleanup (weekly/monthly)
- When database shows more records than exist in Drive

**Scripts:**

**Local cleanup** (direct database access):
```bash
# Dry run (see what would be deleted)
npx tsx scripts/cleanup-orphaned-local.ts

# Execute cleanup
npx tsx scripts/cleanup-orphaned-local.ts --execute
```

**API cleanup** (via Vercel endpoint):
```bash
# Dry run
npx tsx scripts/cleanup-orphaned-metadata.ts

# Execute cleanup
npx tsx scripts/cleanup-orphaned-metadata.ts --execute
```

---

## Database Schema

### `deletion_queue` Table

```sql
CREATE TABLE deletion_queue (
  id UUID PRIMARY KEY,
  resource_type TEXT NOT NULL,        -- 'angled_shot', 'product_image'
  resource_id UUID,                   -- Original record ID
  storage_provider TEXT NOT NULL,     -- 'gdrive'
  storage_path TEXT,                  -- Fallback path
  gdrive_file_id TEXT,                -- File ID (preferred)
  storage_url TEXT,                   -- Public URL
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'pending',      -- 'pending', 'completed', 'failed'
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);
```

**Triggers:**
- `trigger_queue_angled_shot_deletion` - fires on `DELETE` from `angled_shots`
- `trigger_queue_product_image_deletion` - fires on `DELETE` from `product_images`

---

## Setup Instructions

### 1. Run Database Migration

```bash
cd supabase
npx supabase db push
```

This creates:
- `deletion_queue` table
- Database triggers
- RLS policies

### 2. Set Environment Variables

Add to `.env.local`:

```bash
# For cron job authentication
CRON_SECRET=your-random-secret-key
```

### 3. Setup Vercel Cron Job

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/admin/process-deletion-queue",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs the deletion queue processor every 5 minutes.

### 4. Deploy

```bash
git add -A
git commit -m "Add storage sync system"
git push
```

Vercel will automatically set up the cron job.

---

## Testing

### Test 1: UI Deletion

1. Go to Angled Shots tab
2. Delete an angled shot
3. ✅ Verify file removed from Google Drive
4. ✅ Verify record removed from Supabase

### Test 2: Manual Google Drive Deletion

1. Delete a file directly in Google Drive
2. Run reconciliation:
   ```bash
   curl -X POST .../sync -d '{"dryRun": false}'
   ```
3. ✅ Verify orphaned Supabase record deleted
4. ✅ Verify UI no longer shows broken image

### Test 3: Manual Supabase Deletion

1. Delete a record from Supabase (SQL Editor):
   ```sql
   DELETE FROM angled_shots WHERE id = 'some-uuid';
   ```
2. Check deletion queue:
   ```sql
   SELECT * FROM deletion_queue WHERE status = 'pending';
   ```
3. Wait 5 minutes (cron job) or manually trigger:
   ```bash
   curl -X POST .../process-deletion-queue \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
4. ✅ Verify file deleted from Google Drive

### Test 4: Google Drive Trash Cleanup

1. Move a file to trash in Google Drive
2. Run cleanup in dry-run mode:
   ```bash
   npx tsx scripts/cleanup-orphaned-local.ts
   ```
3. ✅ Verify it identifies the trashed file
4. Run cleanup to delete metadata:
   ```bash
   npx tsx scripts/cleanup-orphaned-local.ts --execute
   ```
5. ✅ Verify orphaned Supabase record deleted
6. ✅ Verify UI no longer shows the image

---

## Monitoring

### Check Queue Status

```bash
curl https://your-app.vercel.app/api/admin/process-deletion-queue \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Check Failed Deletions

```sql
SELECT * FROM deletion_queue
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Retry Failed Deletions

```sql
-- Reset failed deletions for retry
UPDATE deletion_queue
SET status = 'pending', retry_count = 0
WHERE status = 'failed';
```

---

## Best Practices

1. **Always use UI deletion** - most reliable, immediate sync
2. **Run cleanup script weekly** - remove metadata for trashed Google Drive files
   ```bash
   npx tsx scripts/cleanup-orphaned-local.ts --execute
   ```
3. **Run reconciliation monthly** - cleanup any missed orphans
4. **Monitor deletion queue** - check for failed deletions
5. **Don't manually delete from Google Drive** - unless necessary, then run cleanup
6. **Use `dryRun: true` first** - before running any cleanup/reconciliation
7. **Check cleanup stats** - verify orphaned count makes sense before executing

---

## Troubleshooting

### Orphaned Records Not Deleted

**Symptom:** UI shows broken images after running sync

**Solution:**
```bash
# 1. Check what would be deleted
curl -X POST .../sync -d '{"dryRun": true}'

# 2. If output looks correct, run for real
curl -X POST .../sync -d '{"dryRun": false}'
```

### Deletion Queue Growing

**Symptom:** Queue has many pending items

**Check cron job:**
```bash
# Manually trigger
curl -X POST .../process-deletion-queue \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Check Vercel logs:**
- Go to Vercel Dashboard → Functions → Cron Logs

### Google Drive API Quota Exceeded

**Symptom:** Many failed deletions with quota errors

**Solution:**
- Wait 24 hours for quota reset
- Reduce cron frequency (every 15 mins instead of 5)
- Batch deletions (delete 10 at a time instead of 50)

---

## Summary

| Deletion Method | Google Drive | Supabase DB | How to Sync |
|----------------|--------------|-------------|-------------|
| **UI Delete** | ✅ Immediate | ✅ Immediate | Auto - Fully synced |
| **Manual Drive Delete** | ✅ Manual | ⚠️ Orphaned | Run reconciliation API |
| **Drive Trash** | 🗑️ Trashed | ⚠️ Orphaned | Run cleanup script |
| **Manual DB Delete** | 🔄 Queued | ✅ Immediate | Auto - Cron (5 min) |

**Key Takeaways:**
- ✅ **Best:** Always use UI deletion for immediate, reliable sync
- 🗑️ **Cleanup:** Run `cleanup-orphaned-local.ts` weekly to remove metadata for trashed files
- 🔄 **Automated:** Deletion queue handles manual DB deletions automatically
