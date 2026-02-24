# Phase 5 — Guidelines Upload + @ Reference System Polish

> **Goal**: Build the guideline upload system where users upload design templates defining safe zones, element placement rules, and layout constraints. Also polish the @ reference system for seamless cross-step usage. This covers pipeline Step 8.

---

## Prerequisites
- Phase 4 complete
- Assets exist in multiple buckets for testing @ references

---

## Step 5.1 — Guideline Upload API

**Action**: Build the API for uploading and parsing design guidelines.

### API: `src/app/api/categories/[categoryId]/guidelines/route.ts`

**Request Body** (multipart/form-data):
```typescript
{
  name: string
  description: string
  file: File // Image (PNG/JPG) — the guideline template/wireframe
  safe_zones: string // JSON string defining safe zones
  element_positions: string // JSON string defining element positions
}
```

**The `safe_zones` structure**:
```typescript
{
  // Areas where content should NOT be placed (margins, bleed areas)
  top_margin_pct: number    // e.g., 5 (5% from top)
  bottom_margin_pct: number
  left_margin_pct: number
  right_margin_pct: number
  // Custom exclusion zones
  exclusion_zones: {
    name: string
    x_pct: number
    y_pct: number
    width_pct: number
    height_pct: number
  }[]
}
```

**The `element_positions` structure**:
```typescript
{
  logo: {
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'custom'
    x_pct?: number  // For custom position
    y_pct?: number
    max_width_pct: number  // Max width as % of canvas
    max_height_pct: number
  }
  product: {
    position: 'center' | 'left' | 'right' | 'custom'
    x_pct?: number
    y_pct?: number
    width_pct: number
    height_pct: number
  }
  headline: {
    position: 'top' | 'bottom' | 'center' | 'custom'
    x_pct?: number
    y_pct?: number
    width_pct: number
    font_size_range: { min: number, max: number }
    alignment: 'left' | 'center' | 'right'
    color: string // hex
  }
  cta: {
    position: 'bottom-center' | 'bottom-right' | 'custom'
    x_pct?: number
    y_pct?: number
    width_pct: number
    font_size_range: { min: number, max: number }
    bg_color?: string
    text_color?: string
    border_radius?: number
  }
  body_text: {
    position: 'custom'
    x_pct: number
    y_pct: number
    width_pct: number
    max_lines: number
    font_size: number
    color: string
    alignment: 'left' | 'center' | 'right'
  }
  background: {
    fill: 'cover' | 'contain' | 'stretch'
  }
}
```

**Implementation**:
1. Upload guideline image to `guidelines/{user_id}/{category_id}/{name}.png`
2. Parse the safe_zones and element_positions JSON
3. Insert into `guidelines` table with parsed JSONB fields
4. Create `asset_references` entry: `@{category_slug}/guideline/{slugified_name}`

**Validation**: Guideline uploaded with structured placement data.

**🔒 COMMIT**: `git add . && git commit -m "feat: guideline upload API with structured placement data"`

---

## Step 5.2 — Guideline Builder UI

**Action**: Build an interactive visual guideline editor.

### Component: `src/components/guidelines/GuidelineBuilder.tsx`

This is the key UX component. Rather than making users write JSON, provide a **visual editor**:

**Canvas Area** (center):
- Shows a blank canvas at a default aspect ratio (e.g., 1080×1080)
- Users can **drag and resize** elements on the canvas:
  - 📦 Product zone (blue dashed rectangle)
  - 🏷️ Logo zone (green dashed rectangle)
  - 📝 Headline zone (orange dashed rectangle)
  - 🔘 CTA zone (red dashed rectangle)
  - 📄 Body text zone (purple dashed rectangle)
  - ⚠️ Safe zone margins (gray overlay on edges)

**Element Panel** (right sidebar):
- When an element is selected on canvas, show its properties:
  - Position (x%, y%)
  - Size (width%, height%)
  - For text elements: font size range, color, alignment
  - For CTA: background color, text color, border radius
  - For logo: max dimensions
  - For background: fill mode

**Toolbar** (top):
- Aspect ratio selector (for previewing different formats)
- Grid/snap toggle
- Upload reference image (the visual guideline template) as canvas background
- Reset to defaults
- Save guideline

**Implementation approach**: Use HTML5 Canvas or a library like `react-konva` or `@dnd-kit` for drag-and-drop positioning. All positions stored as percentages (not pixels) so they scale across aspect ratios.

### Component: `src/components/guidelines/GuidelineUploader.tsx`

For users who prefer to upload a pre-made guideline image:
- File dropzone
- Name and description fields
- Manual entry of element positions (accordion form for each element)
- OR: "Use Visual Editor" button to switch to GuidelineBuilder

