"use client"

import { useEffect, useRef, useState } from 'react'

interface UseScrollAnimationOptions {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
}

export function useScrollAnimation(options: UseScrollAnimationOptions = {}) {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true
  } = options

  const ref = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) {
            observer.unobserve(element)
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      {
        threshold,
        rootMargin
      }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [threshold, rootMargin, triggerOnce])

  return { ref, isVisible }
}

// Hook simplificado para múltiplos elementos
export function useScrollAnimations() {
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-visible')
        }
      })
    }, observerOptions)

    // Observar todos os elementos com classes de animação
    const elements = document.querySelectorAll(
      '.scroll-fade-in, .scroll-slide-up, .scroll-slide-left, .scroll-slide-right, .scroll-scale-in'
    )

    elements.forEach((el) => observer.observe(el))

    return () => {
      elements.forEach((el) => observer.unobserve(el))
    }
  }, [])
}

// Componente wrapper para animações
interface AnimatedSectionProps {
  children: React.ReactNode
  animation?: 'fade' | 'slide-up' | 'slide-left' | 'slide-right' | 'scale'
  delay?: number
  className?: string
}

export function AnimatedSection({ 
  children, 
  animation = 'fade', 
  delay = 0,
  className = '' 
}: AnimatedSectionProps) {
  const { ref, isVisible } = useScrollAnimation()
  
  const animationClass = {
    'fade': 'scroll-fade-in',
    'slide-up': 'scroll-slide-up',
    'slide-left': 'scroll-slide-left',
    'slide-right': 'scroll-slide-right',
    'scale': 'scroll-scale-in'
  }[animation]

  const delayClass = delay > 0 ? `animation-delay-${delay}` : ''

  return (
    <div
      ref={ref as any}
      className={`${animationClass} ${delayClass} ${isVisible ? 'animate-visible' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
