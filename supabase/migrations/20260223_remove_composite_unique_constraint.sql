-- Remove unique constraint that prevents multiple composites with same angled_shot + background
-- This constraint prevents users from:
-- 1. Regenerating composites with different prompts
-- 2. Creating variations with different text overlays
-- 3. Iterating on creative work
-- 4. A/B testing different compositions

-- Drop the constraint if it exists
ALTER TABLE composites
DROP CONSTRAINT IF EXISTS composites_angled_shot_id_background_id_key;

-- Users should be able to create unlimited variations
-- Each composite is unique by its ID and creation timestamp
-- Multiple composites with same assets but different prompts/results are valid use cases
