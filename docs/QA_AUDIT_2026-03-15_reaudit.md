━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway (Re-audit after fixes)
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-15
Files Audited:
  1.  src/app/api/download/route.ts
  2.  src/app/api/categories/[id]/composites/[compositeId]/swap-product/route.ts
  3.  src/app/api/admin/process-deletion-queue/route.ts
  4.  src/app/api/categories/[id]/composites/route.ts
  5.  src/app/api/categories/[id]/products/[productId]/images/route.ts
  6.  src/app/api/categories/[id]/route.ts
  7.  src/app/api/cleanup/process-deletions/route.ts
  8.  src/app/api/categories/route.ts
  9.  src/app/api/categories/[id]/backgrounds/route.ts
  10. src/app/api/categories/[id]/backgrounds/generate/route.ts
  11. src/app/api/categories/[id]/angled-shots/generate/route.ts
  12. src/app/api/categories/[id]/composites/generate/route.ts
  13. src/app/api/categories/[id]/guidelines/route.ts
  14. src/app/api/brand-assets/route.ts
  15. src/lib/storage/index.ts
  16. src/lib/storage/gdrive-adapter.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
All 9 previously reported findings (C-01, H-01, H-02, H-03, M-02, M-03, M-04, L-02, L-03)
are confirmed fixed. However, the re-audit uncovered 2 new HIGH-severity issues: the legacy
`cleanup/process-deletions` route retains an `API_SECRET` fallback that was supposed to be
removed (partial fix on H-02), and the `angled-shots/generate` route fetches a product image
without checking `user_id`, enabling cross-user image access. Four additional medium/low issues
were found. The codebase is NO-GO for production until the two HIGH findings are resolved.

🔴 CRITICAL (0 issues)
──────────────────────────────────────────────────────
None.

🟠 HIGH (2 issues)
──────────────────────────────────────────────────────

H-NEW-01  API_SECRET Fallback Still Present in process-deletions Route
          File: src/app/api/cleanup/process-deletions/route.ts:10
          Issue: The `verifyAuth` helper accepts `process.env.API_SECRET` as a valid bearer
                 token alongside `CRON_SECRET`. The fix for H-02 was applied only to
                 `admin/process-deletion-queue/route.ts`; this older sibling route was not
                 updated. Any caller who knows `API_SECRET` can trigger bulk GDrive file
                 deletion without rate limiting or audit logging.
          Evidence:
            ```ts
            const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET
            ```
            (lines 10-12 in the `verifyAuth` function)
          Fix: Remove the `|| process.env.API_SECRET` fallback so only `CRON_SECRET` is
               accepted, matching the security posture of the admin route.

H-NEW-02  Product Image Fetched Without user_id Ownership Check in angled-shots/generate
          File: src/app/api/categories/[id]/angled-shots/generate/route.ts:88-97
          Issue: After verifying the category and product belong to the user, the route fetches
                 `product_images` by `id` and `product_id` only — no `user_id` filter. An
                 attacker who knows a victim's `productImageId` can supply it with their own
                 `productId` from the same category, and the query will match another user's
                 image row if that image happens to be linked to a matching product, or can
                 trigger a download from GDrive using a foreign file ID.
          Evidence:
            ```ts
            const { data: productImage } = await supabase
              .from('product_images')
              .select('id, file_path, file_name, mime_type, storage_provider, storage_url, storage_path, gdrive_file_id')
              .eq('id', productImageId)
              .eq('product_id', productId)
              .single()
            ```
            (lines 88-93; note: no `.eq('user_id', user.id)` or category join)
          Fix: Add a join through products to categories to enforce ownership, or add
               `.eq('user_id', user.id)` if `product_images` has a `user_id` column. At
               minimum, verify that the resolved `productImage.product_id` belongs to a
               product owned by the authenticated user (the product check on line 77 already
               confirms `category_id`, but `productImageId` is user-supplied and unchecked).

🟡 MEDIUM (2 issues)
──────────────────────────────────────────────────────

