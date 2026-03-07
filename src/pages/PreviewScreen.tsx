import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Zap, Terminal, Github, Send } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

const LOGS = [
    { color: 'text-blue-400', text: '> menginisialisasi proses produksi ...' },
    { color: 'text-gray-500', text: '> menghubungi CodePen MCP Server ...' },
    { color: 'text-yellow-500', text: '> gagal menghubungi MCP. Menggunakan template dasar. (MCP not initialized)' },
    { color: 'text-indigo-400', text: '> mengirim konteks ke Gemini AI ...' },
    { color: 'text-green-500', text: '> sinkronisasi visual selesai.' },
]

export default function PreviewScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const wizardData = useAppStore((s) => s.wizardData)

    const [aiInput, setAiInput] = useState('')
    const [instruction, setInstruction] = useState('')
    const logsRef = useRef<HTMLDivElement>(null)

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

    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
    }, [])

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
                <div className="bg-[#11141b] rounded-xl border border-white/5 p-4 flex flex-col gap-4 shadow-xl">
                    <div className="flex items-center gap-2 text-indigo-400">
                        <Zap size={16} fill="currentColor" />
                        <span className="text-xs font-bold uppercase tracking-wider">AI Refinement</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                        Setiap modifikasi akan langsung dirender ulang pada preview di sebelah.
                    </p>
                    <textarea
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs outline-none focus:border-indigo-500 h-24 transition-colors resize-none text-gray-300 placeholder:text-gray-600"
                        placeholder="Misal: Ubah section hero jadi warna biru muda..."
                    />
                    <button
                        onClick={() => { setInstruction(aiInput); setAiInput('') }}
                        className="w-full bg-indigo-600 py-2 rounded-lg text-xs font-bold hover:bg-indigo-500 transition-colors active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <Send size={12} />
                        Update Kode
                    </button>
                    {instruction && (
                        <p className="text-[9px] text-gray-500 italic border-t border-white/5 pt-2">
                            Terakhir: "{instruction}" — Fitur AI generasi aktif di Fase 4.
                        </p>
                    )}
                </div>

                {/* System Logs */}
                <div className="flex-1 bg-[#090b0f] rounded-xl border border-white/5 p-4 overflow-hidden flex flex-col min-h-[180px]">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">System Logs</span>
                        <Terminal size={12} className="text-gray-700" />
                    </div>
                    <div ref={logsRef} className="flex-1 font-mono text-[9px] space-y-2 overflow-y-auto pr-1">
                        {LOGS.map((log, i) => (
                            <motion.p
                                key={i}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.25, duration: 0.3 }}
                                className={`${log.color} ${i === LOGS.length - 1 ? 'animate-pulse' : ''}`}
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
