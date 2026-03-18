━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA AUDIT REPORT — AdForge-Railway Full Codebase
Auditor: Vera Thornton, Principal QA Engineer
Date: 2026-03-17
Files Audited:
  - src/lib/get-company.ts
  - src/app/auth/callback/route.ts
  - src/app/api/categories/route.ts
  - src/app/api/categories/[id]/route.ts
  - src/app/api/categories/[id]/final-assets/route.ts
  - src/app/api/categories/[id]/composites/route.ts
  - src/app/api/categories/[id]/backgrounds/route.ts
  - src/app/api/categories/[id]/angled-shots/route.ts
  - src/app/api/categories/[id]/angled-shots/generate/route.ts
  - src/app/api/categories/[id]/products/route.ts
  - src/app/api/categories/[id]/products/[productId]/route.ts
  - src/app/api/categories/[id]/copy-docs/route.ts
  - src/app/api/categories/[id]/copy-docs/generate/route.ts
  - src/app/api/categories/[id]/templates/route.ts
  - src/app/api/categories/[id]/guidelines/route.ts
  - src/app/api/categories/[id]/collages/generate/route.ts
  - src/app/api/categories/[id]/brand-voice/route.ts
  - src/app/api/company/route.ts
  - src/app/api/company/members/route.ts
  - src/app/api/company/invite/route.ts
  - src/app/api/brand-assets/route.ts
  - src/lib/ai/gemini.ts
  - src/lib/ai/openai.ts
  - src/lib/ai/sanitize.ts
  - src/lib/rate-limit.ts
  - scripts/composite_final_asset.py
  - src/app/api/admin/* (5 routes)
  - src/app/(dashboard)/settings/team/page.tsx
  - src/lib/supabase/server.ts
  - src/lib/supabase/admin.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY

The multi-tenant migration is largely solid — every audited route correctly calls
`supabase.auth.getUser()`, resolves a `companyId`, and enforces `company_id`
ownership on category and nested-resource queries. However, two critical defects
were found: the `auth.admin` API in `/api/company/members` and `/api/company/invite`
is called on an **anon-key** Supabase client (it silently fails or leaks data
depending on Supabase's behavior with admin APIs on the anon key), and the invite
`redirectTo` URL embeds the raw `company_id` without any HMAC or expiry, allowing
anyone who obtains or guesses a valid company UUID to join that company.
Three high-severity issues were also found: unsanitized DB strings injected into
OpenAI system prompts, an Supabase `inviteError.message` leaking internal error
details to the client, and a `savePreview` fast-path that accepts arbitrary client-
supplied storage coordinates without verifying the file belongs to the caller's
company.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 CRITICAL (2 issues)
──────────────────────────────────────────────────────

C-01  auth.admin API called on anon-key client — will silently fail or bypass intent
      File: src/app/api/company/members/route.ts:35
            src/app/api/company/invite/route.ts:40
      Issue: Both `supabase.auth.admin.listUsers()` and `supabase.auth.admin.inviteUserByEmail()`
             are called on the client returned by `createServerSupabaseClient()`, which is
             initialised with `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The Supabase `auth.admin` namespace
             requires the service-role key. On the anon key the call will either throw, return
             empty data, or — depending on Supabase's SDK version — silently succeed using elevated
             scope that should not be available to the anon client.
      Evidence (members/route.ts):
        ```ts
        const supabase = await createServerSupabaseClient()   // anon key
        ...
        const { data: usersData } = await supabase.auth.admin.listUsers()
        ```
      Evidence (invite/route.ts):
        ```ts
        const supabase = await createServerSupabaseClient()   // anon key
        ...
        const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo })
        ```
      Fix: Import `supabaseAdmin` from `src/lib/supabase/admin.ts` (which uses
           `SUPABASE_SERVICE_ROLE_KEY`) and call `supabaseAdmin.auth.admin.*`.
           The caller has already verified company membership and admin role before
           reaching these lines, so the privilege escalation is intentional and safe
           at that point — the client just needs to be the service-role client.

C-02  Unauthenticated company_id join via auth callback — open tenant-joining
      File: src/app/auth/callback/route.ts:33-39
      Issue: The `?company_id=` query parameter embedded in the invite magic-link is
             read directly and trusted without any verification. There is no HMAC
             signature or expiry on it. Any user who can guess or obtain a valid company
             UUID (which is a Postgres UUID — not secret, and often visible in URLs
             throughout the app) can craft their own magic-link callback with
             `?company_id=<victim_uuid>` and join that company as a member.
      Evidence:
        ```ts
        const inviteCompanyId = requestUrl.searchParams.get('company_id')
        ...
        if (inviteCompanyId) {
          await supabase.from('company_members').insert({
            company_id: inviteCompanyId,
            user_id: user.id,
            role: 'member',
          })
        }
        ```
      Fix: The invite flow must be signed. The recommended approach is to encode
           `{ company_id, email, exp }` into a short-lived JWT (or use a `company_invites`
           table with a random token column) so the callback can verify the token has not
           been tampered with and has not expired. Alternatively, gate the insert with a
           server-side check: verify a row exists in `company_invites` for
           `(company_id, email, token)` before inserting into `company_members`.

──────────────────────────────────────────────────────

🟠 HIGH (3 issues)
──────────────────────────────────────────────────────

H-01  DB-sourced strings inserted raw into OpenAI system prompt — unsanitized
      File: src/lib/ai/openai.ts:154-159
      Issue: `lookAndFeel` (from `categories.look_and_feel`) and `brandGuidelines`
             (from `categories.brand_guidelines`) are concatenated directly into the
             system prompt string without passing through `sanitizeForPrompt()`. Because
             these values are written by authenticated users who control their own category,
             a user can store a prompt-injection payload in `look_and_feel` (e.g.
             "Ignore all previous instructions…") and have it executed against the GPT-4o
             system prompt for every copy-generation request in that category.
      Evidence:
        ```ts
        function buildSystemPrompt(lookAndFeel?: string, brandGuidelines?: string, ...): string {
          let system = `You are an expert copywriter...`
          if (lookAndFeel) {
            system += `\n\nBRAND STYLE: ${lookAndFeel}`      // not sanitized
          }
          if (brandGuidelines) {
            system += `\n\nBRAND GUIDELINES ...\n${brandGuidelines}`  // not sanitized
          }
        ```
      Fix: Pass both values through `sanitizeForPrompt()` before string interpolation:
        ```ts
        if (lookAndFeel) system += `\n\nBRAND STYLE: ${sanitizeForPrompt(lookAndFeel)}`
        if (brandGuidelines) system += `\n\nBRAND GUIDELINES ...\n${sanitizeForPrompt(brandGuidelines)}`
        ```
      Note: This is marked HIGH rather than CRITICAL because the injection is in the
            system prompt (lower exploitability than user-prompt injection) and the
            attacker would need to control their own category's metadata — but it still
            violates Security Invariant #4 and enables cross-context abuse.

H-02  savePreview fast-path accepts arbitrary client-supplied storage coordinates
      File: src/app/api/categories/[id]/final-assets/route.ts:140-175
      Issue: When `body.savePreview` is truthy the handler reads `storageUrl`,
             `storagePath`, and `gdriveFileId` directly from the client request body and
             inserts them into `final_assets` without verifying the file actually belongs
             to the caller's company. A malicious actor could supply the `storageUrl` of
             another company's asset, the Drive file ID of any file they can enumerate,
             and have it recorded as a final asset under their own (verified) category.
             While this does not give them access to data they cannot already view, it
             pollutes audit trails and could facilitate data exfiltration from Drive if
             the recorded URL is later served to their own users.
      Evidence:
        ```ts
        if (body.savePreview) {
          const sp = body.savePreview as {
            storageUrl: string; storagePath: string; gdriveFileId: string; ...
          }
          // No validation that sp.storagePath starts with companySlug/
          // No validation that sp.gdriveFileId was generated in this session
          const { data: savedAsset } = await supabase
            .from('final_assets')
            .insert({ ..., storage_path: sp.storagePath, storage_url: sp.storageUrl, ... })
        ```
      Fix: Validate that `sp.storagePath` starts with `${companySlug}/` before the
           insert. Additionally, consider issuing a short-lived signed token during the
           preview generation phase and verifying it in the savePreview call, so that only
           assets generated in the same session for the same user can be persisted.

H-03  inviteError.message leaked to client in error response
      File: src/app/api/company/invite/route.ts:46
      Issue: When `supabase.auth.admin.inviteUserByEmail()` returns an error, its raw
             `.message` property is forwarded directly to the HTTP response body. Supabase
             internal error messages can reveal whether an email address already exists in
             the system, the Supabase project URL or tenant info, or internal service state.
             This violates Security Invariant #10.
      Evidence:
        ```ts
        if (inviteError) {
          console.error('[company/invite POST]', inviteError)
          return NextResponse.json({ error: inviteError.message }, { status: 500 })
        }
        ```
      Fix: Return a generic message to the client; keep the detailed error server-side:
        ```ts
        return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 })
        ```

──────────────────────────────────────────────────────

🟡 MEDIUM (3 issues)
──────────────────────────────────────────────────────

M-01  copy-docs generate: brand_guidelines from DB injected into system prompt unsanitized
      File: src/app/api/categories/[id]/copy-docs/generate/route.ts:105, 145
      Issue: `category.brand_guidelines` is passed to `generateCopyVariations()` and
             `generateCopyKit()` without sanitization at the call site. The sanitization
             gap is the same as H-01 (inside `buildSystemPrompt`), but this is the specific
             route that surfaces it. Listed separately because fixing H-01 in `openai.ts`
             is the canonical fix; this finding confirms the affected call sites.
      Evidence:
        ```ts
        const results = await generateCopyVariations(
          safeBrief, ..., category.brand_guidelines || undefined, brandVoice
        )
        ```
      Fix: Resolved by fixing H-01 in `src/lib/ai/openai.ts:buildSystemPrompt`.

M-02  brand-voice route: POST does not re-verify category ownership before update
      File: src/app/api/categories/[id]/brand-voice/route.ts:148-156
      Issue: The POST handler fetches the category with `company_id` ownership check
             (line 62-68), then calls the AI extraction function, then does the DB update
             with only `.eq('id', categoryId)` — without re-asserting `.eq('company_id', companyId)`.
             In normal operation this is fine. However if categoryId has changed between the
             query and the update (race condition or logic bug), there is no safety net.
             More importantly, it is inconsistent with the rest of the codebase which always
             pairs `.eq('id', ...)` with `.eq('company_id', ...)` on mutations.
      Evidence:
        ```ts
        const { error: updateError } = await supabase
          .from('categories')
          .update({ brand_voice: profile })
          .eq('id', categoryId)      // missing: .eq('company_id', companyId)
        ```
      Fix: Add `.eq('company_id', companyId)` to the update query.

M-03  product DELETE relies on app-level RLS but deletes by ID only, not category+company
      File: src/app/api/categories/[id]/products/[productId]/route.ts:236
      Issue: The ownership check at lines 217-227 correctly verifies
             `product.category.company_id == companyId`, but the actual DELETE
             statement (line 236) only filters by `product.id` without repeating the
             `category.company_id` guard. If Supabase RLS is misconfigured or absent on
             the products table, a race condition between the ownership check and the
             delete could allow deletion of a product that was just reassigned to a
             different company.
      Evidence:
        ```ts
        const { error } = await supabase.from('products').delete().eq('id', productId)
        // Should be: .eq('id', productId).eq('company_id', companyId)
        ```
      Fix: Add `.eq('company_id', companyId)` to the delete query so the server-side
           filter serves as a defence-in-depth layer independent of RLS.

──────────────────────────────────────────────────────

🔵 LOW (4 issues)
──────────────────────────────────────────────────────

L-01  In-memory rate limiter resets on every Railway deploy — no cross-instance protection
      File: src/lib/rate-limit.ts:13
      Issue: The rate limit store is a plain in-memory `Map`. Every Railway deploy or
             container restart resets all counters. On Railway's ephemeral container model,
             a user could trigger a deploy cycle (e.g. by force-pushing) to reset their
             own rate limit. This does not bypass any auth or ownership checks but weakens
             the AI cost protection.
      Evidence:
        ```ts
        const store = new Map<string, RateLimitEntry>()
        ```
      Fix: The file already has a `// TODO: replace with Redis` comment. For a production
           deployment, replace with an upstash/redis-backed counter using `UPSTASH_REDIS_REST_URL`
           and `UPSTASH_REDIS_REST_TOKEN`. Acceptable as-is for a single-instance Railway
           deployment with awareness of the limitation.

L-02  Python SSL fallback disables certificate verification when certifi is absent
      File: scripts/composite_final_asset.py:25-27
      Issue: If the `certifi` package is not installed, the script falls back to an SSL
             context with `check_hostname = False` and `verify_mode = CERT_NONE`. This
             allows MITM attacks against image downloads during compositing on any
             environment where certifi is not present (e.g. a stripped Docker image).
      Evidence:
        ```python
        except ImportError:
            _ssl_ctx = ssl.create_default_context()
            _ssl_ctx.check_hostname = False
            _ssl_ctx.verify_mode = ssl.CERT_NONE
        ```
      Fix (out of scope per audit instructions — Python compositor is read-only):
           Ensure `certifi` is in `requirements.txt` and the Docker image. Do not silently
           fall back to `CERT_NONE`.

L-03  Company slug not validated for path-traversal characters before Drive path construction
      File: src/app/auth/callback/route.ts:46-50 (slug generation)
            Multiple upload routes using `${companySlug}/...` paths
      Issue: The company slug is generated from the user's display name or email prefix at
             signup time. The generation regex `replace(/[^a-z0-9]+/g, '-')` followed by
             appending `-${user.id.slice(0, 8)}` produces safe slugs. However the slugs are
             never re-validated at upload time. If a slug were somehow written directly to
             the DB (e.g. via a future admin tool, a migration error, or a direct DB write),
             a slug containing `../` characters would result in path traversal when
             constructing Drive paths such as `${companySlug}/${categorySlug}/...`.
      Evidence: The slug generation is safe at creation time. Risk is residual/future.
      Fix: In `getCompanyInfo()`, validate that the returned `company_slug` matches
           `/^[a-z0-9-]+$/` before returning it. Return null (triggering a 403) if the
           slug is malformed.

L-04  settings/team page: invite error message from API echoed directly to DOM
      File: src/app/(dashboard)/settings/team/page.tsx:91-92
      Issue: The raw `data.error` string returned from `/api/company/invite` is rendered
             directly in the UI (`setInviteError(data.error || 'Failed to send invite')`).
             If the API were ever changed to return a more verbose error (see H-03, which
             currently passes `inviteError.message`), that internal message would be
             visible to the user in the browser. Once H-03 is fixed the API will only
             return `'Failed to send invite'`, which makes this benign, but it is still
             a design smell.
      Evidence:
        ```ts
        const data = await res.json()
        if (!res.ok) {
          setInviteError(data.error || 'Failed to send invite')
        ```
      Fix: Use a hardcoded fallback message in the UI rather than forwarding server
           error text: `setInviteError('Failed to send invite. Please try again.')`.

──────────────────────────────────────────────────────

✅ VERIFIED CLEAN (19 items)
──────────────────────────────────────────────────────
1.  Every route calls `supabase.auth.getUser()` before touching data (Invariant #1) — PASS
2.  All category routes pair `.eq('id', categoryId)` with `.eq('company_id', companyId)` (Invariant #2) — PASS
3.  Nested resources (composites, backgrounds, angled-shots) verify category-to-company link — PASS
4.  All AI/generation endpoints call `checkRateLimit()` (Invariant #3) — PASS across all 12 generation routes checked
5.  All user-supplied strings passed to AI prompts use `sanitizeForPrompt()` not `sanitizePromptMaxLength()` (Invariant #4 partial) — PASS for user input; H-01 covers DB-sourced strings
6.  All Gemini REST API calls use `x-goog-api-key` header not `?key=` URL param (Invariant #5) — PASS (lines 170, 441, 564, 665, 958 of gemini.ts)
7.  Python subprocess wrapped in `Promise.race` with SIGKILL timeout (Invariant #6) — PASS (final-assets/route.ts:450-497, collages/generate/route.ts:136-176)
8.  Python stdin/stdout/stderr null-checked before use (Invariant #6) — PASS (final-assets/route.ts:456-459)
9.  `output_path` validated to start with `/tmp/` in Python compositor (Invariant #7) — PASS (composite_final_asset.py:753-754)
10. `isAllowedUrl()` called on all outbound URLs in Node.js routes (Invariant #8) — PASS (logoUrl, baseImageUrl, font_url in final-assets)
11. `_is_allowed_url()` called before all URL fetches in Python (Invariant #8) — PASS (download_image:130-131, download_font:159-160)
12. Input string fields have explicit length caps returning 400 (Invariant #9) — PASS across all audited routes
13. No stack traces or raw DB errors in API error responses (Invariant #10 partial) — PASS (H-03 covers one case of raw error message leakage)
14. Admin routes (`/api/admin/*`) all verified with `CRON_SECRET` Bearer token before creating service-role client (Invariant #11) — PASS
15. `getCompanyId()` helper correctly queries `company_members` table with `user_id` filter — PASS
16. Auth callback open-redirect protection (`isRelativePath` check) — PASS
17. Drive path prefix changed from `${companyId}/` to `${companySlug}/` consistently across composites, backgrounds, angled-shots, copy-docs, guidelines, brand-assets — PASS
18. SVG upload explicitly rejected in brand-assets with both MIME and magic-byte check — PASS
19. File type validated via magic bytes (not just Content-Type header) in guidelines and brand-assets — PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERDICT: NO-GO

Two critical issues must be resolved before this build goes to production:
C-01 (auth.admin on wrong client) and C-02 (unsigned invite token). H-01
(unsanitized DB strings into OpenAI system prompt) must also be resolved.
H-02 and H-03 are strongly recommended for the same release. M-02 and M-03
should be addressed in the same PR as they are one-line fixes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
