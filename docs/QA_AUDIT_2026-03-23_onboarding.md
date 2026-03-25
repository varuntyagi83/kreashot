━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway [Onboarding / Auth]
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-23
Files Audited:
  src/app/api/onboarding/route.ts
  src/app/auth/callback/route.ts
  src/app/auth/signup/page.tsx
  src/app/onboarding/page.tsx
  src/app/(dashboard)/layout.tsx
  src/middleware.ts
  src/lib/supabase/admin.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
The onboarding flow is structurally sound with proper RLS enforcement, admin-client
usage, and data isolation verified end-to-end. Four issues found: one HIGH (invite path
used user-session client for a membership insert that RLS blocks), two MEDIUM (silent
callback failure + missing length cap), one LOW (raw error message exposure). All four
fixed and pushed in this audit pass.

🔴 CRITICAL (0 issues)
──────────────────────────────────────────────────────
None.

🟠 HIGH (1 issue — FIXED)
──────────────────────────────────────────────────────
H-01  Invite path company_members insert bypassed by RLS
      File: src/app/auth/callback/route.ts:60 (pre-fix)
      Issue: Invite path used user-session Supabase client to insert into company_members,
             but new users have no membership row yet — RLS blocks the insert silently.
             Users accepting an invite would land with no company, hitting the onboarding loop.
      Evidence: `await supabase.from('company_members').insert({...})` — supabase is the
                user-session client; non-invite path correctly used getSupabaseAdmin() but
                invite path did not.
      Fix: Changed to `await getSupabaseAdmin().from('company_members').insert({...})` ✅

🟡 MEDIUM (2 issues — FIXED)
──────────────────────────────────────────────────────
M-01  displayName from user metadata not length-capped before DB insert
      File: src/app/auth/callback/route.ts:75 (pre-fix)
      Issue: company_name from user_metadata used directly without .substring(0,100).
             A user can set arbitrarily long company_name at signup, bypassing the 100-char
             guard enforced in /api/onboarding.
      Evidence: `const displayName = (user.user_metadata?.company_name as string)?.trim() || ...`
                — no length cap applied before `admin.from('companies').insert({ name: displayName })`
      Fix: Applied `.substring(0, 100)` to the resolved displayName string ✅

M-02  Silent failure + no redirect on callback company insert error
      File: src/app/auth/callback/route.ts:86 (pre-fix)
      Issue: If the company insert fails (slug collision, DB error), the code silently
             continued — `if (company)` is false, membership never created, user redirected
             to dashboard. Dashboard layout catches the missing membership and redirects to
             /onboarding, but the failure was unlogged and the cause hidden.
      Evidence: `const { data: company } = await getSupabaseAdmin()...` — error was discarded;
                no `error: companyErr` destructuring, no log, no explicit /onboarding redirect.
      Fix: Destructured error, added console.error log, and redirect to /onboarding on failure ✅

M-03  TOCTOU race on double-onboarding (noted, not fixed — acceptable risk)
      File: src/app/api/onboarding/route.ts:21-60
      Issue: Idempotency check (SELECT company_members) and the company INSERT are not atomic.
             Two concurrent requests from the same user could both pass the empty-check window
             and both create companies.
      Evidence: Lines 21-25 read company_members; lines 47-60 insert company + member — no
                transaction or advisory lock between them.
      Risk: Very low in practice (only on first login, requires sub-second concurrent requests).
            A DB-level UNIQUE constraint on company_members(user_id) would be the correct guard.
      Fix: Not fixed in code — requires a Supabase migration. Track as tech debt.

🔵 LOW (1 issue — FIXED)
──────────────────────────────────────────────────────
L-01  Raw Supabase error message surfaced on signup failure
      File: src/app/auth/signup/page.tsx:53 (pre-fix)
      Issue: `toast.error(error.message)` exposes Supabase internals like "User already
             registered" — user enumeration risk.
      Evidence: `if (error) { toast.error(error.message) }`
      Fix: Replaced with generic message: "Could not create account. Please check your
           details and try again." ✅

✅ VERIFIED CLEAN (10 items)
──────────────────────────────────────────────────────
- Auth check via supabase.auth.getUser() before data access in /api/onboarding ✅
- Body parsed AFTER auth check in /api/onboarding ✅
- companyName length capped at 100 chars with explicit 400 error in /api/onboarding ✅
- Admin client used for company + member inserts in /api/onboarding ✅
- Idempotency: double-call returns alreadyOnboarded:true without error ✅
- Open redirect protection on auth/callback `next` param ✅
- UUID format validation on invite company_id param ✅
- Dashboard layout redirects to /onboarding when company membership missing ✅
- Middleware blocks unauthenticated access to /onboarding (redirects to login) ✅
- Data isolation verified: new user sees 0 categories, IDOR attempt on Sunday Natural blocked ✅

VERDICT
GO — with the four fixes applied (pushed as 20e034f3). The remaining TOCTOU (M-03)
requires a DB migration for a proper fix; risk is low in practice and should be tracked
as tech debt rather than blocking deployment.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
