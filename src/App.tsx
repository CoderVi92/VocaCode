import { AnimatePresence } from 'framer-motion'
import { useAppStore } from './lib/store'
import LoginScreen from './pages/LoginScreen'
import LoadingScreen from './pages/LoadingScreen'
import ExplorerScreen from './pages/ExplorerScreen'
import WizardScreen from './pages/WizardScreen'
import PreviewScreen from './pages/PreviewScreen'

const PAGE_LABELS: Record<string, string> = {
  login: 'Beranda',
  loading: 'Autentikasi...',
  explorer: 'Template Explorer',
  wizard: 'Website Wizard',
  preview: 'Live Preview',
}

function App() {
  const currentPage = useAppStore((s) => s.currentPage)

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--color-bg-base)] text-[var(--color-text-base)] rounded-xl overflow-hidden border border-[var(--color-border)] shadow-2xl">
      {/* Custom Window Titlebar */}
      <div
        data-tauri-drag-region
        className="h-10 w-full flex items-center justify-between px-4 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] select-none shrink-0"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer transition-colors" />
          <span className="ml-2 text-xs font-semibold text-[var(--color-text-muted)] tracking-wider" data-tauri-drag-region>
            VOCA<span className="text-[var(--color-brand)]">CODE</span>
          </span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]" data-tauri-drag-region>
          {PAGE_LABELS[currentPage] ?? currentPage}
        </span>
      </div>

      {/* Main Content Area with Framer Motion transitions */}
      <div className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {currentPage === 'login' && <LoginScreen key="login" />}
          {currentPage === 'loading' && <LoadingScreen key="loading" />}
          {currentPage === 'explorer' && <ExplorerScreen key="explorer" />}
          {currentPage === 'wizard' && <WizardScreen key="wizard" />}
          {currentPage === 'preview' && <PreviewScreen key="preview" />}
        </AnimatePresence>
      </div>

      {/* Footer Status Bar */}
      <div className="h-6 bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] flex items-center px-4 justify-between text-[10px] text-[var(--color-text-muted)] shrink-0">
        <div className="flex gap-4">
          <span>v0.1.0</span>
          <span>● MCP Status: Disconnected</span>
        </div>
        <span>Vibe Coding IDE</span>
      </div>
    </div>
  )
}

export default App
