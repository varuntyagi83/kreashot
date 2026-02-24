# AdForge

AI-powered ad creative generation platform using Google Gemini for product image manipulation and Google Drive for storage.

## Features

- 🎨 **AI-Powered Angled Shots**: Generate multiple product angles using Gemini AI
- 📁 **Google Drive Integration**: All images stored in Google Drive
- 🔄 **Storage Sync System**: Keep Google Drive and Supabase metadata in perfect sync
- 🗑️ **Automatic Cleanup**: Remove orphaned metadata for trashed/deleted files
- 📊 **Category Management**: Organize products by category
- 🖼️ **Product Library**: Upload and manage product images

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase
- **AI**: Google Gemini 3 Pro Image Preview
- **Storage**: Google Drive API
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Google Cloud Platform account (for Drive & Gemini)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/varuntyagi83/AdForge.git
   cd AdForge/adforge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

   Fill in the following:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # Google Drive
   GOOGLE_DRIVE_CLIENT_EMAIL=your-service-account-email
   GOOGLE_DRIVE_PRIVATE_KEY=your-private-key
   GOOGLE_DRIVE_FOLDER_ID=your-folder-id

   # Google Gemini
   GEMINI_API_KEY=your-gemini-api-key

   # Cron Jobs
   CRON_SECRET=your-random-secret
   ```

4. Run database migrations:
   ```bash
   cd supabase
   npx supabase db push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Storage Sync & Cleanup

AdForge uses a comprehensive storage sync system to keep Google Drive files and Supabase metadata in sync.

### Cleanup Orphaned Metadata

Remove Supabase metadata for files that are trashed or deleted in Google Drive:

**Dry run (check what would be deleted):**
```bash
npx tsx scripts/cleanup-orphaned-local.ts
```

**Execute cleanup:**
```bash
npx tsx scripts/cleanup-orphaned-local.ts --execute
```

**Via API:**
```bash
npx tsx scripts/cleanup-orphaned-metadata.ts --execute
```

### Documentation

- [Storage Sync System](./docs/STORAGE_SYNC.md) - Complete sync system documentation
- [Google Drive Integration](./docs/GOOGLE_DRIVE_INTEGRATION.md) - Drive setup guide
- [Storage Path Mapping](./docs/STORAGE_PATH_MAPPING.md) - File organization

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Maintenance Scripts

- `npx tsx scripts/cleanup-orphaned-local.ts` - Clean up orphaned metadata
- `npx tsx scripts/fix-gdrive-urls.ts` - Fix Google Drive URLs (one-time)
- `npx tsx scripts/remove-unused-storage-buckets.ts` - Remove unused Supabase buckets

## API Endpoints

### Categories
- `GET /api/categories` - List all categories
- `POST /api/categories` - Create category
- `GET /api/categories/[id]` - Get category
- `PUT /api/categories/[id]` - Update category
- `DELETE /api/categories/[id]` - Delete category

### Products
- `GET /api/categories/[id]/products` - List products in category
- `POST /api/categories/[id]/products` - Create product
- `DELETE /api/categories/[id]/products/[productId]` - Delete product

### Angled Shots
- `GET /api/categories/[id]/angled-shots` - List angled shots
- `POST /api/categories/[id]/angled-shots/generate` - Generate with AI
- `DELETE /api/categories/[id]/angled-shots/[angleId]` - Delete shot

### Admin
- `POST /api/admin/cleanup-orphaned-metadata` - Clean up orphaned records
- `POST /api/admin/process-deletion-queue` - Process deletion queue (cron)

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Google Drive   │ ◄─────► │    Supabase DB   │
│  (Images)       │         │   (Metadata)     │
└─────────────────┘         └──────────────────┘
         │                           │
         │                           │
         └───────────┬───────────────┘
                     │
              Sync Mechanisms:
              1. UI Deletion
              2. Database Triggers
              3. Cleanup Scripts
              4. Cron Jobs
```

## Database Schema

Key tables:
- `categories` - Product categories
- `products` - Products with images
- `angled_shots` - AI-generated angled shots
- `deletion_queue` - Queue for async file deletions

See [Storage Sync System](./docs/STORAGE_SYNC.md) for details.

## Deployment

### Vercel

1. Push to GitHub:
   ```bash
   git push origin main
   ```

2. Import project in Vercel dashboard

3. Add environment variables (same as `.env.local`)

4. Deploy!

The `vercel.json` config automatically sets up cron jobs for cleanup.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- Open a GitHub issue
- Check [docs/](./docs/) for detailed guides
