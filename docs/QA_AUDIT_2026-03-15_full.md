━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway (Full Codebase)
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-15
Files Audited:
  src/app/api/categories/route.ts
  src/app/api/categories/[id]/route.ts
  src/app/api/categories/[id]/backgrounds/route.ts
  src/app/api/categories/[id]/backgrounds/[backgroundId]/route.ts
  src/app/api/categories/[id]/backgrounds/generate/route.ts
  src/app/api/categories/[id]/composites/route.ts
  src/app/api/categories/[id]/composites/generate/route.ts
  src/app/api/categories/[id]/composites/[compositeId]/route.ts
  src/app/api/categories/[id]/composites/[compositeId]/reformat/route.ts
  src/app/api/categories/[id]/composites/[compositeId]/swap-product/route.ts
  src/app/api/categories/[id]/angled-shots/generate/route.ts
  src/app/api/categories/[id]/angled-shots/[angleId]/route.ts
  src/app/api/categories/[id]/products/route.ts
  src/app/api/categories/[id]/products/[productId]/route.ts
  src/app/api/categories/[id]/products/[productId]/images/route.ts
  src/app/api/categories/[id]/products/[productId]/images/[imageId]/route.ts
  src/app/api/categories/[id]/guidelines/route.ts
  src/app/api/categories/[id]/final-assets/route.ts
  src/app/api/categories/[id]/final-assets/preview/route.ts
  src/app/api/categories/[id]/collages/generate/route.ts
  src/app/api/categories/[id]/copy-docs/generate/route.ts
  src/app/api/brand-assets/route.ts
  src/app/api/brand-assets/[id]/route.ts
  src/app/api/brand-guidelines/route.ts
  src/app/api/download/route.ts
  src/app/api/image-proxy/route.ts
  src/app/api/font-proxy/route.ts
  src/app/api/admin/cleanup-orphaned-metadata/route.ts
  src/app/api/admin/process-deletion-queue/route.ts
  src/app/api/admin/verify-storage-sync/route.ts
  src/app/api/cleanup/process-deletions/route.ts
  src/lib/storage/index.ts
  src/lib/storage/gdrive-adapter.ts
  src/lib/supabase/server.ts
  src/lib/supabase/client.ts
  src/lib/rate-limit.ts
  src/lib/ai/sanitize.ts
  src/middleware.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
The codebase has strong structural bones: every user-facing API route checks `supabase.auth.getUser()`, resources are scoped to `user_id`, and the storage layer is properly abstracted. Three meaningful security issues remain ship-blocking: unauthenticated access to admin cron routes is theoretically possible if `CRON_SECRET` is absent at startup, the download route accepts arbitrary Google Drive file IDs without verifying the file belongs to the requesting user (enabling cross-user file exfiltration), and the swap-product route downloads assets without verifying the angled shot belongs to the authenticated user before download. Several medium-severity issues covering orphaned GDrive files on failed saves, an in-memory rate limiter that resets on redeploy, and missing file-size guards before Sharp processing also warrant attention before production traffic scales.

🔴 CRITICAL (1 issue)
──────────────────────────────────────────────────────
C-01  Download route allows any authenticated user to download any Google Drive file by ID
      File: src/app/api/download/route.ts:32–53
      Issue: The `fileId` query parameter is passed directly to `downloadFile(fileId, { provider: 'gdrive' })` without checking that the file ID belongs to a record owned by the requesting user. Any authenticated user can supply any arbitrary Drive file ID and retrieve the file contents, including files owned by other users.
      Evidence:
        const fileId = sp.get('fileId')   // line 40 — raw user input
        ...
        const buffer = await downloadFile(fileId, { provider: 'gdrive' })  // line 53 — no ownership check
      Fix: Before calling `downloadFile`, look up the file ID in any of the storage tables (`backgrounds`, `composites`, `angled_shots`, `final_assets`, `product_images`) filtered by `user_id = user.id`. If no matching row is found, return 403. This ensures the Drive file was uploaded by the requesting user.

