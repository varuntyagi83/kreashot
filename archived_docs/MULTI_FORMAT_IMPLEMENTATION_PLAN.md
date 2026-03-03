# Multi-Format Implementation Plan
## Phase-by-Phase Rollout Strategy

**Goal:** Add support for 4 formats (1:1, 16:9, 9:16, 4:5) without affecting existing 1:1 assets.

**Key Principles:**
- ✅ Backward compatibility - existing 1:1 assets work unchanged
- ✅ Folder isolation - each format has separate storage folders
- ✅ Incremental testing - validate each phase before proceeding
- ✅ Data preservation - no destructive migrations

---

## Phase 1: Database Foundation (2 hours)
**Goal:** Update database schema to support multiple formats per category

### 1.1 Migration: Multi-Format Support
**File:** `supabase/migrations/015_multi_format_support.sql`

```sql
-- Step 1: Add format columns to existing tables (NON-BREAKING)
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS format TEXT DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 1080;

-- Step 2: Update existing templates to explicitly set 1:1 format
UPDATE templates SET format = '1:1', width = 1080, height = 1080
WHERE format IS NULL;

-- Step 3: Drop old unique constraint, add new one with format
DROP INDEX IF EXISTS idx_templates_category;
CREATE UNIQUE INDEX idx_templates_category_format
  ON templates(category_id, format);

-- Step 4: Add format to composites (for future format-aware generation)
ALTER TABLE composites
  ADD COLUMN IF NOT EXISTS format TEXT DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 1080;

-- Step 5: Add format to final_assets
ALTER TABLE final_assets
  ADD COLUMN IF NOT EXISTS format TEXT DEFAULT '1:1',
  ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 1080;

-- Step 6: Create format_configs table (for format metadata)
CREATE TABLE IF NOT EXISTS format_configs (
  format TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  aspect_ratio NUMERIC(5,2) NOT NULL,
  platform_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert standard formats
INSERT INTO format_configs (format, name, width, height, aspect_ratio, platform_tags)
VALUES
  ('1:1', 'Square (Instagram Post)', 1080, 1080, 1.00, ARRAY['instagram', 'facebook', 'linkedin']),
  ('16:9', 'Landscape (YouTube)', 1920, 1080, 1.78, ARRAY['youtube', 'facebook', 'linkedin']),
  ('9:16', 'Portrait (Stories)', 1080, 1920, 0.56, ARRAY['instagram', 'facebook', 'tiktok', 'snapchat']),
  ('4:5', 'Portrait (Feed)', 1080, 1350, 0.80, ARRAY['instagram', 'facebook'])
ON CONFLICT (format) DO NOTHING;
```

**Verification:**
```bash
# Apply migration
npx supabase db push

# Verify format_configs
psql $DATABASE_URL -c "SELECT * FROM format_configs;"

# Verify existing templates are 1:1
psql $DATABASE_URL -c "SELECT id, name, format, width, height FROM templates;"

# Verify no data loss
psql $DATABASE_URL -c "SELECT COUNT(*) FROM templates WHERE format = '1:1';"
```

**Success Criteria:**
- ✅ Migration applies without errors
- ✅ All existing templates have format = '1:1'
- ✅ No data loss in templates, composites, final_assets
- ✅ format_configs has 4 rows

---

## Phase 2: Storage Organization (1.5 hours)
**Goal:** Set up format-specific folders in Google Drive

### 2.1 Folder Structure

**Current structure:**
```
gummy-bear/
  ├── products/
  ├── angled-shots/
  ├── backgrounds/
  ├── composites/
  ├── final-assets/
  ├── guidelines/
  └── templates/
```

