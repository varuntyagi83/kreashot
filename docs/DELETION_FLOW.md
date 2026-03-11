# Deletion flow: GDrive + Supabase metadata

## Deleting an **angled shot** (from the Angled Shots tab)

When you delete a single angled shot from the UI:

1. **API:** `DELETE /api/categories/[id]/angled-shots/[angleId]`
2. **Route** (`[angleId]/route.ts`):
   - Verifies auth and ownership (category_id + user_id).
   - **Deletes the file from GDrive** (using `gdrive_file_id`) or Supabase storage.
   - **Deletes the row** from `angled_shots`.

**Result:** The image is removed from GDrive and the metadata is removed from Supabase. No queue involved; the route does both inline.

---

## Deleting a **product image** (from Products)

When you delete a product image:

1. **API:** `DELETE /api/categories/[id]/products/[productId]/images/[imageId]`
2. **Route** (`[imageId]/route.ts`):
   - Verifies auth and ownership.
   - **Deletes the product image file** from GDrive (or Supabase storage).
   - Optionally reassigns primary image.
   - **Deletes the row** from `product_images`.

3. **Angled shots are kept:** The FK on `angled_shots.product_image_id` uses **ON DELETE SET NULL** (migration `20260311_angled_shots_keep_on_product_image_delete.sql`). So angled shots that referenced this product image are **not** deleted; their `product_image_id` is set to NULL. The generated angled-shot assets (and their GDrive files) remain so you don’t lose derived work.

**Result:** The product image file and row are gone. Angled shots that used it remain; they stay in Supabase and on GDrive with `product_image_id = NULL`. You can still use them in composites/final assets. Optionally, the UI can show “Source image removed” for such shots.

---

## Summary

| Action | GDrive | Supabase metadata |
|--------|--------|-------------------|
| Delete **angled shot** from UI | ✅ Deleted by API route | ✅ Deleted by API route |
| Delete **product image** | ✅ Product image file deleted by route | ✅ Row deleted; **angled shots kept** (product_image_id set to NULL) |

**Behavior:** Deleting a product image does **not** delete its angled shots. Those angled shots stay (with `product_image_id = NULL`) so you keep generated assets. The trigger `queue_angled_shot_deletion` still runs when an angled shot is **explicitly** deleted (from the tab); migration `20260311_fix_angled_shot_deletion_trigger_columns.sql` ensures that trigger inserts into `deletion_queue` correctly for that case.
