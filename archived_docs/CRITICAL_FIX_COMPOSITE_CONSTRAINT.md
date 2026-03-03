# 🚨 CRITICAL FIX REQUIRED: Remove Composite Unique Constraint

## Issue

The `composites` table has a unique constraint that **breaks the UI workflow**:

```sql
CONSTRAINT "composites_angled_shot_id_background_id_key"
UNIQUE (angled_shot_id, background_id)
```

## Impact on Users

This constraint prevents users from:

❌ **Regenerating composites with different prompts**
- User creates composite: "Product on left"
- User wants to try: "Product on right" → **FAILS**

❌ **Adding text to existing combinations**
- User creates plain composite
- User wants to add headline text → **FAILS**

❌ **Creating variations**
- User creates test version
- User wants final version with tweaks → **FAILS**

❌ **A/B testing**
- User creates version A
- User wants version B with same assets → **FAILS**

## Error Users Will See

```json
{
  "code": "23505",
  "message": "duplicate key value violates unique constraint \"composites_angled_shot_id_background_id_key\""
}
```

Even though:
- ✅ AI generated the image successfully
- ✅ Image uploaded to Google Drive
- ✅ Everything else worked
- ❌ Database save fails

## Fix Required

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run this SQL:

```sql
ALTER TABLE composites
DROP CONSTRAINT IF EXISTS composites_angled_shot_id_background_id_key;
```

4. Click **Run**

### Option 2: Supabase CLI

If you have Supabase CLI set up:

```bash
cd /path/to/adforge
supabase db push
```

This will apply the migration file:
`supabase/migrations/20260223_remove_composite_unique_constraint.sql`

## Verification

After removing the constraint, test by:

1. Creating a composite with a specific angled shot + background
2. Creating ANOTHER composite with the SAME angled shot + background but different prompt
3. Both should succeed ✅

## Why This Constraint Was Wrong

**Original Intent:** Prevent accidental duplicates

**Actual Effect:** Blocks legitimate creative workflows

**Correct Approach:**
- Each composite is unique by its `id` (UUID)
- Users should create unlimited variations
- Different prompts = different results = valid use cases
- Constraint was too restrictive for a creative tool

## Urgency

**Priority:** 🔴 **CRITICAL** - Breaks core UI functionality

**When to fix:** Before any user testing or production deployment

**Test after fix:** Generate multiple composites with same assets but different prompts

---

## Related Files

- **Migration:** `supabase/migrations/20260223_remove_composite_unique_constraint.sql`
- **Issue found in:** `scripts/create-composite-direct.ts` (line 161)
- **Affects:** All composite generation via UI and API
