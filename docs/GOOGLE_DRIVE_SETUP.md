# Google Drive Setup Guide

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: `AdForge Storage`
4. Click "Create"

## Step 2: Enable Google Drive API

1. In the project, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click "Enable"

## Step 3: Create Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Name: `adforge-storage`
4. Role: None (we'll use shared folder permissions)
5. Click "Done"

## Step 4: Create Service Account Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Type: JSON
5. Click "Create"
6. **Save the downloaded JSON file** as `google-drive-credentials.json`

## Step 5: Create Shared Folder in Google Drive

1. Go to [Google Drive](https://drive.google.com/)
2. Create a new folder: `AdForge Files`
3. Right-click → "Share"
4. Paste the service account email (from credentials JSON):
   - Example: `adforge-storage@adforge-storage-123456.iam.gserviceaccount.com`
5. Give it **Editor** access
6. Click "Share"
7. **Copy the folder ID** from the URL:
   - URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`

## Step 6: Add Credentials to .env.local

Add these to your `.env.local` file:

```bash
# Google Drive Storage
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
GOOGLE_DRIVE_CLIENT_EMAIL=service_account_email@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
```

**How to get these values from the JSON file:**

```json
{
  "client_email": "← Use this for GOOGLE_DRIVE_CLIENT_EMAIL",
  "private_key": "← Use this for GOOGLE_DRIVE_PRIVATE_KEY"
}
```

## Step 7: Verify Setup

Run the verification script:

```bash
npm run verify-gdrive
```

## Folder Structure in Google Drive

```
AdForge Files/  (shared folder)
├── product-images/
│   └── {user_id}/
│       └── {product_id}/
│           └── image.jpg
├── angled-shots/
│   └── {user_id}/
│       └── {category_id}/
│           └── angle.jpg
└── brand-assets/
    └── {user_id}/
        └── logo.png
```

## Security Notes

- ✅ Service account key is private (never commit to git)
- ✅ Only the service account can access the folder
- ✅ Users access files through your API (not direct Google Drive access)
- ✅ Supabase RLS still controls who can see which metadata

## Troubleshooting

**Error: "Insufficient permissions"**
- Make sure you shared the folder with the service account email
- Verify the email matches the one in your credentials JSON

**Error: "File not found"**
- Check that GOOGLE_DRIVE_FOLDER_ID is correct
- Verify the folder is shared with "Editor" access

**Error: "Invalid credentials"**
- Ensure private key includes newlines: `\n`
- Copy the exact private key from the JSON (including BEGIN/END markers)

## Cost

- **Free tier:** 15 GB per Google account
- **100 GB:** $1.99/month
- **200 GB:** $2.99/month
- **2 TB:** $9.99/month

vs Supabase:
- **Free:** 1 GB
- **Pro:** $25/month for 100 GB

**Savings:** ~$23/month for 100GB storage! 💰
