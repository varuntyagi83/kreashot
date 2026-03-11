# Supabase Security Advisor

If Supabase emails you about **security vulnerabilities** (e.g. "4 error(s)"), use this to resolve them.

## 1. View the exact issues

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project **AdForge**.
2. Go to **Database** → **Security Advisor**.
3. Note each finding’s **code** and **object** (e.g. table or view name).

## 2. Common checks and fixes

| Code | Meaning | Typical fix |
|------|--------|-------------|
| **0013** | RLS disabled in public schema | Enable RLS on the table and add policies (see migration `20260311_fix_security_advisor_rls.sql` for `format_configs`). |
| **0008** | RLS enabled but no policies | Add at least one policy so allowed users can access the table. |
| **0007** | Policies exist but RLS disabled | Run `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`. |
| **0002** | Auth users exposed | Ensure `auth.users` (or views on it) are not exposed to the client/API. Use RLS and avoid selecting from `auth.users` in public APIs. |
| **0010** | Security definer view | Recreate the view with `SECURITY INVOKER` or ensure it doesn’t leak data. |
| **0023** | Sensitive columns exposed | Restrict access via RLS or avoid exposing sensitive columns in APIs. |

## 3. What was fixed in this repo

- **`format_configs`** (migration `20260311_fix_security_advisor_rls.sql`): RLS was enabled and a read-only policy for `authenticated` users was added. This addresses **0013** for that table.
- **Security Definer Views** (migration `20260311_fix_security_definer_views.sql`): The views `templates_by_format`, `composites_by_format`, and `final_assets_by_format` were recreated with `WITH (security_invoker = on)` so they run as the calling user and RLS on underlying tables applies. This addresses **0010** for those three views.

## 4. After applying migrations

1. Apply the new migration to your Supabase project (via CLI, Dashboard SQL, or your deploy process).
2. In the Dashboard, open **Database** → **Security Advisor** and run **Rerun** (or wait for the next run).
3. If other findings remain, use the table above and the [Supabase Database Advisors docs](https://supabase.com/docs/guides/database/database-advisors) to fix them by code.

## 5. RLS best practices in this app

- All user-data tables use RLS with `auth.uid() = user_id` (or equivalent).
- Use the **anon** key (and `createServerSupabaseClient()`) in app code so RLS is enforced.
- Use the **service_role** key only in trusted server-side admin routes, never in client or public APIs.
