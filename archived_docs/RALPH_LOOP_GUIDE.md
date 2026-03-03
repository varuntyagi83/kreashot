# Ralph Loop — Context Management Guide

> **Purpose**: Use this document to manage context rot across Claude Code sessions. Copy the relevant section when starting a new session.

---

## How to Use

1. At the END of each Claude Code session, update the snapshot below with current progress
2. At the START of a new Claude Code session, paste the relevant snapshot + the phase file path
3. Claude Code will read the phase file and continue from where you left off

---

## Session Start Template

Copy and paste this into a new Claude Code session:

```
I'm building AdForge — an AI ad creative pipeline.

Read the master plan: cat MASTER_PLAN.md

Current progress: [PASTE SNAPSHOT BELOW]

Continue with: [PHASE FILE PATH]

The codebase is in this repo. Review the existing code structure first,
then continue building from the specified step.
```

---

## Context Snapshots (Update as you progress)

### After Phase 0
```
Phase 0 complete. Next.js 14 app with TypeScript, Tailwind, shadcn/ui.
Supabase: 12 tables with RLS, 8 storage buckets.
Auth: email/password with protected routes.
UI: Dashboard shell with sidebar navigation.
AI: Gemini client (src/lib/ai/gemini.ts) + Anthropic client (src/lib/ai/anthropic.ts).
State: Zustand store.
API: All route files exist as 501 placeholders.
Continue with: PHASE_1_CATEGORIES_ASSETS.md
```

### After Phase 1
```
Phase 0-1 complete. Categories CRUD with look_and_feel field. Brand assets
(logos) managed globally. Products within categories. Multi-image upload to
assets bucket. All uploads registered in asset_references table. Reusable
AssetReferencePicker component (@ trigger, searchable dropdown). Category
detail page has tabbed pipeline navigation.
Continue with: PHASE_2_ANGLED_SHOTS.md
```

### After Phase 2
```
Phase 0-2 complete. Angled shots generation with Nano Banana Pro
(gemini-3-pro-image-preview). Users select product + source image, define
angles (presets + custom), generate with AI. Preview before save. Individual
or bulk save to angled-shots bucket. GenerationProgress component (reusable
floating panel). generateImage() utility accepts reference images with roles.
Continue with: PHASE_3_BACKGROUNDS_COMPOSITES.md
```

### After Phase 3
```
Phase 0-3 complete. Background generation with category look_and_feel + user
prompts + optional @ style references. Composite generation: angled shots ×
backgrounds. Supports all-combinations (cartesian) and selected-pairs modes.
Multi-image input with role assignments (product_subject, background_scene).
Batch processing with progress tracking.
Continue with: PHASE_4_COPY_GENERATION.md
```

### After Phase 4
```
Phase 0-4 complete. Copy generation using Claude Sonnet 4.5. Multi-type
(hook, cta, headline, tagline, body) + multi-language. Chunking for large
batches. Copy library with search/filter. Quick CSS preview of copy on
composite images.
Continue with: PHASE_5_GUIDELINES_REFERENCES.md
```

### After Phase 5
```
Phase 0-5 complete. Guidelines with visual drag-and-drop builder. Element
positions stored as percentages in JSONB. @ reference system polished —
grouped by type, thumbnails, recents, cross-category + global search.
resolveReferences() utility fetches asset URLs from @ mentions.
Continue with: PHASE_6_FINAL_COMPOSITES.md
```

### After Phase 6
```
Phase 0-6 complete. Final asset generation: composite + logo + copy, laid
out per guideline positions. Multi-image Nano Banana Pro input. Text
rendered directly in image. All-combinations and selected-pairs modes.
Text verification workflow. Final assets saved with full relational data.
Continue with: PHASE_7_AD_EXPORT.md
```

### After Phase 7
```
v1.0.0 COMPLETE. Full 10-step pipeline working. Multi-aspect ratio export
(1:1, 16:9, 9:16, 4:5, etc.). ZIP download with organized folders. CSV
metadata export. Dashboard with pipeline stats. All 8 buckets populated.
RLS enforced. @ references across all steps.
```

---

## Emergency Context Reset

If Claude Code becomes confused mid-phase, provide this:

```
CONTEXT RESET.

Project: AdForge — AI ad creative pipeline
Tech: Next.js 14 + Supabase + Nano Banana Pro + Claude API
Repo structure: standard Next.js App Router in src/

Key files:
- src/lib/ai/gemini.ts — Nano Banana Pro image generation
- src/lib/ai/anthropic.ts — Claude copy generation
- src/lib/supabase/client.ts — Browser Supabase client
- src/lib/supabase/server.ts — Server Supabase client
- src/lib/store/index.ts — Zustand global state
- src/lib/utils/resolveReferences.ts — @ reference resolver

Current phase: [PHASE NUMBER]
Current step: [STEP NUMBER]
What was last completed: [DESCRIPTION]
What needs to happen next: [DESCRIPTION]

Read [PHASE FILE] and continue from Step [X.Y].
```

---

## Key Architecture Decisions (Quick Reference)

- **Image AI**: Nano Banana Pro (gemini-3-pro-image-preview) for ALL image tasks
- **Text AI**: Claude Sonnet 4.5 for copy generation only
- **Storage**: Supabase Storage with 8 buckets, files at {user_id}/{category_id}/...
- **@ References**: asset_references table, @{slug}/type/name pattern
- **Positions**: All guideline positions as percentages (not pixels)
- **Batch jobs**: Client-side Zustand queue with GenerationProgress component
- **Auth**: Supabase Auth with RLS on all tables
