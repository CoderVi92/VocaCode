import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

const steps = [
    { id: 1, label: 'Identitas' },
    { id: 2, label: 'Struktur' },
    { id: 3, label: 'Teknis' },
]

const PAGE_OPTIONS = ['Home', 'Services', 'About', 'Portfolio', 'Testimonials', 'Contact']

export default function WizardScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const setWizardData = useAppStore((s) => s.setWizardData)
    const selectedTemplate = useAppStore((s) => s.selectedTemplate)

    const [step, setStep] = useState(1)
    const [form, setForm] = useState({
        projectName: '',
        tagline: '',
        businessDescription: '',
        pages: ['Home', 'Contact'],
        language: 'id' as 'id' | 'en',
        outputType: 'static' as 'static' | 'dynamic',
    })

    const updateField = (field: string, val: unknown) =>
        setForm((prev) => ({ ...prev, [field]: val }))

    const togglePage = (p: string) =>
        setForm((prev) => ({
            ...prev,
            pages: prev.pages.includes(p) ? prev.pages.filter((x) => x !== p) : [...prev.pages, p],
        }))

    const handleFinish = () => {
        setWizardData({ ...form })
        navigate('preview')
    }

    return (
        <ScreenWrapper>
            <div className="flex flex-col h-full p-6 overflow-hidden">
                {/* Step Indicator */}
                <div className="flex items-center gap-2 mb-6 shrink-0">
                    {steps.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-2">
                            <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${step > s.id ? 'bg-indigo-500 text-white' : step === s.id ? 'bg-indigo-600 text-white' : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]'}`}
                            >
                                {step > s.id ? <Check size={13} /> : s.id}
                            </div>
                            <span className={`text-xs font-medium ${step === s.id ? 'text-indigo-400' : 'text-[var(--color-text-muted)]'}`}>{s.label}</span>
                            {i < steps.length - 1 && <div className="w-12 h-px bg-[var(--color-border)] mx-1" />}
                        </div>
                    ))}
                    {selectedTemplate && (
                        <span className="ml-auto text-xs text-[var(--color-text-muted)]">Template: <span className="text-indigo-400">{selectedTemplate.title}</span></span>
                    )}
                </div>

                {/* Step Content */}
                <div className="flex-1 overflow-auto">
                    {step === 1 && (
                        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 max-w-lg">
                            <h2 className="text-lg font-semibold">Identitas Bisnis</h2>
                            <div>
                                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Nama Project *</label>
                                <input value={form.projectName} onChange={(e) => updateField('projectName', e.target.value)}
                                    className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors" placeholder="contoh: TechCorp Solutions" />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Tagline</label>
                                <input value={form.tagline} onChange={(e) => updateField('tagline', e.target.value)}
                                    className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors" placeholder="Slogan singkat perusahaan Anda" />
                            </div>
                            <div>
                                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Deskripsi Bisnis</label>
                                <textarea value={form.businessDescription} onChange={(e) => updateField('businessDescription', e.target.value)}
                                    rows={4} className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none" placeholder="Jelaskan secara singkat bisnis atau layanan Anda..." />
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 max-w-lg">
                            <h2 className="text-lg font-semibold">Struktur Halaman</h2>
                            <p className="text-sm text-[var(--color-text-muted)]">Pilih halaman yang ingin Anda sertakan dalam website:</p>
                            <div className="grid grid-cols-3 gap-2">
                                {PAGE_OPTIONS.map((p) => (
                                    <button key={p} onClick={() => togglePage(p)}
                                        className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all cursor-pointer
                      ${form.pages.includes(p) ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-indigo-500/40'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)]">Dipilih: {form.pages.join(', ')}</p>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 max-w-lg">
                            <h2 className="text-lg font-semibold">Konfigurasi Teknis</h2>
                            <div>
                                <label className="text-xs text-[var(--color-text-muted)] mb-2 block">Bahasa</label>
                                <div className="flex gap-2">
                                    {(['id', 'en'] as const).map((lang) => (
                                        <button key={lang} onClick={() => updateField('language', lang)}
                                            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer
                        ${form.language === lang ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                                        >
                                            {lang === 'id' ? '🇮🇩 Bahasa Indonesia' : '🇬🇧 English'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-[var(--color-text-muted)] mb-2 block">Tipe Output</label>
                                <div className="flex gap-2">
                                    {(['static', 'dynamic'] as const).map((type) => (
                                        <button key={type} onClick={() => updateField('outputType', type)}
                                            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer
                        ${form.outputType === type ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                                        >
                                            {type === 'static' ? '⚡ Static HTML/CSS' : '🗄️ Dynamic (Database)'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-4 border-t border-[var(--color-border)] shrink-0">
                    <button
                        onClick={() => step > 1 ? setStep(s => s - 1) : navigate('explorer')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border)] text-sm text-[var(--color-text-muted)] transition-colors cursor-pointer"
                    >
                        <ChevronLeft size={16} /> Kembali
                    </button>
                    {step < 3 ? (
                        <button
                            onClick={() => setStep((s) => s + 1)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors cursor-pointer"
                        >
                            Lanjut <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={handleFinish}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm text-white font-medium transition-colors cursor-pointer"
                        >
                            Generate Website <Check size={16} />
                        </button>
                    )}
                </div>
            </div>
        </ScreenWrapper>
    )
}
