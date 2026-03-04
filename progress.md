# AdForge - Implementation Progress

**Last Updated:** 2026-03-04

---

## 📋 Implementation Plan: Template-First Approach

### Revised Order (Correct Dependencies):
1. **Define Safe Zones/Templates First** ⭐ (Blueprint)
2. **Generate Composites** (Product + Background, follows template)
3. **Generate Copy Docs** (Fits character limits from template)
4. **Generate Final Assets** (Assembles everything using template)

---

## ✅ Completed

### Multi-Image Collage Ads (2026-03-04):
- [x] **Collage Tab** — separate tab in category page for building multi-image collage ads
- [x] **Types:** `src/lib/types/collage.ts` — `CollageLayer`, `CollageData`, `Collage` types
- [x] **DB migration:** `supabase/migrations/20260304_create_collages_table.sql` — `collages` table with RLS
- [x] **API routes:** CRUD at `/api/categories/[id]/collages`, generate at `.../collages/generate`
- [x] **PIL extension:** `image` layer type (cover/contain) + `background_color` layer in `composite_final_asset.py`
- [x] **CollageWorkspace.tsx** — main builder with save/load/generate/gallery
- [x] **CollageCanvas.tsx** — Fabric.js canvas with image/text/overlay layer rendering
- [x] **CollageLayerPanel.tsx** — layer list with add dropdown, reorder, delete
- [x] **CollagePropertiesPanel.tsx** — tabbed image source picker (Pipeline/Brand/URL), text/overlay editing
- [x] **Category page wired** — Collage tab between Ad Export and Guidelines
- **NOTE:** Run migration SQL in Supabase dashboard before using

### Brand Voice Extractor (2026-02-23):
- [x] **AI-Powered Brand Voice Extraction** — 3 input methods, deep profile generation
  - **Method 1 — Q&A:** 6 structured brand questions (personality, audience, feeling, reference, never, sample)
  - **Method 2 — Text Samples:** Paste up to 5 pieces of existing copy for AI style analysis
  - **Method 3 — Ad Images:** Upload up to 5 images; Gemini analyses visual language, copy, emotional tone
  - Profile saved to `categories.brand_voice` (JSONB) via `POST /api/categories/[id]/brand-voice`
  - Profile automatically fed into every copy generation as highest-priority context
  - `src/lib/ai/brand-voice.ts`: 3 extraction functions + rich prompt formatting
  - `src/components/copy/BrandVoiceExtractor.tsx`: 3-tab UI with full profile display
  - Migration: `supabase/migrations/20260223_brand_voice.sql`

- [x] **Rich Brand Voice Profile Schema** — 15+ fields covering all dimensions of brand voice:
  - Identity: `tone_words`, `personality`, `brand_promise`
  - Style: `language_style`, `sentence_structure`, `vocabulary_level`, `emotional_register`
  - Rules: `dos[]`, `donts[]`, `messaging_pillars[]`, `power_words[]`
  - Examples: `sample_phrases[]`, `example_hooks[]`, `example_ctas[]`
  - Context: `audience_insight`, `competitive_differentiation`
  - AI prompted to be "specific and opinionated — vague outputs are useless"
  - `formatBrandVoiceForPrompt()` injects all 15 fields into OpenAI system prompt

### Copy Tab — Multi-tone Kit + Brand Guidelines PDF (2026-02-23):
- [x] **Multi-type + Multi-tone Copy Generation**
  - Generate all selected copy types × all selected tones in a single click
  - e.g. Hook + Headline + CTA × Professional + Playful = 6 combinations at once
  - Parallel generation via `generateCopyKit()` in `src/lib/ai/openai.ts`
  - API supports both `mode: 'kit'` (new) and `mode: 'single'` (backwards compatible)
  - Max 25 combinations per request (5 types × 5 tones)
  - Results grouped by copy type in `CopyPreviewGrid.tsx`
  - Each card shows Type badge + Tone badge
  - `tone` column added to `copy_docs` table (migration: `20260223_copy_enhancements.sql`)

