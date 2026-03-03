-- Fix: drop duplicate AFTER DELETE trigger on angled_shots
-- Migration 006 created trigger_queue_angled_shot_deletion (AFTER DELETE)
-- Migration 011 created angled_shots_deletion_queue (BEFORE DELETE) as replacement
-- but never dropped the original, causing double queue entries on every deletion.
DROP TRIGGER IF EXISTS trigger_queue_angled_shot_deletion ON angled_shots;

-- Fix: drop duplicate index on composites.category_id
-- idx_composites_category and idx_composites_category_id both index the same column.
DROP INDEX IF EXISTS idx_composites_category;
