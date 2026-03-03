# Phase 1 — Categories, Brand Assets & Product Upload

> **Goal**: Implement category CRUD, brand asset management (logos), product creation, and product image upload. This covers pipeline Steps 1 and 2.

---

## Prerequisites
- Phase 0 complete (all validation checks passed)
- Supabase running with schema and buckets

---

## Step 1.1 — Category CRUD

**Action**: Build full category management.

### API: `src/app/api/categories/route.ts`

Implement:
- `GET` — List all categories for the authenticated user
- `POST` — Create a new category

Required fields for creation:
```typescript
{
  name: string          // "Greenworld"
  description: string   // "Natural supplement line targeting health-conscious consumers"
  look_and_feel: string // "Fresh, organic, green tones, nature imagery, clean minimalist aesthetic"
}
```

The `slug` should be auto-generated from the name (lowercase, hyphenated).

### API: `src/app/api/categories/[id]/route.ts`

Implement:
- `GET` — Get single category with counts (products, assets, shots, etc.)
- `PUT` — Update category
- `DELETE` — Delete category (cascade deletes all related data)

### UI: Category List & Create Dialog

Create:
- `src/app/(dashboard)/categories/page.tsx` — Grid of category cards
- `src/components/categories/CategoryCard.tsx` — Shows name, description, asset counts, look & feel preview
- `src/components/categories/CreateCategoryDialog.tsx` — Form with name, description, look & feel textarea

Each category card should show a pipeline progress indicator (how many of the 10 steps have assets).

### UI: Category Detail View

Create:
- `src/app/(dashboard)/categories/[id]/page.tsx` — Category detail with tabbed sub-navigation

This page is the **main workspace** for a category. It should have tabs matching the pipeline steps:
1. Assets
2. Angled Shots
3. Backgrounds
4. Composites
5. Copy
6. Guidelines
7. Final Assets
8. Ad Export

For now, only the "Assets" tab will be functional. Other tabs show "Coming in Phase X" placeholder.

**Validation**: Can create, view, edit, delete categories. Slug auto-generates. Category detail page renders with tabs.

**🔒 COMMIT**: `git add . && git commit -m "feat: category CRUD with detail view and pipeline tabs"`

---

## Step 1.2 — Brand Assets (Logo Management)

**Action**: Build global brand asset management (not tied to any category).

### API: `src/app/api/brand-assets/route.ts`

Implement:
- `GET` — List all brand assets for user
- `POST` — Upload a brand asset (logo, font file, etc.)

Upload flow:
1. Accept file via FormData
2. Upload to Supabase Storage: `brand-assets/{user_id}/{filename}`
3. Get public/signed URL
4. Insert record into `brand_assets` table
5. Create an `asset_references` entry: `@global/logo/{name}`

### API: `src/app/api/brand-assets/[id]/route.ts`
- `GET` — Get single brand asset
- `DELETE` — Delete brand asset + storage file + reference entry

### UI: Brand Assets Page

Create:
- `src/app/(dashboard)/brand-assets/page.tsx` — Grid of brand assets
- `src/components/brand-assets/UploadBrandAsset.tsx` — Upload dialog with:
  - File dropzone (accept images, fonts)
  - Name field
  - Asset type selector (logo, font, color palette, watermark, other)
- `src/components/brand-assets/BrandAssetCard.tsx` — Preview with delete option

**Validation**: Can upload logos, they appear in the grid. Files exist in `brand-assets` bucket. `asset_references` entry created with `@global/logo/{name}` pattern.

**🔒 COMMIT**: `git add . && git commit -m "feat: brand asset management with logo upload"`

---

## Step 1.3 — Product Management

**Action**: Build product CRUD within a category.

### API: `src/app/api/categories/[categoryId]/products/route.ts`

Implement:
- `GET` — List all products in a category
- `POST` — Create a product

Required fields:
```typescript
{
  name: string        // "Vitamin D3"
  description: string // "Premium vitamin D3 supplement, 1000IU"
}
```

Slug auto-generated from name.

### API: `src/app/api/categories/[categoryId]/products/[id]/route.ts`
- `GET` — Get single product with asset counts
- `PUT` — Update product
- `DELETE` — Delete product (cascade)

### UI: Product Management (within Category Assets tab)

Create:
- `src/components/products/ProductList.tsx` — List/grid of products within a category
- `src/components/products/CreateProductDialog.tsx` — Form to create product
- `src/components/products/ProductCard.tsx` — Shows product name, image count, link to manage

**Validation**: Can create products within a category. Products show in the Assets tab.

