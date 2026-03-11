import { useRef, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import {
  ChevronDown, LayoutGrid, Search, Monitor,
  Mail, CheckCircle2, Github, LogOut, Minus, Square, X,
  Link2, Zap
} from 'lucide-react'
import { useAppStore } from './lib/store'
import LoginScreen from './pages/LoginScreen'
import LoadingScreen from './pages/LoadingScreen'
import ExplorerScreen from './pages/ExplorerScreen'
import WizardScreen from './pages/WizardScreen'
import PreviewScreen from './pages/PreviewScreen'

// Tauri window API — will fail gracefully in browser
let appWindow: any = null
try {
  import('@tauri-apps/api/window').then((mod) => {
    appWindow = mod.getCurrentWindow()
  })
} catch (_) { /* browser fallback */ }

const HEADER_PAGES = ['explorer', 'wizard1', 'wizard2', 'wizard3', 'final_preview']
const FOOTER_PAGES = ['explorer', 'wizard1', 'wizard2', 'wizard3', 'final_preview']

export default function App() {
  const currentPage = useAppStore((s) => s.currentPage)
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const isProfileOpen = useAppStore((s) => s.isProfileOpen)
  const setProfileOpen = useAppStore((s) => s.setProfileOpen)
  const navigate = useAppStore((s) => s.navigate)
  const selectedModel = useAppStore((s) => s.selectedModel)
  const aiModels = useAppStore((s) => s.aiModels)
  const setSelectedModel = useAppStore((s) => s.setSelectedModel)
  const profileRef = useRef<HTMLDivElement>(null)

  // Auto-login logic (Hydration persist run)
  useEffect(() => {
    const initAuth = async () => {
      const store = useAppStore.getState()
      
      // Jika oauthToken dan refreshToken ada (dari local storage Zustand persist)
      if (store.oauthToken && store.refreshToken) {
        try {
          // Refresh access token via backend Tauri rust
          const newAccessJson: string = await invoke('refresh_access_token', {
            refreshToken: store.refreshToken
          })
          const result = JSON.parse(newAccessJson)
          
          if (result.access_token) {
            useAppStore.setState({ 
              oauthToken: result.access_token,
              isAuthenticated: true 
            })
            // Fetch kuota terbaru secara opsional
            if (store.projectId) {
               const models: any = await invoke('fetch_gemini_models_with_quota', {
                 accessToken: result.access_token,
                 projectId: store.projectId
               })
               useAppStore.setState({ aiModels: models })
            }
            // Langsung ke dashboard
            navigate('explorer')
          }
        } catch (e) {
           console.error("Auto login failed (refresh token expired/error): ", e)
           // Bersihkan sesi jika gagal
           useAppStore.setState({ isAuthenticated: false, oauthToken: null, refreshToken: null, projectId: null })
           navigate('login')
        }
      }
    }
    
    // Hanya periksa jika saat ini berada di halaman login (fresh start)
    if (useAppStore.getState().currentPage === 'login') {
      initAuth()
    }
  }, [])

  // Model selector dropdown state
  const [isModelSelectorOpen, setModelSelectorOpen] = useState(false)
  const modelSelectorRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setModelSelectorOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [setProfileOpen])

  // Window control handlers
  const handleMinimize = async () => {
    try { await appWindow?.minimize() } catch (_) { /* browser */ }
  }
  const handleToggleMaximize = async () => {
    try { await appWindow?.toggleMaximize() } catch (_) { /* browser */ }
  }
  const handleClose = async () => {
    try { await appWindow?.close() } catch (_) { /* browser */ }
  }

  const showHeader = HEADER_PAGES.includes(currentPage)
  const showFooter = FOOTER_PAGES.includes(currentPage)

  return (
    <div className="min-h-screen bg-[#0b0d11] text-gray-300 font-sans flex flex-col select-none overflow-hidden relative">

      {/* Window Controls — top-right, Windows style */}
      <div className="absolute top-0 right-0 p-2 flex items-center gap-0.5 z-[100]" data-tauri-drag-region>
        <div
          onClick={handleMinimize}
          className="p-1.5 hover:bg-white/5 rounded text-gray-600 hover:text-gray-300 cursor-pointer transition-colors"
        >
          <Minus size={14} />
        </div>
        <div
          onClick={handleToggleMaximize}
          className="p-1.5 hover:bg-white/5 rounded text-gray-600 hover:text-gray-300 cursor-pointer transition-colors"
        >
          <Square size={10} />
        </div>
        <div
          onClick={handleClose}
          className="p-1.5 hover:bg-red-600 rounded text-gray-600 hover:text-white cursor-pointer transition-colors"
        >
          <X size={14} />
        </div>
      </div>

      {/* Header — only after login */}
      <AnimatePresence>
        {showHeader && (
          <motion.header
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex justify-between items-center bg-[#11141b] h-12 px-4 border-b border-white/5 relative z-50 shrink-0"
            data-tauri-drag-region
          >
            {/* Left — Logo + Model selector */}
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 w-6 h-6 rounded flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                <span className="font-bold text-[10px] text-white uppercase tracking-tighter leading-none">VC</span>
              </div>

              {/* Model Selector (functional dropdown) */}
              <div className="relative" ref={modelSelectorRef}>
                <div
                  onClick={() => setModelSelectorOpen(!isModelSelectorOpen)}
                  className="flex items-center bg-[#1e2330] rounded-md px-3 py-1.5 cursor-pointer border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 group">
                    <span className="group-hover:text-gray-200 transition-colors">Perencanaan</span>
                    <ChevronDown size={11} className="text-gray-500" />
                  </div>
                  <div className="h-3 w-px bg-white/10 mx-3" />
                  <div className="flex items-center gap-2 text-[11px] text-indigo-300 font-bold group">
                    <span className="group-hover:text-indigo-200 transition-colors uppercase tracking-wide">
                      {selectedModel?.displayName || 'Loading AI...'}
                      {mode === 'BASIC' && selectedModel?.quotaPercent !== undefined ? ` | ${selectedModel.quotaPercent}%` : ''}
                    </span>
                    <ChevronDown size={11} className={`text-gray-500 transition-transform duration-200 ${isModelSelectorOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Model Dropdown */}
                <AnimatePresence>
                  {isModelSelectorOpen && aiModels.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute top-10 left-0 w-80 bg-[#161920] border border-white/10 rounded-xl shadow-2xl py-2 z-[100]"
                    >
                      <p className="px-4 py-1.5 text-[9px] font-bold text-gray-600 uppercase tracking-widest">Pilih Model AI</p>
                      {aiModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setSelectedModel(model)
                            setModelSelectorOpen(false)
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-left ${
                            selectedModel?.id === model.id ? 'bg-indigo-600/10' : ''
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className={`text-[11px] font-bold ${selectedModel?.id === model.id ? 'text-indigo-300' : 'text-gray-300'}`}>
                              {model.displayName} {mode === 'BASIC' && model.quotaPercent !== undefined ? `| ${model.quotaPercent}%` : ''}
                            </span>
                            <span className="text-[9px] text-gray-600 mt-0.5">{model.description}</span>
                          </div>
                          {selectedModel?.id === model.id && (
                            <CheckCircle2 size={14} className="text-indigo-400 shrink-0 ml-2" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Center — BASIC / ADVANCE Toggle */}
            <div className="absolute left-1/2 -translate-x-1/2 flex bg-black/40 rounded-full p-0.5 border border-white/5">
              {(['BASIC', 'ADVANCE'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-0.5 text-[10px] font-bold rounded-full transition-all duration-200 ${mode === m ? 'bg-[#1e2330] text-indigo-400' : 'text-gray-500 hover:text-gray-400'
                    }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Right — Icons + Profile */}
            <div className="flex items-center gap-3 pr-20 relative" ref={profileRef}>
              {mode === 'ADVANCE' && (
                <div className="flex gap-3 text-gray-500">
                  <Search size={15} className="hover:text-gray-300 cursor-pointer transition-colors" />
                  <LayoutGrid size={15} className="hover:text-gray-300 cursor-pointer transition-colors" />
                  <Monitor size={15} className="hover:text-gray-300 cursor-pointer transition-colors" />
                </div>
              )}
              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Profile Button */}
              <button
                onClick={() => setProfileOpen(!isProfileOpen)}
                className="w-6 h-6 bg-teal-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white hover:ring-2 ring-indigo-500/50 transition-all active:scale-90 relative"
              >
                J
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border border-[#11141b] rounded-full" />
              </button>

              {/* Profile Dropdown */}
              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute top-10 right-0 w-64 bg-[#161920] border border-white/10 rounded-xl shadow-2xl py-3 z-[100]"
                  >
                    <div className="px-4 pb-3 border-b border-white/5 mb-2">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Akun Terhubung</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center font-bold text-white text-xs">J</div>
                        <div>
                          <p className="text-xs font-bold text-white">Jaka Sembung</p>
                          <p className="text-[10px] text-gray-500">Pro Member</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-2 space-y-1">
                      {[
                        { icon: Mail, label: 'Google OAuth', sub: 'jaka.dev@gmail.com' },
                        { icon: Github, label: 'GitHub Proxy', sub: '@jakadeveloper' },
                      ].map(({ icon: Icon, label, sub }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-default">
                          <div className="flex items-center gap-3">
                            <Icon size={14} className="text-gray-400" />
                            <div className="flex flex-col">
                              <span className="text-[11px] font-medium text-gray-300">{label}</span>
                              <span className="text-[9px] text-gray-500">{sub}</span>
                            </div>
                          </div>
                          <CheckCircle2 size={12} className="text-green-500" />
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 pt-2 border-t border-white/5 px-2">
                      <button
                        onClick={() => { 
                          setProfileOpen(false)
                          useAppStore.setState({
                             isAuthenticated: false,
                             oauthToken: null,
                             refreshToken: null,
                             projectId: null,
                             aiModels: []
                          })
                          navigate('login') 
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors text-[11px] font-bold"
                      >
                        <LogOut size={14} /> Keluar Sesi
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col items-center relative overflow-y-auto pt-8 pb-12">
        <AnimatePresence mode="wait">
          {currentPage === 'login' && <LoginScreen key="login" />}
          {currentPage === 'loading' && <LoadingScreen key="loading" />}
          {currentPage === 'explorer' && <ExplorerScreen key="explorer" />}
          {['wizard1', 'wizard2', 'wizard3'].includes(currentPage) && <WizardScreen key="wizard" />}
          {currentPage === 'final_preview' && <PreviewScreen key="preview" />}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <AnimatePresence>
        {showFooter && (
          <motion.footer
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className="h-7 bg-[#0a0c10] border-t border-white/5 flex items-center px-4 justify-between shrink-0"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">Sistem Online</span>
              </div>

              <div className="h-3 w-px bg-white/5" />

              <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-colors cursor-default group">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-30" />
                  <Link2 size={8} className="relative inline-flex text-indigo-400" />
                </div>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest group-hover:text-gray-400 transition-colors">
                  MCP: CodePen Connected
                </span>
              </div>

              <div className="h-3 w-px bg-white/5" />
              <div className="flex items-center gap-1 text-gray-600">
                <Zap size={10} />
                <span className="text-[10px] font-bold uppercase">Latensi: 24ms</span>
              </div>
            </div>
            <div className="text-[10px] text-gray-700 font-mono tracking-tighter">BUILD v0.1.0-ALPHA</div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  )
}
