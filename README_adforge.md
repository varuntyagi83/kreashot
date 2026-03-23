# AdForge — AI-Powered Ad Creative Platform

AdForge automates the entire workflow of producing professional, on-brand social media ads — from raw product photos to export-ready creatives — in a fraction of the time and cost of traditional production.

---

## What is AdForge?

Creating ad creatives at scale is slow and expensive. Brands juggle photographers, designers, copywriters, and asset managers to produce variations across different formats, platforms, and SKUs. AdForge replaces that pipeline with an AI-driven workflow: upload your product images, configure your brand context, and generate polished ad creatives ready to drop straight into Meta Ads Manager.

**Who is it for?**
- E-commerce brands and DTC founders who need to launch campaigns fast
- Marketing teams managing multiple product lines or categories
- Creative agencies producing ad assets for multiple clients

---

## How It Works — The 8-Step Pipeline

AdForge is organised as a linear creative pipeline inside each **Category** (a campaign or product line). Move through each tab in order:

```
1. Products      →  Upload your product images
2. Angled Shots  →  AI generates multiple product angles
3. Scenes        →  AI generates lifestyle backgrounds
4. Photoshoots   →  AI composites product onto background
5. Ad Copy       →  AI writes hooks, headlines, CTAs, taglines
6. Templates     →  Design your ad layout (canvas editor)
7. Ads           →  Render final assets (image + copy + logo)
8. Collage       →  Create multi-product collage images
```

Every step feeds the next. At the end you have export-ready PNG files and a CSV ready for Meta Ads Manager import.

---

## Getting Started

### 1. Sign Up
Create an account with your email and password. On first login, AdForge automatically creates a **Company** for you and makes you its admin.

### 2. Create a Category
A Category represents a campaign or product line (e.g. *"Summer Sneakers 2026"*, *"Premium Coffee Range"*). From the dashboard, click **New Category**, give it a name, and select your target **aspect ratio(s)**:

| Format | Dimensions | Best For |
|--------|-----------|----------|
| 1:1 | 1080 × 1080 px | Instagram Feed, Facebook Feed, Carousel |
| 4:5 | 1080 × 1350 px | Instagram Portrait, Facebook Portrait |
| 16:9 | 1920 × 1080 px | YouTube, Facebook Video, Display |
| 9:16 | 1080 × 1920 px | Instagram Stories, TikTok, Reels |

### 3. Upload Products
Go to the **Products** tab inside your category. Upload one or more product images (packshots, flat lays, or studio shots). Each image becomes a product entry that flows through the entire pipeline.

### 4. Configure Brand Context *(optional but recommended)*
Before generating, set your brand context to keep everything on-brand:
- **Look & Feel** — a short description of your visual style (e.g. *"Clean, minimal, Scandinavian aesthetic. Natural light. Warm tones."*)
- **Guidelines** — upload a brand guidelines PDF. AdForge extracts your colours, tone, target audience, and visual identity automatically.
- **Brand Voice** — AI builds a reusable voice profile (tone, personality, messaging pillars, vocabulary) from your guidelines or sample copy.

### 5. Run the Pipeline

#### Angled Shots
AdForge uses **Google Gemini** to generate product images from multiple angles — front, side, back, lifestyle, and detail shots — directly from your uploaded image. No photography needed.

#### Scenes (Backgrounds)
Generate contextual lifestyle backgrounds that match your brand's look & feel. AdForge creates settings like coffee shops, gyms, outdoor environments, or studio setups using **Google Gemini**.

#### Photoshoots (Composites)
AdForge merges your product (angled shot) onto the generated background using AI, producing a realistic composite image. This is the visual centrepiece of your final ad.

#### Ad Copy
Switch to the **Ad Copy** tab and generate copy variants powered by **GPT-4o**. Select which types you need:

| Copy Type | Description |
|-----------|-------------|
| Hook | Attention-grabbing opening line |
| Tagline | Short punchy phrase for on-image overlay |
| Headline | Ad headline (Facebook / Google) |
| Body | Supporting paragraph copy |
| CTA | Call-to-action text |

Choose a tone (professional, casual, playful, urgent, empathetic) and target audience. All copy is informed by your brand voice profile if one is set.

#### Templates
Use the built-in **canvas editor** to design how your final ad looks: position the composite image, add text zones (tagline, headline, CTA), drop in your logo, and apply overlays or watermarks. Save templates per category per format.

#### Ads (Final Assets)
Click **Render** to combine your composite + template + copy + brand assets into a finished high-resolution PNG. Generate as many variations as you need. Preview before saving. Download individual files or export all at once.

