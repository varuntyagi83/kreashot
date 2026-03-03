# Template/Safe Zones Implementation Plan

## Current Status
- ✅ Database schema ready (`templates` table with multi-format support)
- ✅ Basic GET/POST API routes exist
- ❌ UPDATE/DELETE routes needed
- ❌ UI components need to be built
- ❌ Template builder interface needed

## Implementation Steps

### 1. Complete API Routes (30 min)

**Files to create/update:**
- `src/app/api/categories/[id]/templates/[templateId]/route.ts` - GET, PUT, DELETE for single template
- Test routes with Postman/curl

### 2. Template Data Structure (Define the Schema)

```typescript
interface TemplateData {
  layers: TemplateLayer[]
  safeZones: SafeZone[]
}

interface TemplateLayer {
  id: string
  type: 'background' | 'product' | 'text' | 'logo'
  name: string
  zIndex: number
  position: {
    x: number      // Percentage from left (0-100)
    y: number      // Percentage from top (0-100)
    width: number  // Percentage of canvas width
    height: number // Percentage of canvas height
  }
  // Text-specific
  maxChars?: number
  fontSize?: number
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  
  // Logo-specific
  padding?: number
  maxWidth?: number
  maxHeight?: number
}

interface SafeZone {
  id: string
  name: string
  x: number      // Percentage
  y: number      // Percentage
  width: number  // Percentage
  height: number // Percentage
  type: 'exclude' | 'margin'
}
```

### 3. UI Components (2-3 hours)

**Component Structure:**
```
/src/components/templates/
  ├── TemplateList.tsx          - Grid of templates per format
  ├── TemplateCard.tsx          - Template preview card
  ├── CreateTemplateDialog.tsx  - Modal to create new template
  ├── TemplateBuilder.tsx       - Main visual editor (COMPLEX)
  │   ├── Canvas.tsx            - Drag-drop canvas
  │   ├── LayerPanel.tsx        - Layer list with z-index controls
  │   ├── PropertyPanel.tsx     - Edit selected layer properties
  │   └── FormatSelector.tsx    - Switch between formats
  └── TemplatePreview.tsx       - Preview template with sample data
```

### 4. Template Builder Features

**MVP Features:**
- [x] Canvas with aspect ratio visualization
- [x] Drag & drop layer positioning
- [x] Resize layers
- [x] Layer list (reorder z-index)
- [x] Property editor (position %, colors, fonts)
- [x] Add/remove layers
- [x] Save template

**Nice-to-have (Phase 2):**
- [ ] Snap to grid
- [ ] Alignment guides
- [ ] Copy/paste layers
- [ ] Template presets
- [ ] Preview with actual product/copy
- [ ] Export as image template

### 5. Default Templates

Create 4 default templates (one per format):

**1:1 (Instagram Square)**
```json
{
  "layers": [
    {"type": "background", "zIndex": 0},
    {"type": "product", "zIndex": 1, "position": {"x": 50, "y": 60, "width": 50, "height": 50}},
    {"type": "text", "name": "headline", "zIndex": 2, "position": {"x": 10, "y": 10, "width": 80, "height": 15}, "maxChars": 40},
    {"type": "text", "name": "cta", "zIndex": 3, "position": {"x": 30, "y": 85, "width": 40, "height": 10}, "maxChars": 20},
    {"type": "logo", "zIndex": 4, "position": {"x": 5, "y": 5, "width": 15, "height": 15}}
  ]
}
```

**9:16 (Stories)**
**16:9 (Landscape)**
**4:5 (Portrait Feed)**

### 6. Integration with Existing Flow

**Update these pages:**
- `/categories/[id]` - Add "Templates" tab
- `/categories/[id]/templates` - Template management page
- `/categories/[id]/templates/new` - Template builder

**Navigation Flow:**
```
Categories → 
  Select Category → 
    Products → 
    Angled Shots → 
    Backgrounds → 
    Templates ← NEW
```

### 7. Testing Checklist

- [ ] Create template for each format
- [ ] Edit template layers
- [ ] Delete template
- [ ] Template respects format dimensions
- [ ] Percentages work across different aspect ratios
- [ ] Save/load template_data JSONB correctly

## Next Steps

1. ✅ Create individual template API route (GET, PUT, DELETE)
2. Build TemplateList component
3. Build simple TemplateBuilder (canvas with basic drag/drop)
4. Test with one format (1:1)
5. Expand to all 4 formats
6. Create default templates
7. Update UI navigation

