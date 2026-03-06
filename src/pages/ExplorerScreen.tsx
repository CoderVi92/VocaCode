import { motion } from 'framer-motion'
import { Search, ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

const categories = [
    { id: 'all', label: 'Semua' },
    { id: 'landing', label: 'Landing Page' },
    { id: 'company', label: 'Profile Company' },
    { id: 'portfolio', label: 'Portfolio' },
]

// Placeholder templates - to be replaced with real MCP data in Phase 4
const MOCK_TEMPLATES = Array.from({ length: 6 }, (_, i) => ({
    id: `tpl-${i + 1}`,
    title: `Template ${i + 1}`,
    description: 'Beautiful modern template from CodePen.',
    thumbnail: '',
    html: '<h1>Hello World</h1>',
    css: 'h1 { color: #6366f1 }',
    js: '',
    tags: ['landing'],
}))

const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
}

const cardVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
}

export default function ExplorerScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const setSelectedTemplate = useAppStore((s) => s.setSelectedTemplate)

    const handleSelect = (template: typeof MOCK_TEMPLATES[0]) => {
        setSelectedTemplate(template)
        navigate('wizard')
    }

    return (
        <ScreenWrapper>
            <div className="flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-3 shrink-0">
                    <div className="relative flex-1 max-w-sm">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                        <input
                            type="text"
                            placeholder="Cari template..."
                            className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--color-text-base)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>
                    <div className="flex gap-2">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] hover:bg-[var(--color-border)] transition-colors cursor-pointer"
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Template Grid */}
                <div className="flex-1 overflow-auto p-4">
                    <motion.div
                        className="grid grid-cols-3 gap-4"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                    >
                        {MOCK_TEMPLATES.map((template) => (
                            <motion.div
                                key={template.id}
                                variants={cardVariants}
                                whileHover={{ scale: 1.02, y: -2 }}
                                onClick={() => handleSelect(template)}
                                className="group bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden cursor-pointer hover:border-indigo-500/60 transition-colors"
                            >
                                {/* Thumbnail Placeholder */}
                                <div className="h-40 bg-gradient-to-br from-[var(--color-bg-elevated)] to-[var(--color-bg-base)] flex items-center justify-center">
                                    <Globe size={32} className="text-[var(--color-border)] group-hover:text-indigo-400 transition-colors" />
                                </div>
                                <div className="p-3">
                                    <p className="font-medium text-sm">{template.title}</p>
                                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{template.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>

                {/* Pagination */}
                <div className="shrink-0 p-3 border-t border-[var(--color-border)] flex items-center justify-center gap-3">
                    <button className="p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border)] transition-colors text-[var(--color-text-muted)] cursor-pointer">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-[var(--color-text-muted)]">Halaman 1 / 1</span>
                    <button className="p-1.5 rounded bg-[var(--color-bg-elevated)] hover:bg-[var(--color-border)] transition-colors text-[var(--color-text-muted)] cursor-pointer">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </ScreenWrapper>
    )
}