- [x] **Brand Guidelines PDF Upload**
  - Upload a brand PDF in the Copy tab — text is extracted and stored per-category
  - Parsed text fed into the OpenAI system prompt on every copy generation
  - PDF parsing via `pdfjs-dist` (already in dependencies)
  - Stored in `categories.brand_guidelines` (TEXT, max ~8000 chars)
  - Filename stored in `categories.brand_doc_name` for UI display
  - Upload/remove via `POST/DELETE /api/categories/[id]/brand-docs`
  - Active brand doc shown as a chip in `CopyGenerationForm` with remove button

  **⚠️ Important — PDF Storage Architecture:**
  - The **PDF binary is NEVER stored** (not in Supabase Storage, not on disk, not in Google Drive)
  - PDF is uploaded → text extracted in-memory by `pdfjs-dist` → PDF discarded immediately
  - Only the **extracted text** is persisted: `categories.brand_guidelines` (TEXT column in Supabase PostgreSQL)
  - Only the **filename** is persisted: `categories.brand_doc_name` (for UI display)
  - ✅ No storage costs, no bucket management, text immediately injectable into prompts
  - ⚠️ Scanned/image-only PDFs won't work (no selectable text to extract)
  - ⚠️ Truncated at 8,000 chars (~4–5 pages of dense text); longer docs lose trailing content

- [x] **Composite Safe Zone Enforcement (2026-02-23)**
  - Added explicit AI instructions to `generateComposite()` in `gemini.ts`:
    - `✗ Do NOT add headlines, taglines, CTAs, slogans, or any copy`
    - `✗ Do NOT render any words, letters, or typographic elements`
  - Composites are now enforced as text-free visual foundations
  - Warning note added to `CompositeGenerationForm.tsx` for users
  - Text/copy belongs only in the Final Assets stage

- [x] **Composite Product Text Preservation Fix (2026-02-27)**
  - **Problem:** Composite generation was altering/destroying product packaging text (labels, brand names, ingredients). Green Complex product text was being tampered with.
  - **Root causes identified:**
    1. Contradictory prompt — "NO text of any kind" overrode "preserve product labels" due to recency bias
    2. No `systemInstruction` (unlike angled shots which preserved text correctly)
    3. Prompt never distinguished "product packaging text" from "overlay/editorial text"
    4. Hardcoded MIME type (`image/jpeg`) regardless of actual image format
  - **Fixes applied:**
    - Added `systemInstruction` with photo compositor persona emphasizing product fidelity
    - Rewrote prompt to clearly separate "product packaging text = SACRED" from "overlay text = FORBIDDEN"
    - Moved product fidelity instructions to end of prompt (strongest signal position)
    - Removed the contradictory "NO text of any kind" line
    - Added `detectMimeType()` using magic bytes in `composites/generate/route.ts`

- [x] **Critical Bug Fix: Composite Unique Constraint (2026-02-23)**
  - Removed `UNIQUE (angled_shot_id, background_id)` constraint from `composites` table
  - Previously blocked users from regenerating or creating variations
  - Fix: `ALTER TABLE composites DROP CONSTRAINT IF EXISTS composites_angled_shot_id_background_id_key`
  - Verified: multiple composites with same assets now create successfully

### Final Assets — End-to-End Generation (2026-02-24):
- [x] **Final Assets tab fully wired** — composites + copy + logo → Python compositing → Google Drive upload → Supabase record
  - Format-aware: generates at correct pixel dimensions per selected format (1:1→1080×1080, 16:9→1920×1080, 9:16→1080×1920, 4:5→1080×1350)
  - Logo selector: fetches all logos from `brand_assets`, renders Select dropdown with thumbnail previews
  - Storage path includes format folder: `{slug}/final-assets/{format}/asset_{timestamp}.png`
  - GET endpoint filters by `?format=` param so tab only shows assets for selected format
  - `src/components/final-assets/FinalAssetsWorkspace.tsx`
  - `src/app/api/categories/[id]/final-assets/route.ts`

