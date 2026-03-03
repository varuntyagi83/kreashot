# Running Supabase Migrations

Follow these steps to set up your database schema and storage buckets:

## Step 1: Access Supabase SQL Editor

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/fhvwwmprzwizrmeoracl
2. Click on the **SQL Editor** in the left sidebar
3. Click **New Query** to create a new SQL query

## Step 2: Run Database Schema Migration

1. Open the file: `supabase/migrations/001_initial_schema.sql`
2. Copy **all** the contents of this file
3. Paste it into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Wait for it to complete - you should see "Success. No rows returned"

This creates:
- 12 database tables (categories, products, brand_assets, etc.)
- All indexes for performance
- Row Level Security (RLS) policies
- Triggers for updated_at timestamps

## Step 3: Run Storage Buckets Migration

1. Open the file: `supabase/migrations/002_storage_buckets.sql`
2. Copy **all** the contents of this file
3. In the SQL Editor, click **New Query**
4. Paste the storage migration SQL
5. Click **Run**

This creates:
- 8 storage buckets for your assets
- Storage policies for user-scoped file access

## Step 4: Verify Setup

After running both migrations:

1. Go to **Table Editor** in Supabase
   - You should see 12 tables listed
   - Click on any table (like `categories`) to verify it exists

2. Go to **Storage** in Supabase
   - You should see 8 buckets:
     - brand-assets
     - assets
     - angled-shots
     - backgrounds
     - angled-product-background
     - copy-doc
     - guidelines
     - final-assets

3. Go to **Authentication > Policies**
   - You should see RLS policies for all tables

## Troubleshooting

If you get errors:

- **"extension already exists"**: This is fine, ignore it
- **"relation already exists"**: Tables already exist, you can skip
- **Permission errors**: Make sure you're using the service role key
- **Syntax errors**: Make sure you copied the entire SQL file

## Next Steps

Once migrations are complete:
- Your database is fully set up
- All tables have RLS enabled
- Storage buckets are ready for file uploads
- You can start building Phase 1 features!
