# AdForge — Figma MCP Bridge
## Claude Code Instructions

> Drop this file in the repo root alongside `CLAUDE.md` before starting any session.
> Read **both** `CLAUDE.md` and `CLAUDE_MEMORY.md` at the start of every session — this file is additive, not a replacement.

---

## 🛑 CORE APP IS OFF-LIMITS — READ THIS FIRST

The AdForge production pipeline is live and generating revenue. **You must never modify any of the files listed below.** If you find yourself about to edit one of them, stop, re-read this file, and find the additive approach instead. There is always an additive approach.

### ❌ Files you must NOT open for editing

| File / Folder | Why |
|---|---|
| `src/lib/ai/gemini.ts` | Core image generation (angled shots, backgrounds, composites). Any change risks breaking the entire image pipeline. |
| `src/lib/ai/openai.ts` | Copy generation. Not relevant to this feature. |
| `src/lib/ai/brand-voice.ts` | Brand voice logic. Not relevant to this feature. |
| `src/lib/ai/replicate.ts` | Replicate adapter. Not relevant to this feature. |
| `scripts/composite_final_asset.py` | Python PIL compositor. Changes here break Final Assets. |
| `src/lib/formats.ts` | Format definitions. Import read-only — never modify. |
| `src/lib/storage/` | Storage adapters. Bridge downloads from storage but never writes through these. |
| `src/app/api/categories/` | All existing category API routes. Read their responses; never touch their code. |
| `src/components/final-assets/` | Final Assets workspace. Out of scope for this feature. |
| `src/components/backgrounds/` | Backgrounds workspace. Out of scope. |
| `src/components/angled-shots/` | Angled Shots workspace. Out of scope. |
| `src/components/copy/` | Copy workspace. Out of scope. |
| `src/components/templates/` | Template builder. Out of scope. |
| `src/components/collage/` | Collage workspace. Out of scope. |
| `supabase/migrations/*.sql` (existing files) | Never modify existing migrations. Always create a new file. |
| `CLAUDE.md` | Updated at session end only, not mid-session. |
| `CLAUDE_MEMORY.md` | Updated at session end only, not mid-session. |

### ✅ The only existing files you may touch (Session 5 only, additive lines only)

- `src/components/composites/CompositeImageDrawer.tsx` — add 3 lines: one import + render `<FigmaBridgeButton>`
- `src/components/composites/CompositeWorkspace.tsx` — add 3 lines: one import + render `<FigmaBridgeBatch>`

**Additive means:** you add lines. You do not delete lines. You do not reformat existing lines. You do not move existing blocks.

---

## What This Feature Does

A Figma MCP Bridge that pushes AdForge-generated creatives (composites, angled shots, backgrounds, final assets) directly into Figma as fully editable, layered frames — without touching the core generation pipeline.

**Three workflows:**

1. **Push single creative** — "Send to Figma" button on a composite → one editable Figma frame with image fill + metadata layers
2. **Batch variant export** — "Export All Formats" → all format variants (1:1, 9:16, 4:5, 16:9) laid out side-by-side in one Figma file
3. **`/push-approved` skill** — Claude Code skill that reads an approved Figma frame URL and exports a download-ready PNG bundle

---

## New Files Only — Complete List

Everything for this feature lives in these new locations. No other directories.

```
src/app/api/figma-bridge/
  push/route.ts               ← Workflow 1: push single asset
  push-batch/route.ts         ← Workflow 2: batch format export
  status/route.ts             ← Connection health check

src/components/figma-bridge/
  FigmaBridgeButton.tsx       ← Single-asset push button + confirmation modal
  FigmaBridgeBatch.tsx        ← Batch export button with format selector
  FigmaStatusBadge.tsx        ← Small connection indicator

src/lib/figma/
  types.ts                    ← TypeScript interfaces for all Figma payloads
  payload-builder.ts          ← Builds FigmaFrameSpec from AdForge asset data
  client.ts                   ← Figma REST API wrapper with retry logic
  validators.ts               ← Frame dimension validation vs formats.ts

supabase/migrations/
  20260317_figma_bridge.sql   ← figma_exports audit table + RLS

adforge/.claude/skills/push-approved/
  skill.md                    ← /push-approved Claude Code skill

docs/
  FIGMA_BRIDGE.md             ← Setup guide and env var documentation
```