**New structure (backward compatible):**
```
gummy-bear/
  ├── products/              # Format-agnostic (created once)
  ├── angled-shots/          # Format-agnostic (created once)
  ├── backgrounds/           # Format-agnostic (created once)
  ├── composites/
  │   ├── 1x1/              # Existing composites stay here
  │   ├── 16x9/             # NEW
  │   ├── 9x16/             # NEW
  │   └── 4x5/              # NEW
  ├── final-assets/
  │   ├── 1x1/              # Existing final assets stay here
  │   ├── 16x9/             # NEW
  │   ├── 9x16/             # NEW
  │   └── 4x5/              # NEW
  ├── guidelines/
  │   ├── 1x1/              # Move existing + new 1:1 guidelines
  │   ├── 16x9/             # NEW format-specific guidelines
  │   ├── 9x16/             # NEW
  │   └── 4x5/              # NEW
  └── templates/
      ├── 1x1/              # Move existing templates
      ├── 16x9/             # NEW
      ├── 9x16/             # NEW
      └── 4x5/              # NEW
```

### 2.2 Migration Script: Reorganize Existing Assets
**File:** `scripts/migrate-to-format-folders.ts`

```typescript
/**
 * Migrates existing 1:1 assets to format-specific folders
 * WITHOUT affecting the database (preserves storage_path references)
 */
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const FORMAT = '1x1' // Default format for existing assets

async function migrateToFormatFolders() {
  console.log('🔄 Migrating existing assets to format-specific folders...\n')

  // 1. Create format subfolders in Google Drive
  const foldersToCreate = [
    'composites/1x1',
    'composites/16x9',
    'composites/9x16',
    'composites/4x5',
    'final-assets/1x1',
    'final-assets/16x9',
    'final-assets/9x16',
    'final-assets/4x5',
    'guidelines/1x1',
    'guidelines/16x9',
    'guidelines/9x16',
    'guidelines/4x5',
    'templates/1x1',
    'templates/16x9',
    'templates/9x16',
    'templates/4x5',
  ]

  console.log('📁 Creating format subfolders in Google Drive...')
  // TODO: Create folders using Google Drive API

  // 2. Move existing assets (COPY, don't delete originals yet)
  console.log('\n📦 Moving existing 1:1 assets to 1x1/ subfolders...')

  // Move composites
  // Move final-assets
  // Move guidelines
  // Move templates

  // 3. Update database storage_path references
  console.log('\n💾 Updating database storage paths...')

  // Update composites paths: 'composites/abc.jpg' → 'composites/1x1/abc.jpg'
  // Update final_assets paths
  // Update guidelines paths
  // Update templates paths

  console.log('\n✅ Migration complete!')
  console.log('⚠️  Original files preserved for rollback safety')
  console.log('⚠️  Verify new paths work before running cleanup')
}

migrateToFormatFolders()
```

**Verification:**
```bash
# Run migration
npx tsx scripts/migrate-to-format-folders.ts

# Verify Google Drive folders exist
# TODO: Add verification queries

# Verify database paths updated
psql $DATABASE_URL -c "SELECT storage_path FROM composites LIMIT 5;"
psql $DATABASE_URL -c "SELECT storage_path FROM final_assets LIMIT 5;"

# Test loading existing assets in UI (should work unchanged)
```

**Success Criteria:**
- ✅ Format subfolders created in Google Drive
- ✅ Existing 1:1 assets moved to `1x1/` subfolders
- ✅ Database `storage_path` updated correctly
- ✅ Existing UI loads assets without errors
- ✅ Original files preserved for rollback

---

## Phase 3: Template Multi-Format Support (2 hours)
**Goal:** Allow creating templates for each format

### 3.1 Update Template Builder UI
**File:** `src/components/templates/TemplateWorkspace.tsx`

**Changes:**
1. Add format selector dropdown
2. Show format-specific canvas dimensions
3. Update save logic to include format

**New UI:**
```tsx
<Select value={selectedFormat} onValueChange={setSelectedFormat}>
  <SelectItem value="1:1">1:1 Square (1080x1080)</SelectItem>
  <SelectItem value="16:9">16:9 Landscape (1920x1080)</SelectItem>
  <SelectItem value="9:16">9:16 Portrait (1080x1920)</SelectItem>
  <SelectItem value="4:5">4:5 Portrait (1080x1350)</SelectItem>
</Select>
```

