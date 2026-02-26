# AdForge Railway — QA Issues Tracker

**Audit Date:** 2026-02-26 (Round 2 — Exhaustive)
**Auditor:** Senior QA Assessment (automated)
**Overall Risk Level:** HIGH
**Total Issues:** 69 (7 fixed, 1 WONTFIX, 61 tracked)

> **Note:** Auth-related items (#1) marked as WONTFIX — app is internal-use only (1-2 users).

---

## CRITICAL Issues

| # | Issue | Location | Safe to Fix? | Status |
|---|-------|----------|--------------|--------|
| 1 | Template routes missing authentication + user_id filter | `src/app/api/categories/[id]/templates/route.ts`, `[templateId]/route.ts` | N/A | WONTFIX (internal use) |
| 2 | Orphaned GDrive files when DB insert fails after upload | All POST routes (backgrounds, copy-docs, composites, angled-shots) | RISKY — needs careful transaction wrapping; rollback must delete uploaded GDrive file without breaking existing flows | NOT FIXED |
| 3 | Category deletion orphans ALL GDrive assets (cascade deletes DB rows but triggers don't fire on cascaded deletes) | `src/app/api/categories/[id]/route.ts` | RISKY — must enumerate and delete GDrive files BEFORE cascade; wrong order = data loss | NOT FIXED |
| 4 | Batch generation (copy kit / backgrounds) uses Promise.all — partial failure loses ALL results | `src/lib/ai/openai.ts`, `src/lib/ai/gemini.ts` | N/A | FIXED |
| 5 | CompositeGenerationForm: `setIsGenerating(false)` only in catch, not finally — button stuck on success | `src/components/composites/CompositeGenerationForm.tsx:179` | N/A | FIXED |
| 6 | No error.tsx / ErrorBoundary anywhere — component crash = blank page | Entire app (`src/app/`) | N/A | FIXED |
| 7 | Base64 image uploads have no size limit — could crash server with huge payloads | backgrounds, angled-shots, composites POST routes | N/A | FIXED |
| 43 | Product deletion orphans child GDrive files (product_images + angled_shots cascaded but triggers don't fire) | `src/app/api/categories/[id]/products/[productId]/route.ts` | RISKY — same pattern as #3; must collect all child GDrive IDs before cascade, delete after | NOT FIXED |
| 44 | Zero retry logic on Gemini API calls — transient 429/503 kills entire generation batch | `src/lib/ai/gemini.ts` (all 4 generation functions) | MODERATE — retry logic is straightforward but must handle timeout accumulation and avoid duplicating work | NOT FIXED |

---

## HIGH Priority Issues

| # | Issue | Location | Safe to Fix? | Status |
|---|-------|----------|--------------|--------|
| 8 | No rate limiting on AI generation routes (OpenAI, Gemini) | All `/generate` endpoints | MODERATE — middleware could block legitimate rapid usage if thresholds are too low | NOT FIXED |
| 9 | Brand voice deletion race condition — deleted voice used silently in concurrent generation | BrandVoiceSelector + copy-docs/generate | SAFE — add a 404 check before generation; no existing behavior changes | NOT FIXED |
| 10 | Unbounded list rendering in galleries — no pagination or virtualization | CompositeGallery, BackgroundGallery, CopyGallery | SAFE — additive pagination/virtualization; existing behavior unchanged for small lists | NOT FIXED |
| 11 | Dashboard N+3 request waterfall — 3 API calls per category (16 calls for 5 categories) | `src/app/(dashboard)/page.tsx` | SAFE — consolidate into single query; purely performance improvement | NOT FIXED |
| 12 | Brand-assets POST: no file type validation, no size limit | `src/app/api/brand-assets/route.ts` | N/A | FIXED |
| 13 | ReferencePicker: no AbortController — stale fetches on rapid typing, memory leak on unmount | `src/components/ui/reference-picker.tsx` | N/A | FIXED |
| 14 | ProductImageUpload: blob URLs from createObjectURL never revoked | `src/components/products/ProductImageUpload.tsx` | N/A | FIXED |
| 15 | GDrive quota (403) treated as permanent failure — should retry with backoff | `src/lib/storage/gdrive-adapter.ts` | MODERATE — retry on 403/429 is correct but must ensure idempotency to avoid duplicate files | NOT FIXED |
| 16 | Missing Suspense boundaries in dashboard layout | `src/app/(dashboard)/layout.tsx` | SAFE — purely additive; wrapping in Suspense with fallback cannot break existing rendering | NOT FIXED |
| 17 | Prompt injection risk — user brief directly interpolated into AI prompts without sanitization | `src/lib/ai/openai.ts`, `src/lib/ai/gemini.ts` | MODERATE — over-aggressive sanitization could strip legitimate copy content | NOT FIXED |
| 18 | No input validation library (zod/joi) — manual validation inconsistent across routes | Multiple API routes | MODERATE — large-scale migration touches many files; stricter validation could reject previously accepted input | NOT FIXED |
| 19 | Gemini API key passed in URL query string instead of headers — exposed in ALL ai files | `src/lib/ai/gemini.ts`, `src/lib/ai/brand-voice.ts` | SAFE — move key from URL param to `x-goog-api-key` header; Gemini supports both, zero behavior change | NOT FIXED |
| 45 | Angled shots silently fall back to original image on generation failure — no error indicator to client | `src/lib/ai/gemini.ts:168-180` (generateAngledShots) | SAFE — return error metadata alongside fallback; client can then show warning | NOT FIXED |
| 46 | Product image primary flag race condition — no UNIQUE constraint, concurrent deletion can leave 0 or 2+ primaries | `src/app/api/categories/[id]/products/[productId]/images/[imageId]/route.ts:121-137` | MODERATE — adding partial UNIQUE index is safe but existing data must be checked for violations first | NOT FIXED |
| 47 | Category rename doesn't update GDrive folder structure — slug changes but files remain in old folder | `src/app/api/categories/[id]/route.ts:132-139` | RISKY — GDrive folder rename/move is destructive; partial failure leaves assets split across old and new folders | NOT FIXED |
| 48 | Admin auth bypass when CRON_SECRET/API_SECRET env vars undefined — `if (expectedToken && ...)` skips check | `src/app/api/admin/verify-storage-sync/route.ts`, `process-deletion-queue/route.ts` | MODERATE — fix is simple (`if (!expectedToken || ...)`) but could lock out cron jobs if env not set in all environments | NOT FIXED |
| 49 | Error messages leak internal details (DB schema, file paths) to API clients | Multiple API routes (brand-assets, brand-voices, admin) | SAFE — replace specific errors with generic messages; no functional change | NOT FIXED |
| 50 | GDrive upload retry doesn't cover 429 (rate limit) — only retries on 5xx/network errors | `src/lib/storage/gdrive-adapter.ts:184` | MODERATE — same idempotency concern as #15; must ensure upload deduplication | NOT FIXED |
| 51 | `window.location.reload()` causes full page reload instead of React state refresh | `src/app/(dashboard)/categories/[id]/page.tsx:209` | SAFE — replace with `router.refresh()` or callback; strictly better UX | NOT FIXED |
| 67 | Missing `export const dynamic = 'force-dynamic'` on 8+ API routes — stale/cached user data possible | Multiple data-mutation API routes | SAFE — additive one-liner per route; prevents caching, no behavior change for correct data | NOT FIXED |

---

## MEDIUM Priority Issues

| # | Issue | Location | Safe to Fix? | Status |
|---|-------|----------|--------------|--------|
| 20 | Missing DB indexes on user_id in 5+ tables (copy_docs, guidelines, final_assets, ad_exports) — RLS full-table scans | Migrations | SAFE — additive indexes; zero behavior change, only faster queries | NOT FIXED |
| 21 | No unique constraint on backgrounds(category_id, name, format) — allows duplicates | Schema | SAFE — additive constraint; existing duplicates would need cleanup first (check before applying) | NOT FIXED |
| 22 | 120+ uses of `any` type across codebase that could cause runtime errors | Multiple files | SAFE — purely compile-time changes; no runtime behavior change | NOT FIXED |
| 23 | `formData.get('file') as File` without null check — unsafe cast before guard clause | Multiple API routes | SAFE — add null check before cast; strictly defensive | NOT FIXED |
| 24 | No security headers (CSP, X-Frame-Options, HSTS) in next.config | `next.config.ts` | SAFE — additive headers; no functional change | NOT FIXED |
| 25 | No custom 404/500 error pages | App directory | SAFE — additive `not-found.tsx` files; purely UX improvement | NOT FIXED |
| 26 | Admin routes use weak Bearer token auth (CRON_SECRET) — see also #48 | Admin API routes | MODERATE — changing auth mechanism could break existing cron configurations | NOT FIXED |
| 27 | Concurrent category edits — last write wins, no optimistic locking | Category PUT | MODERATE — adding versioning changes the API contract; existing clients must send version | NOT FIXED |
| 28 | `window.location` access should use `useSearchParams()` — hydration mismatch | `CategoryNav.tsx` | SAFE — direct React hook replacement; fixes console warnings and visual flicker | NOT FIXED |
| 29 | No `.env.example` file and no startup environment variable validation | Root | SAFE — additive file; no behavior change | NOT FIXED |
| 30 | Slug generation regex doesn't handle Unicode — `\w` only matches ASCII | Categories, products, backgrounds, composites routes | MODERATE — changing slug generation could create different slugs for existing names; old URLs break | NOT FIXED |
| 31 | Dockerfile runs as root, no USER directive | `Dockerfile` | SAFE — add `USER node`; standard container hardening | NOT FIXED |
| 32 | Python + Pillow in Node container increases attack surface | `Dockerfile` | RISKY — removing Python breaks `final-assets` route that shells out to Python/Pillow for image compositing | NOT FIXED |
| 33 | No health check endpoint for container orchestration | N/A | SAFE — additive route; no existing behavior affected | NOT FIXED |
| 34 | Missing `required` / `aria-label` on forms for accessibility | Multiple components | SAFE — additive HTML attributes; no functional change | NOT FIXED |
| 52 | Missing `loading.tsx` skeleton files — blank screen during page transitions | `src/app/(dashboard)/` (no loading.tsx anywhere) | SAFE — additive files; Next.js uses them automatically as Suspense fallbacks | NOT FIXED |
| 53 | Lazy loading missing on most gallery images (only BackgroundGallery has `loading="lazy"`) | CompositeGallery, ProductCard, BackgroundPreviewGrid | SAFE — add `loading="lazy"` attribute; standard HTML optimization | NOT FIXED |
| 54 | Form double-submit possible via keyboard Enter during loading state | CreateProductDialog, CreateCategoryDialog | SAFE — add `disabled={isSubmitting}` to form; no behavior change when not submitting | NOT FIXED |
| 55 | No transaction control in multi-step DB operations (brand voice default toggle, primary image swap) | brand-voices route, product-images route | MODERATE — wrapping in RPC/transaction changes error handling; partial rollback behavior differs from current | NOT FIXED |
| 57 | Template creation gives vague 500 error on format uniqueness violation | `src/app/api/categories/[id]/templates/route.ts:80-99` | SAFE — catch constraint violation and return descriptive 409; no functional change | NOT FIXED |
| 58 | No `.dockerignore` — build context includes .git, node_modules, .env files | Project root (missing file) | SAFE — additive file; reduces build size only | NOT FIXED |
| 59 | Sidebar refetches categories on every pathname change (`useEffect` dep on `pathname`) | `src/components/layout/Sidebar.tsx:35-52` | SAFE — remove pathname dependency; fetch once on mount + on category mutations | NOT FIXED |
| 68 | Unguarded `JSON.parse` in final-assets route — Python script output could crash parser | `src/app/api/categories/[id]/final-assets/route.ts` | SAFE — wrap in try/catch with descriptive error; strictly defensive | NOT FIXED |
| 69 | No optimistic locking on generation endpoints — duplicate simultaneous generations possible | All generate routes | MODERATE — adding locking could reject legitimate retries if lock state is stale | NOT FIXED |

---

## LOW Priority Issues

| # | Issue | Location | Safe to Fix? | Status |
|---|-------|----------|--------------|--------|
| 35 | Using `<img>` instead of Next.js `<Image>` in galleries | Multiple components | SAFE — swap tags; Next.js Image handles optimization automatically | NOT FIXED |
| 36 | Missing keyboard navigation in modals | Dialog components | SAFE — additive a11y; Radix Dialog already handles most, just needs focus trapping | NOT FIXED |
| 37 | No caching for repeated reference fetches | `reference-display.tsx` | SAFE — add simple in-memory cache; no behavior change | NOT FIXED |
| 38 | Unused import (`Package` icon) | `CategoryNav.tsx` | SAFE — delete one line; zero risk | NOT FIXED |
| 39 | Form values not cleared on submission error | `CreateProductDialog.tsx` | SAFE — preserve values on error (actually better UX); only clear on success | NOT FIXED |
| 40 | No audit trail / soft delete for compliance | Database | MODERATE — adding soft delete changes all queries; hard deletes become updates | NOT FIXED |
| 41 | Reference image download failure silently skipped during generation | Background generate route | SAFE — add warning in response; generation still proceeds with available refs | NOT FIXED |
| 42 | GDrive file permission failure doesn't roll back upload — file exists but inaccessible | `gdrive-adapter.ts` | SAFE — add cleanup on permission failure; existing broken files unaffected | NOT FIXED |
| 56 | `source_angled_shot_id` column is dead code — added in migration 017 but never populated by API | Migration 017, angled-shots route | SAFE — leave in place or drop; no code references it | NOT FIXED |
| 60 | Backgrounds `CHECK (format IN (...))` constraint conflicts with format_configs FK — redundant enforcement | Migration 012 vs 015 | SAFE — remove CHECK, keep FK; less restrictive is fine since FK already validates | NOT FIXED |
| 61 | Composite unique constraint removed — TOCTOU race on slug check before insert | Migration `20260223_remove_composite_unique_constraint.sql` | MODERATE — re-adding constraint could fail if duplicates already exist in production | NOT FIXED |
| 62 | Browser `confirm()` dialogs don't match app design | BackgroundGallery, CompositeGallery, ProductCard | SAFE — replace with custom dialog component; purely cosmetic | NOT FIXED |
| 63 | CopyGallery shows full text with no truncation — page gets very long with long copy | `src/components/copy/CopyGallery.tsx:152-156` | SAFE — add CSS line-clamp with expand toggle; purely cosmetic | NOT FIXED |
| 64 | ProductCard image error handling doesn't retry with fallback URL (unlike BackgroundGallery) | `src/components/products/ProductCard.tsx:109-113` | SAFE — add onError fallback; matches existing BackgroundGallery pattern | NOT FIXED |
| 65 | Redundant `supabase.auth.getSession()` call in useAuth hook — `onAuthStateChange` already fires immediately | `src/lib/hooks/useAuth.ts:14-17` | SAFE — remove one call; onAuthStateChange handles it | NOT FIXED |
| 66 | Migration 011 may reference wrong table name (`storage_deletion_queue` vs `deletion_queue`) | Migration `011_add_storage_sync_to_angled_shots.sql:54-68` | RISKY — if trigger references wrong table, fixing it requires re-running migration on live data; angled shot deletions may have been silently failing | NOT FIXED |

---

## Master Summary Table

| # | Issue (short) | Severity | Safe to Fix? | Status |
|---|--------------|----------|--------------|--------|
| 1 | Template auth missing | CRITICAL | N/A | WONTFIX |
| **2** | **Orphaned GDrive on DB insert failure** | **CRITICAL** | **RISKY** | NOT FIXED |
| **3** | **Category delete orphans ALL GDrive files** | **CRITICAL** | **RISKY** | NOT FIXED |
| 4 | Batch generation partial failure | CRITICAL | N/A | FIXED |
| 5 | Generate button stuck on success | CRITICAL | N/A | FIXED |
| 6 | No error boundaries | CRITICAL | N/A | FIXED |
| 7 | No base64 size limit | CRITICAL | N/A | FIXED |
| **43** | **Product delete orphans GDrive files** | **CRITICAL** | **RISKY** | NOT FIXED |
| **44** | **No retry on Gemini API (429/503)** | **CRITICAL** | **MODERATE** | NOT FIXED |
| 8 | No rate limiting on AI routes | HIGH | MODERATE | NOT FIXED |
| 9 | Brand voice deletion race | HIGH | SAFE | NOT FIXED |
| **10** | **Unbounded gallery rendering** | **HIGH** | **SAFE** | NOT FIXED |
| **11** | **Dashboard N+3 waterfall** | **HIGH** | **SAFE** | NOT FIXED |
| 12 | Brand-assets no validation | HIGH | N/A | FIXED |
| 13 | ReferencePicker memory leak | HIGH | N/A | FIXED |
| 14 | ProductImageUpload blob leak | HIGH | N/A | FIXED |
| **15** | **GDrive 403 not retried** | **HIGH** | **MODERATE** | NOT FIXED |
| **16** | **Missing Suspense boundaries** | **HIGH** | **SAFE** | NOT FIXED |
| 17 | Prompt injection risk | HIGH | MODERATE | NOT FIXED |
| 18 | No validation library | HIGH | MODERATE | NOT FIXED |
| 19 | Gemini API key in URL query string | HIGH | SAFE | NOT FIXED |
| **45** | **Angled shots silent fallback** | **HIGH** | **SAFE** | NOT FIXED |
| **46** | **Primary image race condition** | **HIGH** | **MODERATE** | NOT FIXED |
| **47** | **Category rename breaks GDrive paths** | **HIGH** | **RISKY** | NOT FIXED |
| 48 | Admin auth bypass if env missing | HIGH | MODERATE | NOT FIXED |
| 49 | Error messages leak internals | HIGH | SAFE | NOT FIXED |
| **50** | **GDrive retry skips 429** | **HIGH** | **MODERATE** | NOT FIXED |
| **51** | **window.location.reload()** | **HIGH** | **SAFE** | NOT FIXED |
| **67** | **Missing force-dynamic on routes** | **HIGH** | **SAFE** | NOT FIXED |
| 20 | Missing DB indexes on user_id | MEDIUM | SAFE | NOT FIXED |
| 21 | No unique constraint on backgrounds | MEDIUM | SAFE | NOT FIXED |
| 22 | 120+ `any` types | MEDIUM | SAFE | NOT FIXED |
| 23 | Unsafe file cast pattern | MEDIUM | SAFE | NOT FIXED |
| 24 | No security headers | MEDIUM | SAFE | NOT FIXED |
| 25 | No custom 404/500 pages | MEDIUM | SAFE | NOT FIXED |
| 26 | Weak admin token auth | MEDIUM | MODERATE | NOT FIXED |
| 27 | No optimistic locking on edits | MEDIUM | MODERATE | NOT FIXED |
| **28** | **CategoryNav hydration mismatch** | **MEDIUM** | **SAFE** | NOT FIXED |
| 29 | No .env.example / startup validation | MEDIUM | SAFE | NOT FIXED |
| **30** | **Slug regex drops Unicode** | **MEDIUM** | **MODERATE** | NOT FIXED |
| 31 | Dockerfile runs as root | MEDIUM | SAFE | NOT FIXED |
| **32** | **Python in Node container** | **MEDIUM** | **RISKY** | NOT FIXED |
| 33 | No health check endpoint | MEDIUM | SAFE | NOT FIXED |
| 34 | Missing form a11y labels | MEDIUM | SAFE | NOT FIXED |
| **52** | **Missing loading.tsx files** | **MEDIUM** | **SAFE** | NOT FIXED |
| **53** | **Gallery images not lazy-loaded** | **MEDIUM** | **SAFE** | NOT FIXED |
| **54** | **Form double-submit via Enter** | **MEDIUM** | **SAFE** | NOT FIXED |
| **55** | **No transactions in multi-step ops** | **MEDIUM** | **MODERATE** | NOT FIXED |
| **57** | **Template 500 on format collision** | **MEDIUM** | **SAFE** | NOT FIXED |
| 58 | No .dockerignore | MEDIUM | SAFE | NOT FIXED |
| 59 | Sidebar refetches on pathname | MEDIUM | SAFE | NOT FIXED |
| **68** | **Unguarded JSON.parse** | **MEDIUM** | **SAFE** | NOT FIXED |
| 69 | No locking on generation endpoints | MEDIUM | MODERATE | NOT FIXED |
| 35 | `<img>` instead of `<Image>` | LOW | SAFE | NOT FIXED |
| 36 | Missing keyboard nav in modals | LOW | SAFE | NOT FIXED |
| 37 | No reference fetch caching | LOW | SAFE | NOT FIXED |
| 38 | Unused import | LOW | SAFE | NOT FIXED |
| 39 | Form values not cleared on error | LOW | SAFE | NOT FIXED |
| 40 | No audit trail / soft delete | LOW | MODERATE | NOT FIXED |
| 41 | Download failure silently skipped | LOW | SAFE | NOT FIXED |
| 42 | GDrive permission fail no rollback | LOW | SAFE | NOT FIXED |
| 56 | source_angled_shot_id dead code | LOW | SAFE | NOT FIXED |
| 60 | Redundant CHECK + FK constraint | LOW | SAFE | NOT FIXED |
| 61 | Composite TOCTOU race on slug | LOW | MODERATE | NOT FIXED |
| 62 | Browser confirm() style mismatch | LOW | SAFE | NOT FIXED |
| 63 | CopyGallery no text truncation | LOW | SAFE | NOT FIXED |
| 64 | ProductCard no image retry | LOW | SAFE | NOT FIXED |
| 65 | Redundant getSession() call | LOW | SAFE | NOT FIXED |
| **66** | **Migration 011 wrong table name?** | **LOW** | **RISKY** | NOT FIXED |

---

## Fix Risk Summary

| Risk Level | Count | Issues |
|------------|-------|--------|
| **SAFE** | 43 | Fix has zero risk to existing UX — purely additive, defensive, or cosmetic changes |
| **MODERATE** | 14 | Fix is correct but needs careful implementation — could reject valid input, change error behavior, or require data migration |
| **RISKY** | 6 | Fix could break existing functionality if done wrong — involves GDrive file operations, cascade delete rewiring, or production migration changes |
| **N/A** | 6 | Already FIXED or WONTFIX |

### RISKY Fixes — Why They're Risky

| # | Issue | Risk |
|---|-------|------|
| 2 | Orphaned GDrive on DB fail | Transaction wrapping must delete uploaded file on DB error; wrong order means either data loss or permanent orphan |
| 3 | Category delete orphans GDrive | Must collect ALL child GDrive file IDs across 5+ tables BEFORE cascade delete; miss one = permanent orphan |
| 43 | Product delete orphans GDrive | Same as #3 — must enumerate product_images + angled_shots GDrive IDs before cascade |
| 47 | Category rename breaks GDrive | GDrive folder rename is not atomic; partial failure splits assets across old and new folder paths |
| 32 | Python in Node container | Cannot remove — `final-assets` route shells out to Python/Pillow for image compositing; removing breaks generation |
| 66 | Migration 011 wrong table name | If trigger references `storage_deletion_queue` instead of `deletion_queue`, all angled shot deletions since migration have silently skipped GDrive cleanup; fixing requires re-running on live data |

### Recommended Fix Order (SAFE + High-Impact First)

1. **#19** — Move Gemini API key from URL to header (SAFE, HIGH, security)
2. **#51** — Replace `window.location.reload()` with `router.refresh()` (SAFE, HIGH, UX)
3. **#67** — Add `force-dynamic` to API routes (SAFE, HIGH, data freshness)
4. **#28** — Replace `window.location` with `useSearchParams()` (SAFE, MEDIUM, hydration fix)
5. **#52** — Add `loading.tsx` skeleton files (SAFE, MEDIUM, perceived performance)
6. **#53** — Add `loading="lazy"` to gallery images (SAFE, MEDIUM, page load speed)
7. **#45** — Return error metadata from angled shot fallback (SAFE, HIGH, data accuracy)
8. **#16** — Add Suspense boundaries to dashboard layout (SAFE, HIGH, no blank screens)
9. **#54** — Disable forms during submission (SAFE, MEDIUM, prevent duplicates)
10. **#68** — Wrap JSON.parse in try/catch (SAFE, MEDIUM, crash prevention)

---

## Core Functionality Impact Summary

**27 issues directly affect core functionality.** Here they are grouped by impact:

### Generation Fails / Wrong Output (5 issues)
| # | Issue | What Breaks | Safe to Fix? |
|---|-------|-------------|--------------|
| 44 | No Gemini retry | Background/angled-shot/composite generation fails on transient errors | MODERATE |
| 45 | Angled shot silent fallback | User unknowingly saves original image labeled as different angle | SAFE |
| 15 | GDrive 403 not retried | File uploads fail on quota/rate limit | MODERATE |
| 50 | GDrive retry skips 429 | Same — uploads fail on rate limit | MODERATE |
| 68 | Unguarded JSON.parse | Final asset generation crashes on malformed Python output | SAFE |

### Data Loss / Orphaned Files (4 issues)
| # | Issue | What Breaks | Safe to Fix? |
|---|-------|-------------|--------------|
| 2 | Orphaned GDrive on DB fail | Files accumulate in GDrive, quota waste | RISKY |
| 3 | Category delete orphans files | ALL GDrive assets leak when category deleted | RISKY |
| 43 | Product delete orphans files | Product images + angled shots leak when product deleted | RISKY |
| 47 | Category rename breaks paths | All galleries show empty after category rename | RISKY |

### UI Broken / Poor UX (10 issues)
| # | Issue | What Breaks | Safe to Fix? |
|---|-------|-------------|--------------|
| 10 | Unbounded galleries | Performance cliff at 100+ items | SAFE |
| 11 | Dashboard N+3 waterfall | Dashboard loads slowly (16 API calls for 5 categories) | SAFE |
| 16 | No Suspense boundaries | Blank screen during navigation | SAFE |
| 28 | CategoryNav hydration | Visual flicker, console warnings | SAFE |
| 51 | window.location.reload() | Loses all component state on guideline upload | SAFE |
| 52 | No loading.tsx skeletons | Blank screen during transitions | SAFE |
| 53 | No image lazy loading | All images download at once | SAFE |
| 54 | Form double-submit | Duplicate products/categories created | SAFE |
| 57 | Template 500 on collision | Vague error instead of "template exists for this format" | SAFE |
| 67 | Missing force-dynamic | Users may see stale/cached data | SAFE |

### Data Integrity (4 issues)
| # | Issue | What Breaks | Safe to Fix? |
|---|-------|-------------|--------------|
| 30 | Slug drops Unicode | Non-ASCII brand names produce empty slugs, collisions | MODERATE |
| 46 | Primary image race | Product ends up with 0 or 2+ primary images | MODERATE |
| 55 | No transactions | Brand voice default or primary image swap partially applied | MODERATE |
| 66 | Migration wrong table? | Angled shot deletion trigger may silently fail | RISKY |

---

## Change Log

| Date | Issues Fixed | Details |
|------|-------------|---------|
| 2026-02-26 | #4 | `Promise.all` → `Promise.allSettled` in openai.ts; per-item catch in gemini.ts — partial results returned on failure |
| 2026-02-26 | #5 | Moved `setIsGenerating(false)` from catch to finally in CompositeGenerationForm |
| 2026-02-26 | #6 | Added `error.tsx` to root app and `(dashboard)` route segments |
| 2026-02-26 | #7 | Added 20MB base64 size validation to backgrounds, angled-shots, composites POST routes |
| 2026-02-26 | #12 | Added MIME type whitelist (JPEG/PNG/WebP/SVG/PDF) + 50MB size limit to brand-assets POST |
| 2026-02-26 | #13 | Added AbortController to ReferencePicker — cancels stale requests on new keystrokes |
| 2026-02-26 | #14 | Used useMemo for blob URLs + useEffect cleanup with revokeObjectURL in ProductImageUpload |
| 2026-02-26 | Round 2 | Exhaustive re-audit: added 27 new issues (#43-#69), updated existing #19/#22 scope, added core-functionality impact analysis |
