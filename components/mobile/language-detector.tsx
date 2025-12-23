"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"

/**
 * Componente para detectar e aplicar idioma automaticamente nos apps mobile
 * 
 * Prioridade:
 * 1. Idioma salvo no perfil do usuário (preferred_language)
 * 2. Idioma do navegador (navigator.language)
 * 3. Fallback: Português (pt)
 */

const SUPPORTED_LANGUAGES = [
  'pt', 'en', 'es', 'fr', 'de', 'it', 'nl',
  'zh-CN', 'ja', 'ar', 'ru', 'hi',
  'sr', 'hr', 'bs', 'sq', 'bg', 'ro', 'pl', 'uk', 'tr'
]

export default function LanguageDetector() {
  useEffect(() => {
    detectAndApplyLanguage()
  }, [])

  const detectAndApplyLanguage = async () => {
    try {
      console.log('🌐 [LANGUAGE] Detectando idioma preferido...')

      let targetLang = 'pt' // Fallback padrão

      // 1. Tentar buscar idioma do perfil do usuário
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('preferred_language, country')
          .eq('id', session.user.id)
          .single()

        if (profile?.preferred_language) {
          targetLang = profile.preferred_language
          console.log(`✅ [LANGUAGE] Idioma do perfil: ${targetLang}`)
        } else if (profile?.country) {
          // Mapear país para idioma
          const countryToLang: Record<string, string> = {
            'PT': 'pt', 'BR': 'pt',
            'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en',
            'ES': 'es', 'MX': 'es', 'AR': 'es',
            'FR': 'fr',
            'DE': 'de', 'AT': 'de', 'CH': 'de',
            'IT': 'it',
            'NL': 'nl', 'BE': 'nl',
            'CN': 'zh-CN',
            'JP': 'ja',
            'SA': 'ar', 'AE': 'ar',
            'RU': 'ru',
            'IN': 'hi',
            'RS': 'sr', 'HR': 'hr', 'BA': 'bs', 'AL': 'sq',
            'BG': 'bg', 'RO': 'ro', 'PL': 'pl', 'UA': 'uk', 'TR': 'tr'
          }
          targetLang = countryToLang[profile.country] || 'pt'
          console.log(`✅ [LANGUAGE] Idioma do país (${profile.country}): ${targetLang}`)
        }
      }

      // 2. Se não tem perfil, usar idioma do navegador
      if (targetLang === 'pt' && typeof navigator !== 'undefined') {
        const browserLang = navigator.language.split('-')[0]
        if (SUPPORTED_LANGUAGES.includes(browserLang)) {
          targetLang = browserLang
          console.log(`✅ [LANGUAGE] Idioma do navegador: ${targetLang}`)
        }
      }

      // 3. Aplicar idioma no Google Translate
      if (targetLang !== 'pt') {
        console.log(`🌐 [LANGUAGE] Aplicando tradução automática para: ${targetLang}`)
        await applyTranslation(targetLang)
      } else {
        console.log(`🇵🇹 [LANGUAGE] Mantendo português (padrão)`)
      }
    } catch (error) {
      console.error('❌ [LANGUAGE] Erro ao detectar idioma:', error)
    }
  }

  const applyTranslation = async (langCode: string) => {
    // ✅ VERIFICAÇÃO CRÍTICA: Se o utilizador escolheu manualmente, NÃO aplicar auto-tradução
    const userManualSelection = sessionStorage.getItem('mtm_user_manual_selection')
    const autoTranslateDisabled = localStorage.getItem('mtm_auto_translate_disabled')
    
    if (userManualSelection === 'true' || autoTranslateDisabled === 'true') {
      console.log('⏭️ [MOBILE LANGUAGE] Utilizador escolheu manualmente - pulando tradução automática')
      return
    }
    
    let attempts = 0
    const maxAttempts = 10 // Reduzido para velocidade

    const tryApply = () => {
      const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement
      
      if (translateSelect) {
        console.log(`✅ [LANGUAGE] Google Translate pronto, mudando para ${langCode}`)
        translateSelect.value = langCode
        
        const event = new Event('change', { bubbles: true })
        translateSelect.dispatchEvent(event)
        
        setTimeout(() => {
          if (translateSelect.value === langCode) {
            console.log('✅ [LANGUAGE] Tradução aplicada com sucesso!')
            sessionStorage.setItem('mtm_auto_lang', langCode)
          }
        }, 100)
      } else {
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(tryApply, 300) // Reduzido intervalo
        } else {
          console.warn(`⚠️ [LANGUAGE] Google Translate não carregou após ${maxAttempts} tentativas`)
        }
      }
    }

    // Aguardar 1s antes de tentar (reduzido para velocidade)
    setTimeout(tryApply, 1000)
  }

  // Componente invisível (apenas lógica)
  return null
}

