import { motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore, AntigravityModel } from '../lib/store'
import ScreenWrapper from '../components/ScreenWrapper'

export default function LoginScreen() {
    const navigate = useAppStore((s) => s.navigate)

    const handleLogin = async () => {
        navigate('loading')
        try {
            const token: string = await invoke('login_oauth_proxy')
            const models: AntigravityModel[] = await invoke('fetch_gemini_models')

            const store = useAppStore.getState()
            store.setOauthToken(token)
            store.setAiModels(models)
            if (models.length > 0) {
                store.setSelectedModel(models[0])
            }

            store.setAuthenticated(true)
            store.navigate('explorer')
        } catch (err) {
            console.error("Tauri OAuth Error / API fallback:", err)
            // Fallback for standard browser preview without Tauri window
            setTimeout(() => {
                const store = useAppStore.getState()
                store.setAuthenticated(true)
                store.navigate('explorer')
            }, 1000)
        }
    }

    return (
        <ScreenWrapper>
            {/* Ambient background glows */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-violet-600/8 rounded-full blur-[80px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="m-auto relative z-10 w-full max-w-sm text-center"
            >
                {/* Logo mark */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' }}
                    className="mb-8"
                >
                    {/* Animated symbol */}
                    <div className="relative inline-block">
                        <motion.div
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute -inset-4 bg-indigo-600/20 rounded-full blur-xl"
                        />
                        <div className="relative text-[52px] font-extralight italic tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 via-indigo-300 to-violet-400 leading-none select-none">
                            {'</>'}
                        </div>
                    </div>
                </motion.div>

                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                >
                    <h1 className="text-4xl font-black text-white tracking-tight mb-1">VocaCode</h1>
                    <p className="text-gray-500 text-[13px] italic tracking-wide mb-10">
                        Autentikasi OAuth via Proxy CLI
                    </p>
                </motion.div>

                {/* Login Card */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="bg-[#11141b] border border-white/[0.07] rounded-2xl p-8 shadow-2xl shadow-black/40 backdrop-blur-sm"
                >
                    {/* Decorative top line */}
                    <div className="w-12 h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent mx-auto mb-6" />

                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                        Masuk dengan akun Google Anda untuk mengakses model AI dan mulai membangun website impian Anda.
                    </p>

                    {/* Google Login Button */}
                    <motion.button
                        whileHover={{ scale: 1.02, backgroundColor: '#f3f4f6' }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleLogin}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center gap-3 w-full bg-white text-gray-900 py-3.5 px-5 rounded-xl font-bold text-sm shadow-xl shadow-black/20 cursor-pointer"
                    >
                        <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="G" />
                        Masuk dengan Google
                    </motion.button>

                    <p className="text-[10px] text-gray-600 mt-5 leading-relaxed">
                        Token disimpan secara aman di lokal. Tidak ada data yang dikirim ke server pihak ketiga.
                    </p>
                </motion.div>

                {/* Bottom badge */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-6 flex items-center justify-center gap-2 text-[10px] text-gray-700"
                >
                    <div className="w-1 h-1 rounded-full bg-green-500" />
                    <span>Sistem OAuth tersedia</span>
                </motion.div>
            </motion.div>
        </ScreenWrapper>
    )
}
