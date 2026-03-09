-- Enable RLS on collages table (missed in initial migration)
ALTER TABLE collages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collages_select" ON collages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "collages_insert" ON collages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collages_update" ON collages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "collages_delete" ON collages FOR DELETE USING (auth.uid() = user_id);
