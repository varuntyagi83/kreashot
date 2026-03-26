━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway [Collages]
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-26
Files Audited:
  src/app/api/categories/[id]/collages/route.ts
  src/app/api/categories/[id]/collages/[collageId]/route.ts
  src/app/api/categories/[id]/collages/generate/route.ts
  src/lib/types/collage.ts
  src/components/collage/CollageCanvas.tsx
  src/components/collage/CollageLayerPanel.tsx
  src/components/collage/CollagePropertiesPanel.tsx
  src/components/collage/CollageWorkspace.tsx
  supabase/migrations/20260304_create_collages_table.sql
  src/lib/rate-limit.ts
  src/lib/supabase/server.ts
  src/lib/get-company.ts
  scripts/composite_final_asset.py (collage sections)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
The collages feature has one critical security defect (GCS URLs blocked by Python's SSRF allowlist, causing all generated collage images to fail at render time — now fixed) and three high-severity issues: missing company_id column in the DB migration (schema/API mismatch), missing rate-limit on GET and PUT single-collage endpoints (now fixed), and unvalidated layer source_url values passed to Python without a Node-side allowlist check. The feature is NOT safe to ship until the migration schema and source_url validation gaps are resolved.

🔴 CRITICAL (1 issue)
──────────────────────────────────────────────────────
C-01  GCS public URLs blocked by Python SSRF allowlist — collage render always fails
      File: scripts/composite_final_asset.py:32-39
      Issue: storage.googleapis.com was absent from _ALLOWED_DOMAINS. Every collage image layer whose source_url is a GCS URL (the only storage provider used) hits `raise ValueError("URL not allowed by security policy")` inside download_image(), causing the Python process to exit non-zero and the generate endpoint to return 500 for every collage that has image layers.
      Evidence (before fix):
        _ALLOWED_DOMAINS = {
            'lh3.googleusercontent.com',
            'drive.google.com',
            ...
            'supabase.co',
            # storage.googleapis.com MISSING
        }
      Fix applied: Added 'storage.googleapis.com' to _ALLOWED_DOMAINS in composite_final_asset.py.

🟠 HIGH (3 issues)
──────────────────────────────────────────────────────
H-01  Migration missing company_id column — schema/API mismatch
      File: supabase/migrations/20260304_create_collages_table.sql (entire file)
      Issue: The API routes in route.ts and [collageId]/route.ts all filter by `.eq('company_id', companyId)` and insert with `company_id: companyId`, but the migration never declares a company_id column. The column must either exist from a prior migration or the table was created manually; the collages migration itself is incomplete, making it impossible to replay migrations on a clean DB. RLS policies are also scoped only to user_id, providing no multi-tenant isolation at the DB layer.
      Evidence:
        -- Migration has: user_id UUID NOT NULL REFERENCES auth.users(id)
        -- Migration has NO: company_id column, FK, or index
        -- API route.ts line 33: .eq('company_id', companyId)
        -- API route.ts line 119: company_id: companyId,
      Fix: Add `company_id UUID NOT NULL REFERENCES companies(id)` column, corresponding index, and update RLS policies to include `auth.uid() = user_id AND company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())`.

H-02  GET and PUT single-collage endpoints had no rate limiting
      File: src/app/api/categories/[id]/collages/[collageId]/route.ts:15-35 (GET), :52-71 (PUT)
      Issue: GET fetched a collage and PUT updated one with no calls to checkRateLimit(), violating security invariant #3. An authenticated user could enumerate or hammer updates with no throttle.
      Evidence (before fix):
        // GET handler — no checkRateLimit call between getUser() and DB query
        // PUT handler — no checkRateLimit call between getUser() and DB query
      Fix applied: Added `checkRateLimit(`collages:${user.id}`, 30, 60_000)` to both GET and PUT handlers in [collageId]/route.ts.

H-03  Layer source_url values not validated at Node API boundary before subprocess dispatch
      File: src/app/api/categories/[id]/collages/generate/route.ts:60-128
      Issue: collage_data is stored as an opaque JSONB blob. At generate time, layers are read back from DB and passed verbatim to the Python subprocess without any Node-side URL validation. Python's _is_allowed_url() is the only gate. If a malicious layer source_url (e.g., file:// or http://internal-host/) was written directly to the DB (via a compromised session or DB-level access), Python's allowlist would catch it — but the API provides no defense-in-depth at the Node boundary. There is also no cap on the number of layers sent to Python.
      Evidence:
        generate/route.ts:64  const layers = collageData?.layers || []
        generate/route.ts:99  const sanitizedLayers = effectiveLayers || []   // no URL check
        generate/route.ts:121 template_data: { layers: validatedLayers },     // type-filtered only
      Fix: Before building inputData, iterate validatedLayers and for each layer with a source_url, call isAllowedUrl() (import from a shared util or inline the same allowlist). Reject the request with 400 if any source_url fails. Also enforce a max layer count (e.g., 50).

🟡 MEDIUM (3 issues)
──────────────────────────────────────────────────────
M-01  collage_data accepted as opaque blob in PUT — no layer-level validation
      File: src/app/api/categories/[id]/collages/[collageId]/route.ts:86-97
      Issue: When updating a collage, body.collage_data is accepted wholesale (only background_color is validated). Layer text_content, name, source_url, font_family, color, and numeric fields (x, y, width, height, font_size, z_index) are not validated before storage. Oversized payloads, negative dimensions, or arbitrary source_urls are silently stored. This is the write path that feeds H-03.
      Evidence:
        route.ts:92  updateData.collage_data = body.collage_data  // no per-layer validation
      Fix: Validate each layer in body.collage_data.layers: enforce text_content ≤ 500 chars, name ≤ 100 chars, x/y/width/height are numbers 0-100, font_size is a positive integer ≤ 400, z_index is an integer, and source_url (if present) passes isAllowedUrl().

M-02  DELETE mutation unscoped — relies on prior ownership check being atomic
      File: src/app/api/categories/[id]/collages/[collageId]/route.ts:168-170
      Issue: The ownership pre-check (lines 155-161) and the actual DELETE (line 167) are two separate queries. The DELETE is scoped only by `.eq('id', collageId)` — not by category_id or company_id. A TOCTOU race where a collage is reassigned between check and delete is theoretical given Supabase's RLS (user_id match), but the pattern is inconsistent with every other route and violates defense-in-depth.
      Evidence:
        line 155: .eq('id', collageId).eq('category_id', categoryId).eq('company_id', companyId)  // ownership check
        line 167: .delete().eq('id', collageId)  // mutation — category_id and company_id not re-asserted
      Fix: Change the delete query to `.delete().eq('id', collageId).eq('category_id', categoryId).eq('company_id', companyId)`.

M-03  Temp file not cleaned up on generate failure paths
      File: src/app/api/categories/[id]/collages/generate/route.ts:196-224
      Issue: readFile(result) at line 196 and uploadFile() at line 198 can both throw. The `unlink(result)` at line 224 is inside the try block after those calls, so if the upload fails the temp file is leaked. The catch block at line 232 does not attempt cleanup.
      Evidence:
        line 196: const fileBuffer = await readFile(result)
        line 198: const { fileId, publicUrl } = await uploadFile(...)
        line 224: await unlink(result).catch(() => {})  // only reached on success
        line 232: catch (error: any) { ... }             // no unlink here
      Fix: Move unlink into a `finally` block, or store the temp path in a variable before the try and call unlink in the catch as well.

🔵 LOW (4 issues)
──────────────────────────────────────────────────────
L-01  gdrive_file_id still written on GCS uploads in generate route
      File: src/app/api/categories/[id]/collages/generate/route.ts:210-212
      Issue: The update writes `gdrive_file_id: fileId` where fileId comes from uploadFile() with provider 'gcs'. The GCS adapter returns a path string, not a Drive file ID. This field is a legacy artifact (the recent migration to GCS removed it from other tables). It stores a GCS storage path in a column named for Drive, causing confusion and potential bugs if any code reads gdrive_file_id expecting a Drive ID.
      Evidence:
        line 198: const { fileId, publicUrl } = await uploadFile(fileBuffer, storagePath, { provider: 'gcs' })
        line 211: gdrive_file_id: fileId,
      Fix: Remove gdrive_file_id from the update payload. It is not in the migration schema and serves no purpose for GCS-backed storage.

L-02  CollagePropertiesPanel accepts arbitrary external URLs with no client-side validation
      File: src/components/collage/CollagePropertiesPanel.tsx:126-130
      Issue: The URL tab lets users type any string and set it as source_url with no validation (no scheme check, no hostname check, no length cap). The value is stored in collage_data and passed to Python at render time. Python's allowlist is the only gate.
      Evidence:
        line 127: if (urlInput.trim()) { onLayerUpdate({ source_url: urlInput.trim() }) }
      Fix: Validate that urlInput starts with https:// and is ≤ 2048 characters before calling onLayerUpdate. Show an inline error for invalid URLs.

L-03  CollageWorkspace name input has no client-side length cap
      File: src/components/collage/CollageWorkspace.tsx:515
      Issue: The collageName input field has no maxLength attribute. The server enforces ≤ 100 chars, but the UI provides no feedback until the API rejects the save.
      Evidence:
        line 515: <Input value={collageName} onChange={(e) => { setCollageName(e.target.value) ... }} />
      Fix: Add `maxLength={100}` to the Input component.

L-04  Auto-load first collage on mount may overwrite unsaved work when format changes
      File: src/components/collage/CollageWorkspace.tsx:280-283
      Issue: fetchCollages auto-loads the first collage if currentCollageId is null. When the user switches formats (triggering the useEffect at line 292 which sets currentCollageId to null then calls fetchCollages), any unsaved layers are silently replaced with the first collage for the new format. hasChanges is not checked before auto-loading.
      Evidence:
        line 292: setCurrentCollageId(null)
        line 293: fetchCollages()
        line 280-283: if (data.collages?.length > 0 && !currentCollageId) { loadCollage(data.collages[0]) }
      Fix: Gate the auto-load on `!hasChanges || window.confirm('Discard unsaved changes?')`.

✅ VERIFIED CLEAN (14 items)
──────────────────────────────────────────────────────
- Auth invariant: all four route handlers (GET/POST list, GET/PUT/DELETE single, POST generate) call supabase.auth.getUser() before any DB access
- Ownership scoping: list routes use company_id filter; single-collage GET, PUT ownership check, and generate all scope by category_id + company_id
- Rate limiting: POST list, DELETE, and POST generate all call checkRateLimit() (GET/PUT now fixed)
- No sanitizeForPrompt needed: generate route passes no user strings to AI APIs (Python renders purely via PIL; no LLM call in collage path)
- Gemini API key: no Gemini calls in collage flow; not applicable
- Python subprocess: Promise.race with 120s SIGKILL timeout correctly implemented (generate/route.ts:138-178)
- stdin/stdout/stderr null check: present and correct (generate/route.ts:144-146)
- output_path validation: Python validates os.path.abspath(output_path).startswith('/tmp/') (composite_final_asset.py:838-840)
- _is_allowed_url() in Python: called in download_image() and download_font() before every outbound fetch
- No stack traces in API responses: all catch blocks return generic 'Internal server error' messages
- No createAdminSupabaseClient() usage in any collage route
- DB error messages not exposed: error objects are console.error()'d server-side only
- RLS enabled on collages table: confirmed in migration
- CollageCanvas Fabric.js event handlers: cleaned up correctly in useEffect return functions

VERDICT
NO-GO for production.

Blocking conditions (must fix before ship):
  1. H-01: Add company_id column to the collages migration — the table cannot be reliably created from migrations alone as written.
  2. H-03 / M-01: Validate layer source_url values at the Node API boundary (PUT store + generate dispatch) so no unvalidated URL reaches Python.
  3. M-02: Scope the DELETE mutation query by category_id + company_id, not just collageId.

C-01 (GCS domain in Python allowlist) and H-02 (rate limiting on GET/PUT) have been fixed in this audit session.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
