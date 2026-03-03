# Phase 4 — AI Marketing Copy Generation

> **Goal**: Build the copy generation system where users provide a brief/description and Claude generates hundreds of variations — hooks, CTAs, headlines, body text — in multiple languages. This covers pipeline Step 7.

---

## Prerequisites
- Phase 3 complete
- Anthropic API key configured

---

## Step 4.1 — Copy Generation API

**Action**: Build the API for generating marketing copy with Claude Sonnet 4.5.

### API: `src/app/api/generate/copy/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  original_text: string       // User's input brief/description
  copy_types: ('hook' | 'cta' | 'body' | 'tagline' | 'headline')[]
  languages: string[]         // ISO 639-1 codes: ['en', 'de', 'fr', 'es', ...]
  variations_per_type: number // How many variations per type per language (e.g., 10)
  tone: string                // e.g., "professional", "casual", "urgent", "playful"
  reference_asset_ids?: string[] // Optional @ references for context
}
```

**Implementation**:

1. Fetch category info (name, description, look_and_feel) for context
2. If reference_asset_ids provided, fetch their metadata for context
3. Build Claude system prompt:
   ```
   You are an expert multilingual marketing copywriter. You create compelling
   advertising copy for product campaigns.

   BRAND CONTEXT:
   Category: {category.name}
   Description: {category.description}
   Brand Style: {category.look_and_feel}

   OUTPUT FORMAT:
   Return ONLY valid JSON with this structure:
   {
     "variations": [
       {
         "text": "the generated copy text",
         "copy_type": "hook|cta|body|tagline|headline",
         "language": "en|de|fr|es|...",
         "tone": "the tone used"
       }
     ]
   }
   ```
4. Build user prompt:
   ```
   Based on this brief: "{original_text}"

   Generate exactly {variations_per_type} variations for EACH of these types: {copy_types.join(', ')}
   In EACH of these languages: {languages.join(', ')}
   Tone: {tone}

   Total expected: {copy_types.length × languages.length × variations_per_type} variations.

   Rules:
   - Each variation must be unique and creative
   - Hooks should grab attention in the first 3 words
   - CTAs should create urgency or desire
   - Headlines should be punchy and memorable
   - Taglines should be brand-memorable
   - Body copy should be persuasive yet concise (max 2 sentences)
   - Translations must be culturally adapted, NOT literal translations
   - For German: use formal "Sie" form unless the brand is casual
   - Return ONLY the JSON, no markdown, no code fences
   ```
5. Call Claude API (may need multiple calls for large counts)
6. Parse JSON response
7. Return parsed variations

**Chunking Strategy**: If total variations > 50, split into multiple Claude calls:
- Batch by language: generate all types for one language per call
- Merge results

**Response**:
```typescript
{
  total_generated: number
  variations: {
    text: string
    copy_type: string
    language: string
    tone: string
  }[]
}
```

**Validation**: Generates expected count of variations. Translations are culturally adapted. JSON parsing succeeds.

**🔒 COMMIT**: `git add . && git commit -m "feat: AI copy generation API with Claude Sonnet 4.5"`

---

## Step 4.2 — Save Copy Docs API

### API: `src/app/api/generate/copy/save/route.ts`

**Request Body**:
```typescript
{
  category_id: string
  original_text: string
  variations: {
    text: string
    copy_type: string
    language: string
  }[]
}
```

**Implementation** for each variation:

1. Insert into `copy_docs` table
2. Create `asset_references` entry:
   - Pattern: `@{category_slug}/copy/{copy_type}-{language}-{short_hash}`
   - Example: `@greenworld/copy/hook-en-a3f2`, `@greenworld/copy/cta-de-b7c1`
3. Optionally save full batch as JSON to `copy-doc` bucket:
   - Path: `copy-doc/{user_id}/{category_id}/{timestamp}_batch.json`
   - Useful for backup/export

**Validation**: All variations saved to DB. References created.

**🔒 COMMIT**: `git add . && git commit -m "feat: save copy docs to database and storage"`

---

## Step 4.3 — Copy Generation UI

**Action**: Build the Copy tab interface.

### Component: `src/components/copy/CopyWorkspace.tsx`

**Layout**:

**Section 1 — Brief Input** (top):
- **Original text textarea** — Large input with `@` reference support
  - User can write: "Promote our new @greenworld/product/vitamin-d supplement for health-conscious consumers"
- **Copy type selector** (multi-select checkboxes):
  - ☑ Hooks
  - ☑ CTAs
  - ☑ Headlines
  - ☑ Taglines
  - ☑ Body Copy
- **Language selector** (multi-select with search):
  - Common: English, German, French, Spanish, Italian, Portuguese
  - Searchable for 50+ languages
  - Show flag emoji + language name
- **Variations per type**: Number input (default: 10, max: 50)
- **Tone selector** (single select):
  - Professional, Casual, Urgent, Playful, Luxury, Scientific, Friendly
- **Generate button**: Shows estimated count: "Will generate ~{N} variations"

**Section 2 — Results** (bottom):

**Tab view by copy type**: Hooks | CTAs | Headlines | Taglines | Body

Within each tab:
- **Filter by language** (dropdown or pills)
- **Table/list view**:
  - Copy text
  - Language flag
  - Copy type badge
  - Checkbox for selection
  - "Copy to clipboard" button
  - Star/favorite button (for marking best ones)
- **Bulk actions**:
  - "Save Selected" | "Save All" | "Discard"
  - "Export as CSV" (nice-to-have)

### Component: `src/components/copy/CopyLibrary.tsx`

Shows all **saved** copy for the category:
- Filter by: copy type, language, starred
- Search within text
- Bulk delete
- Shows `@reference_id` for each entry
- Click to copy text

### Sub-tabs: "Generate New" | "Copy Library"

**Validation**:
- Can set brief, types, languages, tone → generate
- Results display organized by type and language
- Can save selected or all
- Copy library shows all saved entries with search/filter
- @ references work in brief input

**🔒 COMMIT**: `git add . && git commit -m "feat: copy generation workspace with multi-language support"`

---

## Step 4.4 — Copy Preview in Context

**Action**: Add ability to preview copy text overlaid on a composite image.

### Component: `src/components/copy/CopyPreview.tsx`

A quick-preview feature:
1. User selects a copy variation from the library
2. Clicks "Preview on Image"
3. A modal opens with:
   - Dropdown to select a composite from `angled_product_background`
   - The composite image shown as background
   - The copy text overlaid on top (positioned center, with adjustable font size)
   - This is a CSS/canvas preview only — not an AI generation
4. Useful for quick validation before the final composite step (Phase 6)

**Validation**: Can preview copy text on any composite image in a modal.

**🔒 COMMIT**: `git add . && git commit -m "feat: copy preview on composite images"`

---

## Phase 4 Complete — Final Validation

Before moving to Phase 5, verify:
- [ ] Can input brief text with @ references
- [ ] Multi-type + multi-language generation works
- [ ] Claude generates culturally adapted translations (not literal)
- [ ] Large batches (100+ variations) handled via chunking
- [ ] Results organized by type and language
- [ ] Can save selected or all variations
- [ ] Copy library with search, filter, and `@reference_ids`
- [ ] Quick preview of copy on composite images
- [ ] Generation progress tracked in queue

**🏷️ TAG**: `git tag v0.5.0 -m "Phase 4: AI copy generation with multi-language" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 4 complete. Copy generation using Claude Sonnet 4.5. Users input brief + select copy types (hook, cta, headline, tagline, body) + select languages + set variations count + choose tone. Claude generates all variations in JSON format. Chunking for large batches (split by language). Results saved to `copy_docs` table with `@reference_ids`. Copy library with search/filter. Quick CSS preview of copy on composite images. Four pipeline tabs now active. Ready for Phase 5: Guideline upload + complete @ reference system.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_5_GUIDELINES_REFERENCES.md"

---

## NEXT: Read `PHASE_5_GUIDELINES_REFERENCES.md`
