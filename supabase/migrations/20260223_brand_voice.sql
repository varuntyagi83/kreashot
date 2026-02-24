-- Brand Voice Profile: structured tone-of-voice extracted by AI
-- Date: 2026-02-23

-- Stores the structured brand voice profile as JSON
-- Extracted from: text samples, Q&A answers, or image analysis
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS brand_voice JSONB;

-- Example brand_voice structure:
-- {
--   "tone_words": ["friendly", "science-backed", "empowering"],
--   "personality": "A trusted health companion that speaks like a knowledgeable friend",
--   "language_style": "Simple sentences, second-person ('you'), active voice, no jargon",
--   "dos": ["Lead with benefits", "Reference science simply", "Use warm humour"],
--   "donts": ["Fear-based messaging", "Medical claims", "Overly formal language"],
--   "sample_phrases": ["Feel good every day", "Your healthiest self starts here"],
--   "extracted_from": "qa",
--   "extracted_at": "2026-02-23T10:00:00Z"
-- }
