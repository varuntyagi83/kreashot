'use client'

import { useState } from 'react'
import { FinalAssetsWorkspace } from '@/components/final-assets/FinalAssetsWorkspace'
import { AdExportWorkspace } from '@/components/ad-export/AdExportWorkspace'

interface AdsWorkspaceProps {
  categoryId: string
  format?: string
}

export function AdsWorkspace({ categoryId, format = '1:1' }: AdsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'export'>('create')

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-1 pb-4 border-b border mb-6">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            activeTab === 'create'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Create Ad
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            activeTab === 'export'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Export
        </button>
      </div>

      {activeTab === 'create' && (
        <FinalAssetsWorkspace categoryId={categoryId} format={format} />
      )}

      {activeTab === 'export' && (
        <AdExportWorkspace categoryId={categoryId} format={format} />
      )}
    </div>
  )
}