---

## Environment Variables

Add these to `.env.local` and to Railway service variables.

```
FIGMA_ACCESS_TOKEN=<your-personal-access-token>
FIGMA_DEFAULT_FILE_KEY=<optional-default-figma-file-key>
FIGMA_MCP_URL=https://api.figma.com/v1
```

**How to get `FIGMA_ACCESS_TOKEN`:**
Figma → Account Settings → Personal Access Tokens → Generate new token → Scopes: `files:read` + `files:write`

**Never commit `FIGMA_ACCESS_TOKEN` to the repo.**

---

## Architecture Rules

### How the bridge reads AdForge data (read-only)

The bridge fetches existing data via GET — it never writes to existing tables.

| Data needed | How to get it |
|---|---|
| Composite image URL | `SELECT storage_url FROM composites WHERE id = $assetId` |
| Angled shot image URL | `SELECT storage_url FROM angled_shots WHERE id = $assetId` |
| Background image URL | `SELECT storage_url FROM backgrounds WHERE id = $assetId` |
| Final asset image URL | `SELECT storage_url FROM final_assets WHERE id = $assetId` |
| Format dimensions | `import { FORMATS } from '@/lib/formats'` — read-only, no modification |
| Category name/slug | `SELECT name, slug FROM categories WHERE id = $categoryId` |

### Image download pattern

All AdForge images are stored on Google Drive CDN. The URL format is:

```
https://lh3.googleusercontent.com/d/{FILE_ID}=w2000
```

To download: `fetch(asset.storage_url)` → `Buffer`. No auth headers needed for CDN URLs.

### Auth pattern (copy exactly from existing routes)

Every new API route must follow this exact pattern — copy from `src/app/api/categories/[id]/composites/route.ts`:

```typescript
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const companyId = await getCompanyId(supabase, user.id)
if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })
```

### Figma client pattern (copy from gemini.ts)

Use `fetch()` directly — same pattern as `src/lib/ai/gemini.ts`. No Figma SDK.

```typescript
const res = await fetch(`${FIGMA_BASE_URL}/me`, {
  headers: { 'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN! }
})
```

