━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE PIPELINE AUDIT — AdForge
Auditor: Iris, Image Pipeline Engineer
Date: 2026-03-23
Category tested: Gummy Bear (a7510dad-d33d-4e77-8ed2-6b41fb92990f)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Environment

- Dev server: http://localhost:3006 (started fresh for this audit)
- Auth: Supabase email/password session (cookie-based)
- Storage: Google Drive (service account)
- Product tested: Green Cycle Complex (c3d65fb5-b849-482b-9134-55b1dd6b8821)
- Product image tested: 56c385fd-0bc3-42b4-afad-2419cabd90e2 (gdrive: 1lMO72fNIUKuE7rALhnH8y4EdjVTgtllm)

---

## Assets Generated & Saved

### Background
- **Endpoint**: POST /api/categories/{id}/backgrounds/generate
- **Status**: PASS — Generated successfully in ~43s using Gemini (gemini-3.1-flash-image-preview)
- **Generate response**: 1 background, format 1:1, imageData 11,167,539 chars (base64 JPEG)
- **Save endpoint**: POST /api/categories/{id}/backgrounds
- **Save status**: PASS
- **Background ID**: 5bb977c4-bac4-4eeb-88a7-b8fd115694d4
- **GDrive File ID**: 1hr7aJOdv9qxjQe3Bb7Wk9-8FJfPTYYzv
- **Name**: iris-test-scene-1774283775
- **Format**: 1:1
- **Prompt**: "Clean modern product scene with soft natural lighting"

### Angled Shot (Generate)
- **Endpoint**: POST /api/categories/{id}/angled-shots/generate
- **Status**: FAIL — DB insert fails; count returned is 0
- **Root cause**: Supabase insert for `angled_shots` references a non-existent column
  `generation_time_ms` that is missing from the schema cache.
  Error: `"Could not find the 'generation_time_ms' column of 'angled_shots' in the schema cache"`
- **Gemini generation**: Image IS generated and uploaded to GDrive (file ID visible in cleanup log: 1uT4U_1px5hVpMTuU6OxYtZTrCboITdNd), but the DB insert fails and the file is then deleted as orphan cleanup.
- **Fallback used**: Existing 1:1 "front" angled shot (ID: 39f5baaf-d255-4d53-b4d9-396abe9c24b0, GDrive: 17CqC9jBLtJz9f2S_GfIytZBpnNx4mRYP) from the 28 pre-existing 1:1 shots.

### Composite
- **Generate endpoint**: POST /api/categories/{id}/composites/generate
- **Status**: PASS — Generated successfully in ~43s using Gemini
- **Generate response**: 1 result, image_base64 (JPEG), generationTimeMs: 43444ms
- **Pairs used**: angledShotId=39f5baaf, backgroundId=5bb977c4
- **Save endpoint**: POST /api/categories/{id}/composites
- **Save status**: PASS
- **Composite ID**: 9c2b09d6-6b68-4099-aa1e-7933e71c5197
- **GDrive File ID**: 1md2vl3f4oZjt3n9Y40fKQu1i_wvclyqR
- **Name**: iris-test-composite-1774284027
- **Format**: 1:1 (1080x1080)

---

## Download Matrix

Tested using background GDrive file ID: 1hr7aJOdv9qxjQe3Bb7Wk9-8FJfPTYYzv
Auth: Supabase session cookie (required — unauthenticated requests return HTTP 307 redirect to /auth/login)

| Resolution | Format | HTTP Code | Size (bytes) | Notes                     |
|------------|--------|-----------|--------------|---------------------------|
| Original   | JPEG   | 200       | 1,311,776    | Full resolution            |
| Original   | WebP   | 200       | 518,350      | Full resolution            |
| Original   | PNG    | 200       | 24,999,049   | Full resolution            |
| 1K         | JPEG   | 200       | 90,807       | Resized to 1024px max      |
| 1K         | WebP   | 200       | 38,850       | Resized to 1024px max      |
| 1K         | PNG    | 200       | 1,900,363    | Resized to 1024px max      |
| 2K         | JPEG   | 200       | 306,405      | Resized to 2048px max      |
| 2K         | WebP   | 200       | 123,628      | Resized to 2048px max      |
| 2K         | PNG    | 200       | 7,464,447    | Resized to 2048px max      |
| 4K         | JPEG   | 200       | 1,311,776    | Same as Original*          |
| 4K         | WebP   | 200       | 518,350      | Same as Original*          |
| 4K         | PNG    | 200       | 24,999,049   | Same as Original*          |

*4K returns same size as Original because Sharp uses `withoutEnlargement: true` — the source image
is already below 4K resolution, so no upscaling occurs. This is correct/expected behavior.

**Download verdict: ALL 12 COMBINATIONS PASS (HTTP 200)**

---

## Final Asset Generation

### Attempt 1: Using iris-test-composite (1:1)
- **Composite**: 9c2b09d6 (iris-test-composite-1774284027)
- **Composite GDrive URL**: https://lh3.googleusercontent.com/d/1md2vl3f4oZjt3n9Y40fKQu1i_wvclyqR=w2000
- **Status**: FAIL — HTTP 500
- **Root cause**: The Python compositor script (`composite_final_asset.py`) tries to download the
  composite via its `storage_url` (lh3.googleusercontent.com), but freshly uploaded GDrive files
  return HTTP 404 on that URL format immediately after upload. Google's `lh3` thumbnail CDN
  requires propagation time before the URL becomes publicly accessible.
