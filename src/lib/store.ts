import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export interface AiModelTier {
    id: string
    name: string
}

export interface AntigravityModel {
    id: string
    name: string
    displayName: string
    description: string
    inputTokenLimit: number
    outputTokenLimit: number
    source: string
    quotaPercent?: number
    tiers?: AiModelTier[]
    selectedTierId?: string
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
    userName: string | null
    userEmail: string | null

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
    setUserName: (name: string) => void
    setUserEmail: (email: string) => void
}

const defaultWizardData: WizardData = {
    projectName: '',
    tagline: '',
    description: '',
    pages: ['Home', 'Layanan', 'Kontak'],
    language: 'id',
    outputType: 'static',
}

import { logger } from './logger'

// Middleware sederhana untuk mencatat aktivitas ke Desktop log via Rust
const logMiddleware = (config: any) => (set: any, get: any, api: any) =>
  config(
    (args: any) => {
      const prevState = get();
      set(args);
      const newState = get();
      
      // Cari perbedaan state untuk dilog (sangat mendetail sesuai permintaan user)
      Object.keys(newState).forEach(key => {
        if (prevState[key] !== newState[key] && typeof (newState as any)[key] !== 'function') {
          const val = (newState as any)[key];
          const valStr = typeof val === 'object' ? JSON.stringify(val) : val;
          logger.info("STATE-CHANGE", key, `Berubah menjadi: ${valStr}`);
        }
      });
    },
    get,
    api
  );

export const useAppStore = create<AppState>()(
  logMiddleware(
    persist(
      (set: any) => ({
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
      userName: null,
      userEmail: null,

      navigate: (page: any) => set({ currentPage: page }),
      setMode: (mode: any) => set({ mode }),
      setAuthenticated: (val: any) => set({ isAuthenticated: val }),
      setProfileOpen: (val: any) => set({ isProfileOpen: val }),
      setSelectedTemplate: (t: any) => set({ selectedTemplate: t }),
      setFilter: (filter: any) => set({ filter, templatePage: 0 }),
      setTemplatePage: (page: any) => set({ templatePage: page }),
      updateWizardData: (data: any) =>
          set((state: any) => ({ wizardData: { ...state.wizardData, ...data } })),
      toggleWizardPage: (page: any) =>
          set((state: any) => ({
              wizardData: {
                  ...state.wizardData,
                  pages: state.wizardData.pages.includes(page)
                      ? state.wizardData.pages.filter((p: any) => p !== page)
                      : [...state.wizardData.pages, page],
              },
          })),
      setAiModels: (models: any) => set({ aiModels: models }),
      setSelectedModel: (model: any) => set({ selectedModel: model }),
      setOauthToken: (token: any) => set({ oauthToken: token }),
      setProjectId: (id: any) => set({ projectId: id }),
      setRefreshToken: (token: any) => set({ refreshToken: token }),
      setUserName: (name: string) => set({ userName: name }),
      setUserEmail: (email: string) => set({ userEmail: email }),
    }),
    {
      name: 'vocacode-auth-storage',
      partialize: (state: AppState) => ({
        oauthToken: state.oauthToken,
        refreshToken: state.refreshToken,
        projectId: state.projectId,
        aiModels: state.aiModels,
        selectedModel: state.selectedModel,
        isAuthenticated: state.isAuthenticated,
        userName: state.userName,
        userEmail: state.userEmail,
      }),
    }
  ) as any)
)


