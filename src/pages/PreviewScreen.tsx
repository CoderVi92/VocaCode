import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Terminal, Github, Send, Loader2, Bot } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

interface LogEntry {
    color: string
    text: string
}

const INITIAL_LOGS: LogEntry[] = [
    { color: 'text-blue-400', text: '> menginisialisasi proses produksi ...' },
    { color: 'text-gray-500', text: '> menghubungi CodePen MCP Server ...' },
    { color: 'text-yellow-500', text: '> gagal menghubungi MCP. Menggunakan template dasar. (MCP not initialized)' },
    { color: 'text-green-500', text: '> sistem siap. Menunggu instruksi AI...' },
]

export default function PreviewScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const wizardData = useAppStore((s) => s.wizardData)
    const oauthToken = useAppStore((s) => s.oauthToken)
    const selectedModel = useAppStore((s) => s.selectedModel)

    const [aiInput, setAiInput] = useState('')
    const [aiResponse, setAiResponse] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS)
    const logsRef = useRef<HTMLDivElement>(null)
    const responseRef = useRef<HTMLDivElement>(null)

    // Auto-scroll logs
    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
    }, [logs])

    // Auto-scroll AI response
    useEffect(() => {
        if (responseRef.current) responseRef.current.scrollTop = responseRef.current.scrollHeight
    }, [aiResponse])

    const addLog = (color: string, text: string) => {
        setLogs((prev) => [...prev, { color, text }])
    }

    const handleSendPrompt = async () => {
        const prompt = aiInput.trim()
        if (!prompt || isGenerating) return

        setAiInput('')
        setAiResponse('')
        setIsGenerating(true)

        const modelId = selectedModel?.id || 'antigravity-gemini-3.1-pro'
        const modelName = selectedModel?.displayName || modelId

        addLog('text-indigo-400', `> mengirim instruksi ke ${modelName} ...`)
        addLog('text-gray-500', `> prompt: "${prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt}"`)

        // Setup SSE listeners
        let unlistenChunk: UnlistenFn | null = null
        let unlistenComplete: UnlistenFn | null = null
        let unlistenError: UnlistenFn | null = null

        try {
            unlistenChunk = await listen<string>('ai_chunk', (event) => {
                setAiResponse((prev) => prev + event.payload)
            })

            unlistenComplete = await listen('ai_complete', () => {
                setIsGenerating(false)
                addLog('text-green-500', '> response AI selesai.')
                // Cleanup listeners
                unlistenChunk?.()
                unlistenComplete?.()
                unlistenError?.()
            })

            unlistenError = await listen<string>('ai_error', (event) => {
                setIsGenerating(false)
                addLog('text-red-400', `> error AI: ${event.payload}`)
                // Cleanup listeners
                unlistenChunk?.()
                unlistenComplete?.()
                unlistenError?.()
            })

            // Invoke backend command with selected model
            await invoke('execute_model_prompt', {
                token: oauthToken || '',
                model: modelId,
                prompt: prompt,
            })

        } catch (err: any) {
            setIsGenerating(false)
            const errorMsg = typeof err === 'string' ? err : err?.message || 'Unknown error'
            addLog('text-red-400', `> gagal menghubungi AI: ${errorMsg}`)

            // Cleanup listeners on error
            unlistenChunk?.()
            unlistenComplete?.()
            unlistenError?.()

            // Fallback response for browser preview without Tauri
            if (errorMsg.includes('not a function') || errorMsg.includes('__TAURI__') || errorMsg.includes('Could not resolve')) {
                addLog('text-yellow-500', '> mode preview browser: menampilkan respons simulasi.')
                setAiResponse(`[Simulasi] AI akan merespons instruksi: "${prompt}"\n\nFitur ini memerlukan Tauri runtime untuk berkomunikasi dengan model ${modelName}. Silakan jalankan aplikasi via 'npm run tauri dev'.`)
            }
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendPrompt()
        }
    }

    const previewHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${wizardData.projectName || 'Preview'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b0d11; color: #f1f5f9; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; }
    h1 { font-size: 2.5rem; font-weight: 900; letter-spacing: -0.05em; color: white; margin-bottom: 0.75rem; }
    h1 span { color: #6366f1; }
    p { color: #94a3b8; max-width: 28rem; line-height: 1.7; margin-bottom: 2rem; font-size: 0.95rem; }
    nav { display: flex; gap: 1rem; margin-bottom: 2.5rem; flex-wrap: wrap; justify-content: center; }
    nav a { color: #a5b4fc; font-size: 0.8rem; font-weight: 600; text-decoration: none; padding: 0.4rem 1rem; border: 1px solid #4f46e5/40; border-radius: 999px; }
    .btn { background: #4f46e5; color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; cursor: pointer; box-shadow: 0 0 24px rgba(99,102,241,0.3); }
    .tag { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #818cf8; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); padding: 0.25rem 0.75rem; border-radius: 999px; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <div class="tag">✦ AI Generated</div>
  <h1>${wizardData.projectName || 'MyWebsite'} <span>.</span></h1>
  <p>${wizardData.tagline || 'Tagline perusahaan Anda akan muncul di sini dalam bahasa yang elegan.'}</p>
  ${wizardData.pages.length > 0 ? `<nav>${wizardData.pages.map(p => `<a href="#">${p}</a>`).join('')}</nav>` : ''}
  <button class="btn">Mulai Sekarang</button>
</body>
</html>`

    return (
        <ScreenWrapper className="!flex-row w-full h-full px-6 py-0 gap-4">
            {/* Left — AI Refinement + Logs */}
            <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="w-full md:w-80 flex flex-col gap-4 h-full py-4 shrink-0"
            >
                {/* AI Refinement Panel */}
                <div className="bg-[#11141b] rounded-xl border border-white/5 p-4 flex flex-col gap-3 shadow-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-indigo-400">
                            <Zap size={16} fill="currentColor" />
                            <span className="text-xs font-bold uppercase tracking-wider">AI Refinement</span>
                        </div>
                        {selectedModel && (
                            <span className="text-[9px] font-bold text-indigo-300/60 uppercase tracking-wider bg-indigo-600/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                {selectedModel.displayName}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                        Kirim instruksi ke AI untuk memodifikasi website. Tekan Enter untuk mengirim.
                    </p>
                    <textarea
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isGenerating}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs outline-none focus:border-indigo-500 h-24 transition-colors resize-none text-gray-300 placeholder:text-gray-600 disabled:opacity-50"
                        placeholder="Misal: Ubah section hero jadi warna biru muda..."
                    />
                    <button
                        onClick={handleSendPrompt}
                        disabled={isGenerating || !aiInput.trim()}
                        className={`w-full py-2 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${isGenerating || !aiInput.trim()
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            }`}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 size={12} className="animate-spin" />
                                Menunggu AI...
                            </>
                        ) : (
                            <>
                                <Send size={12} />
                                Update Kode
                            </>
                        )}
                    </button>
                </div>

                {/* AI Response Panel */}
                <AnimatePresence>
                    {aiResponse && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-[#11141b] rounded-xl border border-indigo-500/20 overflow-hidden shadow-xl"
                        >
                            <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
                                <Bot size={14} className="text-indigo-400" />
                                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Response AI</span>
                                {isGenerating && <Loader2 size={10} className="animate-spin text-indigo-400 ml-auto" />}
                            </div>
                            <div
                                ref={responseRef}
                                className="p-4 max-h-48 overflow-y-auto"
                            >
                                <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                                    {aiResponse}
                                </pre>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* System Logs */}
                <div className="flex-1 bg-[#090b0f] rounded-xl border border-white/5 p-4 overflow-hidden flex flex-col min-h-[140px]">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">System Logs</span>
                        <Terminal size={12} className="text-gray-700" />
                    </div>
                    <div ref={logsRef} className="flex-1 font-mono text-[9px] space-y-1.5 overflow-y-auto pr-1">
                        {logs.map((log, i) => (
                            <motion.p
                                key={`${i}-${log.text.slice(0, 20)}`}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i < INITIAL_LOGS.length ? i * 0.25 : 0, duration: 0.3 }}
                                className={`${log.color} ${i === logs.length - 1 && isGenerating ? 'animate-pulse' : ''}`}
                            >
                                {log.text}
                            </motion.p>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Right — Live Preview */}
            <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
                className="flex-1 bg-gray-50 rounded-xl shadow-2xl relative overflow-hidden border border-white/10 my-4 group"
            >
                {/* Browser bar */}
                <div className="absolute top-0 inset-x-0 h-10 bg-[#1e2330] flex items-center justify-between px-4 z-10 border-b border-black/10">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-tighter">
                            {wizardData.projectName || 'preview'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('explorer')}
                            className="text-gray-500 hover:text-gray-300 text-[10px] transition-colors cursor-pointer mr-2"
                        >
                            Ganti Template
                        </button>
                        <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer">
                            <Github size={12} /> Publish to GitHub
                        </button>
                    </div>
                </div>

                <iframe
                    title="preview"
                    sandbox="allow-scripts"
                    srcDoc={previewHtml}
                    className="w-full h-full border-0 pt-10"
                />
            </motion.div>
        </ScreenWrapper>
    )
}
