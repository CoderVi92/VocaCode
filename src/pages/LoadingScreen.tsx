import { motion } from 'framer-motion'
import ScreenWrapper from '../components/ScreenWrapper'

export default function LoadingScreen() {
    return (
        <ScreenWrapper>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="m-auto flex flex-col items-center gap-4"
            >
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full"
                />
                <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-bold"
                >
                    Menghubungkan ke Proxy...
                </motion.p>
            </motion.div>
        </ScreenWrapper>
    )
}