- [x] **Python Compositing Script** — `scripts/composite_final_asset.py`
  - Reads `width` and `height` from stdin JSON (no longer hardcoded 1080×1080)
  - Cross-platform font loading: tries DejaVu/Liberation/Ubuntu (Linux), Helvetica (macOS), Arial (Windows)
  - All debug output goes to stderr; only final JSON result goes to stdout (prevents parse errors)

- [x] **GDrive → Supabase Composite Sync** — `scripts/sync-composites-from-gdrive.mjs`
  - Scans GDrive `{slug}/composites/{format}` folders
  - Extracts angle name from filename using `-on-` split pattern
  - Matches to `angled_shots` records with format-specific + fallback matching
  - Supports `--dry-run` and `--format=` flags

### Bug Fixes & Security (2026-02-24):
- [x] **TypeScript type unification** — `BrandVoiceProfile` was defined 3× with mismatched fields
  - `CopyWorkspace.tsx` and `BrandVoiceExtractor.tsx` now both `import type { BrandVoiceProfile } from '@/lib/ai/brand-voice'`
  - Single source of truth; build no longer fails on type incompatibility

- [x] **Security: auth added to `cleanup/process-deletions`** — both GET and POST handlers now require `CRON_SECRET` bearer token; fails closed (rejects all) if secret is unset

- [x] **Security: auth added to GET `/api/categories/[id]/final-assets`** — now calls `supabase.auth.getUser()` consistent with POST

- [x] **Fix: broken `supabase.rpc('get', ...)` call** in `admin/process-deletion-queue` — removed invalid RPC filter; `status='pending'` filter is sufficient since exhausted-retry items are set to `'failed'`

- [x] **Fix: template null mutation crash** — `final-assets/route.ts` no longer writes to a null `template` object when no template exists; uses nullish coalescing to build a default template object

- [x] **Fix: `selectedLogo` closure ordering** — moved logo lookup inside `handleGenerate` to avoid potential TDZ reference before render completes

### Foundation Work:
- [x] **Categories & Products System**
  - Category CRUD with look_and_feel field
  - Product CRUD within categories
  - Database schema with RLS enabled

- [x] **Brand Assets**
  - Logo upload system
  - Global brand asset management
  - Storage in `brand-assets` bucket

- [x] **Angled Shot Generation**
  - 7 angles generated successfully
  - Angles: front, three_quarter_right, three_quarter_left, right_side, left_side, top_45deg, isometric
  - Using Gemini API (gemini-3-pro-image-preview)
  - Temperature: 0.85 (for distinct angles)
  - Storage: Google Drive + Supabase `angled_shots` table
  - Script: `scripts/regenerate-1x1-direct.mjs`

- [x] **Templates/Safe Zones System** ⭐ (BLUEPRINT COMPLETE)
  - Full visual template builder with react-konva canvas
  - Drag-and-drop layer positioning
  - Layer types: background, product, text, logo
  - Safe zones with exclusion/margin types
  - Multi-format support (1:1, 9:16, 16:9, 4:5)
  - Template gallery with save/load
  - Component: `src/components/templates/TemplateWorkspace.tsx`
  - API routes: Full CRUD at `/api/categories/[id]/templates`
  - Database: `templates` table with JSONB template_data

### Technical Details:
- **Stack:** Next.js 14, TypeScript, Supabase, Google Drive API
- **AI Models:**
  - Gemini (Nano Banana Pro) for image generation
  - Claude Sonnet 4.5 for copy generation (planned)
- **Storage:** Google Drive with public URLs
- **Database:** Supabase with 12 tables

---

### GDrive Asset Format Audit & Fix (2026-02-25):
- [x] **Full asset format audit** — audited all composites, backgrounds, and angled shots across GDrive and Supabase
  - Scripts: `scripts/audit-composite-formats.mjs`, `scripts/audit-all-assets-formats.mjs`, `scripts/audit-background-pipeline.mjs`
  - 7 composites moved from wrong GDrive folder (1x1 → 16x9), Supabase metadata fixed
  - 2 backgrounds corrected (format 1:1 → 16:9), GDrive files moved
  - 58 angled shots dimensions updated in Supabase to match actual GDrive image sizes
  - Final: 77/77 assets verified correct, 0 mismatches
  - Committed as `4d5c8d7`

