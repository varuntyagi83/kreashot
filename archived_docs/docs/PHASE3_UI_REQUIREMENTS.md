# Phase 3 UI Requirements - Background & Composite Generation

## Overview
This document defines the UI requirements for Phase 3: Background Generation and Composite Creation.

---

## 3.1 Background Generation UI

### Location
- New page/tab within category workspace: `/categories/{slug}/backgrounds`
- Accessible from category navigation sidebar

### Key Components

#### 1. Look & Feel Input (CRITICAL REQUIREMENT)
**Purpose:** Allow users to define or override the category's look and feel for background generation

**UI Elements:**
- **Label:** "Look & Feel / Style Direction"
- **Input Type:** Textarea (multi-line)
- **Default Value:** Pre-populated with category's `look_and_feel` field from database
- **Placeholder:** "Describe the visual style, mood, colors, and aesthetic for backgrounds (e.g., 'Fresh, organic, green aesthetic with natural lighting')"
- **Character Limit:** 500 characters
- **Validation:** Optional but recommended (shows warning if empty)
- **Persistence:**
  - Save to category's `look_and_feel` field when user updates it
  - Used in Gemini AI prompt for background generation

**Example Values:**
- "Fresh, organic, green trees and green leaves"
- "Modern, clean product photography with warm tones"
- "Minimalist, high-contrast black and white aesthetic"
- "Vibrant, energetic colors with motion blur effects"

#### 2. User Prompt Input
**Purpose:** Specific request for this background generation

**UI Elements:**
- **Label:** "Background Description"
- **Input Type:** Textarea
- **Placeholder:** "Describe the specific background you want (e.g., 'Hand in front of multiple shades of green mood boxes')"
- **Character Limit:** 300 characters
- **Required:** Yes

#### 3. Background Count Selector
**UI Elements:**
- **Label:** "Number of Variations"
- **Input Type:** Number selector or slider
- **Range:** 1-4 backgrounds per generation
- **Default:** 1
- **Info Tooltip:** "Generate multiple variations to choose from. Each generation uses AI credits."

#### 4. Style Reference Images (Optional)
**Purpose:** Upload reference images to guide the visual style

**UI Elements:**
- **Label:** "Style References (Optional)"
- **Input Type:** File upload (drag-and-drop area)
- **Accepted Formats:** JPG, PNG, WEBP
- **Max Files:** 3 images
- **Max Size:** 5MB per image
- **Preview:** Thumbnail grid of uploaded references
- **Usage:** Passed to Gemini AI as style guidance

#### 5. Generate Button
**UI Elements:**
- **Label:** "Generate Backgrounds"
- **State:**
  - Disabled if user prompt is empty
  - Loading state during generation
  - Shows progress: "Generating 1 of 3..."
- **Action:** Calls `POST /api/categories/{id}/backgrounds/generate`

#### 6. Preview Grid
**Purpose:** Display generated backgrounds before saving

**UI Elements:**
- **Layout:** Grid of generated backgrounds (2-4 columns)
- **Each Background Card:**
  - Full preview image
  - "Save" button
  - "Discard" button
  - Download icon (download without saving)
  - Prompt used (collapsible)
- **Batch Actions:**
  - "Save All" button
  - "Discard All" button

#### 7. Saved Backgrounds Gallery
**Purpose:** Display all saved backgrounds for this category

**UI Elements:**
- **Layout:** Masonry or grid layout
- **Each Background Card:**
  - Thumbnail image
  - Name (editable)
  - Description (from prompt)
  - Created date
  - Actions dropdown:
    - Edit name/description
    - Download
    - Delete (with confirmation)
- **Filters:**
  - Sort by: Date (newest/oldest), Name
  - Search by name/description
- **Empty State:**
  - Message: "No backgrounds yet. Generate your first background above!"
  - Icon: Image placeholder

### Data Flow

