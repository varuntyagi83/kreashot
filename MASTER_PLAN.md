# AdForge — AI Ad Creative Pipeline
## Master Plan Document

> **Purpose**: This document is the entry point for Claude Code. Read this first, then read each phase file sequentially. Build each phase completely before moving to the next. Ask the user to commit and push after each phase.

---

## Project Overview

AdForge is an end-to-end AI-powered ad creative generation platform. Users upload product images, generate AI variations (angles, backgrounds), create marketing copy, apply brand guidelines, and export production-ready ads in multiple aspect ratios.

**The entire image pipeline is powered by Nano Banana Pro (Gemini 3 Pro Image — `gemini-3-pro-image-preview`)**. Text/copy generation uses **GPT-4o via OpenAI API**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router) with TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Supabase (Auth, Database, RLS) |
| Storage | Google Drive (via Service Account with domain-wide delegation) |
| Image AI | Nano Banana Pro (`gemini-3-pro-image-preview`) via Google Gemini API |
| Text AI | GPT-4o via OpenAI API |
| State | Zustand for client state |
| File handling | Sharp.js for local image processing where needed |

---

## Google Drive Storage Structure

**All assets stored in Google Drive** under the AdForge Shared Drive with organized hierarchy:

### Phase 1 & 2 Structure (Product Images & Angled Shots)
```
AdForge Shared Drive/
└── {category-slug}/                              (e.g., gummy-bear)
    └── {product-slug}/                           (e.g., vitamin-c-gummies)
        └── product-images/                       (container for all product images)
            ├── {image-filename}.jpg              (user-uploaded high-res images)
            ├── {image-filename}-angled-shots/    (AI variations of this specific image)
            │   ├── left_30deg_{timestamp}.jpg
            │   ├── front_{timestamp}.jpg
            │   └── right_45deg_{timestamp}.jpg
            ├── {another-image}.jpg               (another uploaded image)
            └── {another-image}-angled-shots/     (its AI variations)
                └── ...
```

### Full Structure (All Phases)
| Folder Path | Scope | Purpose |
|-------------|-------|---------|
| `{category-slug}/{product-slug}/product-images/` | Per product | Raw product images uploaded by user |
| `{category-slug}/{product-slug}/product-images/{image-name}-angled-shots/` | Per image | AI-generated angle variations of specific product image |
| `{category-slug}/backgrounds/` | Per category | AI-generated backgrounds matching category look & feel |
| `{category-slug}/composites/` | Per category | Composites: angled product + background |
| `{category-slug}/copy/` | Per category | AI-generated marketing copy (hooks, CTAs, text) |
| `{category-slug}/guidelines/` | Per category | User-uploaded design guidelines, safe zones |
| `{category-slug}/final-assets/` | Per category | Fully composed creatives (image + text + layout) |
| `brand-assets/` | Global | Logos, brand fonts, universal elements |

**Storage Path Examples:**
- Original image: `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies.jpg`
- Angled shot: `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/left_30deg_1234567.jpg`
- Background: `gummy-bear/backgrounds/tropical-leaves-warm_1234568.jpg`

**Storage Sync System (3-Layer Architecture):**
- **Layer 1:** UI operations (upload, delete, view)
- **Layer 2:** Supabase database (metadata with storage_provider, storage_path, storage_url, gdrive_file_id)
- **Layer 3:** Google Drive (actual file storage)

**Sync Mechanisms:**
1. UI deletion → Both Drive & DB deleted immediately
2. Manual Drive deletion → Run reconciliation API
3. Drive trash → Run cleanup script (treats trashed as deleted)
4. Manual DB deletion → Queued for Drive deletion via cron job

**Human-Readable Folder Names:**
- Uses slugs from category and product names (e.g., `gummy-bear/vitamin-c-gummies/`)
- Angled shots organized per original image (e.g., `vitamin-c-gummies-angled-shots/`)
- NOT UUIDs - makes Drive folders browsable and organized

