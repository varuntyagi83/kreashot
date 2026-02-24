import { create } from 'zustand'

interface AppState {
  // Active selections
  selectedCategoryId: string | null
  selectedProductId: string | null
  activeStep: number // 1-10 pipeline step

  // Actions
  setSelectedCategory: (id: string | null) => void
  setSelectedProduct: (id: string | null) => void
  setActiveStep: (step: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCategoryId: null,
  selectedProductId: null,
  activeStep: 1,

  setSelectedCategory: (id) => set({ selectedCategoryId: id, selectedProductId: null }),
  setSelectedProduct: (id) => set({ selectedProductId: id }),
  setActiveStep: (step) => set({ activeStep: step }),
}))
