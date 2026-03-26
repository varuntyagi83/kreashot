━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway [Collages — Final]
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-26
Files Audited:
  - src/app/api/categories/[id]/collages/route.ts
  - src/app/api/categories/[id]/collages/generate/route.ts
  - src/app/api/categories/[id]/collages/[collageId]/route.ts
  - src/components/collage/CollagePropertiesPanel.tsx
  - src/components/collage/CollageWorkspace.tsx
  - supabase/migrations/20260326_collages_add_company_id.sql
  - scripts/composite_final_asset.py (ALLOWED_DOMAINS section)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
14 of the 15 required fixes are confirmed present and correct. One LOW-severity
gap was found: the Python `_is_allowed_url` helper in `composite_final_asset.py`
permits `http:` scheme URLs in addition to `https:`, creating a minor inconsistency
with both Node.js `isAllowedUrl` implementations which enforce `https:` only. All
HIGH and MEDIUM severity fixes are fully verified. The feature is safe to ship
subject to the one LOW finding being tracked.

---

CRITICAL (0 issues)

HIGH (0 issues)

MEDIUM (0 issues)

LOW (1 issue)
──────────────────────────────────────────────────────
FIND-LOW-01 — scripts/composite_final_asset.py:50
  `_is_allowed_url` checks `if parsed.scheme not in ('https', 'http')` — the
  `http:` scheme is permitted. Both Node.js counterparts (generate/route.ts:27
  and [collageId]/route.ts:22) correctly enforce `https:` only. Python images
  fetched over plain HTTP are subject to MITM. Impact is mitigated by the Node
  layer rejecting http: URLs before the Python script is ever invoked; however
  the Python function's own defence is weaker than specified.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERIFIED CLEAN (15 items)
──────────────────────────────────────────────────────
C-01   scripts/composite_final_asset.py:39
       `'storage.googleapis.com'` is listed in `_ALLOWED_DOMAINS`.

H-01   supabase/migrations/20260326_collages_add_company_id.sql:41-50 + 73-83
       `company_id` FK recreated with `ON DELETE CASCADE` (line 41-45);
       `idx_collages_company_id` index created (line 50); four company-scoped
       RLS policies (`collages_select/insert/update/delete`) created using
       `is_company_member(company_id)` (lines 73-83). All three sub-requirements
       confirmed.

H-02   src/app/api/categories/[id]/collages/[collageId]/route.ts:46 + 83
       `checkRateLimit(...)` called on line 46 inside GET and on line 83 inside
       PUT. Both handlers enforce rate limiting before any data access.

H-03   src/app/api/categories/[id]/collages/generate/route.ts:128-131
       Inside the `validatedLayers` filter, `isAllowedUrl(layer.source_url)` is
       called on every layer's `source_url` at the Node boundary before the
       Python script receives any URL. Layers that fail the check are silently
       dropped with a console warning (line 129-130).

M-01   src/app/api/categories/[id]/collages/[collageId]/route.ts:127-181
       Full per-layer validation loop: `layer.name` capped at 100 chars (line
       133), `text_content` capped at 500 chars (line 143), `source_url`
       validated via `isAllowedUrl` (line 153), and numeric bounds enforced for
       `x`, `y`, `width`, `height`, `opacity`, `fontSize` (lines 162-180).

M-02   src/app/api/categories/[id]/collages/[collageId]/route.ts:260-263
       DELETE mutation: `.eq('id', collageId)` (261), `.eq('category_id',
       categoryId)` (262), `.eq('company_id', companyId)` (263). Both required
       equality filters present.

M-03   src/app/api/categories/[id]/collages/generate/route.ts:250-253
       Temp file cleanup is in a `finally` block: `await unlink(result).catch(
       () => {})` at line 252, ensuring deletion even when the DB update throws.

L-01   src/app/api/categories/[id]/collages/generate/route.ts:238
       `gdrive_file_id: null` is set explicitly in the `.update(...)` payload
       alongside `storage_provider: 'gcs'`, clearing any stale Drive reference
       on every GCS upload.

L-02   src/components/collage/CollagePropertiesPanel.tsx:130-132 + 140-142
       `handleUrlSubmit` (line 130): rejects any URL not starting with
       `https://` and sets `urlError`. `handleUrlBlur` (line 140): same guard
       on blur. Both image and overlay URL tabs share this single handler pair.

L-03   src/components/collage/CollageWorkspace.tsx:525
       Name `<Input>` has `maxLength={100}` attribute directly on the element.

L-04   src/components/collage/CollageWorkspace.tsx:263-271
       `useEffect` that syncs the `format` prop calls `window.confirm(...)` when
       `hasChanges && layers.length > 0`, blocking the format switch until the
       user explicitly approves (line 266-269).

M-NEW-01   src/app/api/categories/[id]/collages/[collageId]/route.ts:260-263
           DELETE: `.eq('company_id', companyId)` present at line 263.
           (Same evidence as M-02; confirmed independently.)

M-NEW-02   src/app/api/categories/[id]/collages/[collageId]/route.ts:202-207
           PUT mutation: `.eq('id', collageId)` (205), `.eq('category_id',
           categoryId)` (206), `.eq('company_id', companyId)` (207). Both
           required equality filters present.

L-NEW-01   src/app/api/categories/[id]/collages/generate/route.ts:27
           `isAllowedUrl`: `if (parsed.protocol !== 'https:') return false`.
           src/app/api/categories/[id]/collages/[collageId]/route.ts:22
           `isAllowedUrl`: same guard. Both Node.js implementations allow only
           `https:`. (Python counterpart allows `http:` — see FIND-LOW-01.)

L-NEW-02   src/app/api/categories/[id]/collages/[collageId]/route.ts:133-138
           Per-layer validation loop in PUT: `layer.name.length > 100` triggers
           a 400 response with message "name must be a string of 100 characters
           or fewer". Confirmed for all layers via the `for` loop at line 128.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERDICT
GO — with advisory

All HIGH and MEDIUM fixes are confirmed. The single LOW finding (FIND-LOW-01)
is defence-in-depth: the Python `http:` permission is blocked upstream by the
Node.js validation layer, so no `http:` URL can realistically reach the script
in production. The feature may ship. The Python check should be tightened to
`https` only in the next hardening sprint.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