### 3.2 Update Template API
**File:** `src/app/api/categories/[id]/templates/route.ts`

**Changes:**
```typescript
// POST - Create template
const { format = '1:1', template_data } = await request.json()

// Get format dimensions
const formatConfig = FORMAT_CONFIGS[format]
const { width, height } = formatConfig

// Save with format-specific path
const storagePath = `${category.slug}/templates/${format}/${slug}_${timestamp}.png`

// Insert with format
const { data: template } = await supabase
  .from('templates')
  .insert({
    category_id: categoryId,
    user_id: user.id,
    name,
    format,         // NEW
    width,          // NEW
    height,         // NEW
    template_data,
    storage_path: storagePath,
    // ...
  })
```

### 3.3 Format Configurations
**File:** `src/lib/formats.ts`

```typescript
export const FORMAT_CONFIGS = {
  '1:1': {
    name: 'Square (Instagram Post)',
    width: 1080,
    height: 1080,
    aspectRatio: 1.0,
    platforms: ['instagram', 'facebook', 'linkedin'],
  },
  '16:9': {
    name: 'Landscape (YouTube)',
    width: 1920,
    height: 1080,
    aspectRatio: 1.78,
    platforms: ['youtube', 'facebook', 'linkedin'],
  },
  '9:16': {
    name: 'Portrait (Stories)',
    width: 1080,
    height: 1920,
    aspectRatio: 0.56,
    platforms: ['instagram', 'facebook', 'tiktok', 'snapchat'],
  },
  '4:5': {
    name: 'Portrait (Feed)',
    width: 1080,
    height: 1350,
    aspectRatio: 0.8,
    platforms: ['instagram', 'facebook'],
  },
} as const

export type Format = keyof typeof FORMAT_CONFIGS
```

**Testing:**
1. Create 1:1 template (verify backward compatibility)
2. Create 16:9 template (verify new format works)
3. Verify both templates coexist for same category
4. Check templates saved to correct format-specific folders

**Success Criteria:**
- ✅ Can create templates for all 4 formats
- ✅ Each format has correct dimensions
- ✅ Templates saved to format-specific folders
- ✅ Template gallery shows format badge
- ✅ Existing 1:1 templates unaffected

---

## Phase 4: Format-Aware Composite Generation (3 hours)
**Goal:** Generate composites with format-specific dimensions and safe zones

### 4.1 Update Composite Generation API
**File:** `src/app/api/categories/[id]/composites/generate/route.ts`

**Changes:**
```typescript
// Accept format parameter
const { mode, pairs, userPrompt, format = '1:1' } = await request.json()

// Fetch format-specific template
const { data: template } = await supabase
  .from('templates')
  .select('id, name, format, width, height, template_data')
  .eq('category_id', categoryId)
  .eq('format', format)  // NEW: Filter by format
  .single()

// Extract safe zones for this format
let safeZones: any[] = []
if (template && template.template_data) {
  safeZones = template.template_data.safe_zones || []
  console.log(`Found ${safeZones.length} safe zones in ${format} template`)
}

// Pass format dimensions to Gemini
const composite = await generateComposite(
  productImageData,
  productImageMimeType,
  backgroundImageData,
  backgroundImageMimeType,
  userPrompt,
  category.look_and_feel || undefined,
  safeZones.length > 0 ? safeZones : undefined,
  format,          // NEW: Pass format
  template?.width || FORMAT_CONFIGS[format].width,   // NEW
  template?.height || FORMAT_CONFIGS[format].height  // NEW
)

// Save composite to format-specific folder
const storagePath = `${category.slug}/composites/${format}/${slug}_${timestamp}.jpg`

// Insert with format
await supabase.from('composites').insert({
  category_id: categoryId,
  angled_shot_id: angledShotId,
  background_id: backgroundId,
  format,         // NEW
  width: template?.width || FORMAT_CONFIGS[format].width,
  height: template?.height || FORMAT_CONFIGS[format].height,
  storage_path: storagePath,
  // ...
})
```

