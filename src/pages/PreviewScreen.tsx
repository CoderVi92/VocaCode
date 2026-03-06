import { useState } from 'react'
import { Send, RefreshCcw, Github } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

const PLACEHOLDER_CODE = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Preview Website</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b0d11; color: #f1f5f9; margin: 0; padding: 2rem; }
    h1 { color: #6366f1; } p { color: #94a3b8; }
    .btn { background: #4f46e5; color: white; border: none; padding: .6rem 1.4rem; border-radius: .5rem; cursor: pointer; }
  </style>
</head>
<body>
  <h1>PROJECT_NAME</h1>
  <p>TAGLINE</p>
  <button class="btn">Mulai Sekarang</button>
</body>
</html>`

export default function PreviewScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const wizardData = useAppStore((s) => s.wizardData)
    const [chatInput, setChatInput] = useState('')
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', content: string }[]>([
        { role: 'ai', content: 'Halo! Saya siap membantu Anda menyempurnakan desain website ini. Ketik instruksi Anda di bawah.' }
    ])

    const previewCode = PLACEHOLDER_CODE
        .replace('PROJECT_NAME', wizardData?.projectName || 'MyWebsite')
        .replace('TAGLINE', wizardData?.tagline || 'Your tagline here')

    const handleSend = () => {
        if (!chatInput.trim()) return
        setChatHistory((prev) => [
            ...prev,
            { role: 'user', content: chatInput },
            { role: 'ai', content: `Baik! Memproses instruksi: "${chatInput}". Fitur AI generasi akan aktif di Fase 4.` }
        ])
        setChatInput('')
    }

    return (
        <ScreenWrapper className="flex-row overflow-hidden">
            {/* Left: Chat Panel */}
            <div className="w-72 shrink-0 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]">
                <div className="p-3 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    AI Refinement
                </div>
                {/* Messages */}
                <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`text-xs px-3 py-2 rounded-lg max-w-[90%] ${msg.role === 'user' ? 'self-end bg-indigo-600/30 text-indigo-200 ml-auto' : 'self-start bg-[var(--color-bg-elevated)] text-[var(--color-text-base)]'}`}>
                            {msg.content}
                        </div>
                    ))}
                </div>
                {/* Input */}
                <div className="p-3 border-t border-[var(--color-border)] flex gap-2">
                    <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Instruksi ke AI..."
                        className="flex-1 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button onClick={handleSend} className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer">
                        <Send size={14} />
                    </button>
                </div>
            </div>

            {/* Right: Preview */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-[var(--color-border)] flex items-center gap-2 shrink-0">
                    <RefreshCcw size={14} className="text-[var(--color-text-muted)]" />
                    <span className="text-xs text-[var(--color-text-muted)] flex-1">Live Preview</span>
                    <button
                        onClick={() => navigate('explorer')}
                        className="text-xs px-3 py-1 rounded-lg bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-colors cursor-pointer"
                    >
                        Ganti Template
                    </button>
                    <button className="text-xs px-3 py-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer">
                        <Github size={13} />
                        Publish
                    </button>
                </div>
                <iframe
                    title="preview"
                    sandbox="allow-scripts"
                    srcDoc={previewCode}
                    className="flex-1 w-full border-0 bg-white"
                />
            </div>
        </ScreenWrapper>
    )
}
