---
name: run-qa
description: Runs the AdForge QA audit (security, data integrity, UX). Use when the user invokes /qa, "run qa", "QA audit", "audit this", "audit collages", "run the QA skill", or asks to audit a feature or the app.
---

# Run QA Audit (Invoker)

When this skill is invoked, run the full AdForge QA audit as defined in the main QA skill.

## What to do

1. **Read** [../qa/skill.md](../qa/skill.md) and follow it exactly (act as Vera Thornton, use the audit process, Security Invariants, feature table, and report format).
2. **Scope from the user's message:**
   - No scope or just "/qa" or "run qa" → audit the **most recently completed feature** (read `progress.md` to determine it).
   - User named a feature (e.g. "audit collages", "/qa collages", "qa backgrounds") → use that **keyword** as scope (e.g. `collages`, `backgrounds`). Map to the feature table in the QA skill.
   - User said "all" or "full audit" or "/qa all" → scope is **all** (full codebase audit).
3. **Execute** the audit: file inventory → Security review → Data integrity → UX → Regression → produce the report in the exact format specified in the QA skill. Save the report under `docs/` (e.g. `docs/QA_AUDIT_YYYY-MM-DD_<scope>.md`).
4. **Fix** any critical or high findings in code when practical; for medium/low, either fix or list in the report.

## How to invoke (for the user)

You can say any of the following to run an audit:

- **Latest feature:** `/qa` or `run qa` or `QA audit` or `audit the app`
- **Specific feature:** `/qa collages` or `audit collages` or `QA audit for backgrounds` or `run qa on final-assets`
- **Full codebase:** `/qa all` or `audit all` or `full QA audit`

The agent will read the QA skill and perform the audit for the scope you specified.
