# Template System - Current Status

## ✅ Completed (This Session)

### 1. Backend API Routes
- ✅ `GET /api/categories/[id]/templates` - List templates
- ✅ `POST /api/categories/[id]/templates` - Create template
- ✅ `GET /api/categories/[id]/templates/[templateId]` - Get single template
- ✅ `PUT /api/categories/[id]/templates/[templateId]` - Update template
- ✅ `DELETE /api/categories/[id]/templates/[templateId]` - Delete template

### 2. TypeScript Types
- ✅ Created `src/types/templates.ts` with complete type definitions:
  - LayerType, LayerPosition
  - BackgroundLayer, ProductLayer, TextLayer, LogoLayer
  - TemplateData, Template
  - SafeZone

### 3. Database Schema
- ✅ Already exists from previous migrations
- ✅ `templates` table with multi-format support
- ✅ `format_configs` table with 4 standard formats (1:1, 9:16, 16:9, 4:5)
- ✅ Unique constraint: one template per (category, format)

## 🚧 Next Steps (In Order)

### Step 1: Create Templates Page Route
**File:** `src/app/(dashboard)/categories/[id]/templates/page.tsx`
**Purpose:** Main page to view and manage templates for a category
**Time:** 15 min

### Step 2: Build TemplateList Component
**File:** `src/components/templates/TemplateList.tsx`
**Purpose:** Grid view of all templates with format filters
**Features:**
- Format tabs (1:1, 9:16, 16:9, 4:5)
- Template cards with preview
- Create new template button
**Time:** 30 min

### Step 3: Build CreateTemplateDialog
**File:** `src/components/templates/CreateTemplateDialog.tsx`
**Purpose:** Modal to create new template
**Features:**
- Name input
- Description textarea
- Format selector (radio group)
- Creates template with default template_data
**Time:** 20 min

### Step 4: Build Simple Template Builder
**File:** `src/components/templates/TemplateBuilder.tsx`
**Purpose:** Visual canvas to edit template layers
**Features (MVP):**
- Canvas with aspect ratio
- Layer list (text only, no drag-drop yet)
- Simple property editor (position inputs)
- Save button
**Time:** 1-2 hours

### Step 5: Update Navigation
**Purpose:** Add "Templates" tab to category page
**Files:**
- `src/app/(dashboard)/categories/[id]/layout.tsx` or navigation component
**Time:** 10 min

## 📋 Implementation Priority

**OPTION A: Quick & Simple (Recommended for now)**
- Build Steps 1-3 only (page + list + create dialog)
- Skip visual builder for now
- Use simple JSON editor for template_data
- **Time: ~1 hour**
- **Result:** Can create and list templates, ready to use in composites

**OPTION B: Full Visual Editor**
- Build Steps 1-5 completely
- Full react-konva canvas with drag-drop
- **Time: ~3-4 hours**
- **Result:** Complete visual template editor

## 🎯 Recommended: Start with Option A

Why?
1. Gets templates working end-to-end quickly
2. Can start building composites that USE templates
3. Visual editor is nice-to-have, not blocking
4. Can add visual editor later after testing template flow

## 💻 Tech Stack Being Used

- **UI:** shadcn/ui (radix-ui components) + Tailwind CSS
- **Icons:** lucide-react
- **Toasts:** sonner
- **Canvas:** react-konva (for future visual editor)
- **State:** Zustand (if needed)

## 📝 Default Template Data

Default template_data for each format is already defined in `src/types/templates.ts` (see DEFAULT_TEMPLATE_DATA)

## 🔗 Current Flow

```
Category → Product Images → Angled Shots (multi-format) → Backgrounds (multi-format) → Templates (multi-format) [NEW]
```

After Templates:
```
→ Composites (uses templates) → Copy Docs → Final Assets
```

## ⚡ Quick Start Commands

```bash
# If ready to build UI components
npm run dev

# Components to create (in order):
# 1. src/app/(dashboard)/categories/[id]/templates/page.tsx
# 2. src/components/templates/TemplateList.tsx
# 3. src/components/templates/CreateTemplateDialog.tsx
```

## 🔍 Testing Checklist

After building Option A:
- [ ] Navigate to /categories/[id]/templates
- [ ] See empty state with "Create Template" button
- [ ] Click create, select format, enter name
- [ ] Template created and appears in list
- [ ] Can switch between format tabs
- [ ] Can view template details
- [ ] Can delete template

## 📌 Key Decisions Made

1. **Template per format:** Each category can have ONE template per format (enforced by DB)
2. **Percentages for positions:** All layer positions stored as percentages (0-100) for scale-independence
3. **JSONB storage:** template_data stored as JSONB in database for flexibility
4. **Default templates:** System provides sensible defaults for each format

## 🎨 Default Template Structure Example (1:1)

```json
{
  "version": "1.0",
  "layers": [
    {"id": "bg", "type": "background", ...},
    {"id": "product", "type": "product", "position": {"x": 35, "y": 45, "width": 30, "height": 40}},
    {"id": "headline", "type": "text", "textType": "headline", "maxChars": 40, ...},
    {"id": "cta", "type": "text", "textType": "cta", "maxChars": 20, ...},
    {"id": "logo", "type": "logo", "corner": "top-left", ...}
  ],
  "safeZones": [
    {"id": "margin", "name": "Safe Margin", "position": {"x": 5, "y": 5, "width": 90, "height": 90"}}
  ]
}
```

