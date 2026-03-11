# AdForge — App Overview, Storage, Models, Quality & Issues

**Last updated:** 2026-03-11

---

## 1. What the app does

**AdForge** is a **Next.js 16 ad-generation platform** that lets users build brand-aligned ad creatives in a template-first flow:

1. **Categories** — Each category has a name, slug, description, and **look and feel** (style for AI).
2. **Products** — Products live in categories; users upload **product images** (one or more per product).
3. **Angled shots** — AI (Gemini) generates additional angles of the same product from one source image.
4. **Backgrounds** — AI generates product-photography **backgrounds** (scenes, no product) from prompts + optional reference images.
5. **Composites** — AI combines a product (or angled shot) + background into one image, with optional **safe zones** from templates.
6. **Templates** — Per-category, per-format (1:1, 16:9, 9:16, 4:5) **layout blueprints** (layers, safe zones, copy slots).
7. **Copy** — OpenAI generates **hooks, headlines, CTAs, taglines, body** copy; can use **brand voice** + **brand guidelines PDF** text.
8. **Final assets** — Python (PIL) **compositor** assembles template + composite/collage + copy + logo into a final PNG; uploaded to storage.
9. **Collages** — Multi-image **collage ads** (grid layouts, image + text layers) built in UI, rendered by the same Python script.

**Auth:** Supabase (email/password). **Deployment:** Railway (Docker). **Default storage:** Google Drive (optional Supabase Storage for product images).

---

## 2. Where images and data are stored

### 2.1 Primary storage: **Google Drive**

- **Root:** One shared Drive folder (`GOOGLE_DRIVE_FOLDER_ID`). All paths are **relative to that folder**.
- **Path pattern:** `{categorySlug}/{resourceType}/{formatFolder?}/{fileName}`  
  `formatFolder` is format with `:` replaced (e.g. `1x1`, `16x9`).

| Resource            | Path pattern example |
|--------------------|----------------------|
| Product images     | `{categorySlug}/{productSlug}/product-images/angled-shots/{formatFolder}/{name}-{ts}.{ext}` |
| Backgrounds        | `{categorySlug}/backgrounds/{formatFolder}/{slug}_{ts}.jpg` (or similar) |
| Composites         | `{categorySlug}/composites/{formatFolder}/{slug}_{ts}.{ext}` |
| Templates          | `{categorySlug}/templates/{formatFolder}/{name}.json` |
| Final assets       | `{categorySlug}/final-assets/{formatFolder}/asset_{ts}.png` |
| Collages           | `{categorySlug}/collages/{formatFolder}/collage_{ts}.png` |
| Copy docs          | `{categorySlug}/copy-docs/{copyType}/{slug}_{ts}.json` |
| Guidelines (PDF)    | Not stored as file; text only in DB (see below). |

### 2.2 Database (Supabase PostgreSQL) — metadata for every asset

Each generated/uploaded asset has a row with:

- **`storage_provider`** — `'gdrive'` (or `'supabase'` for some product images).
- **`storage_path`** — Full path under the Drive root (e.g. `gummy-bears/backgrounds/1x1/studio_123.jpg`).
- **`storage_url`** — Public URL (e.g. Google Drive thumbnail/download URL).
- **`gdrive_file_id`** — Drive file ID for fast delete; used by deletion-queue triggers.

Tables that have these columns: `product_images`, `angled_shots`, `backgrounds`, `composites`, `templates`, `final_assets`, `collages`, `copy_docs`, `guidelines`, `brand_assets`. Many also have a **`metadata`** JSONB column (e.g. format, dimensions, prompt).

### 2.3 Brand assets (logos, overlays)

- **Table:** `brand_assets` (global per user).
- **Storage:** Can be Supabase Storage or Drive; **seed overlays** may be stored as data URLs in `storage_url` + `metadata`.

### 2.4 Brand guidelines and brand voice (no image storage)

- **Brand guidelines (PDF):**  
  - PDF binary is **not** stored.  
  - Upload → text extracted in-memory (`pdfjs-dist`) → **only text** saved in `categories.brand_guidelines` (TEXT, ~8000 chars max).  
  - Filename in `categories.brand_doc_name`.  
  - Optional: **Gemini Vision** (`gemini-2.0-flash`) can extract richer specs from PDF; **color translation** for image prompts uses `gemini-2.5-flash` and is stored in `brand_guidelines.color_description` (if used).
- **Brand voice:**  
  - **Per category:** `categories.brand_voice` (JSONB) — 15+ fields (tone_words, personality, dos/donts, sample_phrases, etc.).  
  - **Library:** `brand_voices` table for reusable named profiles (user-level).

---

## 3. LLM and image models used

| Purpose              | Model / API | Where used |
|----------------------|-------------|------------|
| **Image generation**  | **Gemini 3.1 Flash Image Preview** (`gemini-3.1-flash-image-preview`) | Angled shots, backgrounds, composites, background reformat. All via **REST** `generateContent`, not the SDK. |
| **Copy (text)**      | **OpenAI GPT-4o** (`gpt-4o`) | Copy variations, copy kit. `src/lib/ai/openai.ts`. |
| **Brand voice extraction** | **OpenAI GPT-4o** (Q&A, text samples) + **Gemini 2.5 Flash** (ad images analysis) | `src/lib/ai/brand-voice.ts`. |
| **PDF brand extraction** | **Gemini 2.0 Flash** (vision) | `src/lib/pdf.ts` — `extractPdfWithVision()`. |
| **Color description for image prompts** | **Gemini 2.5 Flash** (text) | `src/lib/pdf.ts` — `translateGuidelinesToColorDescription()`. |
| **Copy generation (Gemini path)** | **Gemini 2.5 Flash** (SDK `@google/generative-ai`) | `gemini.ts` — `buildCopySystemPrompt` / text generation; used if OpenAI not configured. |

