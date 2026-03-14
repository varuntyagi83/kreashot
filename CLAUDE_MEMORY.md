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
- Internal FormatSelector removed — format is now driven by the page-level selector (prop synced via useEffect)
- Background layer default position: x:0, y:0 (was x:25, y:25)
- Product images use `globalCompositeOperation='multiply'` to blend white backgrounds
- Layer reorder fixed: operates on z_index values (ascending sort swap), not unsorted array positions
- Panel selection → canvas sync: after drawLayers(), calls `canvas.setActiveObject()` on selected layer

### Theme (Dark/Light/System)
- `next-themes ^0.4.6` — already in package.json
- `ThemeProvider` wrapper: `src/components/layout/ThemeProvider.tsx`
- Wired in `src/app/layout.tsx` with `attribute="class" defaultTheme="system" enableSystem`
- Toggle in `TopBar.tsx`: Sun/Moon/Monitor icon → dropdown with Light, Dark, System options + checkmark on active

### Overlay Seeder (UPDATED 2026-03-04 — SVG→PNG migration)
- `POST /api/brand-assets/seed-overlays` — generates SVG overlays and converts them to **PNG data URLs** using `@resvg/resvg-js` (Rust/WASM, no system deps), stored directly in `storage_url` DB column. No storage bucket needed.
- Stored as `data:image/png;base64,...` — Python PIL compositor can read PNG data URLs; Fabric.js canvas and `<img>` tags work fine too.
- **Re-seed upgrade**: Calling seed-overlays again auto-upgrades any existing SVG data URLs to PNG. Check: `existing.storage_url?.includes('image/svg')` → update `brand_assets.storage_url` + `asset_references.storage_url`.
- Previously stored as `data:image/svg+xml;base64,...` — Python PIL compositor skipped these (line 189 in `composite_final_asset.py`). Fixed by storing PNG instead.
- `brand_assets.asset_type` CHECK constraint includes `'overlay'` (migration `20260303_add_overlay_asset_type.sql` — already applied in prod).
- Button on Brand Assets page: "Seed Overlays". Toast shows first error message on failure.
- 10 overlays total: Dashed Circle Arrow, Thin Circle Ring, Double Concentric Rings, Corner Brackets, Dot Grid, Diagonal Lines, Minimal Frame, Vertical Line (1080×1920), Horizontal Line, Cross Lines
- Reference brand ads use: circular overlays (ads 1, 3) and vertical line (ads 2, 4)
- `asset_references.asset_table_id` is NOT NULL — seeder uses `.select('id').single()` to get brand_asset.id and passes it
- **Turbopack build fix**: `@resvg/resvg-js` is a native Node addon — Turbopack cannot bundle it. Added to `serverExternalPackages` in `next.config.ts` (loads via `require()` at runtime). Added `COPY --from=builder /app/node_modules/@resvg ./node_modules/@resvg` to Dockerfile runner stage so the binary is present at runtime.

### Per-Layer Text Inputs (Final Asset Builder — added 2026-03-03)
- `FinalAssetsWorkspace.tsx` reads selected template's text layers and renders one `Input` per named layer
- State: `layerTexts: Record<string, string>` — keyed by `layer.name || layer.id`
- `useEffect` on `selectedTemplateId` initialises inputs from `layer.sample_text`
- Sends `layerTexts` map in POST body to final-assets route
- `final-assets/route.ts` accepts `layerTexts`; if provided, uses as `copy_text` directly (Python already does `copy_text.get(layer_name)` per layer)
- Falls back to single copyDoc `generated_text` for old templates without named layers

### Multiple Overlay Support (added 2026-03-03)
- `TemplateWorkspace.tsx` `handleAddLayer` auto-names layers sequentially: "Overlay 1", "Overlay 2", "Text 1", "Text 2", "Product 1"
- Pattern: `const sameTypeCount = layers.filter(l => l.type === type).length + 1`
- Prevents all overlays stacking invisibly at x:0,y:0 and appearing as identical "overlay" entries in layers panel

