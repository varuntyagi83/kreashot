# AdForge Railway — QA Issues Tracker

**Audit Date:** 2026-02-26
**Auditor:** Senior QA Assessment (automated)
**Overall Risk Level:** MEDIUM-HIGH

> **Note:** Auth-related items (#1) marked as WONTFIX — app is internal-use only (1-2 users).

---

## CRITICAL Issues

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | Template routes missing authentication + user_id filter | `src/app/api/categories/[id]/templates/route.ts`, `[templateId]/route.ts` | WONTFIX (internal use) |
| 2 | Orphaned GDrive files when DB insert fails after upload | All POST routes (backgrounds, copy-docs, composites, angled-shots) | NOT FIXED |
| 3 | Category deletion orphans all GDrive assets (cascade deletes DB rows but not GDrive files) | `src/app/api/categories/[id]/route.ts` | NOT FIXED |
| 4 | Batch generation (copy kit / backgrounds) uses Promise.all — partial failure loses ALL results | `src/lib/ai/openai.ts` (`generateCopyKit`), `src/lib/ai/gemini.ts` (`generateBackgrounds`) | FIXED |
| 5 | CompositeGenerationForm: `setIsGenerating(false)` only in catch, not finally — button stuck on success | `src/components/composites/CompositeGenerationForm.tsx:179` | FIXED |
| 6 | No error.tsx / ErrorBoundary anywhere — component crash = blank page | Entire app (`src/app/`) | FIXED |
| 7 | Base64 image uploads have no size limit — could crash server with huge payloads | backgrounds, angled-shots, composites POST routes | FIXED |

---

## HIGH Priority Issues

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 8 | No rate limiting on AI generation routes (OpenAI, Gemini) | All `/generate` endpoints | NOT FIXED |
| 9 | Brand voice deletion race condition — deleted voice used silently in concurrent generation | BrandVoiceSelector + copy-docs/generate | NOT FIXED |
| 10 | Unbounded list rendering in galleries — no pagination or virtualization | CompositeGallery, BackgroundGallery, CopyGallery | NOT FIXED |
| 11 | Dashboard N+3 request waterfall — 3 API calls per category | `src/app/(dashboard)/page.tsx` | NOT FIXED |
| 12 | Brand-assets POST: no file type validation, no size limit | `src/app/api/brand-assets/route.ts` | FIXED |
| 13 | ReferencePicker: no AbortController — stale fetches on rapid typing, memory leak on unmount | `src/components/ui/reference-picker.tsx` | FIXED |
| 14 | ProductImageUpload: blob URLs from createObjectURL never revoked | `src/components/products/ProductImageUpload.tsx` | FIXED |
| 15 | GDrive quota (403) treated as permanent failure — should retry with backoff | `src/lib/storage/gdrive-adapter.ts` | NOT FIXED |
| 16 | Missing Suspense boundaries in dashboard layout | `src/app/(dashboard)/layout.tsx` | NOT FIXED |
| 17 | Prompt injection risk — user brief directly interpolated into AI prompts | `src/lib/ai/openai.ts`, `src/lib/ai/gemini.ts` | NOT FIXED |
| 18 | No input validation library (zod/joi) — manual validation inconsistent across routes | Multiple API routes | NOT FIXED |
| 19 | Gemini API key passed in URL query string instead of headers | `src/lib/ai/brand-voice.ts` | NOT FIXED |

---

## MEDIUM Priority Issues

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 20 | Missing DB indexes on foreign keys (product_assets.category_id, angled_shots.product_id) | Migrations | NOT FIXED |
| 21 | No unique constraint on backgrounds(category_id, name, format) — allows duplicates | Schema | NOT FIXED |
| 22 | 20+ uses of `any` type that could cause runtime errors | Multiple files | NOT FIXED |
| 23 | `formData.get('file') as File` without null check in multiple routes | Multiple API routes | NOT FIXED |
| 24 | No security headers (CSP, X-Frame-Options, HSTS) in next.config | `next.config` | NOT FIXED |
| 25 | No custom 404/500 error pages | App directory | NOT FIXED |
| 26 | Admin routes use weak Bearer token auth (CRON_SECRET) | Admin API routes | NOT FIXED |
| 27 | Concurrent category edits — last write wins, no optimistic locking | Category PUT | NOT FIXED |
| 28 | `window.location` access should use `useSearchParams()` | `CategoryNav.tsx` | NOT FIXED |
| 29 | No `.env.example` file documenting required environment variables | Root | NOT FIXED |
| 30 | Slug generation regex doesn't handle Unicode properly | Categories route | NOT FIXED |
| 31 | Dockerfile runs as root, no USER directive | `Dockerfile` | NOT FIXED |
| 32 | Python + Pillow in Node container increases attack surface | `Dockerfile` | NOT FIXED |
| 33 | No health check endpoint for container orchestration | N/A | NOT FIXED |
| 34 | Missing `required` / `aria-label` on forms for accessibility | Multiple components | NOT FIXED |

---

## LOW Priority Issues

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 35 | Using `<img>` instead of Next.js `<Image>` in galleries | Multiple components | NOT FIXED |
| 36 | Missing keyboard navigation in modals | Dialog components | NOT FIXED |
| 37 | No caching for repeated reference fetches | `reference-display.tsx` | NOT FIXED |
| 38 | Unused import (`Package` icon) | `CategoryNav.tsx` | NOT FIXED |
| 39 | Form values not cleared on submission error | `CreateProductDialog.tsx` | NOT FIXED |
| 40 | No audit trail / soft delete for compliance | Database | NOT FIXED |
| 41 | Reference image download failure silently skipped during generation | Background generate route | NOT FIXED |
| 42 | GDrive file permission failure doesn't roll back upload | `gdrive-adapter.ts` | NOT FIXED |

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
