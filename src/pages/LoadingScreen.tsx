import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import ScreenWrapper from '../components/ScreenWrapper'

export default function LoadingScreen() {
    return (
        <ScreenWrapper>
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 rounded-full border-2 border-indigo-400 border-t-transparent"
                />
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-1"
                >
                    <Zap size={18} className="text-indigo-400" />
                    <p className="text-sm text-[var(--color-text-muted)]">Menghubungkan ke server OAuth...</p>
                </motion.div>
            </div>
        </ScreenWrapper>
    )
}