#### Collage
Create multi-product layouts combining several product shots into a single image — useful for range ads or collection announcements.

### 6. Export for Ads
Once your final assets are ready:
- **Download** individual PNG files directly from the Ads tab
- **Export CSV** — a spreadsheet formatted for Meta Ads Manager, with image URLs and copy fields mapped to the correct columns. Import it directly to launch your campaign.

---

## Brand Kit

The **Brand Kit** (accessible from the sidebar) is your global asset library shared across all categories:

- **Logos** — upload logo files in different variants (dark, light, icon-only). Apply them inside templates.
- **Overlays** — PNG overlays and watermarks layered onto final assets.
- **Fonts** — upload custom font files used in the template canvas editor.

---

## Team Collaboration

AdForge supports multi-user teams under a single company.

### Roles

| Role | Permissions |
|------|-------------|
| Admin | Full access — create/delete categories, invite and remove members, edit company name |
| Member | Generate assets, upload products, view all categories — cannot invite others |

### Inviting Team Members
1. Go to **Settings → Team**
2. Enter your colleague's email and click **Send Invite**
3. They receive a magic-link email — one click and they are automatically added to your company

No separate signup flow needed. Invitees are placed directly into your company as members.

---

## AI Models at a Glance

| Task | Model | Provider |
|------|-------|----------|
| Angled shots, backgrounds, composites | Gemini 3.1 Flash (image generation) | Google |
| All ad copy (hooks, taglines, headlines, CTAs, body) | GPT-4o | OpenAI |
| Brand voice extraction from guidelines | GPT-4o | OpenAI |
| Competitor video analysis *(coming soon)* | Gemini 2.5 Flash | Google |

---

## Supported Ad Formats

AdForge generates assets in the aspect ratios you select per category. All pipeline steps (angled shots, backgrounds, composites, final assets) are produced in your chosen formats automatically.

| Format | Use Case |
|--------|----------|
| 1:1 Square | Instagram Feed, Facebook Feed, Carousel |
| 4:5 Portrait | Instagram Portrait, Facebook Portrait |
| 16:9 Landscape | YouTube Pre-roll, Facebook Video, Display |
| 9:16 Vertical | Instagram Stories, TikTok, Reels |

---

## Key Concepts & Terminology

| Term | Definition |
|------|-----------|
| **Category** | A campaign or product line (e.g. "Summer Collection 2026"). Contains products, assets, templates, and copy. |
| **Angled Shot** | AI-generated product photo from a specific angle (front, side, back, lifestyle, detail). |
| **Scene / Background** | AI-generated contextual setting (beach, coffee shop, gym, etc.) matching your brand look & feel. |
| **Composite / Photoshoot** | AI-merged image of a product on a background. Forms the basis of every final ad. |
| **Final Asset / Ad** | Rendered image = composite + text overlay + logo + overlays. Export-ready for social platforms. |
| **Template** | Visual layout design defining where images, text, and logos are positioned in the final ad. |
| **Brand Voice** | Extracted tone, personality, messaging pillars, and vocabulary style that guides copy generation. |
| **Copy Type** | Category of ad text: hook, tagline, headline, CTA, body. |
| **Ad Export** | CSV file with final asset image URLs and copy fields, ready to import into Meta Ads Manager. |

---

## Frequently Asked Questions

**Do I need design or AI prompting experience?**
No. AdForge handles all the AI prompting internally. Configure your brand context once and the system uses it to guide every generation automatically.

**Can I edit the generated images?**
The template canvas lets you reposition, resize, and layer generated images. For advanced retouching, download the asset and use your preferred design tool.

**How many assets can I generate?**
There are no hard limits per category. Generate as many variants as you need and cherry-pick the best for your final ads.

**What file format are exports?**
Final assets are exported as high-resolution PNGs. Ad copy is exported as a CSV compatible with Meta Ads Manager.

**Is my data shared between companies?**
No. All categories, products, and assets are strictly isolated to your company. Other companies cannot access your data.

**Can I use my own fonts and logos?**
Yes. Upload fonts and logo files to your Brand Kit and they become available in the template canvas editor across all categories.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Database & Auth | Supabase (PostgreSQL + Row-Level Security) |
| AI — Images | Google Gemini (`gemini-3.1-flash-image-preview`) |
| AI — Copy | OpenAI GPT-4o |
| Image Processing | Sharp (Node.js), Python Pillow (compositing) |
| Canvas Editor | Fabric.js |
| Storage | Google Drive (service account) |
| Deployment | Railway (Docker) |

---

## Support

For issues, feedback, or feature requests, please reach out through the support channel provided on your account dashboard.
