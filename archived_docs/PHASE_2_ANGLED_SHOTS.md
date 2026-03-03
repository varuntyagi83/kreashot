# Phase 2 — AI Angled Shot Generation

> **Goal**: Allow users to select a product image and generate AI-powered angled variations using Nano Banana Pro. Users define angles, generate shots one product at a time, and save individually or in bulk. This covers pipeline Steps 3 and 4.

---

## Prerequisites
- Phase 1 complete
- Google Gemini API key configured
- At least one product with uploaded images exists for testing

---

## Step 2.1 — Angle Definition System

**Action**: Build the UI for defining angles per product.

### Component: `src/components/angled-shots/AngleDefiner.tsx`

This component lets the user define what angles they want for a product:

**Preset Angles** (quick-select):
- Front
- Back
- Left side (30°)
- Right side (30°)
- Top-down (45°)
- Three-quarter left
- Three-quarter right
- Bottom-up (low angle)

**Custom Angle** (user-defined):
- Angle name (text input)
- Description (text input for detailed prompt guidance)
- Camera distance: close-up, medium, wide

The component should output an array:
```typescript
interface AngleDefinition {
  name: string           // "left_30deg"
  display_name: string   // "Left Side, 30 Degrees"
  description: string    // "Product photographed from the left side at a 30-degree angle"
  camera_distance: 'close-up' | 'medium' | 'wide'
}
```

### Component: `src/components/angled-shots/ProductAngleSelector.tsx`

A two-panel layout:
- **Left panel**: List of products in the category. User selects one product.
- **Right panel**: Shows the selected product's images and the `AngleDefiner` below.

The user:
1. Selects a product
2. Selects a source image from that product's gallery (the image Nano Banana Pro will use as reference)
3. Defines desired angles
4. Clicks "Generate Angled Shots"

**Validation**: Can select product, pick source image, define angles (preset + custom). Data structure ready for API.

**🔒 COMMIT**: `git add . && git commit -m "feat: angle definition UI with presets and custom angles"`

---

## Step 2.2 — Nano Banana Pro Angled Shot Generation API

**Action**: Build the API endpoint that generates angled shots.

