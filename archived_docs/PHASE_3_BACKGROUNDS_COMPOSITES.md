# Phase 3 — AI Background Generation + Product×Background Composites

> **Goal**: Generate AI backgrounds matching the category's look & feel, then create all possible combinations of angled shots × backgrounds using Nano Banana Pro's multi-image composition. This covers pipeline Steps 5 and 6.

---

## Prerequisites
- Phase 2 complete
- At least a few angled shots saved in `angled-shots` bucket
- Category has a `look_and_feel` description

---

## Step 3.1 — Background Generation API

**Action**: Build the API for generating backgrounds using Nano Banana Pro.

### API: `src/app/api/generate/backgrounds/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  prompt: string              // User's text prompt for the background
  count: number               // How many variations to generate (1-5 per request)
  reference_asset_ids?: string[] // Optional @ references for style guidance
}
```

**Implementation**:

1. Fetch the category's `look_and_feel` from DB
2. If `reference_asset_ids` are provided, fetch those images from storage → base64
3. Build the Nano Banana Pro prompt:
   ```
   Generate a high-quality product photography background with the following characteristics:

   Category Style: {category.look_and_feel}
   User Request: {prompt}

   CRITICAL INSTRUCTIONS:
   - This is ONLY a background — no products, no text, no logos
   - The background should complement a product that will be composited on top later
   - Leave clear space in the center/foreground for a product to be placed
   - Match the lighting style to the category aesthetic
   - Professional, studio-quality output
   - Resolution: High quality, suitable for 4K output
   ```
4. If reference images provided, include them with role: `style_reference`
5. Generate `count` variations (sequential calls)
6. Return generated images as base64 for preview

**Response**:
```typescript
{
  results: {
    image_base64: string
    image_mime_type: string
    prompt_used: string
  }[]
}
```

**Validation**: Generates backgrounds that match the category's look & feel.

**🔒 COMMIT**: `git add . && git commit -m "feat: AI background generation API with Nano Banana Pro"`

---

## Step 3.2 — Save Backgrounds API

### API: `src/app/api/generate/backgrounds/save/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  backgrounds: {
    name: string
    prompt_used: string
    image_base64: string
    image_mime_type: string
  }[]
}
```

**Implementation** for each background:

1. Decode base64 → buffer
2. Upload to Supabase Storage: `backgrounds/{user_id}/{category_id}/{slugified_name}.png`
3. Get signed URL
4. Insert into `backgrounds` table
5. Create `asset_references` entry: `@{category_slug}/bg/{slugified_name}`

**Validation**: Backgrounds saved to bucket and registered in references.

**🔒 COMMIT**: `git add . && git commit -m "feat: save backgrounds to Supabase Storage"`

---

## Step 3.3 — Background Generation UI

**Action**: Build the Backgrounds tab interface.

### Component: `src/components/backgrounds/BackgroundWorkspace.tsx`

**Layout**:

**Section 1 — Generation Controls** (top):
- **Prompt textarea** with `@` reference support (AssetReferencePicker)
  - User can type: "A warm tropical setting with @greenworld/product/vitamin-d-front visible style"
  - Referenced assets are extracted and sent as style references
- **Category look & feel** displayed as context reminder
- **Count selector**: How many variations (1-5)
- **Generate button**

**Section 2 — Preview Gallery** (middle):
- Generated backgrounds shown in grid
- Each card:
  - Background thumbnail
  - Naming input field (user names it before saving)
  - Checkbox for selection
  - "Regenerate" button
- **Action bar**: "Save Selected" | "Save All" | "Discard"

**Section 3 — Saved Backgrounds Gallery** (bottom):
- Grid of all saved backgrounds for this category
- Shows `@reference_id` below each
- Delete, preview expand

### Sub-tabs: "Generate New" | "Saved Backgrounds"

**Validation**: Can generate backgrounds with prompts, preview, name, and save. @ references work in prompt field.

**🔒 COMMIT**: `git add . && git commit -m "feat: background generation workspace with @ references"`

---

## Step 3.4 — Product × Background Composite Generation API

**Action**: This is the first "variation" step — combine every angled shot with every background.

### API: `src/app/api/generate/composites/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  mode: 'all_combinations' | 'selected'
  // For 'selected' mode:
  pairs?: {
    angled_shot_id: string
    background_id: string
  }[]
}
```

**Implementation**:

For `all_combinations` mode:
1. Fetch all angled shots for the category from DB
2. Fetch all backgrounds for the category from DB
3. Generate cartesian product of pairs
4. For each pair, call the composite generation

For `selected` mode:
1. Use only the specified pairs

**Composite generation per pair**:
1. Fetch angled shot image from storage → base64
2. Fetch background image from storage → base64
3. Build Nano Banana Pro prompt with multi-image input:
   ```
   Compose these two images into a single professional product photograph:

   Image 1 (role: product/subject): This is the product. Place it naturally in the scene.
   Image 2 (role: background/scene): This is the background scene.

   CRITICAL INSTRUCTIONS:
   - Place the product NATURALLY in the background scene
   - Match the product's lighting to the background's lighting
   - The product should look like it was photographed IN that background, not pasted on
   - Maintain the EXACT appearance of the product — same shape, color, labels, branding
   - Scale the product appropriately for the scene
   - Add natural shadows and reflections where appropriate
   - Do NOT alter the product in any way
   - Do NOT add text, logos, or watermarks
   - Professional, advertisement-quality output
   ```
4. Call Nano Banana Pro with both images as reference inputs:
   ```typescript
   const result = await generateImage(prompt, [
     { data: angledShotBase64, mimeType: 'image/png', role: 'product_subject' },
     { data: backgroundBase64, mimeType: 'image/png', role: 'background_scene' }
   ])
   ```
5. Return generated composite for preview

**Important**: For `all_combinations` mode, this could be a LOT of images. Implement:
- Return total count first and ask for confirmation
- Process in batches of 5
- Use the generation queue from Phase 2
- Allow cancellation mid-batch

**Response**:
```typescript
{
  total_combinations: number
  results: {
    angled_shot_id: string
    background_id: string
    image_base64: string
    prompt_used: string
  }[]
}
```

**Validation**: Composites look natural — product placed realistically in background.

**🔒 COMMIT**: `git add . && git commit -m "feat: product×background composite generation with Nano Banana Pro"`

---

## Step 3.5 — Save Composites API

### API: `src/app/api/generate/composites/save/route.ts`

Same pattern as before:
1. Upload to `angled-product-background/{user_id}/{category_id}/{composite_name}.png`
2. Insert into `composites` table (linking angled_shot_id + background_id)
3. Create `asset_references` entry: `@{category_slug}/composite/{product_slug}-{angle}-{bg_name}`

**🔒 COMMIT**: `git add . && git commit -m "feat: save composites to Supabase Storage"`

---

## Step 3.6 — Composites UI

**Action**: Build the Composites tab interface.

### Component: `src/components/composites/CompositeWorkspace.tsx`

**Layout**:

**Section 1 — Combination Builder** (top):
- **Mode toggle**: "All Combinations" | "Select Pairs"
- For "All Combinations":
  - Shows count: "This will generate {X} angled shots × {Y} backgrounds = {X×Y} composites"
  - Warning if count > 50: "This will generate a large number of images. Consider selecting specific pairs."
  - "Generate All" button
- For "Select Pairs":
  - Two-column selector:
    - Left: Angled shots grid (multi-select with checkboxes)
    - Right: Backgrounds grid (multi-select with checkboxes)
  - Shows: "Selected: {X} shots × {Y} backgrounds = {X×Y} composites"
  - "Generate Selected" button

**Section 2 — Generation Progress**:
- Uses the shared `GenerationProgress` component
- Shows: "Generating composite 7 of 24..."
- Each completed composite appears in the preview grid below

**Section 3 — Preview & Save**:
- Grid of generated composites
- Each card shows:
  - Composite thumbnail
  - Source shot name + background name
  - Checkbox for selection
  - "Regenerate" button
- **Action bar**: "Save Selected" | "Save All" | "Discard"

**Section 4 — Saved Composites Gallery**:
- Grid with filter by product, by background, or by angle
- `@reference_id` shown below each
- Bulk operations: select all, delete selected

### Sub-tabs: "Generate" | "Saved Composites"

**Validation**:
- All combinations mode generates correct cartesian product
- Selected pairs mode works
- Large batches show progress and allow cancellation
- Composites saved with correct references

**🔒 COMMIT**: `git add . && git commit -m "feat: composite workspace with combination builder"`

---

## Phase 3 Complete — Final Validation

Before moving to Phase 4, verify:
- [ ] Can generate backgrounds from text prompts with category style
- [ ] @ references in prompt field pull style from referenced images
- [ ] Backgrounds saved to `backgrounds` bucket with references
- [ ] Composite generation works with both all-combinations and selected-pairs modes
- [ ] Nano Banana Pro composes product onto background naturally (check lighting/shadows)
- [ ] Large batch generation shows progress and supports cancellation
- [ ] Composites saved to `angled-product-background` bucket
- [ ] All references created in `asset_references` table
- [ ] Gallery views with filtering work for both backgrounds and composites

**🏷️ TAG**: `git tag v0.4.0 -m "Phase 3: Backgrounds and composites" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 3 complete. Background generation with Nano Banana Pro using category look_and_feel + user prompts + optional @ style references. Composite generation combines angled shots × backgrounds — supports all-combinations (cartesian) and selected-pairs modes. Multi-image input to Nano Banana Pro with role assignments (product_subject, background_scene). Batch processing with progress tracking. All outputs saved to respective buckets with asset_references. Three pipeline tabs now active: Assets, Angled Shots, Backgrounds/Composites. Ready for Phase 4: AI copy/text generation with Claude.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_4_COPY_GENERATION.md"

---

## NEXT: Read `PHASE_4_COPY_GENERATION.md`
