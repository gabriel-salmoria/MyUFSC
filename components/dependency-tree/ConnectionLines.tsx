"use client"

import { useRef } from 'react'
import { motion } from 'framer-motion'
import type { Connection } from '@/hooks/useDependencyGraph'

// Define color gradient for different depths
export const DEPTH_COLORS = [
  '#4287f5', // brighter blue (root)
  '#9d6ffd', // brighter violet (depth 1)
  '#ff59a8', // brighter pink (depth 2)
  '#ff8534', // brighter orange (depth 3+)
]

interface ConnectionLinesProps {
  connections: Connection[]
  courseElements: Map<string, Element[]>
}

export default function ConnectionLines({ connections, courseElements }: ConnectionLinesProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Calculate connection line positions
  const calculateConnectionLines = () => {
    if (courseElements.size === 0) return null
    
    const lines = connections.map((connection, index) => {
      const sourceElements = courseElements.get(connection.from) || []
      const targetElements = courseElements.get(connection.to) || []
      
      if (sourceElements.length === 0 || targetElements.length === 0) return null
      
      const sourceElement = sourceElements[0]
      const targetElement = targetElements[0]
      
      // Get element rects
      const sourceRect = sourceElement.getBoundingClientRect()
      const targetRect = targetElement.getBoundingClientRect()
      
      // Get color based on depth
      const colorIndex = Math.min(connection.depth, DEPTH_COLORS.length - 1)
      const strokeColor = DEPTH_COLORS[colorIndex]
      
      // Calculate centers
      const sourceCenterX = sourceRect.left + sourceRect.width / 2
      const sourceCenterY = sourceRect.top + sourceRect.height / 2
      const targetCenterX = targetRect.left + targetRect.width / 2
      const targetCenterY = targetRect.top + targetRect.height / 2
      
      // Calculate vector between centers
      const dx = targetCenterX - sourceCenterX
      const dy = targetCenterY - sourceCenterY
      
      // Edge gap
      const edgeGap = 4
      
      // Normalize direction vector
      const distance = Math.sqrt(dx * dx + dy * dy)
      const dirX = dx / distance
      const dirY = dy / distance
      
      // Calculate intersection points with source box
      const sourceHalfWidth = sourceRect.width / 2
      const sourceHalfHeight = sourceRect.height / 2
      
      const txVert = dirX === 0 ? Infinity : sourceHalfWidth / Math.abs(dirX)
      const tyHor = dirY === 0 ? Infinity : sourceHalfHeight / Math.abs(dirY)
      
      let x1, y1
      
      if (txVert < tyHor) {
        x1 = sourceCenterX + (sourceHalfWidth + edgeGap) * Math.sign(dirX)
        y1 = sourceCenterY + dirY * (txVert + edgeGap)
      } else {
        x1 = sourceCenterX + dirX * (tyHor + edgeGap)
        y1 = sourceCenterY + (sourceHalfHeight + edgeGap) * Math.sign(dirY)
      }
      
      // Calculate intersection points with target box
      const targetHalfWidth = targetRect.width / 2
      const targetHalfHeight = targetRect.height / 2
      
      const txVertTarget = dirX === 0 ? Infinity : targetHalfWidth / Math.abs(dirX)
      const tyHorTarget = dirY === 0 ? Infinity : targetHalfHeight / Math.abs(dirY)
      
      let x2, y2
      
      if (txVertTarget < tyHorTarget) {
        x2 = targetCenterX - (targetHalfWidth + edgeGap) * Math.sign(dirX)
        y2 = targetCenterY - dirY * (txVertTarget + edgeGap)
      } else {
        x2 = targetCenterX - dirX * (tyHorTarget + edgeGap)
        y2 = targetCenterY - (targetHalfHeight + edgeGap) * Math.sign(dirY)
      }
      
      const lineWidth = 5 - Math.min(connection.depth, 2)
      
      return (
        <motion.line
          key={`${connection.from}-${connection.to}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={strokeColor}
          strokeWidth={lineWidth}
          initial={{ opacity: 0, strokeDashoffset: 1, strokeDasharray: 1 }}
          animate={{ opacity: 0.85, strokeDashoffset: 0 }}
          transition={{ duration: 0.5 }}
        />
      )
    }).filter(Boolean)
    
    return lines
  }

  return (
    <svg 
      ref={svgRef}
      className="fixed inset-0 pointer-events-none z-5"
      style={{ width: '100%', height: '100%' }}
    >
      {calculateConnectionLines()}
    </svg>
  )
} 