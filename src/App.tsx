import { useState } from 'react'

function App() {
  return (
    <div className="flex flex-col h-screen w-full bg-[var(--color-bg-base)] text-[var(--color-text-base)] rounded-xl overflow-hidden border border-[var(--color-border)] shadow-2xl">
      {/* Custom Window Titlebar */}
      <div
        data-tauri-drag-region
        className="h-10 w-full flex items-center justify-between px-4 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] select-none shrink-0"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer"></div>
          <span className="ml-2 text-xs font-semibold text-[var(--color-text-muted)] tracking-wider" data-tauri-drag-region>VOCA<span className="text-[var(--color-brand)]">CODE</span></span>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]" data-tauri-drag-region>
          workspace
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Mini */}
        <div className="w-16 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] flex flex-col items-center py-4 gap-4">
          {/* Sidebar Icons Placeholder */}
          <div className="w-8 h-8 rounded bg-[var(--color-brand-dark)] opacity-80 cursor-pointer hover:opacity-100 flex items-center justify-center">🌐</div>
          <div className="w-8 h-8 rounded bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-border)] flex items-center justify-center">⚙️</div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 relative overflow-auto">
          <h1 className="text-2xl font-bold mb-4">Welcome to VocaCode</h1>
          <p className="text-[var(--color-text-muted)] max-w-lg">
            This is the foundational scaffolding. The app is running with a customized borderless frame, dark mode palette, and Tailwind v4.
          </p>
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="h-6 bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] flex flex-row items-center px-4 justify-between text-[10px] text-[var(--color-text-muted)] shrink-0">
        <div className="flex gap-4">
          <span>v0.1.0</span>
          <span>● MCP Status: Disconnected</span>
        </div>
        <div>
          <span>Vibe Coding IDE</span>
        </div>
      </div>
    </div>
  )
}

export default App
