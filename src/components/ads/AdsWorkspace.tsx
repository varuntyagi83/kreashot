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
      <div className="flex items-center gap-1 px-1 pb-4 border-b border-[#EEEEEC] mb-6">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            activeTab === 'create'
              ? 'bg-[#7C5DFA] text-white shadow-sm'
              : 'text-[#666] hover:text-[#333] hover:bg-[#F0EFEC]'
          }`}
        >
          Create Ad
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            activeTab === 'export'
              ? 'bg-[#7C5DFA] text-white shadow-sm'
              : 'text-[#666] hover:text-[#333] hover:bg-[#F0EFEC]'
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
