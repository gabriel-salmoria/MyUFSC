"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface InfoBannerProps {
  message: string
  duration?: number
}

export default function InfoBanner({ message, duration = 3000 }: InfoBannerProps) {
  const [isVisible, setIsVisible] = useState(true)
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, duration)
    
    return () => clearTimeout(timer)
  }, [duration])
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-4 left-0 right-0 flex justify-center items-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ 
            enter: { delay: 0.5, duration: 0.3 },
            exit: { duration: 0.2 }
          }}
        >
          <div className="bg-black/75 text-white px-4 py-2 rounded-full text-sm shadow-lg">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 