### 4.2 Update Gemini Function
**File:** `src/lib/ai/gemini.ts`

**Changes:**
```typescript
export async function generateComposite(
  productImageData: string,
  productImageMimeType: string,
  backgroundImageData: string,
  backgroundImageMimeType: string,
  userPrompt?: string,
  lookAndFeel?: string,
  safeZones?: Array<SafeZone>,
  format: Format = '1:1',        // NEW
  canvasWidth: number = 1080,    // NEW
  canvasHeight: number = 1080    // NEW
): Promise<{
  promptUsed: string
  imageData: string
  mimeType: string
}> {
  // Calculate pixel coordinates based on format dimensions
  const pixelMultiplierX = canvasWidth / 100
  const pixelMultiplierY = canvasHeight / 100

  if (productSafeZone) {
    safeZoneInstructions += `\n🎯 PRODUCT PLACEMENT ZONE (CRITICAL):
Position the product within these coordinates on a ${canvasWidth}x${canvasHeight} canvas:
- Left edge: ${productSafeZone.x}% from left (${Math.round(productSafeZone.x * pixelMultiplierX)}px)
- Top edge: ${productSafeZone.y}% from top (${Math.round(productSafeZone.y * pixelMultiplierY)}px)
- Width: ${productSafeZone.width}% (${Math.round(productSafeZone.width * pixelMultiplierX)}px)
- Height: ${productSafeZone.height}% (${Math.round(productSafeZone.height * pixelMultiplierY)}px)

Format: ${format} (${canvasWidth}x${canvasHeight})
The ENTIRE product must fit within this zone.\n`
  }

  // Rest of function unchanged
}
```

### 4.3 Update Composite Generation UI
**File:** `src/components/composites/CompositeGenerationForm.tsx`

**Changes:**
```tsx
// Add format selector
const [selectedFormat, setSelectedFormat] = useState<Format>('1:1')

// Show format-specific template info
useEffect(() => {
  // Fetch template for selected format
  fetch(`/api/categories/${categoryId}/templates?format=${selectedFormat}`)
}, [selectedFormat])

// Pass format to API
const response = await fetch(`/api/categories/${categoryId}/composites/generate`, {
  method: 'POST',
  body: JSON.stringify({
    mode,
    pairs,
    userPrompt,
    format: selectedFormat,  // NEW
  }),
})
```

**Testing:**
1. Select 16:9 format
2. Generate composite (1 shot + 1 background)
3. Verify composite has 16:9 dimensions (1920x1080)
4. Verify product positioned within 16:9 safe zones
5. Verify saved to `composites/16x9/` folder
6. Repeat for 9:16 and 4:5 formats

**Success Criteria:**
- ✅ Can select format before generating composites
- ✅ Composites generated with correct dimensions per format
- ✅ Safe zones respected for each format
- ✅ Composites saved to format-specific folders
- ✅ Database stores format, width, height correctly
- ✅ Existing 1:1 composite generation still works

---

## Phase 5: Format-Aware Final Asset Generation (2.5 hours)
**Goal:** Generate final ads with format-specific templates

### 5.1 Update Python Compositing Script
**File:** `scripts/composite_final_asset.py`

**Changes:**
```python
# Accept format parameters
format_type = data.get('format', '1:1')
canvas_width = data.get('canvas_width', 1080)
canvas_height = data.get('canvas_height', 1080)

# Create canvas with format-specific dimensions
canvas = Image.new('RGB', (canvas_width, canvas_height), (255, 255, 255))

# Convert percentage coordinates to pixels (format-aware)
pixel_x = int(layer.get('x', 0) * canvas_width / 100)
pixel_y = int(layer.get('y', 0) * canvas_height / 100)
pixel_width = int(layer.get('width', 100) * canvas_width / 100)
pixel_height = int(layer.get('height', 100) * canvas_height / 100)

# Rest of compositing logic unchanged
```

