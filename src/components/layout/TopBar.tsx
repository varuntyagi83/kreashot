'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Settings, Sun, Moon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { CompanySwitcher } from './CompanySwitcher'

export function TopBar() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/login')
  }

  return (
    <div className="border-b bg-background">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Kreashot
          </h1>
        </div>
        <div className="ml-4 flex-1 flex items-center">
          <CompanySwitcher />
        </div>
        <div className="ml-auto flex items-center space-x-2">

          {/* Theme toggle — only render after mount to avoid SSR/client ID mismatch */}
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 rounded-full bg-[#B3D9E8] flex items-center justify-center text-sm font-semibold text-gray-700 hover:opacity-80 transition-opacity">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">My Account</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </div>
  )
}