Add retry on 429 and 503: max 3 attempts, 2s / 4s / 8s backoff. Copy `fetchGeminiWithRetry` from `gemini.ts` as a reference (read it, don't modify it).

### Figma frame layer structure

Each pushed creative becomes a Figma frame with these layers:

```
[Frame]  ad-{slug}-{format}          ← sized to format dimensions e.g. 1080×1080
  [Rectangle]  image-fill            ← composite PNG as image fill (base64 from GDrive)
  [Text]       format                ← "1:1 · 1080×1080 · Instagram Square Post"
  [Text]       category              ← category name
  [Text]       product               ← product name (if available)
  [Text]       copy-tagline          ← tagline text (only if asset has one)
  [Text]       prompt-used           ← Gemini prompt, truncated to 400 chars
  [Text]       generated-at          ← ISO timestamp
  [Rectangle]  safe-zone             ← dashed border, 10% inset from all edges
```

### Batch layout

For batch exports, frames are placed side by side:

```typescript
x = (frame.width + 60) * index  // 60px gap between frames
```

All frames sit inside a parent group: `Batch Export — {categoryName} — {timestamp}`

### figma_exports table (new — audit log only)

```sql
CREATE TABLE figma_exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  asset_type      TEXT NOT NULL
    CHECK (asset_type IN ('composite','angled-shot','background','final-asset')),
  asset_id        UUID NOT NULL,
  figma_file_key  TEXT NOT NULL,
  figma_frame_id  TEXT NOT NULL,
  figma_frame_url TEXT NOT NULL,
  format          TEXT,
  is_batch        BOOLEAN DEFAULT FALSE,
  batch_formats   TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE figma_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY figma_exports_company_isolation ON figma_exports
  USING (company_id IN (
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));
```

---

## Session Plan

### Ralph Loop — every session

```
1. Read CLAUDE.md
2. Read CLAUDE_MEMORY.md
3. Read this file (FIGMA_BRIDGE_CLAUDE.md)
4. At 60% context usage: commit all changes, update CLAUDE_MEMORY.md, start fresh session
```

---

### Session 1 — Types, Payload Builder, Validators
**Goal:** `src/lib/figma/` foundation. No UI. No API routes. No existing files touched.

**Create `src/lib/figma/types.ts`**

```typescript
// FigmaAssetPayload — what the bridge receives from AdForge
export interface FigmaAssetPayload {
  assetType: 'composite' | 'angled-shot' | 'background' | 'final-asset'
  assetId: string
  categoryId: string
  categoryName: string
  productName?: string
  format: string                   // e.g. '1:1'
  formatConfig: FormatConfig       // from src/lib/formats.ts
  imageUrl: string                 // GDrive CDN URL
  imageBuffer?: Buffer
  mimeType: string
  taglineCopy?: string
  promptUsed?: string
  generatedAt: string              // ISO timestamp
  slug: string
}

// FigmaFrameSpec — the Figma frame to create
export interface FigmaFrameSpec {
  name: string
  width: number
  height: number
  x: number
  y: number
  children: FigmaLayerSpec[]
}

export interface FigmaLayerSpec {
  type: 'RECTANGLE' | 'TEXT'
  name: string
  content?: string                 // TEXT layers only
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
  fontColor?: string
  imageFill?: string               // base64 image data for RECTANGLE image fills
  isDashed?: boolean               // for safe-zone rect
}

export interface FigmaExportResult {
  success: boolean
  figmaFileKey?: string
  figmaFrameId?: string
  figmaFrameUrl?: string
  error?: string
}

export interface FigmaBatchExportResult extends FigmaExportResult {
  framesCreated?: number
  frameUrls?: { format: string; url: string }[]
}
```

**Create `src/lib/figma/payload-builder.ts`**

- `buildFrameSpec(payload: FigmaAssetPayload): FigmaFrameSpec`
  - Frame sized to `payload.formatConfig.width × height`
  - `image-fill` rect: full frame, `imageFill` = base64 of image buffer
  - `format` text: `"${format} · ${width}×${height} · ${formatConfig.description}"`
  - `category` text: `payload.categoryName`
  - `product` text: `payload.productName` (skip layer if undefined)
  - `copy-tagline` text: `payload.taglineCopy` (skip layer if undefined)
  - `prompt-used` text: `payload.promptUsed?.slice(0, 400)` (skip if undefined)
  - `generated-at` text: `payload.generatedAt`
  - `safe-zone` rect: `isDashed: true`, 10% inset from frame edges
  - Text layers stacked at bottom of frame, 20px font, white text
- `buildBatchLayout(specs: FigmaFrameSpec[]): FigmaFrameSpec[]`
  - Sets `x = (spec.width + 60) * index` for each spec

**Create `src/lib/figma/validators.ts`**

- `validateFrameDimensions(w: number, h: number): { matched: boolean, format?: string, delta?: number }`
  - Import `FORMATS` from `'@/lib/formats'` (read-only)
  - Compare `w/h` against all format entries
  - Return closest match and pixel delta

**Commit:** `feat(figma-bridge): session 1 — types, payload-builder, validators`

---

### Session 2 — Figma MCP Client
**Goal:** `src/lib/figma/client.ts`. No UI. No API routes. No existing files touched.

**Create `src/lib/figma/client.ts`**

```typescript
const FIGMA_BASE = process.env.FIGMA_MCP_URL || 'https://api.figma.com/v1'

// Always add this header
headers: { 'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN! }
```

**Implement these functions:**

```typescript
// Test auth + get username
getConnectionStatus(): Promise<{ connected: boolean; userName?: string; error?: string }>
  → GET /me

// Get or create the target Figma file
getOrCreateFile(fileKey?: string): Promise<string>
  → fileKey provided: GET /files/{fileKey} → confirm exists → return fileKey
  → no fileKey: use FIGMA_DEFAULT_FILE_KEY env var
  → no env var: POST to create file named "AdForge Exports {YYYY-MM-DD}"

// Get or create the target page inside the file
getOrCreatePage(fileKey: string, pageName: string): Promise<string>
  → GET /files/{fileKey} → find page by name → return pageId
  → not found: POST /files/{fileKey}/pages with { name: pageName }

// Upload image bytes → get imageRef for use as frame fill
uploadImageToFigma(fileKey: string, buffer: Buffer, mimeType: string): Promise<string>
  → POST /files/{fileKey}/images (multipart/form-data)
  → returns imageRef string

// Create a frame with all child layers on the target page
createFrame(fileKey: string, pageId: string, spec: FigmaFrameSpec): Promise<string>
  → POST /files/{fileKey}/nodes
  → map FigmaFrameSpec + children to Figma API node JSON
  → image-fill rect: fills: [{ type: 'IMAGE', imageRef: spec.imageFill }]
  → TEXT layers: characters field
  → RECTANGLE with isDashed: strokeDashes: [4, 4]
  → return created frameId
```

**Retry logic** (copy pattern from `gemini.ts` — read it, do not modify it):

```typescript
// Max 3 attempts, backoff: 2000ms, 4000ms, 8000ms
// Retry on status 429 and 503
async function fetchFigmaWithRetry(url, options): Promise<Response>
```

**Commit:** `feat(figma-bridge): session 2 — Figma MCP client`

---

### Session 3 — API Routes
**Goal:** Three new routes in `src/app/api/figma-bridge/`. No existing files touched.

**Auth pattern to copy** (from `src/app/api/categories/[id]/composites/route.ts`):

```typescript
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const companyId = await getCompanyId(supabase, user.id)
if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })
```

**Route 1:** `src/app/api/figma-bridge/status/route.ts`

```
GET /api/figma-bridge/status
→ Call getConnectionStatus()
→ Return { connected, userName, tokenConfigured: !!process.env.FIGMA_ACCESS_TOKEN }
```

**Route 2:** `src/app/api/figma-bridge/push/route.ts`

```
POST /api/figma-bridge/push
Body: { assetType, assetId, categoryId, figmaFileKey?, figmaPageName? }

Steps:
1. Auth check (copy pattern above)
2. Fetch asset from Supabase:
   composite   → composites table
   angled-shot → angled_shots table
   background  → backgrounds table
   final-asset → final_assets table
3. Fetch category: SELECT name, slug FROM categories WHERE id = categoryId
4. Fetch product name if available (join through composite → angled_shots → products)
5. Download image: const res = await fetch(asset.storage_url)
                   const buffer = Buffer.from(await res.arrayBuffer())
6. buildFrameSpec() → getOrCreateFile() → getOrCreatePage()
   → uploadImageToFigma() → createFrame()
7. INSERT INTO figma_exports (audit log)
8. Return { success: true, figmaFrameUrl, figmaFileKey, frameId }

On Figma API error: return { success: false, error: message } HTTP 502
```

**Route 3:** `src/app/api/figma-bridge/push-batch/route.ts`

```
POST /api/figma-bridge/push-batch
Body: { baseCompositeId, categoryId, formats?, figmaFileKey? }

Steps:
1. Auth check
2. SELECT * FROM composites WHERE id = baseCompositeId → get angled_shot_id + background_id
3. SELECT * FROM composites
   WHERE category_id = categoryId
   AND angled_shot_id = base.angled_shot_id
   AND background_id = base.background_id
   AND format = ANY(formats)   ← filter to requested formats
4. For each variant: download image → buildFrameSpec()
5. buildBatchLayout() → set x positions
6. getOrCreateFile() → getOrCreatePage()
   → For each spec: uploadImageToFigma() → createFrame()
7. INSERT INTO figma_exports (is_batch=true, batch_formats=formats)
8. Return { success, figmaFileUrl, framesCreated, frameUrls }
```

**Commit:** `feat(figma-bridge): session 3 — push, push-batch, status routes`

---

### Session 4 — UI Components
**Goal:** Three new components in `src/components/figma-bridge/`. No existing files touched.

**Rules:**
- Use only existing `src/components/ui/` primitives: `Button`, `AlertDialog`, `Badge`, `Checkbox`
- Lucide icons available: `Loader2`, `ExternalLink`
- Follow main branch design (not `ui-redesign` branch)
- No new npm packages

**`FigmaStatusBadge.tsx`**

```
- Client component
- Calls GET /api/figma-bridge/status on mount
- Connected:         small green dot + "Figma connected" (12px muted text)
- Token set, error:  yellow dot + "Figma auth error"
- No token:          render null (clean fallback, no broken UI)
```

**`FigmaBridgeButton.tsx`**

```typescript
interface Props {
  assetType: 'composite' | 'angled-shot' | 'background' | 'final-asset'
  assetId: string
  categoryId: string
  label?: string   // defaults to "Send to Figma"
}
```

```
- Outline Button variant
- Click → AlertDialog: "Send this creative to your Figma workspace?"
- Confirm → POST /api/figma-bridge/push
- Loading: Loader2 spinner inside button, button disabled
- Success: sonner toast "Opened in Figma ↗" — figmaFrameUrl as clickable link
- Error: sonner toast with error message
```

**`FigmaBridgeBatch.tsx`**

```typescript
interface Props {
  baseCompositeId: string
  categoryId: string
}
```

```
- Button label: "Export All Formats to Figma"
- Click → Dialog with format checkboxes: 1:1, 9:16, 4:5, 16:9
  All checked by default
- Confirm → POST /api/figma-bridge/push-batch with selected formats
- Success: sonner toast "Exported {n} variants to Figma ↗"
- Error: sonner toast with error message
```

**Commit:** `feat(figma-bridge): session 4 — status badge, push button, batch component`

---

### Session 5 — Integration (the only session that touches existing files)
**Goal:** Add `FigmaBridgeButton` and `FigmaBridgeBatch` to existing composite views.

> ⚠️ **Read each target file fully before editing. Add lines only. Never delete or reformat existing lines.**

**`src/components/composites/CompositeImageDrawer.tsx`**

1. Add at top of imports:
   ```typescript
   import { FigmaBridgeButton } from '@/components/figma-bridge/FigmaBridgeButton'
   ```
2. Find the existing action button group (Regenerate, Change Ratio, Swap Product, Download)
3. Below the last button in that group, add:
   ```tsx
   <FigmaBridgeButton
     assetType="composite"
     assetId={composite.id}
     categoryId={categoryId}
   />
   ```
4. Verify `categoryId` is already available as a prop in this component (it is — check before assuming)

**`src/components/composites/CompositeWorkspace.tsx`**

1. Add at top of imports:
   ```typescript
   import { FigmaBridgeBatch } from '@/components/figma-bridge/FigmaBridgeBatch'
   ```
2. Find the workspace toolbar (near the top of the JSX return)
3. Next to existing toolbar buttons, add (only when a composite is selected):
   ```tsx
   {selectedCompositeId && (
     <FigmaBridgeBatch
       baseCompositeId={selectedCompositeId}
       categoryId={categoryId}
     />
   )}
   ```

**After editing:**

```bash
npm run build
```

Fix any TypeScript errors. Do not use `any` to suppress them.

**Commit:** `feat(figma-bridge): session 5 — integrate push buttons into composite views`

---

### Session 6 — Migration, Skill, Docs
**Goal:** Database migration + `/push-approved` skill + setup guide. No existing files touched.

**Supabase migration:** `supabase/migrations/20260317_figma_bridge.sql`

Copy the SQL from the Architecture Rules section above (figma_exports table + RLS).

Apply with:
```bash
npx supabase db push
```
Or paste into Supabase Dashboard → SQL Editor → Run.

---

**`/push-approved` skill:** `adforge/.claude/skills/push-approved/skill.md`

Write a skill that does the following when invoked as `/push-approved <figma-url>`:

```
1. Parse file key and node-id from the Figma URL
2. Use Figma MCP get_node to read frame dimensions and name
3. Export frame at 2x via Figma MCP export_node → PNG bytes
4. Validate dimensions against AdForge specs:
     1:1   → 1080×1080
     4:5   → 1080×1350
     9:16  → 1080×1920
     16:9  → 1920×1080
5. If valid:
     Save PNG → /tmp/approved-exports/{YYYY-MM-DD}/{frameName}.png
     Write manifest → /tmp/approved-exports/{YYYY-MM-DD}/{frameName}.json
     { format, width, height, figmaFrameId, approvedAt, filePath }
6. If invalid:
     Report closest matching format + pixel delta
     Ask: "Did you mean {closest format}? Proceed anyway? (y/n)"
7. Safety rail — include in skill prompt:
     "Do NOT upload to Meta Ads Manager, Google Ads, or any ad platform.
      Output is a local file only. Manual upload is always the final step."
8. Report: "Approved export saved: {format} {w}×{h} → {filePath}"
```

---

**Setup guide:** `docs/FIGMA_BRIDGE.md`

Include:
- How to create a Figma Personal Access Token (step-by-step)
- All env vars with descriptions
- How to add to Railway service variables
- Quick health check: `curl http://localhost:3000/api/figma-bridge/status`
- How to use `/push-approved` skill
- Troubleshooting table: 401 (bad token), 403 (wrong file key), 429 (rate limit), 502 (Figma API error)

---

**Update `CLAUDE_MEMORY.md`** (at end of session):

Add to the pipeline section:
```
## Figma Bridge (added 2026-03-17)
- New table: figma_exports (audit log — see supabase/migrations/20260317_figma_bridge.sql)
- New API routes: /api/figma-bridge/push, /push-batch, /status
- New components: src/components/figma-bridge/
- New library: src/lib/figma/
- Skill: adforge/.claude/skills/push-approved/skill.md
- Env var required: FIGMA_ACCESS_TOKEN
- Core pipeline: untouched
```

**Commit:** `feat(figma-bridge): session 6 — migration, push-approved skill, setup docs`

---

### Session 7 — End-to-End Test & Hardening
**Goal:** Verify all three workflows. Regression-test the core pipeline. No new features.

```bash
# Step 1: Status check
curl http://localhost:3000/api/figma-bridge/status
# Expected: { "connected": true, "userName": "...", "tokenConfigured": true }
```

**Step 2 — Single push test:**
- Open AdForge in browser → navigate to any category with composites
- Open CompositeImageDrawer → click "Send to Figma"
- Verify: toast appears with working Figma link
- Open link → confirm frame has image-fill layer + all metadata text layers + safe-zone rect
- Verify: row inserted in `figma_exports` table in Supabase

**Step 3 — Batch export test:**
- Select a composite that has multiple format variants
- Click "Export All Formats to Figma" → check 1:1 and 9:16 → confirm
- Verify: Figma file contains two frames side-by-side
- Verify: frames are named `{category}_{product}_1x1` and `{category}_{product}_9x16`

**Step 4 — `/push-approved` skill test:**
- In Claude Code: `/push-approved [URL of a frame you just exported]`
- Verify: PNG saved to `/tmp/approved-exports/`
- Verify: manifest JSON written with correct format detection

**Step 5 — Core pipeline regression (CRITICAL — must pass before shipping):**

| Test | Expected result |
|---|---|
| Generate new composite (normal workflow) | Works identically to before |
| Generate final asset (PIL compositor) | Runs cleanly, GDrive upload succeeds |
| Download Ad Export CSV | Generates correctly |
| Gemini image generation | No errors, images appear in gallery |
| OpenAI copy generation | No errors, copy appears in gallery |

**Step 6:** Fix any issues found. Do not ship if Step 5 has any failures.

**Commit:** `feat(figma-bridge): session 7 — e2e verified, hardening complete`

---

## Quick Reference

### Figma REST endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /v1/me` | Auth check + username |
| `GET /v1/files/{key}` | File metadata + pages |
| `POST /v1/files/{key}/images` | Upload image → imageRef |
| `POST /v1/files/{key}/nodes` | Create frames + layers |
| `GET /v1/files/{key}/nodes?ids={id}` | Read node properties |
| `GET /v1/images/{key}?ids={id}&format=png` | Export node as PNG |

### Format specs (from `src/lib/formats.ts`)

| Format | Width | Height | Platform |
|---|---|---|---|
| 1:1 | 1080 | 1080 | Instagram Square |
| 4:5 | 1080 | 1350 | Instagram Portrait |
| 9:16 | 1080 | 1920 | Stories / Reels |
| 16:9 | 1920 | 1080 | Widescreen |

### AI model rules (from `CLAUDE.md` — unchanged)

| Task | Model |
|---|---|
| Text / copy | GPT-4o (OpenAI) |
| Image generation | gemini-3.1-flash-image-preview |
| Video analysis | gemini-2.5-flash |

The Figma bridge does **not** generate images. It only moves existing images into Figma. No AI model calls in the bridge code.
