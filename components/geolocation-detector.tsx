"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"

/**
 * Componente para detectar localização geográfica do usuário
 * e aplicar tradução automática baseada no país
 * 
 * Usa a API ipapi.co para obter:
 * - País
 * - Idioma principal do país
 * - Fuso horário
 * - Coordenadas (opcional)
 */

interface GeoLocation {
  country_code: string
  country_name: string
  languages: string
  timezone: string
  city?: string
  latitude?: number
  longitude?: number
}

const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  // Europa
  'PT': 'pt', 'BR': 'pt', 'AO': 'pt', 'MZ': 'pt', // Português
  'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'CL': 'es', 'PE': 'es', // Espanhol
  'FR': 'fr', 'BE': 'fr', 'CH': 'fr', 'CA': 'fr', // Francês
  'DE': 'de', 'AT': 'de', // Alemão
  'IT': 'it', // Italiano
  'NL': 'nl', // Holandês
  'PL': 'pl', // Polonês
  'RO': 'ro', // Romeno
  'BG': 'bg', // Búlgaro
  'TR': 'tr', // Turco
  'RU': 'ru', 'UA': 'ru', 'BY': 'ru', 'KZ': 'ru', // Russo
  
  // Ásia
  'CN': 'zh-CN', // Chinês
  'JP': 'ja', // Japonês
  'IN': 'hi', // Hindi
  'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'MA': 'ar', // Árabe
  
  // Países anglo-saxônicos
  'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en', 'NZ': 'en', 'IE': 'en',
  
  // Balcãs
  'RS': 'sr', 'HR': 'hr', 'BA': 'bs', 'AL': 'sq',
}

