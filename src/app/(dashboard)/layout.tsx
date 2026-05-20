import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const user = session?.user

  if (!user?.id) {
    redirect('/auth/login')
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId: user.id },
    select: { companyId: true },
  })

  if (!membership) {
    redirect('/onboarding')
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto" style={{ backgroundColor: '#F5F0E8' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
