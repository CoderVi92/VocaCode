import { motion } from 'framer-motion'

interface ScreenWrapperProps {
    children: React.ReactNode
    className?: string
}

const pageVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
}

export default function ScreenWrapper({ children, className = '' }: ScreenWrapperProps) {
    return (
        <motion.div
            className={`flex-1 flex flex-col overflow-hidden ${className}`}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.25 }}
        >
            {children}
        </motion.div>
    )
}
