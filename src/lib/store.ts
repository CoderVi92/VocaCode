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

export interface AntigravityModel {
    id: string
    name: string
    displayName: string
    description: string
    inputTokenLimit: number
    outputTokenLimit: number
    source: string
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
    aiModels: AntigravityModel[]
    selectedModel: AntigravityModel | null
    oauthToken: string | null
    projectId: string | null
    refreshToken: string | null

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
    setAiModels: (models: AntigravityModel[]) => void
    setSelectedModel: (model: AntigravityModel) => void
    setOauthToken: (token: string) => void
    setProjectId: (id: string) => void
    setRefreshToken: (token: string) => void
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
    aiModels: [],
    selectedModel: null,
    oauthToken: null,
    projectId: null,
    refreshToken: null,

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
    setOauthToken: (token) => set({ oauthToken: token }),
    setProjectId: (id) => set({ projectId: id }),
    setRefreshToken: (token) => set({ refreshToken: token }),
}))
