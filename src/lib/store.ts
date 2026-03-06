import { create } from 'zustand'

export type AppPage = 'login' | 'loading' | 'explorer' | 'wizard' | 'preview'

interface AppState {
    currentPage: AppPage
    isAuthenticated: boolean
    selectedTemplate: TemplateItem | null
    wizardData: WizardData | null

    // Actions
    navigate: (page: AppPage) => void
    setAuthenticated: (val: boolean) => void
    setSelectedTemplate: (template: TemplateItem | null) => void
    setWizardData: (data: WizardData | null) => void
}

export interface TemplateItem {
    id: string
    title: string
    description: string
    thumbnail: string
    html: string
    css: string
    js: string
    tags: string[]
}

export interface WizardData {
    projectName: string
    tagline: string
    businessDescription: string
    pages: string[]
    language: 'id' | 'en'
    outputType: 'static' | 'dynamic'
}

export const useAppStore = create<AppState>((set) => ({
    currentPage: 'login',
    isAuthenticated: false,
    selectedTemplate: null,
    wizardData: null,

    navigate: (page) => set({ currentPage: page }),
    setAuthenticated: (val) => set({ isAuthenticated: val }),
    setSelectedTemplate: (template) => set({ selectedTemplate: template }),
    setWizardData: (data) => set({ wizardData: data }),
}))
