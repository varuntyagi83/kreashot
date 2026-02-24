# Phase 7 — Multi-Aspect Ratio Ad Export

> **Goal**: Generate production-ready ads from final assets in multiple aspect ratios for different advertising platforms. Nano Banana Pro handles intelligent recomposition per aspect ratio. This covers pipeline Step 10 — the final step.

---

## Prerequisites
- Phase 6 complete
- Final assets exist in `final_assets`
- Verified final assets available (text_verified = true preferred)

---

## Step 7.1 — Aspect Ratio Definitions

**Action**: Define supported aspect ratios with platform context.

Create `src/lib/constants/aspect-ratios.ts`:

```typescript
export interface AspectRatio {
  label: string
  ratio: string       // "1:1", "16:9", etc.
  width: number       // Pixel dimensions for generation
  height: number
  platforms: string[]  // Which ad platforms use this
  category: 'square' | 'landscape' | 'portrait' | 'ultrawide' | 'ultratall'
}

export const ASPECT_RATIOS: AspectRatio[] = [
  // Square
  { label: 'Square', ratio: '1:1', width: 1080, height: 1080,
    platforms: ['Instagram Feed', 'Facebook Feed', 'LinkedIn'],
    category: 'square' },

  // Landscape
  { label: 'Landscape 16:9', ratio: '16:9', width: 1920, height: 1080,
    platforms: ['YouTube', 'YouTube Ads', 'Twitter/X', 'LinkedIn Video'],
    category: 'landscape' },
  { label: 'Landscape 4:5 (inverted)', ratio: '5:4', width: 1350, height: 1080,
    platforms: ['Custom'],
    category: 'landscape' },
  { label: 'Ultrawide 21:9', ratio: '21:9', width: 2520, height: 1080,
    platforms: ['Cinema Display Ads', 'Web Banners'],
    category: 'ultrawide' },

  // Portrait
  { label: 'Portrait 9:16', ratio: '9:16', width: 1080, height: 1920,
    platforms: ['Instagram Stories', 'Instagram Reels', 'TikTok', 'Snapchat', 'YouTube Shorts'],
    category: 'portrait' },
  { label: 'Portrait 4:5', ratio: '4:5', width: 1080, height: 1350,
    platforms: ['Instagram Feed (portrait)', 'Facebook Feed (portrait)'],
    category: 'portrait' },
  { label: 'Ultratall 9:21', ratio: '9:21', width: 1080, height: 2520,
    platforms: ['Custom Vertical Banners'],
    category: 'ultratall' },

  // Additional common formats
  { label: 'Facebook Cover', ratio: '205:78', width: 820, height: 312,
    platforms: ['Facebook Cover Photo'],
    category: 'landscape' },
  { label: 'Twitter Header', ratio: '3:1', width: 1500, height: 500,
    platforms: ['Twitter/X Header'],
    category: 'landscape' },
]
```

**🔒 COMMIT**: `git add . && git commit -m "feat: aspect ratio definitions with platform mapping"`

---

## Step 7.2 — Ad Export Generation API

**Action**: Build the API that generates ads in target aspect ratios.

