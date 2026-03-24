import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// All dashboard pages require auth and live Supabase — never statically prerender
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: memberships } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)

    if (!memberships || memberships.length === 0) {
      redirect('/onboarding')
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-muted/30">
          {children}
        </main>
      </div>
    </div>
  )
}
