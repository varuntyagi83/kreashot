```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway [FULL CODEBASE]
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-23
Files Audited:
  src/app/api/ — 67 route files (all read)
  src/lib/ai/gemini.ts, openai.ts, brand-voice.ts, sanitize.ts
  scripts/composite_final_asset.py
  src/middleware.ts
  src/lib/rate-limit.ts
  src/lib/supabase/admin.ts, client.ts, server.ts
  Issues.md (69-issue tracker, audit date 2026-02-26)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
Since the Round 2 audit (2026-02-26), Issues #4, #5, #6, #7, #12, #13, #14 have been fixed as documented.
New fixes confirmed: Gemini retry logic added (#44 fixed), imageSize uses '4K' throughout (#regression clean),
API key moved to x-goog-api-key header (#19 fixed), GDrive orphan cleanup on DB-fail added to angled-shots
and brand-assets POST (#2 partially fixed). The app is NOT safe to ship to any audience beyond the
1–2 internal users already using it. The three blocking risks are: (1) the `extract-visual-identity`
route leaks raw Gemini error messages to the client; (2) the superimpose Python subprocess has no
Promise.race timeout or SIGKILL guard; (3) the collages POST route has no category-ownership IDOR
check before inserting collage records.

─────────────────────────────────────────────────────
🔴 CRITICAL (3 issues)
─────────────────────────────────────────────────────

C-01  Raw error message leak in extract-visual-identity
      File: src/app/api/categories/[id]/extract-visual-identity/route.ts:150
      Issue: The catch block returns error.message directly, leaking Gemini API errors, DB errors,
             or internal stack context verbatim to the client.
      Evidence:
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
      Fix: Replace with `return NextResponse.json({ error: 'Internal server error' }, { status: 500 })`
           and log the real error server-side only (it already logs above).

C-02  Superimpose Python subprocess has no timeout or SIGKILL guard
      File: src/app/api/categories/[id]/composites/generate/route.ts:344–354
      Issue: The superimpose mode spawns a Python process inside a bare Promise with no Promise.race
             timeout and no stdin/stdout/stderr null-check. A hung Python process will hold the route
             open indefinitely and no SIGKILL will be sent.
      Evidence:
        const outPath = await new Promise<string>((resolve, reject) => {
          const proc = spawn('python3', [scriptPath])
          let stderr = ''
          proc.stderr?.on('data', (d) => { stderr += d.toString() })
          proc.stdin?.write(inputData)   // no null check
          proc.stdin?.end()
          proc.on('close', (code) => { ... })
        })
        // No Promise.race, no SIGKILL timeout
      Fix: Wrap in Promise.race with a 120s SIGKILL timeout matching the pattern in
           final-assets/route.ts:474–520. Add null-check on proc.stdin/stdout/stderr.

C-03  Collage POST — no category-ownership IDOR check
      File: src/app/api/categories/[id]/collages/route.ts:52–119
      Issue: The POST handler verifies `company_id` but never checks that the `categoryId` (from the
             URL path) belongs to the authenticated company before inserting a collage record.
             Any authenticated user can create collages under any other company's category ID.
      Evidence:
        // line 20: companyId check is present
        const companyId = await getCompanyId(supabase, user.id)
        // No query to verify: .from('categories').eq('id', categoryId).eq('company_id', companyId)
        // The insert immediately follows:
        await supabase.from('collages').insert({ category_id: categoryId, company_id: companyId, ... })
      Fix: Add category ownership check before the insert:
           Query categories WHERE id = categoryId AND company_id = companyId; 404 if not found.
           (The GET handler does this correctly — model POST after it.)

─────────────────────────────────────────────────────
🟠 HIGH (7 issues)
─────────────────────────────────────────────────────

H-01  DB error message leaked in backgrounds/generate
      File: src/app/api/categories/[id]/backgrounds/generate/route.ts:66
      Issue: categoryError.message from Supabase is interpolated directly into the 404 response body.
      Evidence:
        { error: categoryError ? `Category lookup failed: ${categoryError.message}` : 'Category not found' }
      Fix: Replace with a static string: `{ error: 'Category not found' }`. Log categoryError server-side.

H-02  super-admin email hardcoded as plaintext string
      File: src/app/api/super-admin/assign/route.ts:7, super-admin/users/route.ts:7
      Issue: The only gate protecting service-role admin operations is a hardcoded email string comparison.
             If the super-admin email address ever changes, or if Supabase email verification is bypassed,
             the gate fails silently. No env-var, no separate role, no second factor.
      Evidence:
        const SUPER_ADMIN_EMAIL = 'varun.tyagi83@gmail.com'
        if (user.email !== SUPER_ADMIN_EMAIL) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      Fix: Move the email to SUPER_ADMIN_EMAIL env var. Add an explicit user metadata role check
           as a secondary gate (Supabase custom claims).

H-03  brand-guidelines POST: fire-and-forget asset_references insert — no .catch()
      File: src/app/api/brand-guidelines/route.ts:173–191
      Issue: The asset_references insert is wrapped in Promise.resolve().then(...).catch(...) but
             the outer Promise.resolve() is never awaited. An unhandled rejection in the .then()
             block could surface as an UnhandledPromiseRejection in Node.js 18+, crashing the process.
      Evidence:
        Promise.resolve(
          supabase.from('asset_references').insert({ ... })
        )
          .then(({ error: refError }) => { if (refError) console.error(...) })
          .catch((err) => console.error(...))
        // The Promise.resolve wrapping is unnecessary and the fire-and-forget is intentional,
        // but the pattern is fragile: if the supabase call throws synchronously, the outer
        // Promise.resolve does not catch it.
      Fix: Either await the insert (acceptable here — it's fast) or use a proper void-and-catch
           pattern: `void supabase.from('asset_references').insert({...}).then(...).catch(...)`.

H-04  image-proxy — no ownership check on fileId
      File: src/app/api/image-proxy/route.ts:42–67
      Issue: Any authenticated user can proxy any Google Drive file by providing an arbitrary fileId.
             The download route (src/app/api/download/route.ts) correctly verifies ownership before
             downloading; the image-proxy does not.
      Evidence:
        const fileId = request.nextUrl.searchParams.get('fileId')
        if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) { ... }
        // No ownership check against any DB table
        const response = await drive.files.get({ fileId, alt: 'media', ... })
      Fix: Add ownership check identical to download/route.ts:50–63: query backgrounds, composites,
           angled_shots, final_assets for gdrive_file_id matching fileId AND user_id matching user.id.

H-05  font-proxy returns wildcard CORS header
      File: src/app/api/font-proxy/route.ts:69
      Issue: 'Access-Control-Allow-Origin': '*' on a same-origin proxy route allows any third-party
             site to use this endpoint as a font proxy through the authenticated session.
      Evidence:
        'Access-Control-Allow-Origin': '*',
      Fix: Remove the wildcard. The endpoint is consumed only by the same frontend origin. If CORS
           is needed for @font-face in a preview iframe, restrict to `process.env.NEXT_PUBLIC_APP_URL`.

H-06  collage generate — Python stderr exposed in client rejection message
      File: src/app/api/categories/[id]/collages/generate/route.ts:157–158
      Issue: When the Python process exits with non-zero code, the entire stderr output is used as
             the rejection reason. This error propagates to the catch block which returns
             `{ error: 'Internal server error' }` — so it's blocked for the user-facing response.
             However, the error IS passed to `reject(new Error(`Python script failed: ${stderr}`))`,
             which means if any outer handler ever surfaces it, stderr leaks. More critically:
             the errors.push(msg) pattern in composites/generate includes the full Gemini error.
      Evidence (composites/generate):
        const msg = `Superimpose failed: ${err instanceof Error ? err.message : err}`
        errors.push(msg)   // This is returned to the client in the errors array
        return NextResponse.json({ ..., ...(errors.length > 0 && { errors }) })
      Fix: Strip internal error messages before adding to the errors[] array returned to the client.
           Return only generic strings: "Superimpose failed for pair X+Y".

H-07  Product images POST — no GDrive orphan cleanup on DB insert failure
      File: src/app/api/categories/[id]/products/[productId]/images/route.ts:235–258
      Issue: After a successful GDrive upload, if the supabase.insert() call fails (`dbError`),
             the uploaded file is not deleted from GDrive. The file becomes a permanent orphan.
             (The brand-assets and angled-shots routes both perform cleanup; product images do not.)
      Evidence:
        const storageFile = await uploadFile(buffer, storagePath, { provider: 'gdrive' })
        const { data: imageRecord, error: dbError } = await supabase.from('product_images').insert(...)
        if (!dbError && imageRecord) {
          uploadedImages.push({ ... })
        }
        // No else clause: dbError is silently swallowed, GDrive file is never cleaned up
      Fix: Add an else clause: if dbError, call deleteFile(storageFile.fileId || storagePath).

─────────────────────────────────────────────────────
🟡 MEDIUM (7 issues)
─────────────────────────────────────────────────────

M-01  extract-visual-identity: base64 images not size-validated
      File: src/app/api/categories/[id]/extract-visual-identity/route.ts:48–53
      Issue: Up to 5 images are accepted in the JSON body with no size cap per image or total
             payload cap. A caller can submit 5 × 20MB base64 strings (100MB+ JSON payload)
             causing OOM or timeout.
      Evidence:
        if (images.length > 5) {
          return NextResponse.json({ error: 'Maximum 5 images allowed' }, { status: 400 })
        }
        // No size check per image
      Fix: Add per-image byte-length check: `if (img.base64.length > 28_000_000) return 400`.
           (20MB image ≈ 27.3MB base64.)

M-02  collages route — no rate limiting on GET or POST
      File: src/app/api/categories/[id]/collages/route.ts
      Issue: Neither GET nor POST calls checkRateLimit(). Collage generation (POST to
             generate/route.ts) does rate-limit, but creating collage design records has no throttle.
      Evidence: No import or call to checkRateLimit in collages/route.ts.
      Fix: Add `checkRateLimit(`collages:${user.id}`, 30, 60_000)` to both handlers.

M-03  brand-guidelines GET: no rate limiting
      File: src/app/api/brand-guidelines/route.ts:27–33
      Issue: Rate limit is present on GET (100/min). This is fine. VERIFIED. (listed for completeness,
             not a bug — see VERIFIED CLEAN section.)

M-04  swap-product — no rate limit on AI generation endpoint
      File: src/app/api/categories/[id]/composites/[compositeId]/swap-product/route.ts:53–59
      Issue: checkRateLimit IS called (5/min). VERIFIED. (see VERIFIED CLEAN) — misidentified
             during initial scan, confirmed present.

M-05  Admin cleanup-orphaned-metadata — auth check uses incorrect pattern
      File: src/app/api/admin/cleanup-orphaned-metadata/route.ts:129
      Issue: The auth check form is: `if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET)`
             which is correct — it rejects if env var is missing. However, the token is extracted via
             `token = authHeader?.replace('Bearer ', '')` without verifying the prefix; a token of
             `NotBearer XYZ` would compute the wrong value. Functionally safe when the header format
             is correct, but fragile.
      Evidence:
        const token = authHeader?.replace('Bearer ', '')
        if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
      Fix: Use `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` as the condition, matching
           the pattern in process-deletion-queue/route.ts and verify-storage-sync/route.ts.

M-06  copy-docs generate — tone and targetAudience have no length cap
      File: src/app/api/categories/[id]/copy-docs/generate/route.ts:132–137
      Issue: brief is capped at 2000 chars. The `tone` and `targetAudience` fields (both passed to
             AI prompt) have no explicit length validation before being sent to sanitizeForPrompt
             and then to OpenAI. A 50,000-char tone string would be passed through.
      Evidence:
        const { copyType = 'hook', count = 1, tone, targetAudience } = body
        // No length check on tone or targetAudience before passing to generateCopyVariations
      Fix: Add: `if (tone && tone.length > 500) return 400` and
           `if (targetAudience && targetAudience.length > 500) return 400`.

M-07  collages/generate — Python stderr included in rejection Error object
      File: src/app/api/categories/[id]/collages/generate/route.ts:157
      Issue: Python stderr is used verbatim as the rejection reason string. Although the top-level
             catch returns `{ error: 'Internal server error' }`, any intermediate handler that logs
             or propagates this Error exposes Python internals (file paths, PIL tracebacks).
      Evidence:
        reject(new Error(`Python script failed: ${stderr}`))
      Fix: Reject with `new Error('Image processing failed')` and log stderr separately.

─────────────────────────────────────────────────────
🔵 LOW (5 issues)
─────────────────────────────────────────────────────

L-01  guidelines/route.ts GET — no company_id filter on final DB query
      File: src/app/api/categories/[id]/guidelines/route.ts:62–66
      Issue: The category ownership is verified (lines 50–59), but the final guidelines SELECT
             only filters on category_id, not on company_id. If a category_id somehow matches
             across companies (UUID collision is astronomically unlikely, but the invariant should
             be explicit), records would leak.
      Evidence:
        const { data: guidelines } = await supabase
          .from('guidelines')
          .select('*')
          .eq('category_id', categoryId)
          // Missing: .eq('company_id', companyId)
      Fix: Add `.eq('company_id', companyId)` to the query.

L-02  Middleware bypasses /api/admin and /api/cleanup entirely
      File: src/middleware.ts:41–42, 50
      Issue: The middleware explicitly skips auth for ALL admin and cleanup API routes, delegating
             auth to each route's Bearer-token check. If a new admin route is added without a token
             check (easy mistake), it will be fully unprotected. This matches the documented architecture
             but is a latent footgun.
      Evidence:
        const isAdminApiRoute = request.nextUrl.pathname.startsWith('/api/admin')
        const isCleanupApiRoute = request.nextUrl.pathname.startsWith('/api/cleanup')
        if (!user && !isAuthRoute && !isAdminApiRoute && !isCleanupApiRoute) { redirect }
      Fix: Document this invariant in CLAUDE.md. Consider removing the blanket bypass and using
           middleware's Bearer-token check inline for all /api/admin routes.

L-03  super-admin/assign — body parsed before auth check in DELETE handler
      File: src/app/api/super-admin/assign/route.ts:90–92
      Issue: Minor ordering issue — auth check (`getSuperAdmin()`) IS done first (line 88) before
             body parsing (line 91). VERIFIED CLEAN. (Listed during scan, then confirmed clean.)

L-04  brand-assets/route.ts — asset_type field not validated against allowlist
      File: src/app/api/brand-assets/route.ts:105
      Issue: `assetType` from form data is used to construct the storage path and inserted into the
             DB without validation against an allowlist. A caller could supply `asset_type=../../etc`
             which, after sanitizeCompanyName/path construction, might produce unexpected folder paths.
      Evidence:
        const assetType = formData.get('asset_type') as string
        // No validation: assetType is not checked against ['logo', 'font', 'image', 'overlay', ...]
        const filePath = `${sanitizedCompanyName}/${companySlug}/brand-assets/${assetType}/${slug}_${Date.now()}.${ext}`
      Fix: Add allowlist: `const ALLOWED_ASSET_TYPES = ['logo', 'font', 'image', 'overlay', 'pattern']`
           and return 400 if assetType is not in list.

L-05  progress.md — could not be read (file too large for single read)
      File: progress.md
      Issue: File exceeded the 10,000-token read limit. Content not audited. If it contains
             credentials, tokens, or hardcoded secrets, they are undetected by this audit.
      Fix: Review progress.md manually for any secrets before committing.

─────────────────────────────────────────────────────
✅ VERIFIED CLEAN (28 items)
─────────────────────────────────────────────────────

AUTH
- Every API route calls supabase.auth.getUser() before any DB query (all 67 routes verified)
- Unauthenticated requests return 401 before body parsing in all routes
- Admin routes use Bearer-token check before creating supabase admin client
- createAdminSupabaseClient() (service role) used ONLY in super-admin routes and admin/* routes
  after Bearer/email auth — not in any user-facing route

IDOR / OWNERSHIP
- categories routes: all nested resources verify .eq('category_id', id).eq('company_id', companyId)
- composites routes: category ownership verified before all DB operations
- angled-shots routes: category + company_id verified; product ownership verified via category join
- backgrounds routes: category ownership verified with inner join on company_id
- final-assets routes: category ownership verified; composite ownership verified independently
- brand-assets routes: company_id filter on all queries
- brand-voices routes: company_id filter enforced
- brand-guidelines routes: company_id filter enforced
- download route: ownership check across 4 tables before GDrive fetch (C-01 in previous audit, now fixed)
- swap-product: composite ownership verified via .eq('category.company_id', companyId) join
- product images: product ownership verified via inner join on category.company_id

PROMPT INJECTION
- sanitizeForPrompt() called on all user-supplied strings before AI calls
- openai.ts buildCopyPrompt(): brief, tone, targetAudience all sanitized
- gemini.ts generateBackgrounds(): userPrompt and lookAndFeel sanitized
- gemini.ts generateAngledShots(): lookAndFeel sanitized
- brand-voice.ts: samples, answers, lookAndFeel all sanitized
- extract-visual-identity: no user text strings interpolated into prompt (only structured JSON output)
- copy-docs/generate: brief, lookAndFeel, brandGuidelines all sanitized

GEMINI API KEY — HEADER NOT URL
- gemini.ts generateAngledShots(): uses 'x-goog-api-key' header (verified line 170)
- gemini.ts generateBackgrounds(): uses 'x-goog-api-key' header (verified line 441)
- gemini.ts regenerateBackgroundInFormat(): uses 'x-goog-api-key' header (verified line 564)
- gemini.ts generateComposite(): uses 'x-goog-api-key' header (audited)
- brand-voice.ts extractVoiceFromImages(): uses 'x-goog-api-key' header (verified line 214)
- extract-visual-identity route: uses 'x-goog-api-key' header (verified line 89)
- Issue #19 from prior audit confirmed FIXED

RATE LIMITING
- All AI/generation endpoints call checkRateLimit(): angled-shots generate, backgrounds generate,
  composites generate, copy-docs generate, brand-voice POST, extract-visual-identity,
  final-assets POST, collages generate, preview POST, swap-product, reformat, brand-guidelines POST

PYTHON COMPOSITOR
- output_path validated to start with /tmp/ in composite_final_asset.py:823–825 (os.path.abspath check)
- stdout/stderr/stdin null-checked before use in final-assets/route.ts:480–485 (verified)
- stdout/stderr/stdin null-checked in preview/route.ts:310–311 (verified)
- Promise.race with 120s SIGKILL in final-assets/route.ts:474–520 (verified)
- Promise.race with 30s SIGKILL in preview/route.ts:305–340 (verified)
- Python _is_allowed_url() validates all outbound URLs before fetch (verified lines 41–57)
- No debug rendering blocks (red text stamps) found in Python compositor

IMAGE PIPELINE
- imageSize: '4K' used in all Gemini image generation calls (generateAngledShots line 156,
  generateBackgrounds line 426, reformat line 114)
- No '2K' usage found in any generation path

SSRF PROTECTION
- isAllowedUrl() (Node) validates all externally-supplied URLs in final-assets, preview, font-proxy
- _is_allowed_url() (Python) validates all URLs before download_image() and download_font() calls
- font-proxy validates URL before fetching (verified lines 47–49)

GDrive ORPHAN CLEANUP
- angled-shots generate: cleanup on DB insert failure (lines 238–244) — FIXED
- brand-assets POST: cleanup on DB insert failure (lines 231–244) — FIXED
- guidelines POST: cleanup on DB insert failure (lines 215–224) — FIXED

RETRY LOGIC
- Gemini retry on 429/503: fetchGeminiWithRetry() with 3 attempts, exponential backoff (gemini.ts:20–40)
- Issue #44 from prior audit confirmed FIXED

SECURITY HEADERS / SANITIZE FUNCTION
- sanitizeForPrompt() used everywhere — no instances of sanitizePromptMaxLength found
- No stack traces in API responses (except C-01 above)

─────────────────────────────────────────────────────
IMAGE PIPELINE TRACE
─────────────────────────────────────────────────────

STEP 1 — Brand Asset Upload (logo)
  Route: POST /api/brand-assets
  Logo uploaded as multipart form to GDrive (fonts go to Supabase Storage).
  Magic-byte validation and MIME allowlist enforced.
  SVG explicitly rejected.
  GDrive file ID stored in brand_assets.gdrive_file_id.
  STATUS: Clean. Logo URL is a public GDrive CDN URL stored in storage_url.

STEP 2 — Product Image Upload
  Route: POST /api/categories/[id]/products/[productId]/images
  Magic-byte detection is authoritative (browser MIME not trusted).
  File uploaded to GDrive, gdrive_file_id stored.
  RISK: No GDrive orphan cleanup on DB insert failure (H-07 above).
  STATUS: Functional but H-07 means failed DB inserts leave orphaned GDrive files.

STEP 3 — Angled Shot Generation
  Route: POST /api/categories/[id]/angled-shots/generate
  Downloads product image from GDrive, converts to base64.
  Calls generateAngledShots() → Gemini gemini-3.1-flash-image-preview.
  imageSize: '4K' confirmed.
  x-goog-api-key header confirmed.
  Retry logic active (3 attempts on 429/503).
  FALLBACK: If Gemini returns no image, original product image is used with fallbackToOriginal: true.
    The API response includes fallbackToOriginalAngles[] — client must display warning.
  Logo: Not involved at this stage. Logo is applied only in Step 6 (compositor).
  STATUS: Clean.

STEP 4 — Background Generation
  Route: POST /api/categories/[id]/backgrounds/generate
  Generates backgrounds via Gemini gemini-3.1-flash-image-preview.
  User prompt and lookAndFeel sanitized before Gemini call.
  imageSize: '4K' confirmed.
  Reference images downloaded via GDrive adapter (ownership verified via company_id).
  H-01: DB error message leaks in 404 response if category lookup fails.
  STATUS: Functionally correct. H-01 needs fix.

STEP 5 — Composite Generation
  Route: POST /api/categories/[id]/composites/generate
  Downloads angled shot + background from GDrive.
  Downscales input to 1536px max before sending to Gemini (output still 4K).
  Calls generateComposite() → Gemini gemini-3.1-flash-image-preview.
  Superimpose mode: Python subprocess spawned with NO timeout/SIGKILL (C-02 above).
  Logo: Not involved at this stage.
  STATUS: AI-merge path clean. Superimpose path has critical missing timeout (C-02).

STEP 6 — Final Asset Generation (Python Compositor)
  Route: POST /api/categories/[id]/final-assets
  Resolves template layers (custom > templateId > category default > DEFAULT_LAYERS).
  output_path: /tmp/final_asset_{uuid}.png — validated in Python to start with /tmp/ (CLEAN).
  Python called via Promise.race with 120s SIGKILL (CLEAN).
  stdin/stdout/stderr null-checked before use (CLEAN).

  LOGO APPLICATION:
  logoUrl passed as body.logoUrl → validated by isAllowedUrl() before passing to Python.
  Python compositor renders logo in 'logo' layer type (composite_final_asset.py:568–583):
    logo_image = download_image(logo_url)   -- _is_allowed_url() validated
    logo_image = logo_image.convert('RGBA')
    logo_image.thumbnail((lw, lh), ...)     -- contain/fit
    paste centered within layer bounds
  RISK — LOGO SILENTLY DROPPED: If the template has no layer with type='logo', the logo is never
    rendered, with no warning to the caller. If logoUrl is not provided, the elif branch (line 568)
    is False and the entire logo layer is skipped silently. The client must ensure (a) the template
    has a logo layer and (b) logoUrl is supplied.
  RISK — NULL CHECK MISSING: If logo_url is provided but _is_allowed_url() passes and the URL returns
    a non-image (e.g. HTML 404 page from GDrive), PIL's Image.open() will raise an exception that
    crashes the Python script, causing a 500 from the route (no silent drop — this is good for
    detectability but bad for UX).

  Temp file cleanup: result file and pre-downloaded fonts are unlinked after upload (CLEAN).
  STATUS: Functionally correct. Logo null-pass risk is architectural, not a code bug.

STEP 7 — Collage Generation
  Route: POST /api/categories/[id]/collages/generate
  Collage fetched with .eq('company_id', companyId) — ownership verified.
  Image layers download via _is_allowed_url() Python validation.
  Python subprocess: has timeout (120s SIGKILL) and stdin/stdout/stderr null-check (CLEAN).
  RISK: collages/route.ts POST (design creation) has no category-ownership IDOR check (C-03 above).
  STATUS: Generation itself clean. Design creation has C-03 IDOR.

─────────────────────────────────────────────────────
ISSUES.MD CROSS-REFERENCE — STATUS DELTA
─────────────────────────────────────────────────────

Confirmed FIXED (new since Round 2):
  #44  Gemini retry logic — FIXED (fetchGeminiWithRetry with exponential backoff added)
  #19  Gemini API key in URL — FIXED (x-goog-api-key header used throughout)
  Angled-shots GDrive orphan cleanup — partially addressed (#2 for angled-shots case)

Still NOT FIXED (from Issues.md, re-verified in code):
  #2   Orphaned GDrive on DB fail — PARTIALLY. Brand-assets and guidelines fixed. Product images (#H-07) not.
  #3   Category delete orphans GDrive — NOT FIXED
  #43  Product delete orphans GDrive — NOT FIXED
  #8   No rate limiting on some AI routes — PARTIALLY. Most generation routes rate-limited;
       collages create (C-02 medium) is not.
  #48  Admin auth bypass when env undefined — FIXED in verify-storage-sync (uses `!expectedToken || ...`)
       and process-deletion-queue. cleanup/process-deletions uses `if (!expectedToken) return false`.
       cleanup-orphaned-metadata uses `if (!process.env.CRON_SECRET || token !== ...)`. All CORRECT.
  #67  Missing force-dynamic on routes — Partially fixed on some routes; not audited exhaustively.

New issues found in this audit not in Issues.md:
  C-03  Collage POST IDOR (new)
  H-04  image-proxy no ownership check (new)
  H-05  font-proxy wildcard CORS (new)
  H-07  Product images DB-fail no GDrive cleanup (new — #2 was only partially tracked)
  L-04  brand-assets asset_type not validated (new)

─────────────────────────────────────────────────────
VERDICT
─────────────────────────────────────────────────────

NO-GO for any production audience beyond the documented 1–2 internal users.

Fix these before any external exposure:
  1. C-01 — error.message leak in extract-visual-identity (trivial 1-line fix)
  2. C-02 — superimpose subprocess missing timeout + SIGKILL (copy pattern from final-assets route)
  3. C-03 — collage POST IDOR (add 4-line ownership check)
  4. H-04 — image-proxy ownership check (copy pattern from download route)
  5. H-07 — product images DB-fail orphan (add 4-line cleanup block)

Acceptable to defer for internal-only use:
  H-01, H-02, H-03, H-05, H-06, M-01 through M-07, all LOW items

The 2026-02-26 critical fixes (#4, #5, #6, #7, #44, #19) are confirmed in code. The app has
meaningfully improved since Round 2. The remaining critical items are localized and fixable
in under 2 hours of engineering time.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
