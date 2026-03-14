# Run Image Pipeline (Invoker)

When this skill is invoked, run the full AdForge image pipeline audit as defined in the main skill.

## What to do

1. **Read** [../image-pipeline/skill.md](../image-pipeline/skill.md) and follow it exactly (act as Iris, use the audit process, generation flows, and report format).

2. **Scope from the user's message:**
   - No scope or just `/image-pipeline` or "run image pipeline" → audit using the **first available category**
   - User provides a category ID (e.g. `/image-pipeline abc-123`) → use that category ID
   - User provides a category name → look it up in the categories list first

3. **Execute** the audit:
   - Authenticate via the dev server login
   - Generate + save backgrounds
   - Generate angled shots (auto-saved)
   - Generate + save composites
   - Inspect Supabase metadata for all three asset types
   - Verify Google Drive storage
   - Run the full 4×3 download matrix (12 combinations)
   - Produce the report in the exact format specified in the image-pipeline skill
   - Save the report under `docs/` (e.g. `docs/IMAGE_PIPELINE_AUDIT_YYYY-MM-DD.md`)

4. **Fix** any issues found (e.g. missing save calls, null gdrive_file_id) when practical.

## How to invoke (for the user)

You can say any of the following to run the pipeline audit:

- **Default (first category):** `/image-pipeline` or `run image pipeline` or `test the image pipeline`
- **Specific category:** `/image-pipeline {categoryId}` or `run image pipeline for category {name}`
- **Just download matrix:** `test download formats` or `test 1k 2k 4k downloads`

The agent will read the image-pipeline skill and perform the full audit for the scope you specified.

## ARGUMENTS: {categoryId or empty}
