# Template Builder - Complete Implementation Guide

## 🎯 What's Been Created

### ✅ Infrastructure
- **Google Drive Folder**: `templates/` created in category folder
- **Database Table**: `templates` table with all required columns
- **Sample Templates**: 4 templates created (one for each aspect ratio)

### ✅ UI Components (Canvas-Based Visual Editor)
1. **TemplateBuilderCanvas.tsx** - Main Konva canvas with drag & resize
2. **LayerPanel.tsx** - Left sidebar for layer management
3. **PropertiesPanel.tsx** - Right sidebar for editing properties
4. **ToolbarTemplateBuilder.tsx** - Top toolbar with add layer/zone buttons
5. **TemplateWorkspace.tsx** - Main container orchestrating everything
6. **TemplateSamplePreview.tsx** - Preview with validation indicators
7. **TemplateGallery.tsx** - Display saved templates

### ✅ API Routes
- **GET** `/api/categories/[id]/templates` - Fetch templates (with format filter)
- **POST** `/api/categories/[id]/templates` - Create new template

## 🎨 How to Use the Template Builder

### Step 1: Access Template Builder
Navigate to:
```
http://localhost:3000/categories/[categoryId]
```
Go to the **"Templates"** tab

### Step 2: Define Safe Zones
1. Click **"Add Safe Zone"** → Choose "Safe Zone (Text Allowed)" or "Restricted Zone (No Text)"
2. **Drag and resize** the zone on canvas
3. **Safe zones (green)**: Where text/CTAs can be placed
4. **Restricted zones (red)**: Where product appears (no text allowed)

### Step 3: Add Layers
1. Click **"Add Layer"** → Choose layer type:
   - **Background Layer** (Z:0) - Full canvas background
   - **Product Layer** (Z:1) - Where product image goes
   - **Text Layer** (Z:2) - Headlines, hooks, CTAs
   - **Logo Layer** (Z:3) - Brand logo

2. **Drag to position** layer on canvas
3. **Resize with handles** to adjust size
4. **Edit properties** in right panel:
   - Position (X%, Y%)
   - Size (Width%, Height%)
   - Z-Index (layer order)
   - Text-specific: Font size, family, alignment, max characters
   - Product-specific: Alignment (left/center/right)
   - Logo-specific: Position preset, padding

### Step 4: Save Template
1. Click **"Save Template"** in toolbar
2. Template is saved to database with:
   - All layer positions (as percentages)
   - All safe zones
   - Global settings (grid, background color)

## 📊 Template JSON Structure

Templates are stored as JSON in the `template_data` column:

```json
{
  "layers": [
    {
      "id": "layer-1",
      "type": "background",
      "x": 0,
      "y": 0,
      "width": 100,
      "height": 100,
      "z_index": 0,
      "locked": false
    },
    {
      "id": "layer-2",
      "type": "product",
      "x": 50,
      "y": 30,
      "width": 40,
      "height": 50,
      "z_index": 1,
      "locked": false,
      "alignment": "center"
    },
    {
      "id": "layer-3",
      "type": "text",
      "name": "headline",
      "x": 10,
      "y": 10,
      "width": 80,
      "height": 15,
      "z_index": 2,
      "locked": false,
      "font_size": 24,
      "font_family": "Arial",
      "text_align": "center",
      "max_chars": 50,
      "color": "#000000"
    }
  ],
  "safe_zones": [
    {
      "id": "safe-1",
      "name": "Text Safe Zone",
      "x": 10,
      "y": 10,
      "width": 80,
      "height": 20,
      "type": "safe",
      "color": "#00ff00"
    }
  ],
  "global_settings": {
    "background_color": "#ffffff",
    "grid_enabled": true,
    "grid_size": 50
  }
}
```

## 🔄 Workflow: Templates → Composites → Final Assets

### Phase 1: Templates (CURRENT - ✅ COMPLETE)
- Define safe zones visually
- Set layer positions (product, text, logo)
- Save template configuration

### Phase 2: Composites (NEXT)
- Use template to position product on background
- Respect product placement zone from template
- Generate composite for each aspect ratio

### Phase 3: Copy Docs (AFTER COMPOSITES)
- Generate headlines, hooks, CTAs
- Fit character limits from template text zones
- Same copy across all formats

### Phase 4: Final Assets (LAST)
- Use template to place copy on composites
- Respect safe zones (no text in restricted areas)
- Add logos in designated positions
- Export production-ready ads

## 📝 Example Template Configurations

### 1:1 Instagram Square (1080x1080)
- Product: Bottom 60% (centered)
- Headline: Top 20% (safe zone)
- CTA: Just above product (safe zone)
- Logo: Top-right corner (50px padding)

### 16:9 Facebook Landscape (1920x1080)
- Product: Right 40% (centered)
- Headline: Left 50%, top 20%
- Hook: Left 50%, middle
- CTA: Left 50%, bottom 20%
- Logo: Top-left corner

### 9:16 Stories Portrait (1080x1920)
- Product: Bottom 50%
- Headline: Top 15%
- Hook: Above product
- CTA: Below headline
- Logo: Top-right

### 4:5 Instagram Portrait (1080x1350)
- Product: Bottom 65%
- Headline: Top 20%
- CTA: Between headline and product
- Logo: Top-left

## 🚀 Next Steps

1. ✅ **Templates Complete** - Define safe zones and layer positions
2. 🔜 **Composites** - Generate background + product using template positions
3. 🔜 **Copy Docs** - Generate marketing copy fitting character limits
4. 🔜 **Final Assets** - Combine everything using templates

## 🛠️ Verification

Check that templates are working:

```bash
# Verify database
node scripts/setup-templates-infrastructure.mjs

# Check API
curl http://localhost:3000/api/categories/[categoryId]/templates
```

## 📁 File Structure

```
src/
├── components/templates/
│   ├── TemplateBuilderCanvas.tsx     # Main canvas (Konva)
│   ├── LayerPanel.tsx                # Left sidebar
│   ├── PropertiesPanel.tsx           # Right sidebar
│   ├── ToolbarTemplateBuilder.tsx    # Top toolbar
│   ├── TemplateWorkspace.tsx         # Main container
│   ├── TemplateSamplePreview.tsx     # Validation preview
│   └── TemplateGallery.tsx           # Saved templates
├── lib/types/template.ts             # Type definitions
└── app/api/categories/[id]/templates/
    └── route.ts                      # API endpoints

scripts/
└── setup-templates-infrastructure.mjs # Setup script
```

---

**The Template Builder is ready to use!** 🎉

Access it at: `http://localhost:3000/categories/[categoryId]` → **Templates** tab
