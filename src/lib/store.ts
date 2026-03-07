import { create } from 'zustand'

export type AppPage =
    | 'login'
    | 'loading'
    | 'explorer'
    | 'wizard1'
    | 'wizard2'
    | 'wizard3'
    | 'final_preview'

export type AppMode = 'BASIC' | 'ADVANCE'

export interface TemplateItem {
    id: number
    title: string
    author: string
    img: string
    tag: string
}

export interface WizardData {
    projectName: string
    tagline: string
    description: string
    pages: string[]
    language: 'id' | 'en'
    outputType: 'static' | 'dynamic'
}

interface AppState {
    currentPage: AppPage
    mode: AppMode
    isAuthenticated: boolean
    isProfileOpen: boolean
    selectedTemplate: TemplateItem | null
    filter: string
    templatePage: number
    wizardData: WizardData
    aiModels: string[]
    selectedModel: string | null

    // Actions
    navigate: (page: AppPage) => void
    setMode: (mode: AppMode) => void
    setAuthenticated: (val: boolean) => void
    setProfileOpen: (val: boolean) => void
    setSelectedTemplate: (t: TemplateItem | null) => void
    setFilter: (filter: string) => void
    setTemplatePage: (page: number) => void
    updateWizardData: (data: Partial<WizardData>) => void
    toggleWizardPage: (page: string) => void
    setAiModels: (models: string[]) => void
    setSelectedModel: (model: string) => void
}

const defaultWizardData: WizardData = {
    projectName: '',
    tagline: '',
    description: '',
    pages: ['Home', 'Layanan', 'Kontak'],
    language: 'id',
    outputType: 'static',
}

export const useAppStore = create<AppState>((set) => ({
    currentPage: 'login',
    mode: 'BASIC',
    isAuthenticated: false,
    isProfileOpen: false,
    selectedTemplate: null,
    filter: 'Semua',
    templatePage: 0,
    wizardData: { ...defaultWizardData },
    aiModels: ['Gemini 2.5 Pro'],
    selectedModel: 'Gemini 2.5 Pro',

    navigate: (page) => set({ currentPage: page }),
    setMode: (mode) => set({ mode }),
    setAuthenticated: (val) => set({ isAuthenticated: val }),
    setProfileOpen: (val) => set({ isProfileOpen: val }),
    setSelectedTemplate: (t) => set({ selectedTemplate: t }),
    setFilter: (filter) => set({ filter, templatePage: 0 }),
    setTemplatePage: (page) => set({ templatePage: page }),
    updateWizardData: (data) =>
        set((state) => ({ wizardData: { ...state.wizardData, ...data } })),
    toggleWizardPage: (page) =>
        set((state) => ({
            wizardData: {
                ...state.wizardData,
                pages: state.wizardData.pages.includes(page)
                    ? state.wizardData.pages.filter((p) => p !== page)
                    : [...state.wizardData.pages, page],
            },
        })),
    setAiModels: (models) => set({ aiModels: models }),
    setSelectedModel: (model) => set({ selectedModel: model }),
}))
