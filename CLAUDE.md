# AdForge-Railway — Claude Code Instructions

## AI Model Usage Rules (STRICT — never deviate)

| Task type | Model | Notes |
|-----------|-------|-------|
| **Text / copy generation** | `gpt-4o` (OpenAI) | ALL copywriting: hooks, taglines, headlines, body text, CTAs, creative briefs, variation text, ad insights, comparisons, competitor reports, brand guidelines generation. Never use Gemini for text. |
| **Image generation** | `gemini-3.1-flash-image-preview` (Gemini) | ALL image tasks: angled shots, backgrounds, composites, reformat/resize, any image creation or editing. Never use GPT-4o or DALL-E for images. |
| **Video analysis** | `gemini-2.5-flash` (Gemini) — default | Phase 24+: competitor video analysis, hook extraction, scene breakdown, text overlay extraction, scroll-stop scoring. Native video input, no frame extraction needed. GPT-4o Vision + frame extraction is the premium fallback only. |

### Quick reference
- Text/copy → **GPT-4o** (always)
- Images → **gemini-3.1-flash-image-preview** (always)
- Video analysis → **gemini-2.5-flash** (default), GPT-4o Vision (premium fallback)

---

## Project Overview
- Stack: Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, Supabase, Google Drive storage
- Deployed on: Railway (NOT Vercel)
- Auth: Supabase anon key + RLS
- Image storage: Google Drive via service account

## Key Paths
- API routes: `src/app/api/`
- AI library: `src/lib/ai/` (gemini.ts — images, openai.ts — copy, brand-voice.ts, sanitize.ts)
- Python compositor: `scripts/composite_final_asset.py`
- Rate limiter: `src/lib/rate-limit.ts` (in-memory, per-process)

## Workflow
- Commit + push to GitHub after every change
- Test the app and wait for user confirmation before proceeding to the next phase
