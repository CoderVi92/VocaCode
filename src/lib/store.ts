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
    budget?: number
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
    supportsThinking?: boolean
    thinkingBudget?: number
    minThinkingBudget?: number
    supportsImages?: boolean
    supportsVideo?: boolean
    supportedMimeTypes?: string[]
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
    tokenExpiresAt: number | null  // Timestamp (ms) kapan token expired — buffer 30 detik (server.cjs baris 160)
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
    setTokenExpiresAt: (expiresAt: number) => void
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
    persist<AppState>(
      (set) => ({
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
      tokenExpiresAt: null,
      userName: null,
      userEmail: null,

      navigate: (page: AppPage) => set({ currentPage: page }),
      setMode: (mode: AppMode) => set({ mode }),
      setAuthenticated: (val: boolean) => set({ isAuthenticated: val }),
      setProfileOpen: (val: boolean) => set({ isProfileOpen: val }),
      setSelectedTemplate: (t: TemplateItem | null) => set({ selectedTemplate: t }),
      setFilter: (filter: string) => set({ filter, templatePage: 0 }),
      setTemplatePage: (page: number) => set({ templatePage: page }),
      updateWizardData: (data: Partial<WizardData>) =>
          set((state: AppState) => ({ wizardData: { ...state.wizardData, ...data } })),
      toggleWizardPage: (page: string) =>
          set((state: AppState) => ({
              wizardData: {
                  ...state.wizardData,
                  pages: state.wizardData.pages.includes(page)
                      ? state.wizardData.pages.filter((p) => p !== page)
                      : [...state.wizardData.pages, page],
              },
          })),
      setAiModels: (models: AntigravityModel[]) => set({ aiModels: models }),
      setSelectedModel: (model: AntigravityModel) => set({ selectedModel: model }),
      setOauthToken: (token: string) => set({ oauthToken: token }),
      setProjectId: (id: string) => set({ projectId: id }),
      setRefreshToken: (token: string) => set({ refreshToken: token }),
      setTokenExpiresAt: (expiresAt: number) => set({ tokenExpiresAt: expiresAt }),
      setUserName: (name: string) => set({ userName: name }),
      setUserEmail: (email: string) => set({ userEmail: email }),
    }),
    {
      name: 'vocacode-auth-storage',
      partialize: (state: AppState): any => ({
        oauthToken: state.oauthToken,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
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