### Background Pipeline Fixes & Features (2026-02-25):
- [x] **Max generation cap raised from 10 to 20** — users can now generate up to 5 variations × 4 formats = 20 backgrounds at once
  - Files: `BackgroundGenerationForm.tsx`, `generate/route.ts`
  - Slider max raised from 4 to 5 variations

- [x] **look_and_feel form field now functional** — previously the editable textarea in the generation form was cosmetic; user edits were silently discarded. Now the API route uses the form-submitted value when provided, falling back to the DB value.
  - File: `src/app/api/categories/[id]/backgrounds/generate/route.ts`
  - Logic: `const resolvedLookAndFeel = (lookAndFeel && lookAndFeel.trim()) || category.look_and_feel`

- [x] **Broken images ROOT CAUSE FIXED** — all 80 GDrive files (7 backgrounds, 12 composites, 58 angled shots, 3 product images) were missing public share permissions. The thumbnail URLs were valid but GDrive returned errors because files weren't shared.
  - Script: `scripts/fix-sharing-all-assets.mjs` — set `role: reader, type: anyone` on all 80 files
  - Note: the upload code (`gdrive-adapter.ts` line 152) already sets permissions on new uploads; this only affected pre-existing files
  - Also improved gallery `onError` handler with retry mechanism as a defensive measure

- [x] **Format badges on saved backgrounds** — each card in the gallery now shows a format badge (e.g., "1:1", "16:9") and dimensions

- [x] **Rename saved backgrounds** — new "Rename" option in the dropdown menu, opens a dialog to edit the name
  - API: `PATCH /api/categories/[id]/backgrounds/[backgroundId]` added
  - API: `GET /api/categories/[id]/backgrounds/[backgroundId]` added
  - File: `src/app/api/categories/[id]/backgrounds/[backgroundId]/route.ts`

- [x] **Generate other formats from saved background (image-based reformat)** — new "Generate Other Formats" option in the dropdown menu. Sends the **actual saved image** to Gemini as `inline_data` to create variations in different aspect ratios — no design details are lost.
  - New Gemini function: `regenerateBackgroundInFormat()` in `src/lib/ai/gemini.ts`
  - New API route: `POST /api/categories/[id]/backgrounds/[backgroundId]/reformat`
  - Flow: download source from GDrive → base64 → send to Gemini with target aspect ratio → upload result → save to Supabase
  - UI: `src/components/backgrounds/BackgroundGallery.tsx` — shows source image preview, checkboxes for target formats
  - Auto-saves with name pattern: `{original name} ({format})`
  - Gemini config: temperature 1, topP 0.95, responseModalities ["TEXT", "IMAGE"], imageSize "2K"

- [x] **Gallery shows all formats** — saved backgrounds tab no longer filters by the current format selector; it shows all backgrounds across all formats with format badges
  - File: `src/components/backgrounds/BackgroundGenerationWorkspace.tsx`

**Files changed:**
| File | Changes |
|------|---------|
| `src/app/api/categories/[id]/backgrounds/generate/route.ts` | Raised cap 10→20, use form-submitted lookAndFeel |
| `src/app/api/categories/[id]/backgrounds/[backgroundId]/route.ts` | Added GET and PATCH handlers |
| `src/components/backgrounds/BackgroundGenerationForm.tsx` | Raised cap 10→20, slider max 4→5 |
| `src/components/backgrounds/BackgroundGallery.tsx` | Full rewrite: rename, format badges, image-based reformat, better image error handling |
| `src/components/backgrounds/BackgroundGenerationWorkspace.tsx` | Gallery shows all formats (removed format filter) |
| `src/lib/ai/gemini.ts` | Added `regenerateBackgroundInFormat()` — sends image as inline_data to Gemini |
| `src/app/api/categories/[id]/backgrounds/[backgroundId]/reformat/route.ts` | NEW — downloads source, calls Gemini per format, uploads & saves results |
| `scripts/fix-greenworld-folder.mjs` | Fixed greenworld category gdrive_folder_id + verified all background URLs |
| `scripts/fix-sharing-all-assets.mjs` | Fixed sharing permissions on all 80 GDrive assets |