**Image resolution:** All Gemini image calls use **`imageSize: '4K'`** (and aspect ratio from canvas/format). No `2K` in current code.

---

## 4. Output quality settings

- **Image size:** 4K everywhere for Gemini image (angled shots, backgrounds, composites, reformat).
- **Aspect ratios:** 1:1, 16:9, 9:16, 4:5 — from `format_configs` / template; canvas dimensions (e.g. 1080×1080, 1920×1080) passed to API and Python.
- **Composite:** `temperature: 0.4`, `topP: 0.9` for more consistent compositing.
- **Angled shots:** `temperature: 0.5`, `topP: 0.95`; strong system instruction for product/label fidelity.
- **Copy:** `temperature: 0.8`, `max_tokens: 500` (OpenAI).
- **Final PNG:** Python compositor saves PNG with `quality=95` (PIL).

---

## 5. Known output and quality issues

### 5.1 From progress and fixes already done

- **Composite product text:** Composite prompt was overwriting product packaging text; fixed with clear “product packaging text = preserve” vs “overlay text = forbidden” and `systemInstruction`.
- **MIME type:** Composites now use **magic-byte detection** for upload MIME instead of hardcoded `image/jpeg`.
- **Safe zones:** Composites respect template safe zones; product placement and restricted zones are in the prompt.

### 5.2 From Issues.md (still open)

- **No retry on Gemini (429/503):** Transient failures kill the whole batch (#44). Adding retry with backoff would improve reliability and perceived quality.
- **Angled shots silent fallback:** On generation failure, code can fall back to original image without clearly signaling error to the user (#45).
- **Prompt injection / sanitization:** User content is sanitized (`sanitizeForPrompt`) but prompt-injection risk is still noted (#17); overtightening could hurt copy quality.
- **Brand voice deletion race:** Deleted voice can still be used if a concurrent request runs (#9).

### 5.3 Product/copy fidelity

- **Composite:** System instruction and prompt stress preserving product labels and colors; no editorial text in composite.
- **Copy:** Brand voice (and optionally brand guidelines text) is injected into the system prompt so copy aligns with brand.

---

## 6. Libraries and model sunset / deprecation

### 6.1 Models

- **Gemini 3.1 Flash Image Preview** — Current as of 2026; documented as “Nano Banana 2”, supports 4K. No sunset noted in codebase; worth watching Google’s model lifecycle for any deprecation.
- **Gemini 2.0 Flash / 2.5 Flash** — Used for PDF vision and text (brand color description, optional copy). Google may rename or version these; no deprecation noted in app.
- **GPT-4o** — Current flagship OpenAI model; no sunset.

### 6.2 Libraries

- **`@google/generative-ai`** and **`@google/genai`** — Both present; image generation is done via **REST** to `generativelanguage.googleapis.com`, not the SDK image API. Brand-voice and copy use the SDK (`getGenerativeModel('gemini-2.5-flash')`). No explicit deprecation in repo.
- **`pdfjs-dist`** — Used for PDF text extraction; scanned/image-only PDFs not supported (text only).
- **PIL (Pillow)** — Used in `composite_final_asset.py`; no sunset.
- **Sharp** — Used for image metadata/dimensions and format detection; no sunset.

---

## 7. Recommendations for best output

1. **Keep image size at 4K** — Already set; avoid reverting to 2K.
2. **Add Gemini retries** — Retry with exponential backoff on 429/503 in `gemini.ts` to reduce batch failures and improve perceived quality.
3. **Surface angled-shot failures** — When falling back to original image, return a flag or message so the UI can show “generation failed, showing original.”
4. **Brand guidelines** — Use both PDF text extraction and (if available) Vision extraction + color description so background/composite prompts get accurate brand colors and mood.
5. **Brand voice** — Always pass the selected brand voice (and guidelines) into copy generation so tone and rules are consistent.
6. **Safe zones** — Define templates with clear product safe zones and restricted zones; the composite prompt already uses them.
7. **Watch model names** — If Google deprecates `gemini-3.1-flash-image-preview` or renames Gemini 2.x, update `gemini.ts` and `src/lib/pdf.ts` (and any env/docs that reference model names).
8. **Orphaned assets** — Issues #2, #3, #43 (orphaned GDrive files on DB failure or category/product delete) don’t affect output quality but can leave stale files; fix with transaction ordering and deletion-queue usage.

---

## 8. Quick reference — key files

| Concern        | Location |
|----------------|----------|
| Image generation (Gemini) | `src/lib/ai/gemini.ts` |
| Copy (OpenAI)  | `src/lib/ai/openai.ts` |
| Brand voice    | `src/lib/ai/brand-voice.ts` |
| PDF / color    | `src/lib/pdf.ts` |
| Storage (Drive) | `src/lib/storage/gdrive-adapter.ts` |
| Compositor     | `scripts/composite_final_asset.py` |
| Format config  | `supabase/migrations/015_multi_format_support.sql` (`format_configs` table) |
| Known issues   | `Issues.md` |
| Progress / features | `progress.md` |