### Multi-Image Collage Ads (added 2026-03-04)
- Separate **Collage tab** — does NOT touch existing template/final-asset pipeline
- DB table: `collages` (migration: `supabase/migrations/20260304_create_collages_table.sql`)
- Types: `src/lib/types/collage.ts` — `CollageLayer` (types: `image`, `text`, `overlay`, `background`)
- Components: all under `src/components/collage/` (CollageWorkspace, CollageCanvas, CollageLayerPanel, CollagePropertiesPanel)
- API: `/api/categories/[id]/collages` (CRUD), `.../collages/generate` (PIL render + GDrive upload)
- PIL: `image` layer type in `composite_final_asset.py` — cover/contain object_fit, `background_color` layer type for solid fills
- Image source picker: 3 tabs — Pipeline (angled shots + backgrounds + composites), Brand Assets, URL input
- `collage_data` JSON: `{ layers: [...], background_color: "#hex" }` — stored in `collages.collage_data` JSONB column
- Generate route calls the same `composite_final_asset.py` script (no composite_url needed — all images from layer source_urls)
- **Grid Layout Presets** (updated 2026-03-05): 15 presets in 3 categories (grid/overlay/banner). `PresetCell` supports `name`, `remove_bg`, `object_fit`. Hero Product cells default to `remove_bg: true` + `object_fit: 'contain'`. Dropdown grouped by category with labels/separators.
- **White Background Removal** (collage hero product): Uses **flood-fill from edges** (not simple threshold). BFS from all edge pixels removes only the connected white background region. Preserves white text on product labels. Auto-crops to content bounds. Requires `python3-numpy` in Dockerfile.
- **Composite pipeline comparison**: Composites use **Gemini AI** to intelligently place product on background (lighting, shadows, blending). Collage uses **PIL flood-fill** for bg removal since it composites multiple grid images.
- **SSL fix for Railway**: `composite_final_asset.py` uses `certifi` SSL context; Dockerfile installs `python3-certifi` + `ca-certificates`

### Logo Compositing (Fixed 2026-03-05)
- **No alpha-channel blur** — previous code applied GaussianBlur to the logo's alpha channel for "edge feathering", which destroyed crisp edges, text, and fine details. Removed entirely; logos now composite with their original sharp edges.
- **Aspect ratio preserved** — uses `thumbnail((lw, lh))` (contain-fit + center) instead of `resize((lw, lh))` (stretch-to-fill). Logo is never distorted.
- File: `scripts/composite_final_asset.py` lines 414-430

### Background Gen — Flat/Solid Color Path
- `isFlatColor` detection in `src/lib/ai/gemini.ts`: regex on `solid|flat|plain|no texture|no shadow|no gradient|uniform`
- When matched: uses a stripped prompt (no DSLR, no lighting, no shadows) + flat-color-swatch system instruction
- Use keywords like "solid flat sage green #8a9e8e" or "flat uniform #8a9e8e" to get a clean solid fill

---

## UI Redesign — RiverFlow-Inspired (branch: `ui-redesign`)

**DO NOT merge to `main` until user confirms localhost testing passes.**

Design language: cream bg `#F5F5F3`, white cards `rounded-xl shadow-sm`, purple CTA `#7C5DFA`, `hover:bg-[#6A4FD8]`

### Tab renames (category detail page)
Old → New: Assets→Products, Angled Shots→(removed, merged into Photoshoots click panel), Backgrounds→Scenes, Guidelines+Templates→Styles, Composites→Photoshoots, Copy→Ad Copy, Final Assets+Ad Export→Ads

### Phase Progress
- [x] Phase 1 — Create branch `ui-redesign`
- [x] Phase 2 — Design tokens: tailwind.config.ts + globals.css
- [x] Phase 3 — Layout shell: Sidebar + TopBar + CategoryNav
- [x] Phase 4 — Dashboard + Category list pages
- [x] Phase 5 — Category detail page: tab renames + structural cleanup
- [x] Phase 6 — DB migrations: `generation_time_ms` + `aspect_ratio` columns
- [x] Phase 7 — Image metadata badges on generated image cards
- [x] Phase 8 — Products workspace: redesign + unified gallery
- [x] Phase 9 — Scenes workspace: redesign (split pane, filter tabs)
- [x] Phase 10 — Styles workspace: StylesWorkspace (Guidelines + Templates tabs) — commit `5704ef8`
- [x] Phase 11 — Brand Kit page: Logos/Fonts/Overlays sections — commit `a4e77e7`
- [x] Phase 12 — Photoshoots workspace: CompositeWorkspace redesign — commit `297b993`
- [x] Phase 13 — Photoshoots full build: Show Controls toggle, modals (SceneLibraryModal + SelectProductImagesModal) — commit `5b28eac`
- [x] Phase 14 — Composite Image Drawer: CompositeImageDrawer.tsx (Regenerate, Change Ratio, Generate Angles, Swap Product, Download) — commit `0c62b46`
- [ ] Phase 15 — New API routes: composites/reformat, composites/swap-product, /api/download (Sharp)
- [ ] Phase 15b — Ad Copy workspace: redesign CopyWorkspace
- [ ] Phase 16 — Ads workspace: AdsWorkspace (Create Ad + Export tabs)
- [ ] Phase 17 — Polish pass: hover states, empty states, loading skeletons, responsive
