'use client'

import { useEffect, useState } from 'react'

interface Member {
  id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
  email: string
  full_name: string
  is_current_user: boolean
}

interface Company {
  id: string
  name: string
  slug: string
  plan: string
}

export default function TeamSettingsPage() {
  const [company, setCompany] = useState<Company | null>(null)
  const [myRole, setMyRole] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [companyRes, membersRes] = await Promise.all([
        fetch('/api/company'),
        fetch('/api/company/members'),
      ])
      if (!companyRes.ok || !membersRes.ok) throw new Error('Failed to load team data')
      const companyData = await companyRes.json()
      const membersData = await membersRes.json()
      setCompany(companyData.company)
      setMyRole(companyData.role)
      setNewName(companyData.company.name)
      setMembers(membersData.members || [])
    } catch {
      setError('Failed to load team data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleSaveName() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update name')
      const { company: updated } = await res.json()
      setCompany(updated)
      setEditingName(false)
    } catch {
      setError('Failed to update company name.')
    } finally {
      setSaving(false)
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviteStatus('sending')
    setInviteError('')
    try {
      const res = await fetch('/api/company/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInviteError(data.error || 'Failed to send invite')
        setInviteStatus('error')
        return
      }
      setInviteStatus('sent')
      setInviteEmail('')
    } catch {
      setInviteError('Failed to send invite')
      setInviteStatus('error')
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member from the team?')) return
    try {
      const res = await fetch(`/api/company/members?userId=${userId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove member')
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch {
      setError('Failed to remove member.')
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading team settings…</div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-sm text-destructive">{error}</div>
    )
  }

  const isAdmin = myRole === 'admin'

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-10">
      {/* Company name */}
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Team Settings</h1>

        <div className="bg-white rounded-xl border p-6 space-y-3">
          <div className="text-sm font-medium text-muted-foreground">Company name</div>
          {editingName && isAdmin ? (
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#7C5DFA]"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName() }}
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="px-4 py-1.5 text-sm rounded-md bg-[#7C5DFA] text-white hover:bg-[#6A4FD8] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingName(false); setNewName(company?.name ?? '') }}
                className="px-4 py-1.5 text-sm rounded-md border hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-base font-medium">{company?.name}</span>
              {isAdmin && (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-[#7C5DFA] hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground">Plan: {company?.plan ?? 'free'}</div>
        </div>
      </section>

      {/* Members list */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Members ({members.length})</h2>
        <div className="bg-white rounded-xl border divide-y">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-5 py-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">
                  {member.full_name || member.email}
                  {member.is_current_user && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
                {member.full_name && (
                  <div className="text-xs text-muted-foreground">{member.email}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  member.role === 'admin'
                    ? 'bg-[#7C5DFA]/10 text-[#7C5DFA]'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {member.role}
                </span>
                {(isAdmin || member.is_current_user) && !member.is_current_user && (
                  <button
                    onClick={() => handleRemove(member.user_id)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
                {member.is_current_user && myRole !== 'admin' && (
                  <button
                    onClick={() => handleRemove(member.user_id)}
                    className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                  >
                    Leave
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Invite member — admin only */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Invite member</h2>
          <div className="bg-white rounded-xl border p-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter their email to send a magic-link invite. They will automatically join your team on first sign-in.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="colleague@example.com"
                className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#7C5DFA]"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteStatus('idle'); setInviteError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }}
              />
              <button
                onClick={handleInvite}
                disabled={inviteStatus === 'sending' || !inviteEmail.trim()}
                className="px-4 py-1.5 text-sm rounded-md bg-[#7C5DFA] text-white hover:bg-[#6A4FD8] disabled:opacity-50"
              >
                {inviteStatus === 'sending' ? 'Sending…' : 'Send invite'}
              </button>
            </div>
            {inviteStatus === 'sent' && (
              <p className="text-sm text-green-600">Invite sent successfully.</p>
            )}
            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
