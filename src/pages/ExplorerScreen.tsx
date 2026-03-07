import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

const TEMPLATES = [
    { id: 1, title: 'Y2K Cyber Dashboard', author: 'boy blythe', img: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=400&q=80', tag: 'Landing Page' },
    { id: 2, title: 'Nordic Minimalism', author: 'scandi_design', img: 'https://images.unsplash.com/photo-1449247709967-d4461a6a6103?w=400&q=80', tag: 'Profile Company' },
    { id: 3, title: 'Tech Hero Section', author: 'sohrab zia', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80', tag: 'Landing Page' },
    { id: 4, title: 'Modern Dashboard UI', author: 'mason marley', img: 'https://images.unsplash.com/photo-1551288049-bbbda536639a?w=400&q=80', tag: 'Admin' },
    { id: 5, title: 'Vision UI Kit', author: 'quantum_lab', img: 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?w=400&q=80', tag: 'Portfolio' },
    { id: 6, title: 'Simple 1-Pager', author: 'floyd', img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80', tag: 'Landing Page' },
    { id: 7, title: 'Corporate Clean', author: 'nexus_dev', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80', tag: 'Profile Company' },
    { id: 8, title: 'Startup Launchpad', author: 'alpha_studio', img: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=400&q=80', tag: 'Landing Page' },
    { id: 9, title: 'Business Elegant', author: 'vogue_web', img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80', tag: 'Profile Company' },
]

const ITEMS_PER_PAGE = 6


export default function ExplorerScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const setSelectedTemplate = useAppStore((s) => s.setSelectedTemplate)
    const templatePage = useAppStore((s) => s.templatePage)
    const setTemplatePage = useAppStore((s) => s.setTemplatePage)

    const totalPages = Math.ceil(TEMPLATES.length / ITEMS_PER_PAGE)
    const paginated = TEMPLATES.slice(templatePage * ITEMS_PER_PAGE, (templatePage + 1) * ITEMS_PER_PAGE)

    const handleSelect = (t: typeof TEMPLATES[0]) => {
        setSelectedTemplate(t)
        navigate('wizard1')
    }

    return (
        <ScreenWrapper>
            <div className="w-full max-w-5xl px-6">
                {/* Page Title */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-center mb-10"
                >
                    <h2 className="text-3xl font-bold text-white mb-2">Mau buat apa hari ini?</h2>
                    <p className="text-gray-500 text-sm">
                        Pilih desain yang kamu suka. AI akan memodifikasinya untukmu.
                    </p>
                </motion.div>

                {/* Template Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[280px]">
                    <AnimatePresence mode="wait">
                        {paginated.map((t, i) => (
                            <motion.div
                                key={t.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.4, delay: i * 0.08 }}
                                onClick={() => handleSelect(t)}
                                className="group bg-[#161920] rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/50 transition-all duration-300 cursor-pointer hover:-translate-y-1 shadow-lg"
                            >
                                <div className="h-40 overflow-hidden relative">
                                    <img
                                        src={t.img}
                                        className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
                                        alt={t.title}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end p-4">
                                        <div className="w-full transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                            <span className="text-[8px] font-bold text-indigo-300 uppercase block mb-1">{t.tag}</span>
                                            <span className="text-[10px] font-bold text-white bg-indigo-600 px-2 py-1 rounded inline-block">
                                                GUNAKAN TEMPLATE
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-200">{t.title}</h3>
                                        <p className="text-[10px] text-gray-500 mt-0.5">{t.author}</p>
                                    </div>
                                    <div className="flex gap-1">
                                        {[0, 1, 2].map((d) => (
                                            <div key={d} className="w-1 h-1 bg-gray-700 rounded-full" />
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Pagination */}
                <div className="flex justify-center items-center gap-6 mt-12">
                    <button
                        onClick={() => setTemplatePage(templatePage - 1)}
                        disabled={templatePage === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${templatePage === 0
                            ? 'text-gray-700 cursor-not-allowed'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer'
                            }`}
                    >
                        <ChevronLeft size={16} /> Sebelumnya
                    </button>

                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setTemplatePage(i)}
                                className={`h-1 rounded-full transition-all duration-300 cursor-pointer ${templatePage === i ? 'bg-indigo-500 w-8' : 'bg-gray-800 w-4 hover:bg-gray-600'
                                    }`}
                            />
                        ))}
                    </div>

                    <button
                        onClick={() => setTemplatePage(templatePage + 1)}
                        disabled={templatePage >= totalPages - 1}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${templatePage >= totalPages - 1
                            ? 'text-gray-700 cursor-not-allowed'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer'
                            }`}
                    >
                        Selanjutnya <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </ScreenWrapper>
    )
}
