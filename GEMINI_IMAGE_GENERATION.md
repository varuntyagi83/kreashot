# Gemini Image Generation Setup

AdForge uses **Gemini 3 Pro Image Preview** for generating angled product shots. This model performs **image-to-image generation**, which is perfect for creating angle variations while preserving product details and text.

## Quick Setup (2 Minutes)

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click **"Get API Key"**
3. Create a new API key or use an existing one
4. Copy the API key

### 2. Add to .env.local

```bash
GOOGLE_GEMINI_API_KEY=your-api-key-here
```

That's it! No Google Cloud Platform setup needed. 🎉

## How It Works

### Image-to-Image Generation

Unlike text-to-image models (like Stable Diffusion or DALL-E), Gemini's image generation:

1. **Takes your original product image** as input
2. **Modifies it** based on the angle prompt
3. **Preserves product details** including text, colors, and design
4. **Returns the modified image**

### Request Structure

```javascript
{
  "contents": [{
    "parts": [
      {
        "inline_data": {
          "mime_type": "image/jpeg",
          "data": "base64_image_data"
        }
      },
      {
        "text": "Create a variation showing: three-quarter view from left..."
      }
    ]
  }],
  "generationConfig": {
    "temperature": 0.4,
    "topP": 0.95,
    "maxOutputTokens": 32768,
    "responseModalities": ["TEXT", "IMAGE"]
  }
}
```

### Key Feature: `responseModalities`

The `responseModalities: ["TEXT", "IMAGE"]` configuration tells Gemini to:
- Return both text analysis AND generated image
- Perform image modification (not just analysis)
- Maintain context from the original image

## Advantages Over Vertex AI Imagen

| Feature | Gemini 3 Pro | Vertex AI Imagen 4 |
|---------|--------------|-------------------|
| **Setup** | Just API key | GCP project + service account |
| **Approach** | Image-to-image | Text-to-image |
| **Text Preservation** | ✅ Excellent | ⚠️ Moderate |
| **Product Details** | ✅ Excellent | ⚠️ Can hallucinate |
| **Cost** | Free tier available | $0.04 per image |
| **Integration** | Simple REST API | Vertex AI SDK |
| **Client/Server** | ✅ Works anywhere | ❌ Server-only |

## Usage in AdForge

```typescript
import { generateAngledShots, ANGLE_VARIATIONS } from '@/lib/ai/gemini'

// Generate all 7 angle variations
const shots = await generateAngledShots(
  base64ImageData,
  'image/jpeg',
  ANGLE_VARIATIONS,
  'Modern, clean product photography'
)

// Each shot contains:
// - angleName: 'front', 'left_30deg', etc.
// - angleDescription: Human-readable description
// - promptUsed: The exact prompt sent to Gemini
// - imageData: base64-encoded generated image
// - mimeType: 'image/jpeg'
```

## Available Angles

The system generates 7 different angles:

1. **Front** - Direct front view
2. **Left 30°** - Rotated 30° to the left
3. **Right 30°** - Rotated 30° to the right
4. **Top 45°** - Viewed from above at 45°
5. **Three-quarter left** - Front + left side
6. **Three-quarter right** - Front + right side
7. **Isometric** - Three sides simultaneously

## Testing

Run the E2E test to verify everything works:

```bash
npx tsx scripts/e2e-gummy-bear-test.ts
```

This will:
1. Create a "Gummy Bear" category
2. Upload a product image
3. Generate 7 angled variations
4. Save all images to Google Drive
5. Save metadata to Supabase

## Costs

### Free Tier
- **60 requests per minute** (RPM)
- **1,500 requests per day** (RPD)
- **1 million requests per month**

For most AdForge users, this is **completely free**! 🎉

### Paid Tier (if you exceed free tier)
- Very affordable pricing
- Check [Google AI Studio pricing](https://ai.google.dev/pricing) for details

## Troubleshooting

### Error: "API key not set"
```bash
# Make sure .env.local exists and contains:
GOOGLE_GEMINI_API_KEY=your-api-key-here

# Restart your dev server after adding the key:
npm run dev
```

### Error: "Failed to generate image"
- Check that your API key is valid
- Ensure you haven't exceeded the free tier limits
- Try with a smaller image (< 4MB)

### Images are identical to original
- This means Gemini couldn't modify the angle
- Try adjusting the temperature (higher = more creative)
- Check the image quality (should be clear and well-lit)

## Configuration

Adjust generation parameters in `src/lib/ai/gemini.ts`:

```typescript
generationConfig: {
  temperature: 0.4,    // 0 = deterministic, 1 = creative
  topP: 0.95,          // Nucleus sampling
  maxOutputTokens: 32768,
  responseModalities: ['TEXT', 'IMAGE']
}
```

**Recommendations:**
- Product photography: `temperature: 0.3-0.5`
- Creative variations: `temperature: 0.6-0.8`

## Learn More

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Image Generation Guide](https://ai.google.dev/gemini-api/docs/vision)
- [Get API Key](https://makersuite.google.com/app/apikey)
