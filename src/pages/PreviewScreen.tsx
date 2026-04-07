import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Terminal, Github, Send, Loader2, Bot, Mic, Paperclip, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { refreshAccessTokenBasicSafe } from '../lib/auth-basic'
import { logger } from '../lib/logger'

interface LogEntry {
    color: string
    text: string
}

interface Attachment {
    name: string
    mime_type: string
    data: string
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
    const projectId = useAppStore((s) => s.projectId)
    const selectedModel = useAppStore((s) => s.selectedModel)
    const mode = useAppStore((s: any) => s.mode) // Poin: Kondisi BASIC

    const [aiInput, setAiInput] = useState('')
    const [aiResponse, setAiResponse] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS)
    const [isListening, setIsListening] = useState(false)
    const logsRef = useRef<HTMLDivElement>(null)
    const responseRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Poin 5: Multi-Turn Chat History (Khusus disimulasikan untuk mengingat konteks di BASIC)
    const [chatHistory, setChatHistory] = useState<{role: string, text: string}[]>([])
    // Poin 8 & 12: Representasi Error Ramah & Auto-Retry
    const [errorState, setErrorState] = useState<{type: '403' | '429' | '500' | null, message: string, countdown?: number}>({ type: null, message: '' })
    
    // Fitur 6: Attachments
    const [attachments, setAttachments] = useState<Attachment[]>([])

    // Fitur 7: Voice-to-Text (Realtime + Punctuation)
    const [interimSpeech, setInterimSpeech] = useState('')

    // Speech to Text logic
    const handleToggleSpeech = () => {
        const SpeechRecognitionInfo = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognitionInfo) {
            addLog('text-yellow-500', '> browser Anda tidak mendukung Speech-to-Text.')
            return
        }
        
        if (isListening) return // Prevent duplicate

        const recognition = new SpeechRecognitionInfo()
        recognition.lang = 'id-ID' // Bahasa Indonesia
        recognition.interimResults = true // Poin: Interim Real-time

        recognition.onstart = () => {
            setIsListening(true)
            setInterimSpeech('')
            addLog('text-indigo-400', '> mikrofon aktif, silakan bicara...')
        }

        recognition.onresult = (event: any) => {
            let interim = ''
            let isFinal = false
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                let chunk = event.results[i][0].transcript
                
                // Fitur 7: Punctuation Engine Sederhana
                chunk = chunk
                    .replace(/koma/gi, ',')
                    .replace(/titik/gi, '.')
                    .replace(/tanda tanya/gi, '?')

                if (event.results[i].isFinal) {
                    isFinal = true
                    setAiInput((prev) => prev ? prev + ' ' + chunk : chunk)
                    addLog('text-green-500', `> suara terekam: "${chunk}"`)
                } else {
                    interim += chunk
                }
            }
            
            if (isFinal) {
                setInterimSpeech('') // Reset interim when final
            } else {
                setInterimSpeech(interim)
            }
        }

        recognition.onerror = (event: any) => {
            addLog('text-red-400', `> kesalahan mikrofon: ${event.error}`)
        }

        recognition.onend = () => {
            setIsListening(false)
        }

        recognition.start()
    }

    const processFile = (file: File) => {
        const isImage = file.type.startsWith('image/')
        const isVideo = file.type.startsWith('video/')
        const allowedMap = selectedModel?.supportedMimeTypes || []
        
        let isSupported = false
        if (isImage && selectedModel?.supportsImages) isSupported = true
        else if (isVideo && selectedModel?.supportsVideo) isSupported = true
        else if (allowedMap.includes(file.type)) isSupported = true

        if (!isSupported) {
            addLog('text-red-400', `> File ${file.name} (Tipe: ${file.type || 'unknown'}) tidak didukung oleh model AI ini.`)
            return
        }

        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            const base64Data = result.split(',')[1]
            setAttachments(prev => [...prev, {
                name: file.name,
                mime_type: file.type,
                data: base64Data
            }])
            addLog('text-blue-400', `> Lampiran ditambahkan: ${file.name}`)
        }
        reader.readAsDataURL(file)
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault()
            Array.from(e.clipboardData.files).forEach(processFile)
        }
    }

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            Array.from(e.target.files).forEach(processFile)
        }
        e.target.value = ''
    }

    // Auto-scroll logs
    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
    }, [logs])

    // Auto-scroll AI response
    useEffect(() => {
        if (responseRef.current) responseRef.current.scrollTop = responseRef.current.scrollHeight
    }, [aiResponse])

    // Fitur 11: Logging System — Persist + Filter
    const VERBOSE_KEYWORDS = ['endpoint', 'HTTP', 'raw', 'payload', 'bearer', 'header', 'Content-Type']

    const addLog = (color: string, text: string) => {
        // Selalu persist ke file log (Desktop/vocacode-debug.log)
        logger.info('SYSTEM-LOG', 'Chat', text)

        // Di BASIC, sembunyikan log teknis dari panel UI
        if (mode === 'BASIC' && VERBOSE_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
            return // Tidak tampil di UI, tapi sudah tersimpan di file
        }

        setLogs((prev) => [...prev, { color, text }])
    }

    // Fitur 12: Session Management — Auto reset chat history per model
    useEffect(() => {
        if (mode === 'BASIC') {
            setChatHistory([])
            setAiResponse('')
            setLogs((prev) => [...prev, { color: 'text-gray-500', text: `> riwayat obrolan dibersihkan untuk model: ${selectedModel?.displayName || 'baru'}` }])
        }
    }, [selectedModel?.id, mode])

    const handleSendPrompt = async () => {
        const prompt = aiInput.trim()
        if (!prompt || isGenerating) return

        setAiInput('')
        setAiResponse('')
        setIsGenerating(true)

        const baseModelId = selectedModel?.id || 'gemini-3.1-pro'
        
        // Prioritaskan selectedTierId jika ada. Jika tidak, gunakan baseModelId.
        const modelId = selectedModel?.selectedTierId || baseModelId
        
        // Cari nama tier jika sedang menggunakan tier
        const tierName = selectedModel?.tiers?.find(t => t.id === modelId)?.name
        const modelName = selectedModel?.displayName 
            ? `${selectedModel.displayName}${tierName ? ` (${tierName})` : ''}` 
            : modelId

        // Poin 8: Mereset state error sebelum mencoba
        if (mode === 'BASIC') setErrorState({ type: null, message: '' })

        // Poin 1 & Complexity: Pastikan token segar sebelum mengirim (seperti server.cjs)
        let activeToken = oauthToken || ''
        const refreshToken = useAppStore.getState().refreshToken

        if (mode === 'BASIC' && refreshToken) {
            try {
                activeToken = await refreshAccessTokenBasicSafe(refreshToken)
            } catch (e) {
                console.error("Token refresh failed before chat", e)
            }
        }

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
                
                if (mode === 'BASIC') {
                    // Update Poin 5: Menyimpan ke riwayat percakapan khusus mode BASIC
                    setChatHistory(prev => {
                        let finalResponse = ''
                        setAiResponse(curr => { finalResponse = curr; return curr })
                        return [...prev, { role: 'user', text: prompt }, { role: 'model', text: finalResponse }]
                    })
                }

                setAttachments([]) // Remove attachments when chat succeeds

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

            const selectedTier = selectedModel?.tiers?.find(t => t.id === modelId)
            const thinkingBudget = selectedTier?.budget || undefined

            // Poin 5 & Complexity: Kirim chatHistory yang sebenarnya (bukan gabungan string hack)
            // server.cjs baris 480-482: apiProvider menentukan endpoint routing
            // - API_PROVIDER_OPENAI_VERTEX → streamGenerateContent (GPT-OSS)
            // - API_PROVIDER_GOOGLE_GEMINI → generateContent (Gemini)
            // - API_PROVIDER_ANTHROPIC_VERTEX → generateContent (Claude)
            await invoke('execute_model_prompt', {
                token: activeToken,
                projectId: projectId || '',
                model: selectedModel?.id || modelId,
                prompt: prompt,
                history: chatHistory, // Mengirim Vec<ChatMessage> ke Rust
                thinkingBudget: thinkingBudget, // Mengirim budget integer ke API
                attachments: attachments.length > 0 ? attachments : null,
                apiProvider: (selectedModel as any)?.apiProvider || null // Provider routing untuk endpoint
            })

        } catch (err: any) {
            setIsGenerating(false)
            const errorMsg = typeof err === 'string' ? err : err?.message || 'Unknown error'
            addLog('text-red-400', `> gagal menghubungi AI: ${errorMsg}`)

            // Poin 8 & 12: Deteksi Spesifik Error Khusus mode BASIC
            if (mode === 'BASIC') {
                if (errorMsg.includes('Akses ditolak') || errorMsg.includes('403')) {
                    setErrorState({ type: '403', message: 'Akun Anda kemungkinan membutuhkan Verifikasi Nomor HP di Google Cloud Console.' })
                } else if (errorMsg.includes('429') || errorMsg.includes('Terlalu banyak permintaan')) {
                    // Poin 12: Mekanisme Auto-Retry
                    addLog('text-yellow-400', '> mendeteksi limit 429/503. Mengaktifkan auto-retry (Poin 12)...')
                    let countdown = 3
                    setErrorState({ type: '429', message: 'Teguran Rate Limit diterima. Server akan mencoba mengetuk ulang secara otomatis.', countdown: countdown })
                    
                    const interval = setInterval(() => {
                        countdown -= 1
                        setErrorState(prev => ({ ...prev, countdown }))
                        if (countdown <= 0) {
                            clearInterval(interval)
                            // Auto Retry Action (Poin 12)
                            setErrorState({ type: null, message: '' })
                            addLog('text-indigo-400', '> Auto-retry trigger dieksekusi.')
                            setAiInput(prompt) // Mengembalikan prompt
                            setTimeout(() => document.getElementById('btn-send-prompt')?.click(), 500)
                        }
                    }, 1000)
                } else if (errorMsg.includes('404') || errorMsg.includes('NOT_FOUND') || errorMsg.includes('entity was not found')) {
                    // Poin 8 Refinement: Deteksi Project / Model ID tidak ditemukan
                    setErrorState({ type: '500', message: 'Project ID atau Model ID tidak ditemukan (404). Pastikan Model terpilih tersedia pada akun Anda.' })
                } else if (errorMsg.includes('503') || errorMsg.includes('500') || errorMsg.includes('sedang penuh') || errorMsg.includes('kapasitas') || errorMsg.includes('habis')) {
                    // Poin 8: 503 Capacity & 500 Thinking Solution
                    setErrorState({ type: '500', message: 'Model berkapasitas penuh atau kuota terlampaui. Solusi: Ubah "Perencanaan" ke tingkat yang lebih rendah atau ganti Model AI lain.' })
                }
            }

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
            e.stopPropagation()
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
                    <div className="relative">
                        <textarea
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            disabled={isGenerating}
                            className={`w-full bg-black/40 border border-white/10 rounded-lg p-3 pr-10 text-xs outline-none focus:border-indigo-500 h-24 transition-colors resize-none text-gray-300 placeholder:text-gray-600 disabled:opacity-50 ${attachments.length > 0 ? 'pb-8' : ''}`}
                            placeholder="Misal: Ubah section hero jadi warna biru muda..."
                        />
                        {interimSpeech && (
                            <div className="absolute top-2 right-12 bg-[#1e2330]/90 backdrop-blur-sm border border-indigo-500/30 text-indigo-300 text-[10px] px-2 py-1 rounded pointer-events-none animate-pulse max-w-[200px] truncate">
                                {interimSpeech}
                            </div>
                        )}
                        
                        {/* Multi-file Accumulate Badge (Fitur 6) */}
                        {attachments.length > 0 && (
                            <div className="absolute left-3 bottom-3 flex gap-2">
                                {attachments.map((att, idx) => (
                                    <div key={idx} className="flex items-center gap-1 bg-indigo-500/20 text-indigo-300 text-[9px] px-2 py-0.5 rounded border border-indigo-500/30">
                                        <span className="truncate max-w-[60px]">{att.name}</span>
                                        <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="hover:text-red-400 transition-colors"><X size={10} /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="absolute right-2 bottom-2 flex flex-col gap-1">
                            {/* File Picker Picker (Fitur 6) */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1 rounded bg-white/5 text-gray-500 hover:text-indigo-400 transition-colors flex items-center justify-center mx-auto"
                                title="Lampirkan File"
                            >
                                <Paperclip size={12} />
                            </button>
                            <input type="file" ref={fileInputRef} hidden multiple onChange={handleFileSelected} />

                            <button
                                onClick={handleToggleSpeech}
                                className={`p-1 flex items-center justify-center rounded transition-colors ${isListening ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-white/5 text-gray-500 hover:text-indigo-400'}`}
                                title="Dikte Suara (Voice to Text)"
                            >
                                <Mic size={14} />
                            </button>
                        </div>
                    </div>
                    <button
                        id="btn-send-prompt"
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

                {/* UI Error Khusus Mode BASIC (Poin 8 & 12) */}
                <AnimatePresence>
                    {mode === 'BASIC' && errorState.type && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={`p-4 rounded-xl border flex flex-col gap-2 shadow-xl ${
                                errorState.type === '403' ? 'bg-red-500/10 border-red-500/30' :
                                errorState.type === '429' ? 'bg-yellow-500/10 border-yellow-500/30' :
                                'bg-orange-500/10 border-orange-500/30'
                            }`}
                        >
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white px-2 py-0.5 rounded bg-black/40 w-fit">
                                {errorState.type === '403' ? 'AKUN MEMBUTUHKAN VERIFIKASI (403)' : 
                                 errorState.type === '429' ? 'SERVER SIBUK - AUTO RETRY (429/503)' : 'KESALAHAN PARAMETER (500)'}
                            </span>
                            <p className="text-xs text-gray-300 leading-relaxed">
                                {errorState.message}
                            </p>
                            
                            {errorState.type === '403' && (
                                <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="mt-2 block w-full text-center py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors">
                                    Buka Google Cloud Console
                                </a>
                            )}
                            
                            {errorState.type === '429' && errorState.countdown !== undefined && (
                                <div className="mt-2 w-full py-2 bg-yellow-500/20 rounded-lg flex items-center justify-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-yellow-400" />
                                    <span className="text-xs font-bold text-yellow-500">Mencoba otomatis dalam {errorState.countdown} detik...</span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

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
                                className="p-4 max-h-48 overflow-y-auto w-full prose prose-invert prose-sm"
                                dangerouslySetInnerHTML={{ __html: aiResponse ? DOMPurify.sanitize(marked.parse(aiResponse) as string) : '' }}
                            />
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
                        {/* Fitur 11: BASIC hanya tampilkan 10 log terakhir */}
                        {(mode === 'BASIC' ? logs.slice(-10) : logs).map((log, i) => (
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