### Component: `src/components/guidelines/GuidelinePreview.tsx`

Preview a guideline applied to an existing composite:
- Select a composite from `angled_product_background`
- Select a copy from `copy_docs`
- Select a logo from `brand_assets`
- Show the guideline layout applied with these assets as a CSS mock-up

**Validation**: Can create guidelines visually or via upload. Preview shows correct element placement.

**🔒 COMMIT**: `git add . && git commit -m "feat: visual guideline builder with drag-and-drop layout editor"`

---

## Step 5.3 — Guidelines Gallery

### Component: `src/components/guidelines/GuidelineGallery.tsx`

- Grid of saved guidelines for the category
- Each card shows:
  - Guideline preview (the uploaded template image or a schematic view)
  - Name and description
  - `@reference_id`
  - Element count (which elements are defined)
  - Edit button (opens GuidelineBuilder with loaded data)
  - Delete button
  - Duplicate button (creates a copy for modification)

### Sub-tabs in Guidelines tab: "Create New" | "Saved Guidelines"

**Validation**: Can view, edit, duplicate, delete guidelines.

**🔒 COMMIT**: `git add . && git commit -m "feat: guidelines gallery with edit and duplicate"`

---

## Step 5.4 — @ Reference System Polish

**Action**: Now that all asset types exist, polish the @ reference system for seamless use.

### Enhance `AssetReferencePicker`:

1. **Category grouping**: Group results by asset type with section headers:
   ```
   🏷️ Brand Assets
     @global/logo/sunday-natural-primary
   📦 Products
     @greenworld/product/vitamin-d-front
   📐 Angled Shots
     @greenworld/angled/vitamin-d-left-30deg
   🖼️ Backgrounds
     @greenworld/bg/tropical-leaves-warm
   🎨 Composites
     @greenworld/composite/vitamin-d-left-30deg_tropical
   📝 Copy
     @greenworld/copy/hook-en-a3f2
   📏 Guidelines
     @greenworld/guideline/standard-layout-v1
   ```

2. **Thumbnail previews** in dropdown:
   - Images: show small thumbnail
   - Copy: show truncated text
   - Guidelines: show schematic icon

3. **Cross-category search**: When in a category, show that category's assets first, but allow searching global assets too.

4. **Recent references**: Show recently used references at the top of the dropdown.

5. **Reference resolution utility**:

Create `src/lib/utils/resolveReferences.ts`:
```typescript
/**
 * Given a text string containing @references, resolve all references
 * to their actual asset data (URLs, metadata, etc.)
 */
export async function resolveReferences(
  text: string,
  supabase: SupabaseClient
): Promise<{
  resolvedAssets: {
    reference_id: string
    asset_type: string
    storage_url: string
    metadata: any
  }[]
  cleanText: string // Text with @references stripped
}>
```

This utility will be critical for Phases 6 and 7 where @ references need to be resolved into actual image data for AI processing.

**Validation**: @ picker shows all asset types grouped. Recent references appear. Cross-category + global search works. Reference resolution utility returns correct data.

**🔒 COMMIT**: `git add . && git commit -m "feat: polished @ reference system with grouping, thumbnails, recents"`

---

## Phase 5 Complete — Final Validation

Before moving to Phase 6, verify:
- [ ] Can upload guideline images with structured element positions
- [ ] Visual guideline builder works with drag-and-drop
- [ ] All positions stored as percentages (scale-independent)
- [ ] Can preview guideline applied to composite + copy + logo
- [ ] Guidelines saved with `@reference_ids`
- [ ] @ reference picker shows all 7 asset types grouped
- [ ] @ reference resolution utility correctly fetches asset data
- [ ] Cross-category and global asset search works
- [ ] Recent references shown at top of picker

**🏷️ TAG**: `git tag v0.6.0 -m "Phase 5: Guidelines and @ reference system" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 5 complete. Guidelines system with visual drag-and-drop builder — element positions stored as percentages in JSONB (logo, product, headline, CTA, body text zones + safe zone margins). Can also upload guideline images directly. Guidelines saved to `guidelines` bucket. @ reference system fully polished — grouped by asset type, thumbnail previews, recent references, cross-category + global search. Reference resolution utility (`resolveReferences()`) extracts @ mentions from text and fetches actual asset URLs/data. Five pipeline tabs now active. Ready for Phase 6: Final composite generation combining composites + copy + guidelines.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_6_FINAL_COMPOSITES.md"

---

## NEXT: Read `PHASE_6_FINAL_COMPOSITES.md`