### 5.2 Update Final Asset API
**File:** `src/app/api/categories/[id]/final-assets/generate/route.ts`

**Changes:**
```typescript
// Extract format from template
const { data: template } = await supabase
  .from('templates')
  .select('id, name, format, width, height, template_data')
  .eq('id', templateId)
  .single()

if (!template) {
  return NextResponse.json({ error: 'Template not found' }, { status: 404 })
}

// Verify composite matches template format
const { data: composite } = await supabase
  .from('composites')
  .select('id, format, width, height, storage_url')
  .eq('id', compositeId)
  .single()

if (composite.format !== template.format) {
  return NextResponse.json(
    { error: `Format mismatch: composite is ${composite.format}, template is ${template.format}` },
    { status: 400 }
  )
}

// Pass format info to Python script
const pythonPayload = {
  template_data: template.template_data,
  composite_url: composite.storage_url,
  copy_text: copyText,
  format: template.format,           // NEW
  canvas_width: template.width,      // NEW
  canvas_height: template.height,    // NEW
}

// Save to format-specific folder
const storagePath = `${category.slug}/final-assets/${template.format}/${slug}_${timestamp}.jpg`

// Insert with format
await supabase.from('final_assets').insert({
  category_id: categoryId,
  template_id: templateId,
  composite_id: compositeId,
  copy_text_id: copyTextId,
  format: template.format,       // NEW
  width: template.width,         // NEW
  height: template.height,       // NEW
  storage_path: storagePath,
  // ...
})
```

**Testing:**
1. Create 16:9 template with safe zones
2. Generate 16:9 composite
3. Generate copy text
4. Generate final asset (16:9 template + 16:9 composite + copy)
5. Verify final asset is 1920x1080
6. Verify product within 16:9 safe zones
7. Verify text layers positioned correctly
8. Verify saved to `final-assets/16x9/` folder

**Success Criteria:**
- ✅ Final assets generated with correct dimensions per format
- ✅ Template safe zones enforced during final compositing
- ✅ Text layers positioned correctly for each format
- ✅ Format validation (reject composite/template format mismatch)
- ✅ Assets saved to format-specific folders
- ✅ Existing 1:1 final asset generation still works

---

## Phase 6: UI/UX Updates (2 hours)
**Goal:** Update all UI components to support format selection and filtering

### 6.1 Format Selector Component
**File:** `src/components/common/FormatSelector.tsx`

