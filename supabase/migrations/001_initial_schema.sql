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