### API: `src/app/api/generate/angled-shots/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  product_id: string
  source_asset_id: string  // The product image to use as reference
  angles: AngleDefinition[]
}
```

**Implementation**:

For each angle in the array:

1. **Fetch the source image** from Supabase Storage → convert to base64
2. **Build the Nano Banana Pro prompt**:
   ```
   You are a professional product photographer. I'm providing a reference image of a product.
   Generate a studio-quality photograph of this EXACT same product from the following angle:

   Angle: {angle.display_name}
   Description: {angle.description}
   Camera distance: {angle.camera_distance}

   CRITICAL INSTRUCTIONS:
   - The product must look IDENTICAL to the reference image — same shape, color, texture, branding, labels
   - Only the camera angle/perspective should change
   - Use professional studio lighting that matches the new angle
   - White/neutral background
   - The product should be the clear focal point
   - Maintain the same scale and proportions
   - Do NOT add any elements not present in the original product
   ```
3. **Call Nano Banana Pro** with the source image as a reference input:
   ```typescript
   const result = await generateImage(prompt, [
     { data: sourceImageBase64, mimeType: 'image/png', role: 'reference_product' }
   ])
   ```
4. **Return the generated image** as base64 (don't save yet — user previews first)

**Response**:
```typescript
{
  results: {
    angle: AngleDefinition
    image_base64: string
    image_mime_type: string
    prompt_used: string
  }[]
}
```

**Important**: This endpoint generates but does NOT save. Saving is a separate action (Step 2.3) to let the user preview and cherry-pick.

**Error Handling**:
- If Nano Banana Pro fails for one angle, return partial results with error for that angle
- Rate limit awareness — add delays between sequential generations if needed
- Timeout: Set 60s per generation

**Validation**: POST to endpoint with valid data → get back generated images as base64.

**🔒 COMMIT**: `git add . && git commit -m "feat: Nano Banana Pro angled shot generation API"`

---

## Step 2.3 — Save Angled Shots API

**Action**: Build the endpoint to save generated shots (individual or bulk).

### API: `src/app/api/generate/angled-shots/save/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  product_id: string
  source_asset_id: string
  shots: {
    angle_name: string
    angle_description: string
    prompt_used: string
    image_base64: string
    image_mime_type: string
  }[]
}
```

**Implementation** for each shot:

1. Decode base64 → buffer
2. Upload to Supabase Storage: `angled-shots/{user_id}/{category_id}/{product_id}/{angle_name}.png`
3. Get signed URL
4. Insert into `angled_shots` table
5. Create `asset_references` entry: `@{category_slug}/angled/{product_slug}-{angle_name}`
6. Return created records

**Validation**: Saved shots appear in Storage bucket and database. `asset_references` created.

**🔒 COMMIT**: `git add . && git commit -m "feat: save angled shots to Supabase Storage"`

---

## Step 2.4 — Angled Shots UI

**Action**: Build the complete angled shots tab interface.

### Component: `src/components/angled-shots/AngledShotsWorkspace.tsx`

**Layout** (three sections):

**Section 1 — Product & Source Selection** (top):
- Dropdown to select product
- Thumbnail strip of product's images — click to select as source
- Selected source image shown prominently

**Section 2 — Generation Controls** (middle):
- `AngleDefiner` component from Step 2.1
- "Generate" button (shows loading state per angle)
- Progress indicator: "Generating 3 of 5 angles..."

**Section 3 — Results Gallery** (bottom):
- Grid showing generated angle shots
- Each card shows:
  - Generated image thumbnail
  - Angle name
  - Checkbox for selection
  - "Regenerate" button (re-runs just this angle)
  - Quality rating (optional: thumbs up/down)
- **Action bar** at bottom:
  - "Save Selected" button (saves only checked images)
  - "Save All" button (saves everything)
  - "Discard All" button

### Component: `src/components/angled-shots/AngledShotGallery.tsx`

Shows all **saved** angled shots for the category:
- Filter by product
- Grid view with `@reference_id` shown below each
- Click to expand/preview
- Delete button per shot
- Bulk select + delete

### Wire up the "Angled Shots" tab in the category detail page to render `AngledShotsWorkspace` (for generation) and `AngledShotGallery` (for viewing saved).

Use sub-tabs or a toggle: "Generate New" | "View Saved"

**Validation**:
- Select product → select source image → define angles → generate → preview results
- Can save individual shots or all at once
- Saved shots appear in gallery with `@reference_ids`
- Can delete saved shots
- Can regenerate a single angle without regenerating all

**🔒 COMMIT**: `git add . && git commit -m "feat: complete angled shots workspace with generation and gallery"`

---

## Step 2.5 — Generation Queue & Status

**Action**: Add a simple job queue for tracking generation progress.

Since generating multiple angles takes time (10-15s each), implement:

### Client-side queue in Zustand store:

Add to store:
```typescript
interface GenerationJob {
  id: string
  type: 'angled_shot' | 'background' | 'composite' | 'final_asset' | 'ad_export'
  status: 'pending' | 'generating' | 'completed' | 'failed'
  progress: number // 0-100
  result?: any
  error?: string
}

// In store:
generationJobs: GenerationJob[]
addJob: (job: GenerationJob) => void
updateJob: (id: string, update: Partial<GenerationJob>) => void
```

### Component: `src/components/shared/GenerationProgress.tsx`

A floating bottom-right panel showing active generations:
- Job type icon
- Progress bar
- Status text
- Cancel button (for pending jobs)
- Click to navigate to results when done

This component will be reused across all generation phases.

**Validation**: Generation shows progress. Multiple angles queue and process sequentially.

**🔒 COMMIT**: `git add . && git commit -m "feat: generation queue with progress tracking"`

---

## Phase 2 Complete — Final Validation

Before moving to Phase 3, verify:
- [ ] Can select product and source image
- [ ] Can define preset and custom angles
- [ ] Nano Banana Pro generates angle variations from source image
- [ ] Generated images are previewed before saving
- [ ] Can save individual or all shots to `angled-shots` bucket
- [ ] Saved shots have `@reference_id` in `asset_references` table
- [ ] Gallery shows all saved angled shots with filtering
- [ ] Can regenerate individual angles
- [ ] Generation progress visible in floating panel

**🏷️ TAG**: `git tag v0.3.0 -m "Phase 2: AI angled shot generation" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 2 complete. Angled shot generation working with Nano Banana Pro. Users select product + source image, define angles (presets + custom), generate with AI. Preview before save. Individual or bulk save to `angled-shots` bucket. All shots registered in `asset_references`. Gallery view with filter by product. Generation queue with progress tracking (reusable component). The `generateImage()` utility in `src/lib/ai/gemini.ts` accepts reference images with role assignments. Ready for Phase 3: AI background generation + product×background compositing.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_3_BACKGROUNDS_COMPOSITES.md"

---

## NEXT: Read `PHASE_3_BACKGROUNDS_COMPOSITES.md`
