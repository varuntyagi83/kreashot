# AdForge-Railway

## Project Info
- Repo: https://github.com/varuntyagi83/adforge-railway
- Project path: /Users/varuntyagi/Downloads/Claude Research/AdForge-Railway (git root — Next.js app is at root, NOT in adforge/ subfolder)
- Git remote: origin → https://github.com/varuntyagi83/adforge-railway.git
- Deployed on: Railway (NOT Vercel) — Dockerfile, railway.toml, .railwayignore at root
- Stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase, Google Drive storage

## Workflow Preferences
- Commit + push after every change
- Always update CLAUDE_MEMORY.md before and after making changes

## API Keys (in .env.local)
- `GOOGLE_GEMINI_API_KEY` — used for image generation (angled shots, backgrounds, composites) and copy (Gemini Flash fallback)
- `OPENAI_API_KEY` — used for copy generation (gpt-4o). Was exhausted (429 quota) on 2026-03-03; restored after topping up.
- Google Drive credentials for asset storage

## Current Pipeline (Phases) — ALL IMPLEMENTED

Tab order in category page matches this pipeline exactly:

1. **Assets** — Product image upload
2. **Angled Shots** — Gemini (`gemini-2.0-flash-preview-image-generation`)
3. **Backgrounds** — Gemini (prompt display added to BackgroundPreviewGrid)
4. **Composites** — Gemini (product + background; prompt display in CompositePreviewGrid)
5. **Copy** — OpenAI gpt-4o (`generateCopyKit` in `src/lib/ai/openai.ts`) ← **before Templates**
6. **Templates** — Visual canvas-based template builder (Fabric.js)
7. **Final Assets** — **LIVE** (`FinalAssetsWorkspace.tsx` + Python PIL script)
8. **Ad Export** — **LIVE** (`AdExportWorkspace.tsx` — CSV download for Meta Ads Manager)
9. **Guidelines** — Upload brand guidelines (separate concern, at end)

## Copy Types and Where They Belong
Valid copy types: `hook`, `cta`, `body`, `tagline`, `headline`

| Copy type  | Where it goes                                     |
|------------|---------------------------------------------------|
| `tagline`  | Baked onto the image (Final Asset Phase 7)        |
| `headline` | Meta copy field (Ad Export CSV only)              |
| `hook`     | Meta copy field (Ad Export CSV only)              |
| `cta`      | Meta copy field (Ad Export CSV only)              |
| `body`     | Meta copy field (Ad Export CSV only)              |

**Rule:** Only `tagline` copy is baked onto the final asset image. Everything else is Meta copy.

## Template Text Layer Naming Convention
- Text layers that render on-image MUST be named `tagline`
- The Python PIL script (`scripts/composite_final_asset.py`) matches `layer.name` to `copy_type`
- DEFAULT_LAYERS in `final-assets/route.ts` uses `name: 'tagline'` for the text layer
- PropertiesPanel.tsx shows a hint on text layers explaining this convention

## Ad Architecture (Meta ads)
```
COMPOSITE (AI — product on background)
    ↓ [Phase 7]
FINAL ASSET = composite + tagline text baked in + logo
    ↓ [Phase 8]
AD EXPORT CSV = final_asset image_url + hook + headline + cta + body
    ↓ [Manual]
Meta Ads Manager upload
```

## Gemini copy fallback
- `generateCopyVariationsGemini` and `generateCopyKitGemini` exist in `src/lib/ai/gemini.ts`
- Can be swapped in via `src/app/api/categories/[id]/copy-docs/generate/route.ts` if OpenAI quota runs out

## Key Reference Files (always read when starting work)
- `Issues.md` — open bugs with file locations, severity, and fix-safety notes. Check before touching any file.
- `progress.md` — full implementation log: what's built, what's pending, intended order.

## Critical Architectural Rules (must know before writing any code)