**🔒 COMMIT**: `git add . && git commit -m "feat: product CRUD within categories"`

---

## Step 1.4 — Product Image Upload

**Action**: Build multi-image upload for products.

### API: `src/app/api/categories/[categoryId]/products/[productId]/assets/route.ts`

Implement:
- `GET` — List all images for a product
- `POST` — Upload one or more images

Upload flow:
1. Accept multiple files via FormData
2. For each file:
   a. Upload to Supabase Storage: `assets/{user_id}/{category_id}/{product_id}/{filename}`
   b. Get signed URL
   c. Insert into `product_assets` table
   d. Create `asset_references` entry: `@{category_slug}/product/{product_slug}-{filename}`
3. Return all created assets

### API: `src/app/api/categories/[categoryId]/products/[productId]/assets/[id]/route.ts`
- `DELETE` — Delete single image + storage file + reference

### UI: Image Upload & Gallery

Create:
- `src/components/products/ImageUploader.tsx` — Multi-file drag & drop uploader
  - Accept: jpg, png, webp
  - Max size: 10MB per file
  - Show upload progress per file
  - Bulk upload support
- `src/components/products/ImageGallery.tsx` — Grid gallery of product images
  - Thumbnail view with lightbox on click
  - Shows `@reference_id` below each image
  - Delete button per image
  - Select checkbox for bulk operations
- `src/components/products/ProductDetailPanel.tsx` — Shows product info + image gallery

### Image Gallery Features:
- Lazy loading for thumbnails
- Click to view full size in a modal/lightbox
- Each image displays its `@reference_id` so user can see what to reference later
- Drag & drop reordering (optional, nice-to-have)

**Validation**:
- Can upload multiple images per product
- Images appear in gallery with `@reference_id` labels
- Files exist in `assets` bucket at correct path
- `asset_references` entries created
- Can delete individual images

**🔒 COMMIT**: `git add . && git commit -m "feat: multi-image upload with gallery and @ references"`

---

## Step 1.5 — Asset Reference Utility

**Action**: Build the reusable `@` reference search component that will be used across all phases.

### API: `src/app/api/references/search/route.ts`

Implement:
- `GET ?q=vitamin&type=product_asset` — Search references by text, optionally filter by type

```typescript
// Query asset_references table with full-text search
// Return: { reference_id, display_name, asset_type, storage_url, thumbnail_url }
```

### Component: `src/components/shared/AssetReferencePicker.tsx`

Build a reusable component that:
1. Triggers on `@` typed in any textarea/input
2. Shows a **searchable dropdown** (use shadcn `Command` / `Popover`)
3. Lists matching assets with:
   - Thumbnail preview (for images)
   - Reference ID (e.g., `@greenworld/product/vitamin-d-front`)
   - Asset type badge
4. On selection, inserts the reference ID into the text field
5. Supports filtering by asset type (product, angled shot, background, etc.)
6. Supports filtering by category or showing global assets

### Component: `src/components/shared/AssetReferenceChip.tsx`

Displays an inline chip for a selected reference:
- Shows thumbnail + name
- Clicking opens the asset in a preview
- `x` to remove the reference

**Validation**: Type `@` in a test textarea → dropdown appears → search works → selection inserts reference.

**🔒 COMMIT**: `git add . && git commit -m "feat: @ reference picker component with search"`

---

## Phase 1 Complete — Final Validation

Before moving to Phase 2, verify:
- [ ] Can create categories with name, description, look & feel
- [ ] Can manage brand assets (upload logos) at global level
- [ ] Can create products within categories
- [ ] Can upload multiple images per product
- [ ] All uploads create correct `asset_references` entries
- [ ] `@` reference picker component works with search
- [ ] File paths follow convention: `{bucket}/{user_id}/{category_id}/{...}`
- [ ] RLS working — users only see their own data

**🏷️ TAG**: `git tag v0.2.0 -m "Phase 1: Categories, brand assets, product upload" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 1 complete. Category CRUD with look_and_feel field. Brand assets (logos) managed globally in `brand-assets` bucket. Products created within categories. Multi-image upload working — files go to `assets/{user_id}/{category_id}/{product_id}/{filename}`. All assets registered in `asset_references` table with `@{slug}/type/name` pattern. Reusable `AssetReferencePicker` component built (triggers on `@`, searchable dropdown). Category detail page has tabbed pipeline navigation — only Assets tab active. Ready for Phase 2: AI angled shot generation with Nano Banana Pro.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_2_ANGLED_SHOTS.md"

---

## NEXT: Read `PHASE_2_ANGLED_SHOTS.md`