```tsx
interface FormatSelectorProps {
  value: Format
  onChange: (format: Format) => void
  disabled?: boolean
  label?: string
}

export function FormatSelector({ value, onChange, disabled, label }: FormatSelectorProps) {
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(FORMAT_CONFIGS).map(([format, config]) => (
            <SelectItem key={format} value={format}>
              <div className="flex items-center gap-2">
                <FormatBadge format={format as Format} />
                <span>{config.name}</span>
                <span className="text-xs text-muted-foreground">
                  {config.width}×{config.height}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

### 6.2 Update Gallery Components

**Composites Gallery:**
- Add format filter dropdown
- Show format badge on each composite thumbnail
- Filter composites by selected format

**Final Assets Gallery:**
- Add format filter dropdown
- Show format badge on each final asset thumbnail
- Filter final assets by selected format

**Templates Gallery:**
- Group templates by format
- Show format-specific dimensions
- Allow creating new template per format

### 6.3 Update Preview Components

**Final Asset Preview:**
- Adaptive canvas size based on format
- Show format info in header
- Validate format match before preview

**Composite Preview:**
- Show format badge
- Display correct dimensions

**Testing:**
1. Navigate to Composites tab
2. Select 16:9 format filter
3. Verify only 16:9 composites shown
4. Create new 16:9 composite
5. Navigate to Final Assets tab
6. Select 16:9 format filter
7. Generate final asset with 16:9 template + composite
8. Verify preview shows correct dimensions

**Success Criteria:**
- ✅ Format selector works across all tabs
- ✅ Galleries filter by format correctly
- ✅ Format badges display on thumbnails
- ✅ Previews show format-specific dimensions
- ✅ No UI regressions for existing 1:1 workflow

---

## Phase 7: End-to-End Testing & Documentation (1.5 hours)
**Goal:** Comprehensive testing and user documentation

### 7.1 End-to-End Test Scenarios

**Scenario 1: Complete 16:9 Workflow**
1. Create 16:9 template with safe zones
2. Upload guideline for 16:9
3. Use existing angled shot (format-agnostic)
4. Use existing background (format-agnostic)
5. Generate 16:9 composite
6. Generate copy text
7. Generate 16:9 final asset
8. Verify: Product within safe zones, correct dimensions, saved to correct folder

**Scenario 2: Multi-Format Generation**
1. Create templates for all 4 formats (1:1, 16:9, 9:16, 4:5)
2. Use same angled shot + background
3. Generate composites for all 4 formats
4. Generate final assets for all 4 formats
5. Verify: 4 final assets, each with correct dimensions, all using same product

**Scenario 3: Backward Compatibility**
1. Generate 1:1 composite (old workflow)
2. Generate 1:1 final asset (old workflow)
3. Verify: Works exactly as before, no regressions

**Scenario 4: Format Mismatch Handling**
1. Create 16:9 composite
2. Try to use with 1:1 template
3. Verify: Error message, no asset generated

### 7.2 Update Documentation
- Update Master_plan_v2.md with multi-format implementation
- Add format selection guide
- Document folder structure
- Add troubleshooting section

**Success Criteria:**
- ✅ All test scenarios pass
- ✅ No regressions in existing 1:1 workflow
- ✅ Documentation updated
- ✅ Ready for production use

---

## Rollout Timeline

| Phase | Duration | Tasks | Dependencies |
|-------|----------|-------|--------------|
| **Phase 1** | 2 hours | Database migration | None |
| **Phase 2** | 1.5 hours | Storage organization | Phase 1 |
| **Phase 3** | 2 hours | Template multi-format | Phase 1, 2 |
| **Phase 4** | 3 hours | Composite generation | Phase 3 |
| **Phase 5** | 2.5 hours | Final asset generation | Phase 4 |
| **Phase 6** | 2 hours | UI/UX updates | Phase 3, 4, 5 |
| **Phase 7** | 1.5 hours | Testing & docs | All phases |
| **Total** | **14.5 hours** | | |

---

## Success Metrics

**Before Implementation:**
- ✅ 1 format supported (1:1)
- ✅ All assets in flat folder structure
- ✅ 1 template per category

**After Implementation:**
- ✅ 4 formats supported (1:1, 16:9, 9:16, 4:5)
- ✅ Assets organized in format-specific folders
- ✅ Up to 4 templates per category (one per format)
- ✅ Format-aware composite generation
- ✅ Format-specific safe zone compliance
- ✅ Existing 1:1 assets untouched and functional

---

## Rollback Strategy

If issues arise, rollback is safe because:
1. **Database**: Added columns are nullable/defaulted, existing data unchanged
2. **Storage**: Original 1:1 files preserved in migration
3. **Code**: Feature flags can disable new format selector UI
4. **Data**: All new formats in separate folders, easy to delete

**Rollback Steps:**
1. Hide format selector UI (set default to '1:1')
2. Revert database migration 015 if needed
3. Delete format subfolders if needed
4. No data loss - all original 1:1 assets intact

---

## Next Steps

Ready to begin **Phase 1: Database Foundation**?

The migration is non-breaking and takes ~30 minutes including testing.
