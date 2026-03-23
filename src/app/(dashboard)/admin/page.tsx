'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Shield, Users, Building2, ArrowRight, Loader2, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Membership {
  company_id: string
  company_name: string
  company_slug: string
  role: string
}

interface AppUser {
  id: string
  email: string
  full_name: string
  created_at: string
  memberships: Membership[]
}

interface Company {
  id: string
  name: string
  slug: string
}

export default function SuperAdminPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [assignCompanyId, setAssignCompanyId] = useState('')
  const [assignRole, setAssignRole] = useState<'admin' | 'member'>('member')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    fetch('/api/super-admin/users')
      .then((r) => {
        if (r.status === 403) { setForbidden(true); return null }
        return r.json()
      })
      .then((data) => {
        if (!data) return
        setUsers(data.users || [])
        setCompanies(data.companies || [])
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  const reload = async () => {
    const r = await fetch('/api/super-admin/users')
    const data = await r.json()
    setUsers(data.users || [])
    setCompanies(data.companies || [])
    if (selectedUser) {
      const refreshed = data.users.find((u: AppUser) => u.id === selectedUser.id)
      setSelectedUser(refreshed || null)
    }
  }

  const handleAssign = async () => {
    if (!selectedUser || !assignCompanyId) return
    setAssigning(true)
    try {
      const r = await fetch('/api/super-admin/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, companyId: assignCompanyId, role: assignRole }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success(data.message)
      setAssignCompanyId('')
      await reload()
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign user')
    } finally {
      setAssigning(false)
    }
  }

  const handleRemove = async (userId: string, companyId: string) => {
    if (!confirm('Remove this user from the company?')) return
    try {
      const r = await fetch('/api/super-admin/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, companyId }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      toast.success('User removed from company')
      await reload()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove user')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Shield className="h-10 w-10" />
        <p className="text-sm">Access restricted to super admin only.</p>
      </div>
    )
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase())
  )

  // Build per-company member counts from users data
  const companyCounts: Record<string, number> = {}
  for (const u of users) {
    for (const m of u.memberships) {
      companyCounts[m.company_id] = (companyCounts[m.company_id] || 0) + 1
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Manage user–organisation assignments</p>
        </div>
        <div className="ml-auto flex gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {users.length} users</span>
          <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {companies.length} companies</span>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users</TabsTrigger>
          <TabsTrigger value="companies"><Building2 className="h-3.5 w-3.5 mr-1.5" />Companies</TabsTrigger>
        </TabsList>

        {/* ── Companies tab ───────────────────────────────────────────── */}
        <TabsContent value="companies">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> All Organisations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {companies.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No organisations found</p>
                ) : (
                  companies
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">@{c.slug}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.id}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 ml-4">
                          {companyCounts[c.id] ?? 0} member{(companyCounts[c.id] ?? 0) !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Users tab ───────────────────────────────────────────────── */}
        <TabsContent value="users">
        <div className="grid grid-cols-[1fr_380px] gap-6">
        {/* ── Users table ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> All Users
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 h-8 text-xs rounded-md border border-input bg-background focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[calc(100vh-280px)] overflow-y-auto">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUser(u); setAssignCompanyId('') }}
                  className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${
                    selectedUser?.id === u.id ? 'bg-accent border-l-2 border-primary' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.email}</p>
                      {u.full_name && (
                        <p className="text-xs text-muted-foreground truncate">{u.full_name}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 ml-3 shrink-0">
                      {u.memberships.length === 0 ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">No org</Badge>
                      ) : (
                        u.memberships.map((m) => (
                          <Badge key={m.company_id} variant="secondary" className="text-xs">
                            {m.company_name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Right panel: user detail + assign ───────────────────────── */}
        <div className="space-y-4">
          {selectedUser ? (
            <>
              {/* User detail */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Selected User</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">{selectedUser.email}</p>
                    {selectedUser.full_name && (
                      <p className="text-xs text-muted-foreground">{selectedUser.full_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Joined {new Date(selectedUser.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Current memberships */}
                  <div>
                    <p className="text-xs font-semibold mb-2">Current Organisations</p>
                    {selectedUser.memberships.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Not assigned to any organisation</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedUser.memberships.map((m) => (
                          <div
                            key={m.company_id}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                          >
                            <div>
                              <p className="text-xs font-medium">{m.company_name}</p>
                              <Badge
                                variant={m.role === 'admin' ? 'default' : 'secondary'}
                                className="text-xs mt-0.5"
                              >
                                {m.role}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleRemove(selectedUser.id, m.company_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Assign to company */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Assign to Organisation
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Assigns the user and removes them from all other organisations.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Organisation</label>
                    <Select value={assignCompanyId} onValueChange={setAssignCompanyId}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select organisation..." />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            <span className="text-muted-foreground ml-1 text-xs">@{c.slug}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Role</label>
                    <Select value={assignRole} onValueChange={(v) => setAssignRole(v as 'admin' | 'member')}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member — can use the app</SelectItem>
                        <SelectItem value="admin">Admin — can invite & manage team</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleAssign}
                    disabled={!assignCompanyId || assigning}
                  >
                    {assigning ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Assigning...</>
                    ) : (
                      'Assign to Organisation'
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border rounded-lg border-dashed">
              <Users className="h-8 w-8 mb-2" />
              <p className="text-sm">Select a user to manage their organisation</p>
            </div>
          )}
        </div>
        </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
