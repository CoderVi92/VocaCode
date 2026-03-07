import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, Globe, Database, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'
import type { AppPage } from '../lib/store'

const PAGE_OPTIONS = ['Home', 'Tentang Kami', 'Layanan', 'Portofolio', 'Tim Kami', 'Kontak', 'Blog', 'FAQ']

const STEP_MAP: Record<string, number> = { wizard1: 1, wizard2: 2, wizard3: 3 }
const PREV_MAP: Record<string, AppPage> = { wizard1: 'explorer', wizard2: 'wizard1', wizard3: 'wizard2' }
const NEXT_MAP: Record<string, AppPage> = { wizard1: 'wizard2', wizard2: 'wizard3', wizard3: 'final_preview' }

const slide = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
}


// Floating label input
function Input({
    label, value, onChange, placeholder, type = 'text',
}: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string
}) {
    return (
        <div className="group relative">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 transition-colors group-focus-within:text-indigo-400">
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-gradient-to-b from-black/30 to-black/10 border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/60 focus:bg-black/30 transition-all duration-200"
            />
        </div>
    )
}

function Textarea({
    label, value, onChange, placeholder, rows = 4,
}: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; rows?: number
}) {
    return (
        <div className="group relative">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 transition-colors group-focus-within:text-indigo-400">
                {label}
            </label>
            <textarea
                rows={rows}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-gradient-to-b from-black/30 to-black/10 border border-white/[0.08] rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/60 focus:bg-black/30 transition-all duration-200 resize-none"
            />
        </div>
    )
}