- **Error in logs**: `urllib.error.HTTPError: HTTP Error 404: Not Found` at `bg_image = download_image(composite_url)`

### Attempt 2: Using pre-existing 4:5 composite
- **Composite**: 638207b8 (Green Cycle Complex_Three Quarter Left on Plain green wall 4:5)
- **Template**: f93a9d1d (Actual Template 4:5)
- **Status**: PASS — HTTP 200, final asset generated and saved
- **Final Asset ID**: 2176d06e-91fa-48ee-b654-4338802c70cc
- **GDrive File ID**: 1-oNtMTDJquD-WlvVndM8nLmwxFntZhlK
- **Format**: 4:5 (1080x1350)
- **Storage path**: Sunday Natural/sunday-natural-181d469d/gummy-bear/final-assets/4x5/asset_1774284502204.png
- **Python compositor**: Ran successfully with 5 layers on 1080x1350 canvas

---

## Issues Found

### ISSUE 1 — CRITICAL: Angled Shot DB insert fails due to missing schema column
- **Severity**: Critical — angled shot generation is completely broken for all users
- **Location**: `src/app/api/categories/[id]/angled-shots/generate/route.ts` line 211
- **Problem**: The insert payload includes `generation_time_ms` field, but this column does not
  exist in the `angled_shots` table in Supabase (it's missing from the schema cache).
- **Effect**: Every angled shot generation attempt:
  1. Calls Gemini API (token cost incurred)
  2. Uploads file to Google Drive (storage used)
  3. Fails the DB insert
  4. Triggers orphan cleanup: deletes the uploaded GDrive file
  5. Returns `count: 0` with no error message to the client
- **Fix needed**: Either add the `generation_time_ms` column to the `angled_shots` Supabase table,
  or remove the field from the insert payload in the route.

### ISSUE 2 — HIGH: Final asset generation fails for freshly saved composites
- **Severity**: High — first-time use of a new composite will always fail
- **Location**: `scripts/composite_final_asset.py` line 434, via `src/app/api/categories/[id]/final-assets/route.ts`
- **Problem**: The Python script downloads the composite image using `storage_url`
  (`https://lh3.googleusercontent.com/d/{fileId}=w2000`). Newly uploaded Google Drive files are not
  immediately accessible via this CDN URL — they return HTTP 404 for an indeterminate period after upload.
- **Effect**: Any composite saved in the current session cannot be used for final asset generation
  until Google's CDN propagates the file (could be minutes to hours).
- **Fix options**:
  1. Use the Google Drive API download endpoint (via service account) instead of the public CDN URL
  2. Store the raw image bytes during composite save and pass them directly to the Python script
  3. Add a retry/wait loop in the Python script or route before attempting the CDN download
  4. Use the `/api/download` endpoint (which uses the Drive API) to fetch the composite for the Python script

### ISSUE 3 — LOW: Download endpoint returns 307 redirect without auth (not a user-facing bug)
- **Severity**: Low — informational
- **Location**: `src/app/api/download/route.ts` and `src/middleware.ts`
- **Problem**: The `/api/download` route requires auth via cookie session. Without a valid session,
  the middleware redirects to `/auth/login` (HTTP 307). The route handles auth itself at line 34,
  but the middleware intercepts first. This means unauthenticated curl requests without `-L` (follow
  redirects) see only the redirect, not a useful 401.
- **Effect**: No user-facing impact; the UI always has an active session. Minor DX issue for API consumers.

### ISSUE 4 — LOW: 4K download returns same bytes as Original (expected but undocumented)
- **Severity**: Low / informational
- **Location**: `src/app/api/download/route.ts` line 81
- **Problem**: Sharp uses `withoutEnlargement: true`, so requesting 4K for a sub-4K image returns
  the original resolution. No error is returned; the file is silently at original resolution.
- **Effect**: Users selecting "4K" may expect upscaling but receive the same file as "Original".
  Should be documented in the UI or handled with a clear message.

---

## Final Asset Generation

| Step                       | Status | Notes                                         |
|----------------------------|--------|-----------------------------------------------|
| Background Generate        | PASS   | Gemini ~43s, 11MB base64 response             |
| Background Save            | PASS   | GDrive upload + DB insert OK                  |
| Angled Shot Generate       | FAIL   | DB insert fails (missing column)              |
| Composite Generate         | PASS   | Gemini ~43s, 9.4MB base64 response            |
| Composite Save             | PASS   | GDrive upload + DB insert OK                  |
| Download (12 combinations) | PASS   | All HTTP 200, correct sizes                   |
| Final Asset (new composite)| FAIL   | GDrive CDN propagation delay (404 on new file)|
| Final Asset (old composite)| PASS   | Python compositor succeeded, saved to GDrive  |

---

## VERDICT: PARTIAL PASS / FAIL

The core image generation pipeline (Backgrounds, Composites, Downloads) is functional. Two critical issues block the full pipeline from working end-to-end:

1. **Angled Shot generation is broken** — every attempt silently fails at DB insert due to a missing `generation_time_ms` column. This is a regression that must be fixed immediately (either add the column to Supabase or remove it from the insert payload).

2. **Final Asset generation fails for freshly saved composites** — the Python compositor cannot download newly uploaded GDrive files via the CDN URL. The fix requires switching to Drive API download or passing image bytes directly. Only pre-existing composites (whose CDN URLs have had time to propagate) can produce final assets.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