### API: `src/app/api/generate/ad-export/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  final_asset_ids: string[]        // Which final assets to export
  aspect_ratios: string[]          // ["1:1", "9:16", "16:9"]
  quality: '1k' | '2k' | '4k'     // Output resolution tier
}
```

**Implementation per (final_asset × aspect_ratio) pair**:

1. **Fetch the final asset** image from storage → base64
2. **Fetch the original guideline** associated with this final asset → get element positions
3. **Determine recomposition strategy**:
   - If source is 1:1 and target is 9:16 (portrait): need to extend vertically
   - If source is 1:1 and target is 16:9 (landscape): need to extend horizontally
   - The AI must intelligently recompose, not just crop or stretch

4. **Build Nano Banana Pro prompt**:
   ```
   Recompose this advertisement for a different aspect ratio.

   SOURCE: The provided image is a complete advertisement at approximately 1:1 aspect ratio.
   TARGET: Recompose for {target_ratio} ({width}×{height} pixels)

   RECOMPOSITION RULES:
   - Maintain ALL elements from the original: product, background, text, logo, CTA
   - Intelligently reposition elements for the new aspect ratio
   - For portrait (tall) formats:
     - Product can move to upper or lower third
     - Text elements should reflow vertically
     - Extend the background naturally (continue the scene)
   - For landscape (wide) formats:
     - Product can shift to one side
     - Text can take the opposite side
     - Extend the background naturally
   - For ultrawide/ultratall:
     - Use the extra space for atmospheric background extension
     - Keep product and text in the central portion

   CRITICAL:
   - ALL text must remain EXACTLY the same — same words, same language, same spelling
   - Logo must remain visible and properly sized
   - Product must remain the focal point
   - The ad must look INTENTIONALLY designed for this format, not cropped
   - Professional, polished output at {quality} resolution
   - Output at exactly {width}×{height} pixels
   ```

5. **Call Nano Banana Pro**:
   ```typescript
   const result = await generateImage(prompt, [
     { data: finalAssetBase64, mimeType: 'image/png', role: 'source_advertisement' }
   ])
   ```

6. **Return for preview**

**Batch Processing**: For multiple final assets × multiple ratios, this generates a matrix.
- Example: 5 final assets × 3 ratios = 15 exports
- Process with generation queue, show progress

**Response**:
```typescript
{
  total_exports: number
  results: {
    final_asset_id: string
    aspect_ratio: string
    width: number
    height: number
    image_base64: string
    prompt_used: string
    platforms: string[] // Which platforms this ratio suits
  }[]
}
```

**Validation**: Exported ads look intentionally designed for each aspect ratio, not just cropped.

**🔒 COMMIT**: `git add . && git commit -m "feat: multi-aspect ratio ad export with Nano Banana Pro"`

---

## Step 7.3 — Save Ad Exports API

### API: `src/app/api/generate/ad-export/save/route.ts`

**Implementation**:
1. Upload to: `final-assets/{user_id}/{category_id}/exports/{final_asset_name}_{ratio}.png`
   (Note: exports go into the same `final-assets` bucket in an `exports` subfolder)
2. Insert into `ad_exports` table
3. Create `asset_references` entry:
   - Pattern: `@{category_slug}/ad/{product}-{ratio_compact}`
   - Example: `@greenworld/ad/vitamin-d-hook-en-9x16`

**🔒 COMMIT**: `git add . && git commit -m "feat: save ad exports with aspect ratio metadata"`

---

## Step 7.4 — Ad Export UI

**Action**: Build the Ad Export tab interface.

### Component: `src/components/ad-export/AdExportWorkspace.tsx`

**Layout**:

**Section 1 — Source Selection** (top):
- **Final assets grid** with checkboxes for selecting which to export
- Filter by: product, copy type, language
- "Select All" / "Select Verified Only" (text_verified = true)
- Selected count: "3 final assets selected"

**Section 2 — Aspect Ratio Selection** (middle):
- **Visual ratio selector**: Show each ratio as a proportional rectangle
  ```
  ┌──────┐  ┌────────────┐  ┌────┐  ┌──┐  ...
  │ 1:1  │  │   16:9     │  │4:5 │  │  │
  │      │  │            │  │    │  │9 │
  │      │  └────────────┘  │    │  │: │
  └──────┘                  └────┘  │16│
                                    │  │
                                    └──┘
  ```
- Each ratio shows platform icons below (Instagram, TikTok, YouTube, etc.)
- Checkbox per ratio
- "Select All" / "Select Portrait Only" / "Select Landscape Only"
- Selected ratios: "4 aspect ratios selected"

**Section 3 — Summary & Generate**:
- Matrix view: "3 assets × 4 ratios = 12 ad exports"
- Quality selector: 1K / 2K / 4K (with price indication)
- **Generate button**

**Section 4 — Results Matrix**:
- **Matrix/grid layout**: Rows = final assets, Columns = aspect ratios
- Each cell shows the generated export thumbnail
- Click to expand full-size
- Status per cell: generating / completed / failed / regenerate
- Checkbox per cell for selective saving
- Row actions: "Save entire row" | "Regenerate row"
- Column actions: "Save entire column"

**Section 5 — Action Bar**:
- "Save Selected" | "Save All"
- "Download Selected as ZIP" — packages selected exports for download
- "Export Metadata CSV" — export list with names, ratios, platforms, file paths

### Component: `src/components/ad-export/AdExportGallery.tsx`

Shows all saved ad exports:
- **Group by**: final asset, aspect ratio, or platform
- **Platform view**: "Instagram" shows all 9:16 + 4:5 + 1:1 exports together
- Each card:
  - Export thumbnail
  - Ratio badge
  - Platform pills
  - `@reference_id`
  - Download button
  - Delete button
- **Bulk download**: Select multiple → download as ZIP

### Sub-tabs: "Generate Exports" | "Export Gallery"

**Validation**:
- Source selection with filtering works
- Visual ratio selector shows proportional rectangles
- Matrix generation shows progress per cell
- Results display correctly in matrix view
- Can save individual cells, rows, columns, or all
- Gallery groups by asset, ratio, or platform
- Download as ZIP works

**🔒 COMMIT**: `git add . && git commit -m "feat: ad export workspace with matrix view and platform grouping"`

---

## Step 7.5 — Download & Delivery

**Action**: Build the download and delivery features.

### API: `src/app/api/export/download/route.ts`

**Download options**:
1. **Single file download**: Direct signed URL redirect
2. **Bulk ZIP download**: Server-side ZIP creation
   - Accept array of ad_export_ids
   - Fetch all files from storage
   - Create ZIP with organized folder structure:
     ```
     /greenworld-exports/
       /1x1/
         vitamin-d-hook-en-1x1.png
         vitamin-d-cta-de-1x1.png
       /9x16/
         vitamin-d-hook-en-9x16.png
       /16x9/
         ...
     ```
   - Return ZIP download link (store temporarily or stream)

### API: `src/app/api/export/metadata/route.ts`

Export metadata as CSV:
- Columns: filename, product, angle, background, copy_type, copy_text, language, aspect_ratio, platforms, storage_url
- Useful for uploading to ad platforms or tracking

### Component: `src/components/ad-export/DownloadManager.tsx`

- Download single file
- Download selected as ZIP
- Download all exports for a category as ZIP
- Export metadata CSV
- Copy public URLs (if user enables public sharing)

**Validation**: Single and bulk downloads work. ZIP has correct folder structure. CSV metadata is accurate.

**🔒 COMMIT**: `git add . && git commit -m "feat: download manager with ZIP packaging and CSV export"`

---

## Step 7.6 — Dashboard Overview Enhancement

**Action**: Now that all phases are complete, build a meaningful dashboard.

### Update: `src/app/(dashboard)/page.tsx`

Show:
- **Category overview cards**: Each category with pipeline progress (X of 8 steps completed)
- **Asset counts**: Total across all categories
  - Products: N
  - Angled shots: N
  - Backgrounds: N
  - Composites: N
  - Copy variations: N
  - Final assets: N
  - Ad exports: N
- **Recent activity**: Last 10 generations/uploads
- **Quick actions**: "Create Category", "Generate Ads", "Download Exports"
- **Pipeline visualization**: Visual flow diagram showing the 10-step process

**Validation**: Dashboard shows accurate counts and recent activity.

**🔒 COMMIT**: `git add . && git commit -m "feat: dashboard overview with pipeline stats"`

---

## Phase 7 Complete — Final Validation

Before declaring the project complete, verify the ENTIRE pipeline:
- [ ] Create category with look & feel ✓
- [ ] Upload brand assets (logos) globally ✓
- [ ] Upload product images ✓
- [ ] Generate angled shots with Nano Banana Pro ✓
- [ ] Generate backgrounds matching category style ✓
- [ ] Create product × background composites ✓
- [ ] Generate marketing copy in multiple languages ✓
- [ ] Upload design guidelines with element positions ✓
- [ ] Generate final assets (composite + copy + logo per guideline) ✓
- [ ] Export ads in multiple aspect ratios ✓
- [ ] Download individual or bulk (ZIP) ✓
- [ ] @ references work across all steps ✓
- [ ] All 8 storage buckets populated correctly ✓
- [ ] RLS enforced — users only see their own data ✓

**🏷️ TAG**: `git tag v1.0.0 -m "v1.0.0: AdForge complete — full AI ad creative pipeline" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint — FINAL