```
User Input (Look & Feel + Prompt + Count)
    ↓
Generate Button Click
    ↓
POST /api/categories/{id}/backgrounds/generate
    ↓
Gemini AI generates backgrounds
    ↓
Preview Grid shows generated images
    ↓
User clicks "Save" on selected backgrounds
    ↓
POST /api/categories/{id}/backgrounds (for each)
    ↓
Upload to Google Drive: {category-slug}/backgrounds/
    ↓
Save metadata to Supabase backgrounds table
    ↓
Refresh Saved Backgrounds Gallery
```

### API Integration

**Generate Backgrounds:**
```typescript
POST /api/categories/{id}/backgrounds/generate
Body: {
  userPrompt: string
  lookAndFeel: string  // From category or user override
  count: number
  styleReferenceImages?: Array<{ data: string, mimeType: string }>
}
Response: {
  backgrounds: Array<{
    promptUsed: string
    imageData: string  // base64
    mimeType: string
  }>
}
```

**Save Background:**
```typescript
POST /api/categories/{id}/backgrounds
Body: {
  name: string
  slug: string
  description: string
  prompt_used: string
  imageData: string  // base64
  mimeType: string
}
Response: {
  background: {
    id: string
    name: string
    storage_path: string
    storage_url: string
    gdrive_file_id: string
    created_at: string
  }
}
```

**List Backgrounds:**
```typescript
GET /api/categories/{id}/backgrounds
Response: {
  backgrounds: Array<{
    id: string
    name: string
    slug: string
    description: string
    storage_url: string
    created_at: string
  }>
}
```

**Delete Background:**
```typescript
DELETE /api/categories/{id}/backgrounds/{backgroundId}
```

### Visual Design Notes

- **Color Scheme:** Match existing AdForge UI (shadcn/ui theme)
- **Typography:** Clear hierarchy - large input labels, readable help text
- **Spacing:** Generous whitespace between sections
- **Feedback:** Loading states, success toasts, error messages
- **Responsive:** Mobile-friendly (stack inputs vertically on mobile)

### Validation & Error Handling

1. **Empty User Prompt:** Show inline error "Please describe the background you want"
2. **Empty Look & Feel:** Show warning "Adding a look & feel helps generate better backgrounds"
3. **Generation Failure:** Show error toast with retry button
4. **Save Failure:** Show error toast with details
5. **Network Errors:** Show retry option

### Accessibility

- All inputs have proper labels
- Keyboard navigation support
- ARIA labels for icon buttons
- Alt text for generated images
- Focus management after generation completes

---

## 3.2 Composite Creation UI

### Location
- New page/tab within category workspace: `/categories/{slug}/composites`

### Key Components

#### 1. Angled Shot Selection
- Grid of all angled shots for products in this category
- Multi-select or single-select mode
- Filter by product
- Preview on hover

#### 2. Background Selection
- Grid of all backgrounds for this category
- Single-select (one background at a time)
- Preview on hover
- Link to generate more backgrounds

#### 3. Generate Button
- Disabled until both angled shot and background are selected
- Shows loading state during compositing
- Calls `POST /api/categories/{id}/composites/generate`

#### 4. Preview & Save
- Preview of generated composite
- Save button to persist to Google Drive
- Multiple composites grid if generating batch

#### 5. Saved Composites Gallery
- Similar to backgrounds gallery
- Shows angled shot + background used
- Download and delete actions

---

## Implementation Priority

1. ✅ Backend APIs (completed)
2. **Next:** Background Generation UI with Look & Feel input
3. **Then:** Composites UI
4. **Finally:** Polish and optimization

---

## Critical Reminder

**LOOK & FEEL INPUT IS MANDATORY** in the Background Generation UI. This field:
- Drives the AI generation quality
- Ensures brand consistency across backgrounds
- Pulls from category's `look_and_feel` database field
- Can be overridden per generation
- Should be saved back to category when updated

Without this input, backgrounds will be generic and won't match the category's aesthetic.