---

### Brand Voice Library + Campaign Tone (2026-02-25):
- [x] **Two-tier brand voice system** — saved brand voice library (user-level) + campaign tone per generation
  - New table: `brand_voices` (id, user_id, name, profile JSONB, is_default)
  - Migration: `supabase/migrations/20260225_brand_voices.sql`
  - RLS: users can only manage their own brand voices
  - Unique constraint on (user_id, name), partial unique index for single default per user

- [x] **Brand Voices API** — full CRUD
  - `GET /api/brand-voices` — list user's saved voices (name, tone_words preview, is_default)
  - `POST /api/brand-voices` — save a named voice with profile
  - `PUT /api/brand-voices/[id]` — rename or toggle default
  - `DELETE /api/brand-voices/[id]` — remove from library

- [x] **BrandVoiceSelector dropdown** — new component in Copy tab
  - Shows: "Category Voice" + all named voices from library
  - Default voice auto-selected on load
  - Tone words preview + delete action per voice
  - File: `src/components/copy/BrandVoiceSelector.tsx`

- [x] **Save to Library** — added to BrandVoiceExtractor
  - After extracting a brand voice, user can name and save it to their voice library
  - Inline name input + save button in the profile summary card
  - Dropdown refreshes automatically after saving

- [x] **Campaign Tone** — relabeled existing tone selector
  - "Tones" → "Campaign Tone" in CopyGenerationForm
  - Added 3 new tones: Educational, Promotional, Seasonal (total 8)
  - Each campaign tone generates a separate version of every copy type

- [x] **Copy generation uses selected voice** — API accepts `brandVoiceId`
  - If brandVoiceId provided, fetches voice from `brand_voices` table (with user ownership check)
  - Falls back to `category.brand_voice` if no library voice selected (100% backwards compatible)
  - File: `src/app/api/categories/[id]/copy-docs/generate/route.ts`

**Files changed:**
| File | Changes |
|------|---------|
| `supabase/migrations/20260225_brand_voices.sql` | NEW — brand_voices table with RLS |
| `src/app/api/brand-voices/route.ts` | NEW — GET list, POST create |
| `src/app/api/brand-voices/[id]/route.ts` | NEW — PUT update, DELETE |
| `src/components/copy/BrandVoiceSelector.tsx` | NEW — dropdown for voice selection |
| `src/components/copy/BrandVoiceExtractor.tsx` | Added "Save to Library" button + name input |
| `src/components/copy/CopyWorkspace.tsx` | Wired up BrandVoiceSelector, passes brandVoiceId |
| `src/components/copy/CopyGenerationForm.tsx` | Accept brandVoiceId, relabel tones → campaign tone, +3 tones |
| `src/app/api/categories/[id]/copy-docs/generate/route.ts` | Accept brandVoiceId, fetch from brand_voices |

---

### Copy Kit Combination Limit Fix (2026-02-25):
- [x] **Removed 25-combination cap** — was blocking 5 types × 8 tones (40 combos)
  - Old limit: `totalCombinations > 25` → returned 400 error
  - New limit: `totalCombinations > 50` — raised to support all type/tone combos with headroom
  - File: `src/app/api/categories/[id]/copy-docs/generate/route.ts`

---

### QA Audit Fixes (2026-02-26):
- [x] **#5 CompositeGenerationForm loading state** — `setIsGenerating(false)` moved from catch to finally
- [x] **#4 Batch generation partial failure** — `Promise.all` → `Promise.allSettled` in openai.ts; per-item catch in gemini.ts
- [x] **#6 Error boundaries** — added `error.tsx` to root app and `(dashboard)` route segments
- [x] **#7 Base64 size validation** — 20MB limit on backgrounds, angled-shots, composites POST routes
- [x] **#12 Brand-assets file validation** — MIME whitelist (JPEG/PNG/WebP/SVG/PDF) + 50MB size limit
- [x] **#13 ReferencePicker memory leak** — AbortController cancels stale requests on new keystrokes
- [x] **#14 ProductImageUpload blob URL leak** — useMemo + useEffect cleanup with revokeObjectURL

