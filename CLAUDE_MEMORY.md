# AdForge-Railway

## Project Info
- Repo: https://github.com/varuntyagi83/adforge-railway
- Project path: /Users/varuntyagi/Downloads/Claude Research/AdForge-Railway (git root — Next.js app is at root, NOT in adforge/ subfolder)
- Git remote: origin → https://github.com/varuntyagi83/adforge-railway.git
- Deployed on: Railway (NOT Vercel) — Dockerfile, railway.toml, .railwayignore at root
- Stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase, Google Drive storage

## Workflow Preferences
- Commit + push after every change

## API Keys (in .env.local)
- `GOOGLE_GEMINI_API_KEY` — used for image generation (angled shots, backgrounds, composites) and copy (Gemini Flash fallback)
- `OPENAI_API_KEY` — used for copy generation (gpt-4o). Was exhausted (429 quota) on 2026-03-03; restored after topping up.
- Google Drive credentials for asset storage

## Current Pipeline (Phases) — ALL IMPLEMENTED

1. Product image upload
2. Angled shots — Gemini (`gemini-2.0-flash-preview-image-generation`)
3. Backgrounds — Gemini (prompt display added to BackgroundPreviewGrid)
4. Composites — Gemini (product + background; prompt display added to CompositePreviewGrid)
5. Copy generation — OpenAI gpt-4o (`generateCopyKit` in `src/lib/ai/openai.ts`)
6. Final asset generation — **LIVE** (`src/components/final-assets/FinalAssetsWorkspace.tsx` + Python PIL script)
7. Ad export — **LIVE** (`src/components/ad-export/AdExportWorkspace.tsx` — CSV download)

## Copy Types and Where They Belong
Valid copy types: `hook`, `cta`, `body`, `tagline`, `headline`

| Copy type  | Where it goes             |
|------------|---------------------------|
| `tagline`  | Baked onto the image (Final Asset Phase 6) |
| `headline` | Meta copy field (Ad Export CSV only)       |
| `hook`     | Meta copy field (Ad Export CSV only)       |
| `cta`      | Meta copy field (Ad Export CSV only)       |
| `body`     | Meta copy field (Ad Export CSV only)       |

**Rule:** Only `tagline` copy is baked onto the final asset image. Everything else is Meta copy.

## Template Text Layer Naming Convention
- Text layers that render on-image MUST be named `tagline`
- The Python PIL script (`scripts/composite_final_asset.py`) matches `layer.name` to `copy_type`
- DEFAULT_LAYERS in `final-assets/route.ts` uses `name: 'tagline'` for the text layer
- PropertiesPanel.tsx shows a hint on text layers explaining this convention

## Ad Architecture (Meta ads)
```
COMPOSITE (AI — product on background)
    ↓ [Phase 6]
FINAL ASSET = composite + tagline text baked in + logo
    ↓ [Phase 7]
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
- Layer types currently supported: `background`, `product`, `text`, `logo`
- Safe zones must be respected in composites and final asset generation
- PropertiesPanel.tsx handles layer properties UI

## Planned Feature: Graphic Overlay Layer Type
**Context:** Sunday Natural brand design uses structured graphic elements (dashed circle, text grid,
headline frame, text column) as transparent PNG overlays placed between the composite and text layers.
These are designed once in Figma and reused across all ads in a campaign.

**Architecture decision:** Add `overlay` as a new layer type in the template system.

**What to build:**
1. **Brand Graphic Overlays upload** — new section under Brand Assets for uploading transparent PNGs
   (stored in Google Drive under `brand-assets/overlays/`)
2. **`overlay` layer type in template builder** — PropertiesPanel shows an image picker (select from
   uploaded overlays); layer stores `source_url` pointing to the overlay PNG
3. **PIL script handles `overlay` type** — paste transparent PNG at layer position/size using PIL's
   alpha compositing (already supported via `Image.paste(img, mask=img)`)
4. **Template canvas preview** — show overlay thumbnail in TemplateBuilderCanvas

**Rendering order:** background (z:0) → composite/product (z:1) → overlay PNG (z:2) → text (z:3) → logo (z:4)

**Why not build it into the composite Gemini step:** Graphic overlays are brand design elements, not
AI-generated content. They must be pixel-perfect and reproducible — AI generation would vary each time.

**Status:** Not yet built. Agreed architecture as of 2026-03-03.
