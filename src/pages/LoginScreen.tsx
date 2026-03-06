import { motion } from 'framer-motion'
import { LogIn, Zap } from 'lucide-react'
import { useAppStore } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

export default function LoginScreen() {
    const navigate = useAppStore((s) => s.navigate)
    const setAuthenticated = useAppStore((s) => s.setAuthenticated)

    const handleLogin = () => {
        navigate('loading')
        // Simulate OAuth flow - will be replaced with real CLIProxy Auth in Phase 4
        setTimeout(() => {
            setAuthenticated(true)
            navigate('explorer')
        }, 2000)
    }

    return (
        <ScreenWrapper>
            <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
                {/* Logo */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.5, type: 'spring' }}
                    className="flex flex-col items-center gap-3"
                >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Zap size={32} className="text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-3xl font-bold tracking-tight">
                            VOCA<span className="text-indigo-400">CODE</span>
                        </h1>
                        <p className="text-sm text-[var(--color-text-muted)] mt-1">AI-Powered No-Code Website Builder</p>
                    </div>
                </motion.div>

                {/* Login Card */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="w-full max-w-sm bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-6 shadow-xl"
                >
                    <h2 className="text-lg font-semibold mb-2">Selamat Datang</h2>
                    <p className="text-sm text-[var(--color-text-muted)] mb-6">
                        Login dengan akun Google untuk mengakses AI dan mulai membangun website impian Anda.
                    </p>
                    <button
                        onClick={handleLogin}
                        className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
                    >
                        <LogIn size={18} />
                        Login dengan Google
                    </button>
                </motion.div>

                <p className="text-xs text-[var(--color-text-muted)] text-center max-w-xs">
                    Autentikasi diproses via OAuth proxy yang aman. Token Anda disimpan secara lokal.
                </p>
            </div>
        </ScreenWrapper>
    )
}
