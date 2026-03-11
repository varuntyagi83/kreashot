# QA Audit Report — AdForge-Railway (Collages)

**Auditor:** Vera Thornton, Principal QA Engineer  
**Date:** 2026-03-11  
**Scope:** Collages feature (most recently completed per progress.md)

**Files audited:**
- `src/app/api/categories/[id]/collages/route.ts` (GET list, POST create)
- `src/app/api/categories/[id]/collages/generate/route.ts` (POST generate)
- `src/app/api/categories/[id]/collages/[collageId]/route.ts` (GET, PUT, DELETE)
- `scripts/composite_final_asset.py` (PIL compositor used by collage generate)
- `supabase/migrations/20260304_create_collages_table.sql`
- `supabase/migrations/20260305_add_collages_deletion_trigger.sql`
- `supabase/migrations/20260309_add_collages_rls.sql`

---

## EXECUTIVE SUMMARY

Collages is **safe to ship** from a security and data-integrity standpoint. All Security Invariants that apply (auth, ownership, rate limit, subprocess timeout, output_path, URL allowlist, input length caps, no error leakage) are satisfied. One medium finding: PUT should validate that `name` is a string before length check and DB update. One low: optional defense-in-depth URL validation in Node for layer `source_url` before calling Python. No critical or high issues.

---

## CRITICAL (0 issues)

*None.*

---

## HIGH (0 issues)

*None.*

---

## MEDIUM (1 issue)

**M1 — PUT accepts non-string `name`; length check bypassed, wrong type can reach DB**  
- **File:** `src/app/api/categories/[id]/collages/[collageId]/route.ts:63–67`  
- **Issue:** `if (body.name !== undefined) { if (body.name.length > 100)` assumes `body.name` is a string. If client sends `name: 123`, `body.name.length` is undefined, `undefined > 100` is false, and `updateData.name = body.name` sets a number. DB may reject or store an unexpected value.  
- **Evidence:**  
  ```ts
  if (body.name !== undefined) {
    if (body.name.length > 100) { ... }
    updateData.name = body.name  // no typeof check
  }
  ```  
- **Fix:** (Applied) Reject with 400 if `body.name` is present but not a string. Otherwise trim and enforce `name.length <= 100` before setting `updateData.name`. See `[collageId]/route.ts` PUT handler.

---

## LOW (1 issue)

**L1 — No Node-side URL validation for layer `source_url` before calling Python**  
- **File:** `src/app/api/categories/[id]/collages/generate/route.ts` (layer data passed to Python)  
- **Issue:** Layer `source_url` values are only validated inside the Python script via `_is_allowed_url()`. final-assets route uses `isAllowedUrl()` in Node before calling the same script; collages does not.  
- **Evidence:** generate builds `validatedLayers` and `inputData.template_data.layers` without checking each `layer.source_url` against an allowlist in Node.  
- **Fix:** (Defense-in-depth) Before spawning Python, iterate layers and, for any with `source_url`, call the same `isAllowedUrl()` used in final-assets (or a shared helper). Reject with 400 if any URL is disallowed. Python will still enforce; this reduces risk of logic bugs or script changes bypassing URL check.

---

## VERIFIED CLEAN

- **Auth:** All five handlers (GET list, POST create, POST generate, GET one, PUT, DELETE) call `supabase.auth.getUser()` before any data access. Unauthorized returns 401.
- **Ownership:** All DB access filters by `category_id` and `user_id` (or fetches by id + category_id + user_id). No IDOR.
- **RLS:** Only `createServerSupabaseClient()` (anon key) is used; no service role in collages.
- **Rate limiting:** generate calls `checkRateLimit('collage-gen:${user.id}', 5, 60_000)`; DELETE calls `checkRateLimit('delete:${user.id}', 50, 60_000)`.
- **Subprocess:** generate uses `Promise.race` with 120s SIGKILL; stdin/stdout/stderr null-checked before use.
- **output_path:** Generate sets `outputPath = '/tmp/collage_${Date.now()}.png'`; Python validates `output_path` with `os.path.abspath` and `startswith('/tmp/')`.
- **URL allowlist (Python):** `download_image()` and `download_font()` call `_is_allowed_url()` before `urllib.request.urlopen`. All layer types that fetch by URL (overlay, composite, image, background) use `download_image()`.
- **Input length:** name capped at 100 (POST create, PUT update); layer `text_content` 500, layer `name` 100 in generate; 400 returned on violation.
- **Format/type whitelist:** Format validated against `['1:1','16:9','9:16','4:5']`; layer type against `VALID_COLLAGE_LAYER_TYPES`.
- **Error responses:** All catch blocks return generic `{ error: 'Internal server error' }` or similar; no stack traces or raw DB/exception messages to client.
- **Debug rendering:** No stamps, watermarks, or red text in compositor; only stderr logging.
- **Collages table:** RLS enabled; policies for select/insert/update/delete on `auth.uid() = user_id`. Deletion trigger queues GDrive cleanup via `deletion_queue` (SECURITY DEFINER, server-side only).

---

## VERDICT

**GO for production** with one recommended change: fix PUT `name` type and length validation (M1). L1 is optional hardening.
