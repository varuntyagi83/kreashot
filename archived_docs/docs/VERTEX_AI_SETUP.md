# Vertex AI Imagen 4 Setup Guide

This guide will help you set up Vertex AI Imagen 4 (latest model) for generating angled product shots.

## Prerequisites

- Google Cloud Platform (GCP) account
- Billing enabled on your GCP project
- Access to Vertex AI APIs

## Step 1: Enable Vertex AI API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** > **Library**
4. Search for "Vertex AI API"
5. Click **Enable**

## Step 2: Enable Imagen API

1. In the API Library, search for "Vertex AI Imagen API"
2. Click **Enable**
3. Wait for the API to be enabled (may take a few minutes)

## Step 3: Set Up Authentication

### Option A: Service Account (Recommended for Production)

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Name it (e.g., "adforge-imagen")
4. Grant the following roles:
   - **Vertex AI User**
   - **Storage Object Viewer** (if reading from Cloud Storage)
5. Click **Done**
6. Click on the service account
7. Go to **Keys** tab
8. Click **Add Key** > **Create New Key**
9. Select **JSON** and click **Create**
10. Save the JSON file securely

### Set Up Environment

Add to your `.env.local`:

```bash
# Vertex AI Configuration
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Service Account Authentication
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json
```

### Option B: Application Default Credentials (For Local Development)

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

Then in `.env.local`:

```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

## Step 4: Update .env.local

Add your project ID to `.env.local`:

```bash
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
```

## Step 5: Test the Setup

Run the E2E test to verify everything works:

```bash
npx tsx scripts/e2e-gummy-bear-test.ts
```

## Imagen 4 Features

### Image-to-Image Generation

Imagen 4 (latest model) can generate new images based on:
- **Reference image**: The original product photo
- **Text prompt**: Description of the desired angle/view
- **Style guidance**: Look and feel preferences

### Enhanced Text Preservation

Imagen 4 has **significantly improved text rendering** compared to previous versions:
- Better at preserving text on rotated objects
- Higher quality text generation
- More accurate text placement and scaling
- Improved handling of complex fonts and styling

### Parameters You Can Adjust

In `src/lib/ai/gemini.ts`, you can modify:

- **Temperature** (0.0-1.0): Lower = more consistent, Higher = more creative
  - Current: 0.4 (balanced for product consistency)
- **TopK**: Number of tokens to sample from
  - Current: 32
- **TopP**: Cumulative probability cutoff
  - Current: 1

## Costs

### Imagen 4 Pricing (as of February 2026)

- **imagen-4.0-generate-001**: ~$0.04 per image
- **imagen-4.0-fast-generate-001**: ~$0.02 per image (faster, slightly lower quality)
- **imagen-4.0-ultra-generate-001**: ~$0.08 per image (highest quality)
- **Free tier**: 100 images per month (check current GCP free tier)

### Estimated Costs for AdForge

- **Per Product**: 7 angled shots = ~$0.28
- **100 Products**: ~$28/month
- **1000 Products**: ~$280/month

## Troubleshooting

### Error: "Permission denied"

- Ensure Vertex AI API is enabled
- Check that your service account has "Vertex AI User" role
- Verify GOOGLE_APPLICATION_CREDENTIALS points to valid JSON key

### Error: "Quota exceeded"

- Check your GCP quotas: Console > IAM & Admin > Quotas
- Request quota increase if needed
- Consider rate limiting in your application

### Error: "Model not found"

- Verify Imagen API is enabled in your project
- Check that `us-central1` is available for Imagen
- Try alternative regions: `us-east4`, `europe-west4`

### Images Not Generating Different Angles

- The model quality depends on the prompt clarity
- Try adjusting the temperature parameter
- Provide more detailed product descriptions
- Consider using ControlNet for more precise control (advanced)

## Advanced: Improving Text Preservation

For better text preservation on rotated products:

1. **Use higher resolution images** (Imagen 4 supports up to 2048x2048)
2. **Provide clearer text descriptions** in the prompt
3. **Use reference image masking** (specify which parts to preserve)
4. **Consider post-processing** with text overlay if needed

## Model Options

You can switch between different Imagen 4 variants in `src/lib/ai/gemini.ts`:

```typescript
// Current (balanced):
model: 'imagen-4.0-generate-001'

// Faster, lower cost:
model: 'imagen-4.0-fast-generate-001'  // ~$0.02/image

// Highest quality:
model: 'imagen-4.0-ultra-generate-001'  // ~$0.08/image

// Imagen 3 (fallback):
model: 'imagen-3.0-generate-001'  // If Imagen 4 isn't available
```

## Next Steps

1. Enable the APIs in your GCP project
2. Set up authentication
3. Add your project ID to `.env.local`
4. Run the E2E test
5. Review generated images in Google Drive
6. Adjust parameters as needed

## Support

- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Imagen 3 Guide](https://cloud.google.com/vertex-ai/docs/generative-ai/image/overview)
- [Pricing Calculator](https://cloud.google.com/products/calculator)
