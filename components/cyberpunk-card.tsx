"use client"

import { ReactNode } from 'react'
import { useScrollAnimation } from '@/lib/use-scroll-animation'

interface CyberpunkCardProps {
  children: ReactNode
  animationDirection?: 'bottom' | 'left' | 'right'
  delay?: number
  alwaysVisible?: boolean
}

export function CyberpunkCard({ 
  children, 
  animationDirection = 'bottom',
  delay = 0,
  alwaysVisible = false
}: CyberpunkCardProps) {
  const [ref, isVisible] = useScrollAnimation()
  
  return (
    <div
      ref={ref}
      className={`
        card-cyberpunk
        ${alwaysVisible ? `slide-in-${animationDirection} visible always-visible` : (isVisible ? `slide-in-${animationDirection} visible` : '')}
      `}
      style={{
        animationDelay: `${delay * 200}ms`
      }}
    >
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