M-NEW-01  No Orphan Cleanup on GDrive Upload Failure in angled-shots/generate
          File: src/app/api/categories/[id]/angled-shots/generate/route.ts:204-231
          Issue: When `supabase.from('angled_shots').insert(...)` fails (line 228), the
                 already-uploaded GDrive file is silently abandoned. The `catch` block at
                 line 234 only logs and returns `null`; no `deleteFile` is called. This is the
                 same class of bug as H-03, fixed in composites/route.ts but not replicated
                 here.
          Evidence:
            ```ts
            if (dbError) {
              console.error(`DB insert failed for ${shot.angleName}:`, dbError)
              return null   // <-- no deleteFile call; GDrive file is orphaned
            }
            ```
            (lines 228-231)
          Fix: On `dbError`, call `deleteFile(storageFile.fileId || storageFile.path, { provider: 'gdrive' })`
               before returning `null`, mirroring the pattern in composites/route.ts lines 293-299.

M-NEW-02  guidelines/route.ts POST — Orphaned GDrive File on DB Insert Failure
          File: src/app/api/categories/[id]/guidelines/route.ts:201-207
          Issue: If the database insert at line 178 fails, the uploaded GDrive file is not
                 cleaned up. The error handler returns a 500 without calling `deleteFile`.
                 `deleteFile` is not even imported in this file.
          Evidence:
            ```ts
            if (dbError) {
              console.error('Database error:', dbError)
              return NextResponse.json(
                { error: 'Failed to save guideline' },
                { status: 500 }
              )
            }
            ```
            (lines 201-207; `deleteFile` is not imported at top of file)
          Fix: Import `deleteFile` from `@/lib/storage` and add a cleanup block identical to
               the pattern in backgrounds/route.ts lines 243-249 before returning the 500.

🔵 LOW (2 issues)
──────────────────────────────────────────────────────

