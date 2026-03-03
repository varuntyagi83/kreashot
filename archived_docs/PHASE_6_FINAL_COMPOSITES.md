# Phase 6 — Final Composite Generation

> **Goal**: Combine composites (angled product + background) with copy text and logo, laid out according to guidelines, using Nano Banana Pro. This produces the fully composed creatives stored in `final_assets`. This covers pipeline Step 9.

---

## Prerequisites
- Phase 5 complete
- Composites exist in `angled_product_background` bucket
- Copy variations exist in `copy_docs`
- At least one guideline defined
- At least one logo in `brand_assets`

---

## Step 6.1 — Final Asset Generation API

**Action**: Build the API that creates final composed creatives.

### API: `src/app/api/generate/final-assets/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  mode: 'all_combinations' | 'selected'

  // For 'all_combinations': generates every composite × every copy
  // Filter options for all_combinations:
  copy_types_filter?: string[]   // Only use these copy types
  languages_filter?: string[]    // Only use these languages
  guideline_id: string           // Which guideline to apply
  logo_brand_asset_id: string    // Which logo to use

  // For 'selected' mode:
  selections?: {
    composite_id: string
    copy_doc_id: string
    guideline_id: string
    logo_brand_asset_id: string
  }[]
}
```

**Implementation per final asset**:

1. **Fetch all required assets**:
   - Composite image from `angled_product_background` → base64
   - Logo image from `brand_assets` → base64
   - Copy text from `copy_docs`
   - Guideline data from `guidelines` (element positions JSON)

2. **Build the Nano Banana Pro prompt with multi-image input + structured layout instructions**:

   ```
   Create a professional advertisement creative by composing the provided elements
   according to these EXACT layout specifications:

   LAYOUT RULES (positions as percentage of canvas):
   - Background/Product Image: Fill the entire canvas ({background.fill} mode)
   - Logo: Position at {logo.position} ({logo.x_pct}%, {logo.y_pct}%),
     max size {logo.max_width_pct}% × {logo.max_height_pct}% of canvas
   - Headline text: "{copy_text_if_headline}"
     Position: {headline.position} ({headline.x_pct}%, {headline.y_pct}%)
     Width: {headline.width_pct}% of canvas
     Font: Bold, size {headline.font_size_range.max}px equivalent
     Color: {headline.color}
     Alignment: {headline.alignment}
   - CTA text: "{copy_text_if_cta}"
     Position: {cta.position} ({cta.x_pct}%, {cta.y_pct}%)
     Background: {cta.bg_color}, text: {cta.text_color}
     Border radius: {cta.border_radius}px
   - Body text: "{copy_text_if_body}"
     Position: ({body_text.x_pct}%, {body_text.y_pct}%)
     Width: {body_text.width_pct}%
     Font size: {body_text.font_size}px equivalent
     Color: {body_text.color}

   SAFE ZONES — Do NOT place any element within:
   - Top {safe_zones.top_margin_pct}% margin
   - Bottom {safe_zones.bottom_margin_pct}% margin
   - Left {safe_zones.left_margin_pct}% margin
   - Right {safe_zones.right_margin_pct}% margin

   CRITICAL INSTRUCTIONS:
   - Image 1 is the product+background composite — use as the full background
   - Image 2 is the brand logo — place EXACTLY as specified above
   - Render ALL text EXACTLY as provided — do not change wording, spelling, or language
   - The text must be LEGIBLE and CORRECTLY SPELLED
   - This should look like a professional, polished advertisement
   - Follow the layout positions PRECISELY
   - Output at highest quality
   ```

3. **Call Nano Banana Pro with multi-image input**:
   ```typescript
   const result = await generateImage(prompt, [
     { data: compositeBase64, mimeType: 'image/png', role: 'background_base' },
     { data: logoBase64, mimeType: 'image/png', role: 'logo_overlay' }
   ])
   ```

4. **Return for preview** (don't save yet)

**Combination counting for `all_combinations` mode**:
- Total = composites × (filtered copy_docs) × 1 guideline × 1 logo
- Show warning if > 100: suggest filtering by copy type or language first

**Important**: Text rendering is Nano Banana Pro's strength. The prompt must include the EXACT text strings to render. For multi-language, the text from `copy_docs` includes the language-specific version.

**Response**:
```typescript
{
  total_combinations: number
  results: {
    composite_id: string
    copy_doc_id: string
    guideline_id: string
    logo_id: string
    image_base64: string
    prompt_used: string
    metadata: {
      copy_type: string
      language: string
      product_name: string
      background_name: string
    }
  }[]
}
```

**Validation**: Final assets render with correct text, logo placement, and layout.

**🔒 COMMIT**: `git add . && git commit -m "feat: final asset generation API with guideline-based layout"`

---

## Step 6.2 — Save Final Assets API

### API: `src/app/api/generate/final-assets/save/route.ts`

Standard save pattern:
1. Upload to `final-assets/{user_id}/{category_id}/{descriptive_name}.png`
2. Insert into `final_assets` table (linking composite_id, copy_doc_id, guideline_id)
3. Create `asset_references` entry:
   - Pattern: `@{category_slug}/final/{product}-{angle}-{bg}-{copy_type}-{lang}`
   - Example: `@greenworld/final/vitamin-d-left30-tropical-hook-en`

**🔒 COMMIT**: `git add . && git commit -m "feat: save final assets to storage"`

---

## Step 6.3 — Final Assets Workspace UI

**Action**: Build the Final Assets tab interface.

### Component: `src/components/final-assets/FinalAssetWorkspace.tsx`

**Layout**:

**Section 1 — Configuration Panel** (top):

Row 1 — **Asset Selection**:
- **Mode toggle**: "All Combinations" | "Select Specific"
- For "All Combinations":
  - **Guideline selector**: Dropdown of saved guidelines (with preview)
  - **Logo selector**: Dropdown of brand assets (with preview)
  - **Copy type filter**: Multi-select (hooks, CTAs, headlines, etc.)
  - **Language filter**: Multi-select
  - Combination counter: "This will generate {N} final assets"
- For "Select Specific":
  - **Composite picker**: Grid of composites with checkboxes
  - **Copy picker**: Searchable list with type/language filters + checkboxes
  - **Guideline selector**
  - **Logo selector**
  - Manual pairing interface

Row 2 — **Generate button** with estimated count and cost indication

**Section 2 — Generation Progress**:
- Shared `GenerationProgress` component
- Thumbnail grid that fills in as generations complete

**Section 3 — Results Gallery**:
- **Filter bar**: By product, angle, background, copy type, language
- **Grid view** of generated final assets:
  - Thumbnail (click to expand)
  - Metadata pills: product, angle, background, copy type, language
  - Checkbox for selection
  - "Regenerate" button
  - Side-by-side comparison view (compare two final assets)
- **Action bar**: "Save Selected" | "Save All" | "Discard"
- **Quality check**: Click any result to see a detailed view with:
  - Full-size image
  - Text legibility check (zoom into text areas)
  - Layout overlay showing guideline zones
  - Metadata (all source assets listed with @ references)

**Section 4 — Saved Final Assets Gallery**:
- Comprehensive gallery with advanced filtering
- Group by: product, language, copy type
- `@reference_ids` shown
- Bulk select + delete
- Export metadata as CSV

### Sub-tabs: "Generate" | "Final Assets Library"

**Validation**:
- Configuration panel correctly calculates combinations
- Batch generation with progress tracking
- Results show correct text, logo, layout
- Filter/search works across all dimensions
- Can compare two final assets side by side

**🔒 COMMIT**: `git add . && git commit -m "feat: final assets workspace with configuration and gallery"`

---

## Step 6.4 — Text Accuracy Verification

**Action**: Since AI-rendered text can occasionally have errors, add a verification step.

### Component: `src/components/final-assets/TextVerification.tsx`

For each generated final asset:
1. Show the generated image
2. Below it, show the EXPECTED text (from `copy_docs`)
3. User can:
   - ✅ Mark as "Text Correct"
   - ❌ Mark as "Text Incorrect" → queues for regeneration
   - 🔄 "Regenerate" — re-runs the generation for this specific asset

Add a `text_verified` boolean column to the `final_assets` table.

**Batch verification mode**: Show one asset at a time, swipe/arrow to next. Fast keyboard shortcuts: `y` for correct, `n` for incorrect, `r` for regenerate.

**Validation**: Can quickly verify text accuracy across multiple final assets.

**🔒 COMMIT**: `git add . && git commit -m "feat: text accuracy verification for final assets"`

---

## Phase 6 Complete — Final Validation

Before moving to Phase 7, verify:
- [ ] Final asset generation works with composite + logo + copy + guideline
- [ ] Nano Banana Pro renders text accurately (check multiple languages)
- [ ] Logo placed at correct position per guideline
- [ ] Text positioned per guideline element_positions
- [ ] All combinations mode generates correct count
- [ ] Selected mode allows manual pairing
- [ ] Batch generation with progress tracking
- [ ] Text verification workflow works
- [ ] Final assets saved with all relational FKs and @references
- [ ] Gallery with multi-dimensional filtering (product, angle, bg, copy type, language)

**🏷️ TAG**: `git tag v0.7.0 -m "Phase 6: Final composite generation" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 6 complete. Final asset generation combines composites + logo + copy text, laid out per guideline positions. Nano Banana Pro multi-image input with role assignments: composite as background_base, logo as logo_overlay. Guideline element_positions (percentages) translated into prompt instructions. Text rendered directly in image by Nano Banana Pro. Supports all-combinations and selected-pairs modes. Text verification workflow for quality checking. Final assets saved to `final-assets` bucket with full relational data. Six pipeline tabs active. Ready for Phase 7: Multi-aspect ratio ad export.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_7_AD_EXPORT.md"

---

## NEXT: Read `PHASE_7_AD_EXPORT.md`
