# AdForge - Implementation Progress

**Last Updated:** 2026-02-24

---

## 📋 Implementation Plan: Template-First Approach

### Revised Order (Correct Dependencies):
1. **Define Safe Zones/Templates First** ⭐ (Blueprint)
2. **Generate Composites** (Product + Background, follows template)
3. **Generate Copy Docs** (Fits character limits from template)
4. **Generate Final Assets** (Assembles everything using template)

---

## ✅ Completed

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

## 🚧 In Progress

### Current Focus:
**NOTHING - Ready for next step**

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