### Google Drive URLs
- Always use `https://lh3.googleusercontent.com/d/{FILE_ID}=w2000` format (Google CDN)
- The gdrive-adapter.ts generates this automatically on every upload
- BackgroundGallery.tsx has an old fallback to `drive.google.com/thumbnail` — known inconsistency, low priority
- **IMPORTANT:** Google Drive CDN does NOT send `Access-Control-Allow-Origin` when `Origin` header is present.
  Never use `crossOrigin: 'anonymous'` when loading these URLs into canvas/fabric.js — it causes silent load failure.

### Storage Sync Pattern (universal — no exceptions)
- Every table that stores files MUST have: `storage_provider`, `storage_path`, `storage_url`, `gdrive_file_id`
- Deletion order is ALWAYS: delete from storage first, then delete from DB
- DB triggers queue deletions; cron job processes every 5 minutes
- `docs/` folder has been moved to `archived_docs/` — storage sync pattern is fully live in DB triggers

### Database Constraint (RESOLVED)
- `composites_angled_shot_id_background_id_key` — this constraint NO LONGER EXISTS in live DB (was dropped)
- Current composites unique constraint is only `UNIQUE(category_id, slug)` — A/B testing is unblocked

### Known DB Quirk (not breaking, leave alone)
- `product_images` table has no `category_id` column — intentional, join through `products` table instead

### Template System (fully built)
- API routes exist, DB schema ready, one template per (category, format) enforced
- All layer positions stored as percentages (0–100) for scale independence
- Layer types: `background`, `product`, `text`, `logo`, `overlay` (all five supported)
- Safe zones must be respected in composites and final asset generation
- PropertiesPanel.tsx handles layer properties UI; categoryId is passed from TemplateWorkspace

### Template Layer Fields (src/lib/types/template.ts)
- `source_url` — overlay layers only; the actual overlay PNG URL; **used by PIL renderer**
- `preview_url` — product/background layers; URL of image to preview in canvas; **PIL ignores this**
- `sample_text` — text layers; sample tagline text for canvas preview; **PIL ignores this**

### Template Builder Canvas (TemplateBuilderCanvas.tsx)
- Uses Fabric.js v6 (`fabric ^6.9.1`)
- Layer rendering is async: product/background/overlay layers load real images via `fabric.Image.fromURL(url)` (no crossOrigin)
- Text layers render with actual font/color/size settings via `fabric.Textbox`
- Falls back to colored placeholder rect if image URL is missing or fails to load
- Layer colours: background=blue, product=purple, text=orange, logo=green, overlay=pink

### Graphic Overlay Layer Type (FULLY BUILT)
- Upload: Brand Assets → Upload → Graphic Overlay (transparent PNG) → stored in Supabase `brand-assets` bucket
- Template builder: Add overlay layer → PropertiesPanel shows picker from brand assets filtered to `asset_type='overlay'`
- Canvas preview: shows actual PNG via `fabric.Image.fromURL(source_url)`
- PIL rendering (`scripts/composite_final_asset.py`): alpha-composites overlay PNG at layer position/size
- `source_url` IS saved in template_data (unlike preview_url which is preview-only)
- Rendering order: background (z:0) → composite/product (z:1) → overlay PNG (z:2) → text (z:3) → logo (z:4)

### PropertiesPanel Layer Pickers (added 2026-03-03)
- Receives `categoryId` and `format` props from TemplateWorkspace
- **Product layer**: fetches `/api/categories/[id]/angled-shots?format=...` — filtered to current template format → picker sets `preview_url`
- **Background layer**: fetches `/api/categories/[id]/backgrounds?format=...` — filtered to current template format → picker sets `preview_url`
- **Overlay layer**: fetches `/api/brand-assets` filtered to `asset_type='overlay'` → picker sets `source_url`
- **Text layer**: "Sample Text" input → sets `sample_text` for canvas preview
- Layer delete: visible "Delete Layer" button at bottom of PropertiesPanel (not hover-only)
- Both APIs already supported `?format=` filtering; PropertiesPanel re-fetches on format change

### Template Builder Layout (TemplateWorkspace.tsx)
- Grid: `col-span-2` (Layers) + `col-span-7` (Canvas) + `col-span-3` (Properties) = 12
- Properties was col-span-2 which clipped all fields; widened to col-span-3 (~25%)