export default function WizardScreen() {
    const currentPage = useAppStore((s) => s.currentPage)
    const navigate = useAppStore((s) => s.navigate)
    const wizardData = useAppStore((s) => s.wizardData)
    const updateWizardData = useAppStore((s) => s.updateWizardData)
    const toggleWizardPage = useAppStore((s) => s.toggleWizardPage)
    const selectedTemplate = useAppStore((s) => s.selectedTemplate)

    const stepNum = STEP_MAP[currentPage] ?? 1

    const canProceed = () => {
        if (currentPage === 'wizard1') {
            return wizardData.projectName.trim() !== '' &&
                wizardData.tagline.trim() !== '' &&
                wizardData.description.trim() !== ''
        }
        if (currentPage === 'wizard2') {
            return wizardData.pages.length > 0
        }
        return true
    }

    return (
        <ScreenWrapper>
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="m-auto w-full max-w-2xl bg-[#11141b] rounded-2xl border border-white/[0.07] overflow-hidden shadow-2xl shadow-black/50"
            >
                {/* Header */}
                <div className="px-8 py-5 border-b border-white/5 bg-gradient-to-r from-[#161a24] to-[#131720] flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white">Konfigurasi AI</h2>
                        {selectedTemplate && (
                            <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-indigo-400 inline-block" />
                                Template: <span className="text-indigo-400 font-semibold">{selectedTemplate.title}</span>
                            </p>
                        )}
                    </div>

                    {/* Step progress bars */}
                    <div className="flex items-center gap-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex flex-col items-center gap-1">
                                <div
                                    className={`h-1 rounded-full transition-all duration-500 ${stepNum === i ? 'bg-indigo-500 w-10' : stepNum > i ? 'bg-indigo-500/40 w-7' : 'bg-gray-800 w-7'
                                        }`}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* STEP CONTENT */}
                <div className="px-8 py-8 min-h-[340px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">

                        {/* Wizard 1 — Identitas */}
                        {currentPage === 'wizard1' && (
                            <motion.div key="w1" variants={slide} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-5">
                                <div className="mb-2">
                                    <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Langkah 1 dari 3</div>
                                    <h3 className="text-lg font-bold text-white">Identitas Bisnis</h3>
                                    <p className="text-xs text-gray-500 mt-1">Informasi ini akan digunakan AI untuk menyesuaikan konten website Anda.</p>
                                </div>

                                <div className="w-full h-px bg-gradient-to-r from-indigo-500/30 via-white/5 to-transparent mb-5" />

                                <Input
                                    label="Nama Perusahaan / Project"
                                    value={wizardData.projectName}
                                    onChange={(v) => updateWizardData({ projectName: v })}
                                    placeholder="Contoh: PT Maju Bersama, PortofolioSaya"
                                />
                                <Input
                                    label="Tagline / Slogan"
                                    value={wizardData.tagline}
                                    onChange={(v) => updateWizardData({ tagline: v })}
                                    placeholder="Contoh: Solusi Digital Terpercaya"
                                />
                                <Textarea
                                    label="Deskripsi Singkat"
                                    value={wizardData.description}
                                    onChange={(v) => updateWizardData({ description: v })}
                                    placeholder="Ceritakan tentang bisnis Anda, layanan yang ditawarkan, dan target audiens..."
                                    rows={3}
                                />
                            </motion.div>
                        )}

                        {/* Wizard 2 — Struktur halaman */}
                        {currentPage === 'wizard2' && (
                            <motion.div key="w2" variants={slide} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }}>
                                <div className="mb-6">
                                    <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Langkah 2 dari 3</div>
                                    <h3 className="text-lg font-bold text-white">Struktur Halaman</h3>
                                    <p className="text-xs text-gray-500 mt-1">Pilih halaman yang ingin Anda sertakan. AI akan menyesuaikan navigasi secara otomatis.</p>
                                </div>

                                <div className="w-full h-px bg-gradient-to-r from-indigo-500/30 via-white/5 to-transparent mb-6" />

                                <div className="grid grid-cols-2 gap-3">
                                    {PAGE_OPTIONS.map((item) => {
                                        const active = wizardData.pages.includes(item)
                                        return (
                                            <motion.button
                                                key={item}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.99 }}
                                                onClick={() => toggleWizardPage(item)}
                                                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 cursor-pointer text-left ${active
                                                    ? 'bg-indigo-600/10 border-indigo-500/40 shadow-sm shadow-indigo-600/10'
                                                    : 'bg-white/[0.03] border-white/[0.07] hover:border-indigo-500/20 hover:bg-white/5'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${active ? 'bg-indigo-600 border-indigo-600' : 'border-white/10'
                                                        }`}
                                                >
                                                    {active && (
                                                        <motion.div
                                                            initial={{ scale: 0, rotate: -90 }}
                                                            animate={{ scale: 1, rotate: 0 }}
                                                            transition={{ duration: 0.2 }}
                                                        >
                                                            <CheckCircle2 size={11} className="text-white" />
                                                        </motion.div>
                                                    )}
                                                </div>
                                                <span className={`text-sm font-medium transition-colors duration-200 ${active ? 'text-indigo-300' : 'text-gray-500'}`}>
                                                    {item}
                                                </span>
                                            </motion.button>
                                        )
                                    })}
                                </div>

                                {wizardData.pages.length > 0 && (
                                    <p className="text-[10px] text-gray-600 mt-4">
                                        Dipilih: <span className="text-indigo-400">{wizardData.pages.join(' · ')}</span>
                                    </p>
                                )}
                            </motion.div>
                        )}

                        {/* Wizard 3 — Teknis */}
                        {currentPage === 'wizard3' && (
                            <motion.div key="w3" variants={slide} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-8">
                                <div className="mb-2">
                                    <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-1">Langkah 3 dari 3</div>
                                    <h3 className="text-lg font-bold text-white">Konfigurasi Teknis</h3>
                                    <p className="text-xs text-gray-500 mt-1">Tentukan bahasa dan tipe output untuk website Anda.</p>
                                </div>

                                <div className="w-full h-px bg-gradient-to-r from-indigo-500/30 via-white/5 to-transparent" />

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Bahasa Tampilan Website</label>
                                    <div className="flex gap-3">
                                        {(['id', 'en'] as const).map((lang) => (
                                            <button
                                                key={lang}
                                                onClick={() => updateWizardData({ language: lang })}
                                                className={`flex-1 py-3.5 rounded-xl text-sm font-bold border transition-all duration-200 cursor-pointer ${wizardData.language === lang
                                                    ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-300 shadow-sm shadow-indigo-600/10'
                                                    : 'bg-white/[0.03] border-white/[0.07] text-gray-500 hover:text-gray-300 hover:border-white/10'
                                                    }`}
                                            >
                                                {lang === 'id' ? '🇮🇩  Bahasa Indonesia' : '🇺🇸  English'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Tipe Output Project</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => updateWizardData({ outputType: 'static' })}
                                            className={`p-6 rounded-xl text-center space-y-3 cursor-pointer transition-all duration-200 border ${wizardData.outputType === 'static'
                                                ? 'bg-indigo-600/10 border-indigo-500/50 shadow-sm shadow-indigo-600/10'
                                                : 'bg-white/[0.03] border-white/[0.07] hover:border-indigo-500/20'
                                                }`}
                                        >
                                            <Globe className={`mx-auto ${wizardData.outputType === 'static' ? 'text-indigo-400' : 'text-gray-600'}`} size={28} />
                                            <div>
                                                <p className={`font-bold text-sm ${wizardData.outputType === 'static' ? 'text-indigo-300' : 'text-gray-400'}`}>Static Web</p>
                                                <p className={`text-[9px] mt-0.5 ${wizardData.outputType === 'static' ? 'text-indigo-400/60' : 'text-gray-600'}`}>HTML + CSS + JS</p>
                                            </div>
                                        </button>

                                        <div className="p-6 bg-white/[0.02] border border-white/5 rounded-xl text-center space-y-3 opacity-35 cursor-not-allowed">
                                            <Database className="mx-auto text-gray-600" size={28} />
                                            <div>
                                                <p className="font-bold text-sm text-gray-500">Full Database</p>
                                                <p className="text-[9px] mt-0.5 text-gray-700">Node.js + SQLite</p>
                                                <p className="text-[8px] mt-1 text-gray-700 uppercase tracking-wider">Coming Soon</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Nav */}
                <div className="px-8 py-5 bg-[#0e1117] border-t border-white/5 flex items-center justify-between gap-4 w-full">
                    <div className="flex-1">
                        <button
                            onClick={() => navigate(PREV_MAP[currentPage])}
                            className="px-5 py-2.5 rounded-xl bg-white/5 text-xs font-bold hover:bg-white/8 transition-all active:scale-95 cursor-pointer text-gray-400 hover:text-gray-200 border border-white/5 whitespace-nowrap"
                        >
                            ← Kembali
                        </button>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 justify-center">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${stepNum === i ? 'bg-indigo-400 scale-125' : stepNum > i ? 'bg-indigo-600/40' : 'bg-gray-700'}`} />
                        ))}
                    </div>

                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={() => canProceed() && navigate(NEXT_MAP[currentPage])}
                            disabled={!canProceed()}
                            className={`px-7 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg ${canProceed()
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/20 cursor-pointer'
                                    : 'bg-white/5 text-gray-500 cursor-not-allowed shadow-none border border-white/5'
                                }`}
                        >
                            {currentPage === 'wizard3' ? <><Rocket size={13} className="shrink-0" /> Generate & Sync</> : 'Lanjut →'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </ScreenWrapper>
    )
}
