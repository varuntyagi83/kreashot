# Phase 0 — Foundation

> **Goal**: Scaffold the Next.js project, set up Supabase (auth, database schema, storage buckets), and build the base UI shell with navigation.

---

## Prerequisites
- Node.js 18+ installed
- Supabase project created (get URL + keys)
- Google Gemini API key obtained
- OpenAI API key obtained

---

## Step 0.1 — Project Scaffold

**Action**: Create a new Next.js 14+ project with TypeScript, Tailwind CSS, and shadcn/ui.

```bash
npx create-next-app@latest adforge --typescript --tailwind --eslint --app --src-dir
cd adforge
npx shadcn@latest init
```

Install dependencies:
```bash
npm install @supabase/supabase-js @supabase/ssr zustand uuid
npm install @google/genai
npm install openai
npm install sharp
npm install lucide-react
npx shadcn@latest add button card dialog input label select tabs textarea toast badge scroll-area separator sheet dropdown-menu command popover
```

Create `.env.local` with placeholders:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
```

**Validation**: `npm run dev` starts without errors.

**🔒 COMMIT**: `git init && git add . && git commit -m "chore: scaffold Next.js project with dependencies"`

---

## Step 0.2 — Supabase Client Setup

**Action**: Create Supabase client utilities.

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}
```

Create `src/lib/supabase/admin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

**Validation**: Import and log a test query — no connection errors.

**🔒 COMMIT**: `git add . && git commit -m "feat: add Supabase client utilities"`

---

## Step 0.3 — Database Schema

**Action**: Create all database tables via Supabase SQL Editor or migration file.

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CATEGORIES
-- ============================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  look_and_feel TEXT, -- Style description for AI generation context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- ============================================
-- BRAND ASSETS (Global — not per category)
-- ============================================
CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('logo', 'font', 'color_palette', 'watermark', 'other')),
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- ============================================
-- PRODUCT ASSETS (Raw uploaded images)
-- ============================================
CREATE TABLE product_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANGLED SHOTS (AI-generated)
-- ============================================
CREATE TABLE angled_shots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_asset_id UUID NOT NULL REFERENCES product_assets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  angle_name TEXT NOT NULL, -- e.g., "left_30deg", "front", "top_45deg"
  angle_description TEXT, -- Human-readable: "Left side, 30 degree angle"
  prompt_used TEXT, -- The actual prompt sent to Nano Banana Pro
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BACKGROUNDS (AI-generated)
-- ============================================
CREATE TABLE backgrounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt_used TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMPOSITES (Angled Product + Background)
-- ============================================
CREATE TABLE composites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  angled_shot_id UUID NOT NULL REFERENCES angled_shots(id) ON DELETE CASCADE,
  background_id UUID NOT NULL REFERENCES backgrounds(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt_used TEXT,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COPY DOCS (AI-generated marketing text)
-- ============================================
CREATE TABLE copy_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL, -- User's input text/brief
  generated_text TEXT NOT NULL, -- AI-generated variation
  copy_type TEXT NOT NULL CHECK (copy_type IN ('hook', 'cta', 'body', 'tagline', 'headline', 'other')),
  language TEXT NOT NULL DEFAULT 'en', -- ISO 639-1 code
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GUIDELINES (User-uploaded)
-- ============================================
CREATE TABLE guidelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  -- Parsed guideline data (safe zones, element positions)
  safe_zones JSONB DEFAULT '{}',
  element_positions JSONB DEFAULT '{}', -- {logo: {x, y, w, h}, text: {x, y, w, h}, product: {x, y, w, h}}
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FINAL ASSETS (Fully composed creatives)
-- ============================================
CREATE TABLE final_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  composite_id UUID REFERENCES composites(id) ON DELETE SET NULL,
  copy_doc_id UUID REFERENCES copy_docs(id) ON DELETE SET NULL,
  guideline_id UUID REFERENCES guidelines(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt_used TEXT,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AD EXPORTS (Final ads in specific aspect ratios)
-- ============================================
CREATE TABLE ad_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  final_asset_id UUID NOT NULL REFERENCES final_assets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aspect_ratio TEXT NOT NULL, -- e.g., "1:1", "16:9", "9:16"
  width INT NOT NULL,
  height INT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ASSET REFERENCES (@ mention lookup table)
-- ============================================
CREATE TABLE asset_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE, -- NULL for global assets
  reference_id TEXT NOT NULL, -- e.g., "@greenworld/product/vitamin-d-front"
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'brand_asset', 'product_asset', 'angled_shot', 'background',
    'composite', 'copy_doc', 'guideline', 'final_asset'
  )),
  asset_table_id UUID NOT NULL, -- FK to the actual asset's table
  storage_url TEXT,
  display_name TEXT NOT NULL, -- Human-readable name
  searchable_text TEXT NOT NULL, -- For full-text search
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reference_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_product_assets_product ON product_assets(product_id);
CREATE INDEX idx_angled_shots_product ON angled_shots(product_id);
CREATE INDEX idx_angled_shots_category ON angled_shots(category_id);
CREATE INDEX idx_backgrounds_category ON backgrounds(category_id);
CREATE INDEX idx_composites_category ON composites(category_id);
CREATE INDEX idx_copy_docs_category ON copy_docs(category_id);
CREATE INDEX idx_guidelines_category ON guidelines(category_id);
CREATE INDEX idx_final_assets_category ON final_assets(category_id);
CREATE INDEX idx_ad_exports_final_asset ON ad_exports(final_asset_id);
CREATE INDEX idx_asset_references_user ON asset_references(user_id);
CREATE INDEX idx_asset_references_search ON asset_references USING gin(to_tsvector('english', searchable_text));

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE angled_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE backgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE composites ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_references ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'categories', 'brand_assets', 'products', 'product_assets',
    'angled_shots', 'backgrounds', 'composites', 'copy_docs',
    'guidelines', 'final_assets', 'ad_exports', 'asset_references'
  ])
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_select" ON %I FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "%s_update" ON %I FOR UPDATE USING (auth.uid() = user_id);
      CREATE POLICY "%s_delete" ON %I FOR DELETE USING (auth.uid() = user_id);
    ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Validation**: Run this SQL in Supabase SQL Editor. All tables should appear in the Table Editor.

**🔒 COMMIT**: `git add . && git commit -m "feat: add complete database schema with RLS"`

---

## Step 0.4 — Storage Buckets

**Action**: Create all 8 storage buckets via Supabase Dashboard or SQL.

```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('brand-assets', 'brand-assets', false),
  ('assets', 'assets', false),
  ('angled-shots', 'angled-shots', false),
  ('backgrounds', 'backgrounds', false),
  ('angled-product-background', 'angled-product-background', false),
  ('copy-doc', 'copy-doc', false),
  ('guidelines', 'guidelines', false),
  ('final-assets', 'final-assets', false);