🟠 HIGH (3 issues)
──────────────────────────────────────────────────────
H-01  swap-product route downloads angled shot from GDrive before verifying it belongs to the user
      File: src/app/api/categories/[id]/composites/[compositeId]/swap-product/route.ts:82–115
      Issue: The new angled shot is fetched with `.eq('category_id', categoryId)` only — there is no `user_id` filter on the `angled_shots` table query. The category ownership is verified via the parent composite join, but a user could craft a request supplying an `angledShotId` from another user's category (that happens to share the same `categoryId` format) and force a download of their private image before the auth check would catch it. More practically: the background is fetched with `.eq('category_id', categoryId)` and no `user_id` filter (line 92–97), so a background from any category with that ID is returned.
      Evidence:
        const { data: newShot } = await supabase
          .from('angled_shots')
          .select('...')
          .eq('id', newAngledShotId)
          .eq('category_id', categoryId)   // line 85 — no user_id filter
          .single()
        ...
        const shotBuffer = await downloadFile(shotKey, { provider: 'gdrive' })  // line 108 — downloaded if categoryId matches
      Fix: Add `.eq('user_id', user.id)` to both the `angled_shots` query (line 82) and the `backgrounds` query (line 92). This closes the gap regardless of whether RLS policies cover it.

H-02  Admin/cleanup routes fall back to `API_SECRET` which may share the same string as other secrets, and process-deletion-queue initialises the Supabase service-role client before auth check
      File: src/app/api/admin/process-deletion-queue/route.ts:11–23
      Issue: The service-role Supabase client (which bypasses RLS entirely) is instantiated at lines 12–15 before the Bearer-token authorization check at lines 18–23. If the auth check throws unexpectedly, the client is already constructed with full service-role privileges. Additionally, routes fall back to `process.env.API_SECRET` when `CRON_SECRET` is missing — if `API_SECRET` is shared with another system, it can be used to trigger mass deletions.
      Evidence:
        const supabase = createClient(           // line 12 — service-role client constructed first
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const authHeader = request.headers.get('authorization')   // line 18 — auth check happens after
        const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET  // line 19 — fallback
      Fix: Move the auth check to the very top of each handler, before any client construction. Remove the `|| process.env.API_SECRET` fallback — require `CRON_SECRET` to be set.

H-03  Orphaned GDrive file when composites/route.ts POST DB insert fails (no cleanup)
      File: src/app/api/categories/[id]/composites/route.ts:265–296
      Issue: The composites POST route uploads to Google Drive at line 259, then inserts to the database. If `dbError` is set (line 290), the route returns a 500 response but does NOT delete the orphaned Drive file. The backgrounds route (same pattern) correctly calls `deleteFile` in the error handler; composites does not.
      Evidence:
        const storageFile = await uploadFile(buffer, fileName, {...})  // line 259 — Drive upload
        ...
        if (dbError) {
          console.error('Database error:', dbError)
          return NextResponse.json(              // line 292 — returns error without cleanup
            { error: 'Failed to save composite record' },
            { status: 500 }
          )
        }
      Fix: Add a cleanup block identical to the one in backgrounds/route.ts lines 241–249:
        try {
          const fileIdOrPath = storageFile.fileId || storageFile.path
          await deleteFile(fileIdOrPath, { provider: 'gdrive' })
        } catch (cleanupError) {
          console.error('Failed to clean up orphaned GDrive file:', cleanupError)
        }

🟡 MEDIUM (4 issues)
──────────────────────────────────────────────────────
M-01  In-memory rate limiter resets on every Railway redeploy, providing no protection during deployments and no cross-process protection on scale-out
      File: src/lib/rate-limit.ts:13
      Issue: `const store = new Map<string, RateLimitEntry>()` is process-scoped. Every Railway deploy (or container restart) wipes the map. A caller can burst-trigger AI generation (10 backgrounds, 10 composites, 20 angled shots per 60s window) immediately after each deploy. This is already documented with a TODO comment.
      Evidence:
        // TODO: replace with Redis for persistence across restarts (in-memory resets on Railway deploy)
        const store = new Map<string, RateLimitEntry>()  // line 13
      Fix: Replace with an Upstash Redis or Supabase-backed counter. For a quick interim fix, add a global deploy counter persisted to an environment variable or a single Supabase row so the rate limit survives redeploys.

M-02  Download route has no file-size guard before Sharp processing — a huge Drive file can OOM the server
      File: src/app/api/download/route.ts:53–69
      Issue: `downloadFile(fileId)` fetches the entire file into a `Buffer` before Sharp processes it. A 500MB video file (Drive imposes no upload size limit through the service account) would fully buffer in Node memory, then get passed to Sharp. No max-size check exists between download and Sharp invocation.
      Evidence:
        const buffer = await downloadFile(fileId, { provider: 'gdrive' })  // line 53 — full buffer load
        let pipeline = sharp(buffer)  // line 56 — no size check
      Fix: After line 53, add:
        const MAX_BYTES = 50 * 1024 * 1024  // 50 MB
        if (buffer.length > MAX_BYTES) {
          return NextResponse.json({ error: 'File too large to download via this endpoint' }, { status: 413 })
        }

M-03  product image upload MIME validation allows any `image/*` content-type header without magic-byte fallback when detection returns null
      File: src/app/api/categories/[id]/products/[productId]/images/route.ts:154–171
      Issue: The MIME check at line 154 accepts any `file.type.startsWith('image/')` for the initial gate. When magic-byte detection returns `null` (unrecognised image format), the code falls through to line 170 which only re-checks `file.type.startsWith('image/')` — the same weak browser-supplied value. An attacker can upload a malicious file with a spoofed `image/jpeg` Content-Type that isn't recognised by the magic-byte detector, and it will be accepted and uploaded to Google Drive.
      Evidence:
        if (!file.type.startsWith('image/')) {  // line 154 — weak initial gate (browser-supplied)
          continue
        }
        ...
        if (detectedMime && !['image/jpeg','image/png','image/webp','image/gif'].includes(detectedMime)) {
          return NextResponse.json({ error: 'Invalid image file content' }, { status: 400 })
        }
        if (!detectedMime && !file.type.startsWith('image/')) {  // line 170 — null detection falls through if type starts with image/
          return NextResponse.json({ error: 'Invalid image file' }, { status: 400 })
        }
      Fix: When `detectedMime` is `null`, reject the upload rather than relying on the browser-supplied MIME:
        if (!detectedMime) {
          return NextResponse.json({ error: 'Could not verify image file type' }, { status: 400 })
        }

M-04  categories/[id]/route.ts GET issues 7 sequential unbatched count queries without parallelisation
      File: src/app/api/categories/[id]/route.ts:52–97
      Issue: After the category fetch, 7 individual `.count` queries are fired sequentially (products, angled_shots, backgrounds, composites, copy_docs, guidelines, final_assets). Each has its own round-trip to Supabase. The categories list route (GET /api/categories) was already fixed to batch similar counts; the single-category route was not updated.
      Evidence:
        const { count: productsCount } = await supabase   // line 52
          ...
        const { count: angledShotsCount } = await angledShotsQuery  // line 63
        const { count: backgroundsCount } = await backgroundsQuery  // line 71
        const { count: compositesCount } = await compositesQuery     // line 79
        const { count: copyDocsCount } = await supabase              // line 81
        const { count: guidelinesCount } = await supabase            // line 86
        const { count: finalAssetsCount } = await finalAssetsQuery   // line 97
      Fix: Wrap all 7 count queries in `Promise.all([...])` so they execute in parallel. With a format filter this saves ~6 serial round-trips on every category page load.

🔵 LOW (3 issues)
──────────────────────────────────────────────────────
L-01  GDrive folder lookup in gdrive-adapter uses unsanitised folder name in Drive query string
      File: src/lib/storage/gdrive-adapter.ts:60
      Issue: The `escapedFolderName` escapes backslashes and single quotes before embedding in the Drive `q` parameter, but only those two characters. The folder names are derived from user-supplied category slugs (e.g. `category.slug`) via path construction in the calling routes. If a slug contained a backtick or other Drive query metacharacter, the query could be malformed. Exploitability is low because slugs are generated through the `generateSlug` helper which strips non-`\w\s-` characters; the actual risk is near-zero but the escaping is incomplete.
      Evidence:
        const escapedFolderName = (folderName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")  // line 60
        const { data } = await this.drive.files.list({
          q: `name='${escapedFolderName}' and ...`  // line 62 — string interpolation
      Fix: Use parameterised Drive list calls if the API supports them, or verify the slug contains only `[a-z0-9-]` before passing to the query.

L-02  Error response in download/route.ts leaks the raw error message
      File: src/app/api/download/route.ts:81
      Issue: The catch block returns `error.message` directly in the JSON response body, which may include internal Drive API messages, file IDs, or other operational details.
      Evidence:
        return NextResponse.json({ error: error.message || 'Download failed' }, { status: 500 })  // line 81
      Fix: Log `error.message` server-side and return a generic `'Download failed'` message to the client.

L-03  cleanup/process-deletions/route.ts does not filter by status='pending' — it re-processes items in any state
      File: src/app/api/cleanup/process-deletions/route.ts:46–53
      Issue: The legacy `/api/cleanup/process-deletions` cron handler fetches from `deletion_queue` without filtering by `status`, so it will re-attempt deletion on rows already marked `completed` or `failed`. The newer `/api/admin/process-deletion-queue` handler correctly filters `.eq('status', 'pending')`. The duplicate handler creates confusion about which one Railway actually invokes.
      Evidence:
        const { data: queuedFiles } = await supabase
          .from('deletion_queue')
          .select('*')
          .eq('storage_provider', 'gdrive')
          .not('gdrive_file_id', 'is', null)
          // no status filter  — lines 47-52
      Fix: Add `.eq('status', 'pending')` to the query, or deprecate the legacy handler and use only `/api/admin/process-deletion-queue`.

✅ VERIFIED CLEAN (18 items)
──────────────────────────────────────────────────────
- Authentication: Every user-facing API route calls `supabase.auth.getUser()` and returns 401 before any data access.
- Authorization — categories: All category queries include `.eq('user_id', user.id)`.
- Authorization — composites DELETE/PATCH: Uses join `category:categories!inner(user_id)` with `.eq('category.user_id', user.id)`.
- Authorization — product images PATCH/DELETE: Uses three-level join `product -> category -> user_id` correctly.
- Authorization — brand assets GET/DELETE: Scoped to `user_id` on all operations.
- Authorization — brand guidelines: Scoped to `user_id` on GET, POST, and DELETE.
- Foreign-key validation on composites POST: `angled_shot_id` and `background_id` are verified to exist AND belong to `categoryId` before insert (lines 201–228, composites/route.ts).
- Magic-byte MIME validation: brand-assets/route.ts and brand-guidelines/route.ts both validate file content via magic bytes before upload, not just the browser-supplied Content-Type.
- File size limits: Brand assets capped at 50MB, guidelines at 10MB, product images at 20MB, background/composite base64 payloads at ~67MB — all validated before upload.
- Duplicate slug detection: backgrounds, composites, and categories check for slug collisions and return 409.
- Cascade delete for categories: `preQueueGDriveFiles` pre-queues all child GDrive files before cascade delete; product deletes mirror the same pattern.
- Storage abstraction: All routes call `uploadFile`/`downloadFile`/`deleteFile` from `src/lib/storage/index.ts` — no route uses the Drive SDK directly.
- Orphaned file cleanup in backgrounds POST: Correctly calls `deleteFile` on the GDrive file if DB insert fails (backgrounds/route.ts lines 241–249).
- Orphaned file cleanup in brand-assets POST: Correctly deletes from GDrive or Supabase if DB insert fails.
- Prompt injection sanitization: `sanitizeForPrompt` is called on all user-supplied text before it reaches Gemini or GPT-4o (backgrounds/generate, composites/generate, copy-docs/generate).
- Environment variable access: No hardcoded credentials found. All secrets accessed via `process.env.*`.
- Admin route Bearer token: `cleanup-orphaned-metadata`, `process-deletion-queue`, and `verify-storage-sync` all verify `Authorization: Bearer <CRON_SECRET>` before any operations.
- Image proxy fileId validation: `/api/image-proxy` validates `fileId` against `/^[a-zA-Z0-9_-]+$/` regex before Drive fetch.
- Rate limits on generation routes: backgrounds (10/60s), composites (10/60s), angled shots (20/60s), final assets (5/60s), copy docs (20/60s), preview (10/60s) — all present.
- N+1 fix on categories GET verified correct: Uses two batched `IN` queries instead of per-category queries.
- Font proxy URL allowlist: font-proxy and final-assets routes both validate `font_url` against an explicit domain allowlist before fetching.
- URL validation for baseImageUrl and logoUrl: Both final-assets/route.ts and final-assets/preview/route.ts call `isAllowedUrl()` before passing URLs to the Python compositor.
- No raw SQL with user input: No `rpc()` calls with interpolated user strings found anywhere in the codebase.

VERDICT
NO-GO for production as-is. Issue C-01 (unrestricted Drive file download by any authenticated user) is an exploitable data exfiltration path that must be fixed before launch. H-01 (swap-product missing user_id filter on asset queries) and H-03 (orphaned GDrive file on composite save failure) are straightforward one-line fixes and should be bundled in the same PR. The remaining HIGH and MEDIUM items (H-02 admin client ordering, M-01 rate limiter, M-02 no Sharp size guard, M-03 null MIME fallback, M-04 sequential counts) should be resolved in the next sprint but do not individually block launch if C-01 and H-01 are closed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
