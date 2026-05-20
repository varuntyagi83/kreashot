'use client'

import { useEffect, useState } from 'react'
import { Building2, ChevronsUpDown, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface CompanyMembership {
  company_id: string
  role: string
  company_name: string
  company_slug: string
}

interface CompanyData {
  id: string
  name: string
}

export function CompanySwitcher() {
  const [activeCompany, setActiveCompany] = useState<CompanyData | null>(null)
  const [memberships, setMemberships] = useState<CompanyMembership[]>([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch('/api/company')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setActiveCompany(data.company)
        setMemberships(data.memberships ?? [])
      })
      .catch(() => {})
  }, [])

  // Only render the switcher if the user belongs to more than one company
  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-2">
        <Building2 className="h-3.5 w-3.5" />
        <span className="max-w-[140px] truncate">{activeCompany?.name ?? '…'}</span>
      </div>
    )
  }

  const handleSwitch = async (companyId: string) => {
    if (companyId === activeCompany?.id || switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/company/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      if (res.ok) {
        // Update local state immediately so the switcher reflects the change
        const next = memberships.find((m) => m.company_id === companyId)
        if (next) setActiveCompany({ id: companyId, name: next.company_name })
        // Full page reload so the new company cookie takes effect across all components
        window.location.href = '/'
      }
    } finally {
      setSwitching(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-sm font-normal"
          disabled={switching}
        >
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-[140px] truncate">{activeCompany?.name ?? '…'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch organisation
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.company_id}
            onClick={() => handleSwitch(m.company_id)}
            className="gap-2"
          >
            <Check
              className={`h-3.5 w-3.5 ${m.company_id === activeCompany?.id ? 'opacity-100' : 'opacity-0'}`}
            />
            <div className="flex flex-col min-w-0">
              <span className="truncate">{m.company_name}</span>
              <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
