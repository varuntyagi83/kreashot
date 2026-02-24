#!/usr/bin/env tsx
import { Client } from 'pg'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function getUserId() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()

    const result = await client.query(`
      SELECT id, email FROM auth.users LIMIT 10
    `)

    console.log('Users in database:')
    result.rows.forEach(user => {
      console.log(`  ${user.id} - ${user.email}`)
    })
  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await client.end()
  }
}

getUserId()
