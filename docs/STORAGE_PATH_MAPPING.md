# Storage Path Mapping: Supabase ↔ Google Drive

This document shows how file paths map **exactly** between Supabase Storage and Google Drive.

## 🎯 Key Principle

**The code uses the SAME path for both providers.**

```typescript
// Upload to either provider (code is identical!)
const path = `product-images/${userId}/${productId}/${filename}`

// Supabase:
await supabaseAdapter.upload(file, path)
// → Stored at: product-images/{userId}/{productId}/{filename}

// Google Drive:
await gdriveAdapter.upload(file, path)
// → Stored at: AdForge Files/product-images/{userId}/{productId}/{filename}
```

---

## 📁 Path Mapping Examples

### Example 1: Product Image

**Code:**
```typescript
const path = 'product-images/user-abc123/product-xyz789/photo.jpg'
```

**Supabase Storage:**
```
Bucket: product-images
Path:   user-abc123/product-xyz789/photo.jpg
URL:    https://raedrrohryxpibmmhcjo.supabase.co/storage/v1/object/public/product-images/user-abc123/product-xyz789/photo.jpg
```

**Google Drive:**
```
Root:   AdForge Files/
Path:   product-images/user-abc123/product-xyz789/photo.jpg
URL:    https://drive.google.com/uc?export=download&id=1AbCdEf...
```

**Visual:**
```
Supabase:           Google Drive:
product-images/     AdForge Files/product-images/
├── user-abc123/    ├── user-abc123/
│   └── product-xyz789/    │   └── product-xyz789/
│       └── photo.jpg      │       └── photo.jpg  ✅ SAME!
```

---

### Example 2: Angled Shot

**Code:**
```typescript
const path = 'angled-shots/user-123/category-456/front_view.jpg'
```

**Supabase Storage:**
```
Bucket: angled-shots
Path:   user-123/category-456/front_view.jpg
```

**Google Drive:**
```
Root:   AdForge Files/
Path:   angled-shots/user-123/category-456/front_view.jpg
```

**Visual:**
```
Supabase:           Google Drive:
angled-shots/       AdForge Files/angled-shots/
├── user-123/       ├── user-123/
│   └── category-456/      │   └── category-456/
│       └── front_view.jpg │       └── front_view.jpg  ✅ SAME!
```

---

### Example 3: Brand Asset

**Code:**
```typescript
const path = 'brand-assets/user-abc/logo.png'
```

**Supabase Storage:**
```
Bucket: brand-assets
Path:   user-abc/logo.png
```

**Google Drive:**
```
Root:   AdForge Files/
Path:   brand-assets/user-abc/logo.png
```

**Visual:**
```
Supabase:           Google Drive:
brand-assets/       AdForge Files/brand-assets/
└── user-abc/       └── user-abc/
    └── logo.png        └── logo.png  ✅ SAME!
```

---

## 🔧 How Automatic Folder Creation Works

### Code Flow (gdrive-adapter.ts)

```typescript
// 1. User uploads file with path
await adapter.upload(file, 'product-images/user-123/product-456/image.jpg')

// 2. getOrCreateFolder() is called internally
const path = 'product-images/user-123/product-456/image.jpg'
const pathParts = path.split('/')
// → ['product-images', 'user-123', 'product-456', 'image.jpg']

const folders = pathParts.slice(0, -1) // Remove filename
// → ['product-images', 'user-123', 'product-456']

// 3. Traverse/create each folder
let currentFolderId = rootFolderId // "AdForge Files"

for (const folderName of folders) {
  // Check: Does "product-images" exist in "AdForge Files"?
  const exists = await checkFolderExists(folderName, currentFolderId)

  if (exists) {
    currentFolderId = existingFolderId
  } else {
    // Create folder "product-images" inside "AdForge Files"
    currentFolderId = await createFolder(folderName, currentFolderId)
  }

  // Repeat for "user-123" inside "product-images"
  // Repeat for "product-456" inside "user-123"
}

// 4. Upload file to final folder
await uploadFileToFolder(file, currentFolderId, 'image.jpg')
```

---

## 📊 Database Consistency

The database stores the **same path** regardless of provider:

```sql
-- product_images table
INSERT INTO product_images (
  file_path,          -- Same for both!
  storage_provider,   -- 'supabase' or 'gdrive'
  storage_url,        -- Different URLs
  gdrive_file_id      -- Only for Google Drive
) VALUES (
  'product-images/user-123/product-456/image.jpg',  -- ← SAME PATH
  'gdrive',
  'https://drive.google.com/uc?export=download&id=...',
  '1AbCdEf...'
);
```

---

## ✅ Guarantees

1. **Same Hierarchy:**
   - ✅ Both use: `{bucket}/{user_id}/{resource_id}/{filename}`
   - ✅ Code doesn't change between providers
   - ✅ Automatic folder creation in Google Drive

2. **No Conflicts:**
   - ✅ Existing folders are reused (no duplicates)
   - ✅ Folders created on-demand (lazy creation)
   - ✅ Thread-safe (Google Drive API handles concurrency)

3. **Easy Migration:**
   - ✅ Can switch providers without changing paths
   - ✅ Can run both providers simultaneously
   - ✅ Database tracks which provider has which file

---

## 🧪 Testing the Structure

Run the test script:

```bash
npx tsx scripts/test-gdrive-structure.ts
```

This will show:
- ✅ How paths are split into folders
- ✅ Expected folder structure in Google Drive
- ✅ Automatic folder creation logic

---

## 🎯 Summary

**Question:** How do we ensure Google Drive has the same hierarchy as Supabase?

**Answer:** The code uses the **exact same path string** for both providers:

```typescript
// This path works for BOTH providers identically:
const path = 'product-images/user-id/product-id/file.jpg'

// Supabase: Bucket "product-images", path "user-id/product-id/file.jpg"
// G Drive:  Folder "AdForge Files/product-images/user-id/product-id/file.jpg"

// The getOrCreateFolder() method automatically creates:
// → Folder "product-images"
// → Subfolder "user-id"
// → Subfolder "product-id"
// → Upload "file.jpg"
```

**Result:** ✅ **100% identical hierarchy**, maintained automatically by the code!
