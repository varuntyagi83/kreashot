import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function removeConstraint() {
  console.log('🔧 Removing unique constraint on composites table...\n')

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE composites
      DROP CONSTRAINT IF EXISTS composites_angled_shot_id_background_id_key;
    `
  })

  if (error) {
    // Try direct SQL query instead
    console.log('Trying alternative method...')

    // Use raw SQL query
    const query = `
      ALTER TABLE composites
      DROP CONSTRAINT IF EXISTS composites_angled_shot_id_background_id_key;
    `

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`
        },
        body: JSON.stringify({ sql: query })
      }
    )

    if (!response.ok) {
      console.error('❌ Failed to remove constraint')
      console.error('Error:', await response.text())
      console.log('\n⚠️  You need to run this SQL manually in Supabase dashboard:')
      console.log('\nALTER TABLE composites')
      console.log('DROP CONSTRAINT IF EXISTS composites_angled_shot_id_background_id_key;')
      return
    }
  }

  console.log('✅ Constraint removed successfully!')
  console.log('\nUsers can now:')
  console.log('  - Create multiple composites with same angled shot + background')
  console.log('  - Regenerate composites with different prompts')
  console.log('  - Create variations with different text overlays')
  console.log('  - Iterate on creative work')
}

removeConstraint().then(() => process.exit(0))
