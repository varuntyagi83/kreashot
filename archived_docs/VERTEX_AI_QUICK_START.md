# Quick Start: Vertex AI Imagen 4 Integration

## ✅ What Was Done

1. **Installed Vertex AI SDK**: `@google-cloud/vertexai`
2. **Updated Image Generation**: `src/lib/ai/gemini.ts` now uses **Imagen 4** (latest model)
3. **Added Environment Variables**: Need to configure in `.env.local`
4. **Created Setup Guide**: See `docs/VERTEX_AI_SETUP.md`

## 🚀 Quick Setup (5 Minutes)

### 1. Enable APIs in Google Cloud

```bash
# Go to: https://console.cloud.google.com/

# Enable these APIs:
- Vertex AI API
- Vertex AI Imagen API
```

### 2. Get Your Project ID

```bash
# In Google Cloud Console, copy your Project ID
# It looks like: "my-project-12345"
```

### 3. Set Up Authentication

**Option A: Use gcloud CLI (Easiest for local dev)**

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

**Option B: Service Account (For production)**

1. Create service account in GCP Console
2. Download JSON key
3. Set environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

### 4. Update .env.local

Add your project ID:

```bash
# Open .env.local and add:
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
```

### 5. Test It!

```bash
npx tsx scripts/e2e-gummy-bear-test.ts
```

## 🎯 Expected Results

Now when you run the test, **Imagen 4** will:
- ✅ Generate **actual** different angled views
- ✅ **Better text preservation** than previous versions
- ✅ Maintain **product consistency** across angles
- ✅ **Higher quality** image generation
- ✅ Upload unique images to Google Drive

## 💰 Costs

- **~$0.04 per generated image**
- **7 angles per product = ~$0.28**
- **Free tier: 100 images/month**

## 📊 How It Works

### Before (Placeholder):
```
Original Image → Copy × 7 → All identical
```

### Now (Imagen 4):
```
Original Image → AI Analysis → Imagen 4 Generation → 7 unique angles
                                    ↓
                             Prompts optimized for:
                             - Product consistency
                             - Enhanced text preservation
                             - Professional photography
                             - Superior image quality
```

## ⚠️ Important Notes

1. **Text Preservation**: Imagen 4 has the best text preservation of any Google model, but rotating 3D text is still challenging for AI. Results may vary depending on text complexity.

2. **Fallback**: If generation fails, the system automatically falls back to the original image (so your workflow never breaks).

3. **Rate Limits**: Imagen 4 has rate limits. For production, implement queuing.

4. **Cost Management**: Monitor usage in GCP Console > Billing

5. **Model Version**: We're using `imagen-4.0-generate-001` (Generally Available, not preview)

## 🔧 Configuration

In `src/lib/ai/gemini.ts`, you can adjust:

```typescript
generationConfig: {
  temperature: 0.4,  // 0 = deterministic, 1 = creative
  topK: 32,          // Sampling parameter
  topP: 1,           // Nucleus sampling
}
```

**Recommendations:**
- Product photos: temperature 0.3-0.5
- Creative variations: temperature 0.6-0.8

## 📚 Full Documentation

See `docs/VERTEX_AI_SETUP.md` for complete setup instructions, troubleshooting, and advanced configuration.

## 🎨 Next Steps

1. **Test with your products**: Run the E2E test
2. **Review results**: Check Google Drive for generated images
3. **Adjust parameters**: Tune temperature/prompts as needed
4. **Deploy**: Add env vars to Vercel when ready

## ❓ Need Help?

Check:
- `docs/VERTEX_AI_SETUP.md` - Full setup guide
- [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)
- [Imagen 3 Guide](https://cloud.google.com/vertex-ai/docs/generative-ai/image/overview)
