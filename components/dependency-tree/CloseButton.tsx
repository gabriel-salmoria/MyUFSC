"use client"

import { motion } from 'framer-motion'

interface CloseButtonProps {
  onClose: () => void
}

export default function CloseButton({ onClose }: CloseButtonProps) {
  return (
    <motion.button
      id="dependency-close-button"
      className="fixed top-4 right-4 bg-white rounded-full p-2 shadow-lg z-50 hover:bg-gray-100 transition-colors duration-200"
      onClick={onClose}
      title="Close dependency view"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="#EF4444" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </motion.button>
  )
} 