export default function GeolocationDetector() {
  useEffect(() => {
    detectAndSaveLocation()
  }, [])

  const detectAndSaveLocation = async () => {
    try {
      console.log('🌍 [GEOLOCATION] Detectando localização...')

      // Verificar cache primeiro
      const cachedCountry = localStorage.getItem('mtm_detected_country')
      const cachedLanguage = localStorage.getItem('mtm_detected_language')
      const cachedTimestamp = localStorage.getItem('mtm_geo_timestamp')
      
      // Cache válido por 24 horas
      if (cachedCountry && cachedLanguage && cachedTimestamp) {
        const cacheAge = Date.now() - parseInt(cachedTimestamp)
        const oneDay = 24 * 60 * 60 * 1000
        
        if (cacheAge < oneDay) {
          console.log('⚡ [GEOLOCATION] Usando dados em cache')
          // Aplicar tradução se necessário, MAS APENAS SE O USUÁRIO NÃO ESCOLHEU MANUALMENTE
          const userManualSelection = sessionStorage.getItem('mtm_user_manual_selection')
          const autoTranslateDisabled = localStorage.getItem('mtm_auto_translate_disabled')
          
          if (cachedLanguage !== 'pt' && userManualSelection !== 'true' && autoTranslateDisabled !== 'true') {
            applyTranslation(cachedLanguage)
          } else {
            console.log('⏭️ [GEOLOCATION] Usuário escolheu manualmente - não aplicando tradução do cache')
          }
          sessionStorage.setItem('mtm_geo_detected', 'true')
          return
        }
      }

      // Verificar se já detectou nesta sessão
      const alreadyDetected = sessionStorage.getItem('mtm_geo_detected')
      if (alreadyDetected) {
        console.log('✅ [GEOLOCATION] Já detectado nesta sessão')
        return
      }

      // Detectar localização via IP PRIMEIRO (não depende de auth)
      const response = await fetch('https://ipapi.co/json/', {
        headers: {
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        console.warn('⚠️ [GEOLOCATION] Erro ao buscar localização')
        return
      }

      const geoData: GeoLocation = await response.json()
      
      console.log('🌍 [GEOLOCATION] Localização detectada:', {
        country: geoData.country_name,
        code: geoData.country_code,
        timezone: geoData.timezone,
        city: geoData.city
      })

      // Mapear país para idioma
      const detectedLanguage = COUNTRY_TO_LANGUAGE[geoData.country_code] || 'pt'

      // Cachear no localStorage IMEDIATAMENTE
      localStorage.setItem('mtm_detected_country', geoData.country_code)
      localStorage.setItem('mtm_detected_language', detectedLanguage)
      localStorage.setItem('mtm_detected_timezone', geoData.timezone)
      localStorage.setItem('mtm_geo_timestamp', Date.now().toString())

      // Aplicar tradução imediatamente (não esperar por auth)
      // MAS APENAS SE O USUÁRIO NÃO ESCOLHEU MANUALMENTE
      const userManualSelection = sessionStorage.getItem('mtm_user_manual_selection')
      const autoTranslateDisabled = localStorage.getItem('mtm_auto_translate_disabled')
      
      if (detectedLanguage !== 'pt' && userManualSelection !== 'true' && autoTranslateDisabled !== 'true') {
        applyTranslation(detectedLanguage)
      } else {
        console.log('⏭️ [GEOLOCATION] Usuário escolheu manualmente ou tradução automática desabilitada - pulando')
      }
      sessionStorage.setItem('mtm_geo_detected', 'true')

      // Salvar no perfil do usuário se autenticado (em background, não bloqueante)
      queueMicrotask(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          
          if (session?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('country, preferred_language')
              .eq('id', session.user.id)
              .single()

            // Se já tem país e idioma configurado, não fazer nada
            if (profile?.country && profile?.preferred_language) {
              console.log('✅ [GEOLOCATION] Usuário já tem país e idioma configurados')
              return
            }

            // Atualizar perfil se necessário
            if (profile && (!profile.country || !profile.preferred_language)) {
              const updates: any = {
                country: geoData.country_code,
                timezone: geoData.timezone,
                detected_language: detectedLanguage,
                updated_at: new Date().toISOString()
              }

              // Se não tem idioma preferido, definir o detectado como preferido
              if (!profile.preferred_language) {
                updates.preferred_language = detectedLanguage
                console.log(`🌐 [GEOLOCATION] Definindo idioma preferido: ${detectedLanguage}`)
              }

              const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', session.user.id)

              if (error) {
                console.error('❌ [GEOLOCATION] Erro ao salvar dados:', error)
              } else {
                console.log('✅ [GEOLOCATION] Dados salvos no perfil')
              }
            }
          }
        } catch (error) {
          console.error('❌ [GEOLOCATION] Erro ao atualizar perfil:', error)
        }
      }) // Executar em background sem bloquear

    } catch (error) {
      console.error('❌ [GEOLOCATION] Erro geral:', error)
    }
  }

  const applyTranslation = (langCode: string) => {
    console.log(`🌐 [GEOLOCATION] Aplicando tradução automática para: ${langCode}`)
    
    // ✅ VERIFICAÇÃO CRÍTICA: Se o utilizador escolheu manualmente, NÃO aplicar auto-tradução
    const userManualSelection = sessionStorage.getItem('mtm_user_manual_selection')
    const autoTranslateDisabled = localStorage.getItem('mtm_auto_translate_disabled')
    
    if (userManualSelection === 'true' || autoTranslateDisabled === 'true') {
      console.log('⏭️ [GEOLOCATION] Utilizador escolheu manualmente - pulando tradução automática')
      return
    }

    // Método 1: Usar cookie (mais confiável e funciona mesmo se o script ainda não carregou)
    const cookieValue = `/pt/${langCode}`
    document.cookie = `googtrans=${cookieValue}; path=/; max-age=31536000`
    document.cookie = `googtrans=${cookieValue}; path=/; domain=${window.location.hostname}; max-age=31536000`
    console.log(`🍪 [GEOLOCATION] Cookie definido: googtrans=${cookieValue}`)
    
    // Método 2: Tentar usar o select do Google Translate (fallback)
    let attempts = 0
    const maxAttempts = 15 // Aumentado para dar mais tempo ao script carregar

    const tryApply = () => {
      const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement
      
      if (translateSelect) {
        console.log(`✅ [GEOLOCATION] Google Translate pronto, aplicando ${langCode}`)
        translateSelect.value = langCode
        
        const event = new Event('change', { bubbles: true })
        translateSelect.dispatchEvent(event)
        
        sessionStorage.setItem('mtm_auto_translated', 'true')
        sessionStorage.setItem('mtm_auto_lang', langCode)
      } else {
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(tryApply, 500) // Intervalo maior para dar tempo ao script
        } else {
          // Se o select não aparecer, o cookie já foi definido, então recarregar página
          console.log(`⚠️ [GEOLOCATION] Google Translate select não encontrado, mas cookie definido. Recarregando página...`)
          if (!sessionStorage.getItem('mtm_auto_translation_reload')) {
            sessionStorage.setItem('mtm_auto_translation_reload', 'true')
            setTimeout(() => {
              window.location.reload()
            }, 1000)
          }
        }
      }
    }

    // Aguardar 2s antes de tentar (dar tempo ao script carregar)
    setTimeout(tryApply, 2000)
  }

  // Componente invisível (apenas lógica)
  return null
}