L-NEW-01  cleanup/process-deletions GET — No Status Filter Exposes All Queue Entries
          File: src/app/api/cleanup/process-deletions/route.ts:156-161
          Issue: The GET handler returns up to 200 queue entries with no status filter.
                 Completed and failed entries (which may include storage paths and file IDs
                 of other users' files) are included in the response. Although the endpoint
                 is protected by CRON_SECRET/API_SECRET, the lack of filtering is an
                 unnecessary data exposure.
          Evidence:
            ```ts
            const { data: queuedFiles, error } = await supabase
              .from('deletion_queue')
              .select('id, resource_type, storage_path, created_at')
              .order('created_at', { ascending: false })
              .limit(200)
            ```
            (lines 156-161; no `.eq('status', 'pending')`)
          Fix: Add `.eq('status', 'pending')` to the GET query, or make the status filter
               a query parameter with a default of 'pending'.

L-NEW-02  SVG Magic-Byte Detection Relies on Text Scanning — Bypass Risk
          File: src/app/api/brand-assets/route.ts:25-26
          Issue: SVG detection reads up to 64 bytes as UTF-8 and checks for `<?xml`, `<svg`,
                 or `<svg` within the string (line 25-26). An attacker can craft a file that
                 begins with a BOM or whitespace, pushing the `<svg` marker beyond byte 64
                 while still being a valid SVG. More critically, SVGs can contain embedded
                 JavaScript (`<script>` tags), making them a stored XSS vector if ever
                 served without `Content-Disposition: attachment`.
          Evidence:
            ```ts
            const head = buffer.slice(0, 64).toString('utf-8').trimStart()
            if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) return 'image/svg+xml'
            ```
            (lines 25-26)
          Fix: SVGs that are publicly served (via Google Drive CDN) should be served with
               `Content-Disposition: attachment` to prevent script execution. Consider
               rejecting SVGs entirely for brand-asset uploads and converting them to PNG
               server-side, or sanitising with DOMPurify/server-side SVG sanitiser before
               upload.

✅ VERIFIED FIXES (9 items)
──────────────────────────────────────────────────────

C-01  download/route.ts — Ownership check on gdrive_file_id + user_id across all 4 tables
      ✅ confirmed — lines 50-64: loops over ['backgrounds','composites','angled_shots',
      'final_assets'], filters by both `.eq('gdrive_file_id', fileId)` and
      `.eq('user_id', user.id)`, returns 403 if no match found.

H-01  swap-product/route.ts — user_id scoping on angled_shots and backgrounds queries
      ✅ confirmed — line 85: `.eq('user_id', user.id)` on angled_shots; line 98:
      `.eq('user_id', user.id)` on backgrounds.

H-02  admin/process-deletion-queue/route.ts — auth check is first; only CRON_SECRET accepted
      ✅ confirmed (for this file only) — lines 12-18: auth check executes before any
      Supabase client is created; only `CRON_SECRET` is used, no API_SECRET fallback.
      NOTE: See H-NEW-01 — the sibling route `cleanup/process-deletions/route.ts` was
      not updated and still accepts API_SECRET.

H-03  composites/route.ts POST — deleteFile called in dbError block; import present
      ✅ confirmed — line 3: `deleteFile` imported from `@/lib/storage`; lines 292-299:
      try/catch cleanup block executes `deleteFile(fileIdOrPath, { provider: 'gdrive' })`
      on db insert failure.

M-02  download/route.ts — 50MB buffer.length guard before Sharp
      ✅ confirmed — lines 73-75: `if (buffer.length > 50 * 1024 * 1024)` returns 413
      before any Sharp call.

M-03  products/[productId]/images/route.ts — null detectedMime returns immediate 400
      ✅ confirmed — line 164: `if (!detectedMime) return ... { status: 400 }`.

M-04  categories/[id]/route.ts — count queries wrapped in Promise.all
      ✅ confirmed — lines 77-102: all 7 count queries run concurrently inside a single
      `await Promise.all([...])` block.

L-02  download/route.ts — catch block returns generic message, not error.message
      ✅ confirmed — lines 101-104: catch block logs `error` to console but returns
      `{ error: 'Download failed' }` — no internal message leaked.

L-03  cleanup/process-deletions/route.ts — deletion queue query has .eq('status','pending')
      ✅ confirmed — line 50: `.eq('status', 'pending')` present on the POST handler's
      fetch query.

✅ VERIFIED CLEAN (8 items)
──────────────────────────────────────────────────────

- backgrounds/route.ts: Auth before data access (line 32), category scoped to user_id
  (line 43), orphan cleanup on dbError present (lines 243-249), input validation on name
  and imageData (lines 164-169), base64 size guard (lines 175-181).

- backgrounds/generate/route.ts: Auth before data access (line 34), category scoped to
  user_id (line 54), prompt length validated (line 104), lookAndFeel length validated
  (line 111), count range validated (lines 118-122), total generation cap of 20 enforced
  (lines 125-131), user-input sanitised via sanitizeForPrompt (line 140), brand_guidelines
  scoped to user_id (line 157).

- composites/generate/route.ts: Auth before data access (line 52), category scoped to
  user_id (line 71), rate limiting applied (line 59), pair count capped at 10 (lines
  200-209), pairs capped at 20 at intake (line 89), userPrompt length validated (line 93),
  userPrompt sanitised (line 97), no internal error details leaked in catch block (line 437).

- angled-shots/generate/route.ts: Auth before data access (line 34), category scoped to
  user_id (line 52), rate limiting applied (line 40), format validated against allowlist
  (lines 69-74), product scoped to category_id (line 79).

- admin/process-deletion-queue/route.ts: Auth checked first before privileged client
  creation (lines 12-18 in both GET and POST handlers), service role client created only
  after auth passes, no user data leaked in error responses.

- categories/route.ts: Auth before data access (lines 19, 78), categories scoped to
  user_id (line 28 GET, line 110 POST), batched count queries eliminate N+1 (lines 39-46),
  input length validation present (lines 93-101).

- guidelines/route.ts (GET): Auth before data access (line 37), category scoped to user_id
  (line 48), no data leaked in error responses.

- brand-assets/route.ts: Auth before data access (lines 43, 87), assets scoped to user_id
  (line 49 GET, line 196 POST), magic-byte detection performed (line 141), allowed MIME
  list enforced (lines 142-148), 50MB size limit enforced (line 129), orphan cleanup
  on dbError present (lines 204-215).

VERDICT
NO-GO. Two HIGH-severity findings must be resolved before this branch ships:
H-NEW-01 (API_SECRET fallback in cleanup/process-deletions) and H-NEW-02 (missing
user_id ownership check on product image fetch in angled-shots/generate). Additionally,
M-NEW-01 and M-NEW-02 (orphan GDrive file leaks) should be resolved in the same pass.
All 9 previously reported issues are correctly fixed and may be closed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