**Files changed:**
| File | Changes |
|------|---------|
| `src/components/composites/CompositeGenerationForm.tsx` | #5 — setIsGenerating in finally block |
| `src/lib/ai/openai.ts` | #4 — Promise.allSettled for copy kit |
| `src/lib/ai/gemini.ts` | #4 — per-item error catch in background generation |
| `src/app/error.tsx` | NEW — #6 global error boundary |
| `src/app/(dashboard)/error.tsx` | NEW — #6 dashboard error boundary |
| `src/app/api/categories/[id]/backgrounds/route.ts` | #7 — 20MB base64 size check |
| `src/app/api/categories/[id]/angled-shots/route.ts` | #7 — 20MB base64 size check |
| `src/app/api/categories/[id]/composites/route.ts` | #7 — 20MB base64 size check |
| `src/app/api/brand-assets/route.ts` | #12 — file type + size validation |
| `src/components/ui/reference-picker.tsx` | #13 — AbortController for stale requests |
| `src/components/products/ProductImageUpload.tsx` | #14 — blob URL cleanup |
| `Issues.md` | NEW — full QA issues tracker with 42 findings |

**Full issue tracker:** See `Issues.md` in project root

---

### QA Audit Round 2 — Exhaustive (2026-02-26):
- [x] **Deep-dive audit across 6 dimensions** — deletion flows, retry logic, folder hierarchy, frontend UX, security, data integrity
- **Result:** 27 new issues found (#43-#69), total now 69 issues (7 fixed, 1 WONTFIX, 61 tracked)
- **27 issues affect core functionality** — generation failures, data loss, UI broken, data integrity
- **Format/folder hierarchy verified clean** — no inconsistencies found, all 77 assets correct

**Key new findings:**
| # | Issue | Severity |
|---|-------|----------|
| 43 | Product deletion orphans GDrive files | CRITICAL |
| 44 | No retry on Gemini 429/503 | CRITICAL |
| 45 | Angled shots silent fallback to original | HIGH |
| 46 | Primary image race condition | HIGH |
| 47 | Category rename breaks GDrive paths | HIGH |
| 48 | Admin auth bypass if env undefined | HIGH |
| 50 | GDrive retry skips 429 | HIGH |
| 67 | Missing force-dynamic on API routes | HIGH |

**Full issue tracker:** See `Issues.md` (69 findings with core-functionality impact analysis)

### Background Generation Enhancements (2026-02-26):
- [x] **Look & Feel textarea expanded** — 500 → 2000 characters, 5 rows, resizable
  - DB column is `TEXT` (unlimited), no backend changes needed
  - File: `src/components/backgrounds/BackgroundGenerationForm.tsx`

- [x] **Style Reference Image Picker** — select brand assets as style guides for Gemini
  - Fetches image-type brand assets from `GET /api/brand-assets` on mount
  - Toggle-select up to 4 images as style references (shown as thumbnails)
  - Selected asset IDs sent as `referenceAssetIds` to generate API
  - API now also resolves brand assets (previously only product_images + angled_shots)
  - File: `src/components/backgrounds/BackgroundGenerationForm.tsx`

- [x] **Brand guidelines injected into Gemini prompt** — PDF-extracted text now used for backgrounds
  - Category's `brand_guidelines` (from uploaded PDF) fetched in generate API
  - Passed as new `brandGuidelines` param to `generateBackgrounds()` in gemini.ts
  - Injected as "Brand Guidelines" block in Gemini prompt (colors, fonts, visual rules)
  - Previously only used for copy generation — now also guides background aesthetics

**Files changed:**
| File | Changes |
|------|---------|
| `src/components/backgrounds/BackgroundGenerationForm.tsx` | Look & Feel 2000 chars, style reference picker, sends referenceAssetIds |
| `src/app/api/categories/[id]/backgrounds/generate/route.ts` | Fetches brand_guidelines, resolves brand_assets, passes brandGuidelines to Gemini |
| `src/lib/ai/gemini.ts` | `generateBackgrounds()` accepts `brandGuidelines`, injects into prompt |

---

### Brand Guidelines Library + Color Translation Pipeline (2026-02-26):
- [x] **Brand Guidelines Library** — new `brand_guidelines` table for user-level PDF library
  - Upload PDFs via `POST /api/brand-guidelines` → Gemini Vision extracts content
  - Two-step extraction: (1) `extractPdfWithVision()` via Gemini 2.0 Flash for raw content, (2) `translateGuidelinesToColorDescription()` via Gemini 3.1 Pro Preview for color names
  - Color description saved to `brand_guidelines.color_description` column at upload time
  - Migration: `brand_guidelines` table with extracted_text, color_description, file_name, etc.

- [x] **@ Reference Picker** — `@[Name](type:id)` tokens for inline brand guideline references
  - ReferencePicker component: fuzzy search across brand guidelines + brand assets
  - Both Look & Feel and Background Description fields support @ mentions
  - Backend parses tokens via `parseReferenceTokens()`, fetches matching guidelines
  - Color descriptions from referenced guidelines injected into Gemini image prompt

- [x] **Color World Dropdown** — select specific color palette from brand guidelines
  - `parseColorWorlds()` extracts palette names from color_description text
  - Dropdown in BackgroundGenerationForm between Look & Feel and prompt fields
  - Backend filters color description to only include selected world's colors
  - Auto-loads color descriptions even without @ references when colorWorld is set

- [x] **Model fix: gemini-3-pro-image-preview for image generation**
  - `gemini-3.1-pro-preview` is text-only (cannot generate images) — reverted all 4 image gen URLs + 9 scripts
  - Kept `gemini-3.1-pro-preview` for `analyzeProductImage` (text analysis) and `translateGuidelinesToColorDescription`

- [x] **Format resilience** — each format generation wrapped in try/catch
  - 3-second delay between formats to avoid rate limits
  - Returns `failedFormats` array in response for partial success
  - Frontend shows warning toast for partially failed formats

- [x] **Color accuracy fix: vivid color names in translation prompt**
  - Old: "muted grayish-green" → image model rendered gray walls
  - New: "sage green, eucalyptus green, moss green, olive green" → clear GREEN
  - Translation prompt now requires leading with color name, not modifiers
  - Image generation prompt upgraded: COLOR DIRECTIVE section at highest priority
  - Explicit instruction: dominant surface color MUST visibly match palette

**Files changed:**
| File | Changes |
|------|---------|
| `src/lib/pdf.ts` | Added `extractPdfWithVision()`, `translateGuidelinesToColorDescription()` — updated prompt for vivid green-forward color names |
| `src/lib/ai/gemini.ts` | Model URLs fixed, `brandColorDescription` param, COLOR DIRECTIVE prompt section |
| `src/app/api/brand-guidelines/route.ts` | Brand guidelines library CRUD, color_description in GET response |
| `src/app/api/categories/[id]/backgrounds/generate/route.ts` | colorWorld filtering, auto-fetch guidelines, format resilience |
| `src/components/backgrounds/BackgroundGenerationForm.tsx` | Color world dropdown, parseColorWorlds, @ reference support |
| `src/lib/references.ts` | parseReferenceTokens() for @[name](type:id) syntax |
| `src/components/ui/reference-picker.tsx` | Fuzzy search across guidelines + brand assets |

---

### Background Generation Tuning & Lightbox (2026-02-26):
- [x] **Color world filtering fix** — other brand colors (Gold, Silver, Blue, Pink) were leaking into filtered prompt when "World of Green" selected. Old bug: `lower.includes('brand color')` matched ALL lines. Fixed to only include lines matching the selected world name + lighting/mood keywords.
  - File: `src/app/api/categories/[id]/backgrounds/generate/route.ts` lines 140-156

- [x] **Phantom table/surface removed** — the instruction "Leave clear space in the center/foreground for a product to be placed" caused Gemini to render a tabletop. Replaced with "Do NOT add objects, furniture, shelves, or props unless the user explicitly requests them" + "Follow the user's description exactly".
  - File: `src/lib/ai/gemini.ts` lines 262-271

- [x] **Temperature lowered for color accuracy** — 0.7 → 0.4, topP 0.95 → 0.9 for more controlled, faithful output
  - File: `src/lib/ai/gemini.ts` lines 301-303

- [x] **Click-to-preview lightbox** — clicking a generated background opens a full-screen preview dialog
  - max-w-5xl container, max-h-[80vh] image
  - Left/right navigation arrows with modulo cycling
  - Format badge overlay
  - Footer: counter ("1 of 3"), Download and Save buttons
  - File: `src/components/backgrounds/BackgroundPreviewGrid.tsx`

- [x] **Re-translate color description script** — `scripts/retranslate-color-description.ts`
  - Re-runs color translation with updated vivid prompt
  - Old: "muted grayish-green" → New: "sage green, eucalyptus green, moss green, olive green"
  - Uses dotenv for env loading (source .env.local failed on multi-word values)

---

## 🚧 In Progress

### Current Focus:
*Refining sage green generation — latest result "much better but still can be improved"*

---

## ❌ Not Started (In Priority Order)

### 1. **Generate Composites Using Templates** ⭐ NEXT STEP
**Why Second?** Now we know EXACTLY where to place the product from the template.

**What to Build:**
- Product + Background combination
- Respect template's product placement zone
- Use Nano Banana Pro for composition
- Multi-image input with role assignments

**Estimated Time:** 2-3 hours

---

### 3. **Generate Copy Docs**
**Why Third?** Character limits are defined in template text zones.

**What to Build:**
- Marketing copy generation with Claude Sonnet 4.5
- Copy types: headline, hook, CTA, body, tagline
- Multi-language support (EN, DE, FR, ES, etc.)
- Respect maxChars from template zones

**Estimated Time:** 2-3 hours

---

### 4. **Generate Final Assets**
**Why Last?** Everything is ready - template deterministically places copy on composites.

**What to Build:**
- Final asset generation API
- Combine: Composite + Copy + Logo
- Use template to place elements at exact positions
- Multi-aspect ratio export

**Estimated Time:** 4-5 hours

---

## 📊 Dependency Chain

```
Safe Zones/Templates (1) ← THE BLUEPRINT
        ↓
   Composites (2) ← Respects product placement from template
        ↓
   Copy Docs (3) ← Fits character limits from template
        ↓
  Final Assets (4) ← Uses template to place everything
```

---

## 🎯 Next Actions

1. **START:** Template/Safe Zone system implementation
2. Review aspect ratios to support (1:1, 9:16, 16:9, 4:5, 21:9, etc.)
3. Design template JSON schema
4. Build visual template editor UI
5. Create default templates for common aspect ratios

---

## 💡 Notes

- Template-first approach prevents costly regeneration later
- All positioning stored as percentages (scale-independent)
- Templates ensure brand compliance from the start
- The @ reference system will be critical for cross-step asset reuse

## ⚠️ Known Issues

| Priority | Item | Status |
|----------|------|--------|
| ~~Low~~ | ~~greenworld category missing `gdrive_folder_id`~~ | FIXED — found existing folder `1lK3ITFc4u-BG-ypqtyQxMz39BQSXmZEG`, linked to category |
| Info | Style reference images: backend accepts `referenceAssetIds` to guide Gemini style, but no UI picker exists yet | Future enhancement — not a bug, purely additive |
| Info | `composites` table has no `updated_at` column | By design — discovered during audit |
| ~~Medium~~ | ~~GDrive 503 "Transient failure" during reformat upload~~ | FIXED — added retry logic (2 retries, exponential backoff) to `gdrive-adapter.ts` upload method |
| Info | Gemini reformat produces visual variations, not strict crops — plant/shadow details differ across formats | Expected behavior — Gemini generates a new image guided by the source, not a deterministic resize |
