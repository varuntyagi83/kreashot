-- Copy Enhancements: Multi-tone support + Brand Guidelines PDF
-- Date: 2026-02-23

-- 1. Add tone column to copy_docs so we know which tone each saved copy used
ALTER TABLE copy_docs
ADD COLUMN IF NOT EXISTS tone TEXT;

-- 2. Add brand_guidelines column to categories
--    Stores extracted text from the brand PDF — used as AI context on every copy generation
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS brand_guidelines TEXT;

-- 3. Add brand_doc_name for displaying filename in the UI
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS brand_doc_name TEXT;

-- Indexes for tone filtering
CREATE INDEX IF NOT EXISTS idx_copy_docs_tone ON copy_docs(tone);