-- Storage policies: Users can manage their own files
-- Pattern: {user_id}/{category_id}/{filename} for per-category buckets
-- Pattern: {user_id}/{filename} for global buckets (brand-assets)

DO $$
DECLARE
  bucket TEXT;
BEGIN
  FOR bucket IN SELECT unnest(ARRAY[
    'brand-assets', 'assets', 'angled-shots', 'backgrounds',
    'angled-product-background', 'copy-doc', 'guidelines', 'final-assets'
  ])
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_select" ON storage.objects FOR SELECT
        USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "%s_insert" ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "%s_update" ON storage.objects FOR UPDATE
        USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "%s_delete" ON storage.objects FOR DELETE
        USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text);
    ', bucket, bucket, bucket, bucket, bucket, bucket, bucket, bucket);
  END LOOP;
END $$;
```

**Validation**: All 8 buckets visible in Supabase Storage dashboard.

**🔒 COMMIT**: `git add . && git commit -m "feat: add storage buckets with RLS policies"`

---

## Step 0.5 — Authentication

**Action**: Set up Supabase Auth with email/password. Build login/signup pages.

Create these files:
- `src/app/auth/login/page.tsx` — Login form
- `src/app/auth/signup/page.tsx` — Signup form
- `src/app/auth/callback/route.ts` — Auth callback handler
- `src/middleware.ts` — Protected route middleware
- `src/lib/hooks/useAuth.ts` — Auth hook with user state

The middleware should protect all routes except `/auth/*`.

**Validation**: Can sign up, log in, and access dashboard. Redirects to login when not authenticated.

**🔒 COMMIT**: `git add . && git commit -m "feat: add authentication with protected routes"`

---

## Step 0.6 — Base UI Shell

**Action**: Build the main application layout with navigation.

Create the app layout with:
- **Sidebar** (collapsible):
  - Brand Assets (global)
  - Categories (list with create button)
  - When a category is selected, show sub-navigation:
    - Assets (Step 2)
    - Angled Shots (Step 3-4)
    - Backgrounds (Step 5)
    - Composites (Step 6)
    - Copy (Step 7)
    - Guidelines (Step 8)
    - Final Assets (Step 9)
    - Ad Export (Step 10)
- **Top bar**: App logo, user menu, settings
- **Main content area**: Renders based on selected nav item

Files to create:
- `src/app/(dashboard)/layout.tsx` — Dashboard layout with sidebar
- `src/app/(dashboard)/page.tsx` — Dashboard home / overview
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/CategoryNav.tsx`

Use shadcn/ui `Sheet` for mobile sidebar, standard sidebar for desktop.

**Design Notes**:
- Dark theme preferred (modern creative tool aesthetic)
- Use a pipeline/step visualization showing progress through the 10-step workflow
- Each step should show count of assets generated

**Validation**: Navigation renders, sidebar toggles, all menu items are present (linking to placeholder pages for now).

**🔒 COMMIT**: `git add . && git commit -m "feat: add base UI shell with sidebar navigation"`

---

## Step 0.7 — API Route Structure + Gemini/Anthropic Client Setup

**Action**: Set up the API route structure and AI client utilities.

Create `src/lib/ai/gemini.ts`:
```typescript
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY! })

export async function generateImage(prompt: string, referenceImages?: { data: string; mimeType: string; role: string }[]) {
  const contents: any[] = []

  // Add reference images with role assignments
  if (referenceImages) {
    for (const img of referenceImages) {
      contents.push({
        inlineData: { mimeType: img.mimeType, data: img.data }
      })
    }
  }

  // Add the text prompt (always last)
  contents.push({ text: prompt })

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts: contents }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  })

  // Extract image parts from response
  const images: { data: string; mimeType: string }[] = []
  let text = ''

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.text) text += part.text
    if (part.inlineData) {
      images.push({
        data: part.inlineData.data!,
        mimeType: part.inlineData.mimeType!,
      })
    }
  }

  return { images, text }
}
```

Create `src/lib/ai/openai.ts`:
```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function generateCopy(systemPrompt: string, userPrompt: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  })

  return response.choices[0]?.message?.content || ''
}
```

Create API route structure:
```
src/app/api/
  categories/route.ts
  brand-assets/route.ts
  products/route.ts
  generate/
    angled-shots/route.ts
    backgrounds/route.ts
    composites/route.ts
    copy/route.ts
    final-assets/route.ts
    ad-export/route.ts
```

Each route file should have placeholder handlers returning 501.

**Validation**: API routes respond with 501 status. AI clients initialize without errors.

**🔒 COMMIT**: `git add . && git commit -m "feat: add API route structure and AI client utilities"`

---

## Step 0.8 — Zustand Store Setup

**Action**: Create the global state store.

Create `src/lib/store/index.ts`:
```typescript
import { create } from 'zustand'

interface AppState {
  // Active selections
  selectedCategoryId: string | null
  selectedProductId: string | null
  activeStep: number // 1-10 pipeline step

  // Actions
  setSelectedCategory: (id: string | null) => void
  setSelectedProduct: (id: string | null) => void
  setActiveStep: (step: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCategoryId: null,
  selectedProductId: null,
  activeStep: 1,

  setSelectedCategory: (id) => set({ selectedCategoryId: id, selectedProductId: null }),
  setSelectedProduct: (id) => set({ selectedProductId: id }),
  setActiveStep: (step) => set({ activeStep: step }),
}))
```

**Validation**: Store imports and state updates work in a test component.

**🔒 COMMIT**: `git add . && git commit -m "feat: add Zustand store for global state"`

---

## Phase 0 Complete — Final Validation

Before moving to Phase 1, verify:
- [ ] `npm run dev` runs without errors
- [ ] Can sign up and log in
- [ ] Dashboard renders with sidebar navigation
- [ ] All 8 storage buckets exist in Supabase
- [ ] All 12 database tables exist with RLS enabled
- [ ] API routes return 501 placeholders
- [ ] AI clients (Gemini + Anthropic) initialize without errors

**🏷️ TAG**: `git tag v0.1.0 -m "Phase 0: Foundation complete" && git push --tags`

---

## 🔄 Ralph Loop Checkpoint

**Context Snapshot for next session**:
> Phase 0 complete. Next.js 14 app scaffolded with Supabase backend. 8 storage buckets, 12 database tables with RLS. Auth working. Base UI shell with sidebar. Gemini and Anthropic client utilities ready. Zustand store initialized. All API routes are placeholders. Ready for Phase 1: Category CRUD + Asset Upload.

**If starting a new Claude Code session**, paste the above snapshot and say: "Continue with PHASE_1_CATEGORIES_ASSETS.md"

---

## NEXT: Read `PHASE_1_CATEGORIES_ASSETS.md`