---

## Database Tables

| Table | Purpose | Storage Sync Fields |
|-------|---------|-------------------|
| `categories` | Category metadata (name, slug, description, look_and_feel) | N/A |
| `brand_assets` | Brand-level asset metadata (logos, fonts) | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `products` | Products within a category (name, slug, description) | N/A |
| `product_images` | Raw product images linked to products | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `angled_shots` | AI-generated angled shot metadata | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `backgrounds` | AI-generated background metadata | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `composites` | Product + background composite metadata | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `copy_docs` | Generated marketing copy entries | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `guidelines` | Uploaded guideline metadata | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `final_assets` | Final composed creative metadata | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `ad_exports` | Exported ads with aspect ratio info | ✅ storage_provider, storage_path, storage_url, gdrive_file_id |
| `asset_references` | @ reference lookup table for all assets | N/A |
| `deletion_queue` | Queue for async file deletions with retry logic | Contains resource metadata for cleanup |

**Critical:** ALL tables storing files MUST include the 4 storage sync fields and implement deletion queue triggers (see `docs/STORAGE_SYNC_REQUIREMENTS.md`)

---

## The @ Reference System

Every asset across all buckets gets a unique, human-readable reference ID following this pattern:

```
@{category_slug}/{asset_type}/{descriptive_name}
```

Examples:
- `@greenworld/product/vitamin-d-front`
- `@greenworld/angled/vitamin-d-left-30deg`
- `@greenworld/bg/tropical-leaves-warm`
- `@greenworld/composite/vitamin-d-left-30deg_tropical-leaves`
- `@global/logo/sunday-natural-primary`

The `asset_references` table maps these to actual storage URLs. A searchable dropdown triggers on `@` in any text field.

---

## Phase Execution Order

Read and execute each phase file in order:

1. **`PHASE_0_FOUNDATION.md`** — Project scaffold, Supabase setup, auth, base UI shell
2. **`PHASE_1_CATEGORIES_ASSETS.md`** — Category CRUD, brand assets, product image upload
3. **`PHASE_2_ANGLED_SHOTS.md`** — AI angled shot generation with Nano Banana Pro
4. **`PHASE_3_BACKGROUNDS_COMPOSITES.md`** — AI background generation + product×background compositing
5. **`PHASE_4_COPY_GENERATION.md`** — AI marketing copy generation with GPT-4o
6. **`PHASE_5_GUIDELINES_REFERENCES.md`** — Guideline upload + @ reference system
7. **`PHASE_6_FINAL_COMPOSITES.md`** — Final composite generation (visual + copy + guidelines)
8. **`PHASE_7_AD_EXPORT.md`** — Multi-aspect ratio ad export

---

## Ralph Loop Protocol (Apply Within Each Phase)

Each phase file contains multiple implementation steps. After every significant step:

1. **Context Snapshot**: Save a brief summary of what was built and current state
2. **Validation**: Run the specified tests/checks before proceeding
3. **Commit Point**: Ask user to `git add . && git commit -m "message" && git push`
4. **Reset Point**: If context is getting heavy, summarize state and suggest starting a new Claude Code session with a "Continue from Phase X, Step Y" instruction

---

## Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Drive Storage
GOOGLE_DRIVE_CLIENT_EMAIL=
GOOGLE_DRIVE_PRIVATE_KEY=
GOOGLE_DRIVE_FOLDER_ID=

# Google Gemini API (for Nano Banana Pro)
GEMINI_API_KEY=

# OpenAI API (for GPT copy generation)
OPENAI_API_KEY=

# Cron Jobs
CRON_SECRET=
```

---

## Git Strategy

- Branch: `main` for each phase merge
- Commit after each phase step completion
- Tag after each full phase: `v0.1.0` (Phase 0), `v0.2.0` (Phase 1), etc.

---

## BEGIN: Read `PHASE_0_FOUNDATION.md` now.
