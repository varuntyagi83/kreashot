# QA Audit Report — AdForge-Railway (Full App)

**Auditor:** Vera Thornton, Principal QA Engineer  
**Date:** 2026-03-11  
**Scope:** Full codebase (security, AI lib, API routes, storage, compositor, UI touched by changes)

**Files audited (representative + modified):**
- `src/lib/ai/gemini.ts` (retries, angled-shot fallback signaling)
- `src/lib/pdf.ts` (exports)
- `src/app/api/categories/[id]/brand-docs/route.ts` (Vision + color description)
- `src/app/api/categories/[id]/backgrounds/generate/route.ts` (category color description)
- `src/app/api/categories/[id]/angled-shots/generate/route.ts` (fallbackToOriginalAngles)
- `src/app/api/categories/[id]/copy-docs/generate/route.ts` (brand context comment)
- `src/app/api/categories/[id]/composites/generate/route.ts` (safe zones comment)
- `src/components/angled-shots/GenerateAngledShotsDialog.tsx`, `AngledShotsPage.tsx` (fallback UI)
- `scripts/composite_final_asset.py` (unchanged; reference)
- `supabase/migrations/20260311_categories_color_description.sql`
- `docs/TEMPLATE_SAFE_ZONES.md`
- Sampling: `src/app/api/categories/[id]/final-assets/route.ts`, `collages/generate/route.ts`, `src/lib/supabase/server.ts`, `admin/*` (auth pattern)

---

## EXECUTIVE SUMMARY

Five requested improvements were implemented: Gemini retries (429/503), brand voice/guidelines always passed in copy, Vision + color description for category PDFs, clear safe zones documentation, and angled-shot failure signaling in API and UI. No new critical or high issues were introduced. Modified routes retain auth, ownership checks, and safe error handling. Full app still has known open items from **Issues.md** (e.g. orphaned GDrive files, no retry on Gemini was fixed; angled-shot silent fallback was fixed). **Safe to ship** the changes; recommend running the new migration and re-testing PDF upload and angled-shot flow.

---

## CRITICAL (0 new)

*None introduced by this change set.*

Known open (from Issues.md): #2, #3, #43 (orphaned GDrive), #44 (retry) — **#44 addressed** in this release.

---

## HIGH (0 new)

*None introduced.*

- Copy generation already passed `brand_guidelines` and `brandVoice`; comment added for clarity.
- Brand-docs POST: auth and category ownership verified before any PDF processing; Vision/translation run server-side; no user content in error responses.
- Angled-shot API and UI now expose `fallbackToOriginalAngles` and show a warning toast when generation fell back to original image.

---

## MEDIUM (0 new)

*None introduced.*

- New column `categories.brand_guidelines_color_description`: migration is additive; existing rows get NULL. Backgrounds route uses it only when present.
- Safe zones: documentation added; composite route already used `template_data.safe_zones`; comment clarifies expected shape.

---

## LOW (0 new)

*None introduced.*

- AngledShotsPage toast references `data.generatedShots` or `data.angledShots`; response shape uses `angledShots`. Toast text is correct.

---

## VERIFIED CLEAN (modified areas)

- **gemini.ts:** `fetchGeminiWithRetry` used for all image-generation `fetch` calls (angled shots, backgrounds, regenerateBackgroundInFormat, composite). Key in header only (`x-goog-api-key`). Angled-shot return type includes `fallbackToOriginal: boolean`; fallback and catch paths set `fallbackToOriginal: true`.
- **brand-docs:** `getUser()` and category ownership check before processing. Vision then text fallback; `translateGuidelinesToColorDescription` on extracted text; update includes `brand_guidelines_color_description`. DELETE clears new column.
- **backgrounds/generate:** Category select includes `brand_guidelines_color_description`; used when no @-reference color description; type cast for TS. `generateBackgrounds(..., resolvedColorDescription)` unchanged.
- **angled-shots/generate:** Response includes `fallbackToOriginalAngles` (array of angle names). No leak of internal errors.
- **AngledShotsDialog / AngledShotsPage:** Warning toast when `data.fallbackToOriginalAngles?.length > 0`; no new secrets or stack traces.
- **Migration:** `ADD COLUMN IF NOT EXISTS`; comment on column.
- **RLS / auth:** All modified routes use `createServerSupabaseClient()` and `auth.getUser()`; no service role in user-facing paths.

---

## REGRESSION CHECK

- Gemini retry helper is local to `gemini.ts`; no change to OpenAI or PDF fetch.
- New category column is optional; existing backgrounds flow unchanged if column is NULL.
- Angled-shot response is backward compatible: new field `fallbackToOriginalAngles` is additive; clients that ignore it behave as before.

---

## KNOWN OPEN ITEMS (from Issues.md)

Still outstanding: orphaned GDrive on DB failure (#2), category/product delete orphans (#3, #43), template auth (#1 WONTFIX), rate limiting on some routes (#8), and others listed in **Issues.md**. These were not in scope for this audit.

---

## VERDICT

**GO for production** for this change set. Apply migration `20260311_categories_color_description.sql` before or with deploy. Recommend: smoke-test category PDF upload (Vision + color description), angled-shot generation (including failure path and UI warning), and one composite run with a template that has safe zones.