**Complete Project Context Snapshot**:
> AdForge v1.0.0 complete. Full AI ad creative pipeline:
> - Next.js 14 + TypeScript + Tailwind + shadcn/ui
> - Supabase: 12 tables, 8 storage buckets, RLS enabled
> - Nano Banana Pro (gemini-3-pro-image-preview) for all image generation/composition
> - Claude Sonnet 4.5 for marketing copy generation
> - 10-step pipeline: Category → Upload → Angles → Backgrounds → Composites → Copy → Guidelines → Final Assets → Ad Export → Download
> - @ reference system with searchable picker, grouped by asset type, cross-category + global
> - Batch generation with progress tracking
> - Text verification for AI-rendered text accuracy
> - Multi-aspect ratio export (1:1, 16:9, 9:16, 4:5, 5:4, 21:9, 9:21+)
> - ZIP download with organized folder structure
> - CSV metadata export

---

## 🚀 Post-v1.0 Enhancement Ideas (Future Phases)

If time allows, consider:
1. **A/B Test Tracker**: Track which ad variations perform best
2. **Platform API Integration**: Direct publish to Meta Ads, Google Ads, TikTok Ads
3. **Team Collaboration**: Multi-user workspace with roles
4. **Template Library**: Save and reuse successful guideline + copy combinations
5. **AI Performance Prediction**: Use historical data to predict which variations will perform
6. **Batch Scheduling**: Schedule large generation jobs off-peak
7. **Version History**: Track iterations and rollback
8. **Brand Voice Training**: Fine-tune copy generation to match brand voice
