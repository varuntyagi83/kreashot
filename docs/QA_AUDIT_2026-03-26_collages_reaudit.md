```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway [Collages — Re-audit]
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-26
Files Audited:
  src/app/api/categories/[id]/collages/route.ts
  src/app/api/categories/[id]/collages/generate/route.ts
  src/app/api/categories/[id]/collages/[collageId]/route.ts
  src/lib/types/collage.ts
  scripts/composite_final_asset.py (collage-related sections)
  src/components/collage/CollagePropertiesPanel.tsx
  src/components/collage/CollageWorkspace.tsx
  supabase/migrations/20260304_create_collages_table.sql
  supabase/migrations/20260326_collages_add_company_id.sql
  src/lib/rate-limit.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
Most previously-reported issues have been resolved. Three new findings were uncovered: the DELETE mutation omits company_id from the actual DELETE query (ownership pre-check exists, but the mutation itself is underscoped), the PUT update query similarly drops company_id scoping on the write, and both Node isAllowedUrl implementations accept plain http: — a protocol that should not reach production CDN assets. No critical regressions were introduced; the codebase is close to clean but two medium-severity gaps remain in [collageId]/route.ts.

🔴 CRITICAL (0 issues)

🟠 HIGH (0 issues)

🟡 MEDIUM (2 issues)
──────────────────────────────────────────────────────
M-NEW-01: DELETE mutation missing company_id scope on the actual DELETE call
  File: src/app/api/categories/[id]/collages/[collageId]/route.ts, lines 246–250
  The pre-check SELECT (lines 234–240) correctly filters by company_id, but the
  DELETE statement that follows only uses .eq('id', collageId).eq('category_id', categoryId).
  If RLS were misconfigured or bypassed (e.g. via service-role client in a future refactor),
  a collage belonging to a different company but the same categoryId could be deleted.
  Defense-in-depth requires the mutation to echo the full predicate.
  Snippet:
    .delete()
    .eq('id', collageId)
    .eq('category_id', categoryId)   // company_id missing here
  Fix: add .eq('company_id', companyId) to the DELETE chain.

M-NEW-02: PUT update mutation missing company_id scope on the actual UPDATE call
  File: src/app/api/categories/[id]/collages/[collageId]/route.ts, lines 192–197
  Same pattern as M-NEW-01: ownership is verified via a pre-check SELECT (lines 89–95),
  but the UPDATE statement that follows only uses .eq('id', collageId).
  Snippet:
    .update(updateData)
    .eq('id', collageId)             // company_id and category_id both missing
  Fix: add .eq('category_id', categoryId).eq('company_id', companyId) to the UPDATE chain.

🔵 LOW (2 issues)
──────────────────────────────────────────────────────
L-NEW-01: isAllowedUrl accepts http: protocol in both Node implementations
  Files:
    src/app/api/categories/[id]/collages/generate/route.ts, line 27
    src/app/api/categories/[id]/collages/[collageId]/route.ts, line 22
  Both functions include 'http:' in the allowed protocol list. All production CDN
  assets (GCS, Google CDN) use https:. Accepting http: enables mixed-content fetches
  and a theoretical MITM downgrade vector.
  Fix: restrict to 'https:' only.

L-NEW-02: layer.name length not capped in PUT per-layer validation
  File: src/app/api/categories/[id]/collages/[collageId]/route.ts, lines 127–171
  The generate route caps layer.name at 100 chars (generate/route.ts line 116).
  The PUT per-layer loop validates text_content, source_url, and numeric fields
  but does not validate layer.name length. An arbitrarily long layer name can be
  persisted to the database via PUT.
  Fix: add layer.name length check (≤ 100) matching the generate route.

✅ VERIFIED CLEAN (18 items)
──────────────────────────────────────────────────────
C-01 FIXED: storage.googleapis.com present in Python _ALLOWED_DOMAINS
  (composite_final_asset.py, line 39)

H-01 FIXED: 20260326 migration adds company_id FK with ON DELETE CASCADE,
  idx_collages_company_id index, drops stale user_id policies, and recreates
  company-scoped RLS via is_company_member() for all four operations.

H-02 FIXED: checkRateLimit() called in GET (collages/route.ts line 24),
  PUT ([collageId]/route.ts line 83), and DELETE ([collageId]/route.ts line 228).

H-03 FIXED: Layer source_url validated against isAllowedUrl allowlist before
  being passed to Python (generate/route.ts lines 128–130).

M-01 FIXED: Per-layer text_content (≤ 500), source_url, and numeric bounds
  validated in PUT ([collageId]/route.ts lines 127–171).

M-02 FIXED: DELETE pre-check SELECT includes .eq('category_id', categoryId)
  and .eq('company_id', companyId) (lines 237–239). Note: the mutation itself
  is underscoped — flagged as M-NEW-01 above.

M-03 FIXED: Temp file deleted in finally block (generate/route.ts lines 250–252).

L-01 FIXED: gdrive_file_id set to null on GCS upload (generate/route.ts line 238).

L-02 FIXED: Client-side https:// validation on URL layer input
  (CollagePropertiesPanel.tsx lines 130–133, 141–142).

L-03 FIXED: maxLength={100} on collage name Input
  (CollageWorkspace.tsx line 525).

L-04 FIXED: Confirm dialog before format-switch discards unsaved layers
  (CollageWorkspace.tsx lines 263–271).

Invariant 1 CLEAN: Every route calls supabase.auth.getUser() before data access.
Invariant 2 CLEAN: All nested resources verify ownership via category_id + company_id
  (pre-check SELECT in GET, PUT, DELETE; joined query in generate POST).
Invariant 3 CLEAN: checkRateLimit() present on all AI/generation endpoints.
Invariant 4 N/A: No user strings are passed to AI prompts in collage routes;
  security invariant 4 does not apply to this feature.
Invariant 5 N/A: No Gemini API calls in collage routes.
Invariant 6 CLEAN: Python subprocess wrapped in Promise.race with 120s SIGKILL
  (generate/route.ts lines 160–203); stdin/stdout/stderr null-checked (lines 169–171).
Invariant 7 CLEAN: output_path validated to start with /tmp/ in Python
  (composite_final_asset.py lines 839–841).
Invariant 8 CLEAN: All outbound URLs validated by isAllowedUrl() (Node) and
  _is_allowed_url() (Python) before fetch.
Invariant 9 PARTIALLY CLEAN: name capped at 100 chars; text_content capped at 500
  chars in generate and PUT; layer.name not capped in PUT (see L-NEW-02).
Invariant 10 CLEAN: No stack traces or raw DB errors in API responses.
Invariant 11 N/A: createAdminSupabaseClient() not used in collage routes.

VERDICT
NO-GO — Two medium findings (M-NEW-01, M-NEW-02) must be resolved before release.
Both are single-line fixes adding the missing predicate columns to the DELETE and
UPDATE Supabase query chains. The two low findings are recommended but non-blocking.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
