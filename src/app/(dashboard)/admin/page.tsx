import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import SuperAdminClient from './_client'

export default async function AdminPage() {
  const session = await auth()
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim()
  if (!session?.user?.email || !superAdminEmail || session.user.email !== superAdminEmail) {
    redirect('/dashboard')
  }
  return <SuperAdminClient />
}
