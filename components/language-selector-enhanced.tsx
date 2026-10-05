"use client"

import { useI18n } from "@/components/i18n-provider"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Globe, Check, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import {
  LANGUAGES,
  OTHER_LANGUAGES as OTHER_LANGS_LIST,
  PRIORITY_LANGUAGES as PRIORITY_LANGS_LIST,
  type LanguageOption,
} from "@/lib/i18n/languages"
import { clearGoogtransCookies, setGoogtransCookie } from "@/lib/i18n/googtrans"

/**
 * A lista de idiomas e o cookie do Google Translate vivem agora em lib/i18n — havia duas
 * cópias da lista (esta e a do dicionário) e bastava acrescentar um idioma a uma delas para
 * o seletor deixar de corresponder ao que o site sabe traduzir.
 */
type Language = LanguageOption
const SUPPORTED_LANGUAGES: Language[] = LANGUAGES
const PRIORITY_LANGUAGES: Language[] = PRIORITY_LANGS_LIST
const OTHER_LANGUAGES: Language[] = OTHER_LANGS_LIST

export default function LanguageSelectorEnhanced() {
  // O dicionário nativo (lib/i18n) e o Google Translate eram dois sistemas separados: o seletor
  // escrevia googtrans e o dicionário lia mtm_lang, por isso a página podia estar em inglês com
  // o seletor a dizer Português. Passa a conduzir os dois — o Google Translate continua a servir
  // as páginas ainda não migradas, e o dicionário segue a mesma escolha.
  const { lang: langNativo, setLang: setLangNativo } = useI18n()
  const [currentLanguage, setCurrentLanguage] = useState<string>(langNativo)
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null)
  const [userCountry, setUserCountry] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    setCurrentLanguage(langNativo)
  }, [langNativo])

  useEffect(() => {
    loadUserLanguagePreferences()
    detectBrowserLanguage()
    // Aplicar tradução salva quando componente montar (apenas se não foi escolhido manualmente)
    const manualSelection = sessionStorage.getItem('mtm_user_manual_selection')
    if (!manualSelection || manualSelection !== 'true') {
      applySavedTranslation()
    } else {
      const savedLang = localStorage.getItem('mtm_preferred_language') || sessionStorage.getItem('mtm_active_language')
      if (savedLang) {
        setCurrentLanguage(savedLang)
      }
    }
  }, [])

  // Função auxiliar para aplicar tradução no Google Translate (usando cookie)
  const applyGoogleTranslate = (langCode: string, savePreference: boolean = true) => {
    const cookieValue = `/pt/${langCode}`
    clearGoogtransCookies()
    setGoogtransCookie(cookieValue)

    if (savePreference) {
      sessionStorage.setItem('mtm_active_language', langCode)
      sessionStorage.setItem('mtm_user_manual_selection', 'true')
      localStorage.setItem('mtm_auto_translate_disabled', 'true')
    }
    
    return true
  }

  // Aplicar tradução salva (executado apenas uma vez ao carregar)
  const applySavedTranslation = () => {
    const savedLang = localStorage.getItem('mtm_preferred_language') || sessionStorage.getItem('mtm_active_language')
    if (savedLang && savedLang !== 'pt') {
      // Verificar se o cookie já está definido
      const existingCookie = document.cookie.split('; ').find(row => row.startsWith('googtrans='))
      const cookieValue = `/pt/${savedLang}`
      
      // Se o cookie não existe ou está diferente, definir e recarregar
      if (!existingCookie || !existingCookie.includes(cookieValue)) {
        console.log(`🌐 [LANGUAGE] Aplicando tradução salva: ${savedLang}`)
        clearGoogtransCookies()
        setGoogtransCookie(cookieValue)

        setCurrentLanguage(savedLang)
        
        // Recarregar página apenas uma vez
        if (!sessionStorage.getItem('mtm_translation_applied')) {
          sessionStorage.setItem('mtm_translation_applied', 'true')
          setTimeout(() => {
            window.location.reload()
          }, 500)
        }
      } else {
        // Cookie já está correto, apenas atualizar estado
        setCurrentLanguage(savedLang)
      }
    }
  }

  const loadUserLanguagePreferences = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      // sem user.id não há perfil a ler (id='' dava erro de uuid no PostgREST)
      if (session?.user?.id) {
        setUserId(session.user.id)
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('preferred_language, detected_language, country')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          // Usar idioma preferido se existir, senão usar detectado
          const lang = profile.preferred_language || profile.detected_language || 'pt'
          setCurrentLanguage(lang)
          setDetectedLanguage(profile.detected_language)
          setUserCountry(profile.country)
          
          console.log('🌐 [LANGUAGE] Preferências carregadas:', {
            preferred: profile.preferred_language,
            detected: profile.detected_language,
            country: profile.country
          })
        }
      }
    } catch (error) {
      console.error('❌ [LANGUAGE] Erro ao carregar preferências:', error)
    }
  }

  const detectBrowserLanguage = () => {
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language.split('-')[0]
      console.log('🌐 [LANGUAGE] Idioma do navegador:', browserLang)
      setDetectedLanguage(browserLang)
    }
  }

  const handleLanguageChange = async (langCode: string) => {
    try {
      setLoading(true)
      console.log(`🌐 [LANGUAGE] Mudando para: ${langCode}`)

      // 1. Atualizar estado local IMEDIATAMENTE
      setCurrentLanguage(langCode)

      // 2. Salvar preferências (não bloqueante)
      if (userId) {
        supabase
          .from('profiles')
          .update({ 
            preferred_language: langCode,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .then(({ error }: { error: unknown }) => {
            if (error) {
              console.error('❌ [LANGUAGE] Erro ao salvar preferência:', error)
            } else {
              console.log('✅ [LANGUAGE] Preferência salva no perfil')
            }
          })
      }

      // 3. Salvar no localStorage/sessionStorage IMEDIATAMENTE
      setLangNativo(langCode)   // dicionário nativo: cookie mtm_lang + re-render sem recarregar
      localStorage.setItem('mtm_preferred_language', langCode)
      sessionStorage.setItem('mtm_active_language', langCode)
      sessionStorage.setItem('mtm_user_manual_selection', 'true')
      localStorage.setItem('mtm_auto_translate_disabled', 'true')
      console.log('✅ [LANGUAGE] Override da tradução automática ativado')

      // 4. Se for português, restaurar página original
      if (langCode === 'pt') {
        // Remover cookie do Google Translate em TODOS os scopes (incl. .dominio-raiz)
        clearGoogtransCookies()

        const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement
        if (translateSelect) {
          translateSelect.value = ''
          translateSelect.dispatchEvent(new Event('change', { bubbles: true }))
        }
        
        // Limpar flags
        sessionStorage.removeItem('mtm_translation_applied')
        sessionStorage.removeItem('mtm_active_language')
        sessionStorage.removeItem('mtm_user_manual_selection')
        localStorage.removeItem('mtm_auto_translate_disabled')
        localStorage.removeItem('mtm_preferred_language')
        
        // Recarregar página para restaurar original
        setTimeout(() => {
          window.location.reload()
        }, 300)
        setLoading(false)
        return
      }

      // 5. MÉTODO SIMPLIFICADO: Usar apenas cookie + recarregar página
      // O Google Translate lê o cookie automaticamente quando a página carrega
      console.log(`🌐 [LANGUAGE] Definindo cookie e recarregando página para aplicar ${langCode}...`)

      // IMPORTANTE: limpar PRIMEIRO todos os scopes (senão um cookie antigo em
      // .morethanmoney.pt fixa o idioma anterior na 2.ª troca), depois definir o novo.
      const cookieValue = `/pt/${langCode}`
      clearGoogtransCookies()
      setGoogtransCookie(cookieValue)

      console.log(`🍪 [LANGUAGE] Cookie definido: googtrans=${cookieValue}`)
      
      // Recarregar página imediatamente - o Google Translate lerá o cookie automaticamente
      setLoading(false)
      setTimeout(() => {
        window.location.reload()
      }, 200)
      
    } catch (error) {
      console.error('❌ [LANGUAGE] Erro ao mudar idioma:', error)
      setLoading(false)
    }
  }

  const getCurrentLanguageInfo = () => {
    return SUPPORTED_LANGUAGES.find(lang => lang.code === currentLanguage) || SUPPORTED_LANGUAGES[0]
  }

  const currentLang = getCurrentLanguageInfo()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="relative h-10 px-3 hover:bg-white/10 transition-colors text-white"
          aria-label="Selecionar idioma"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" />
          ) : (
            <>
              <Globe className="h-4 w-4 mr-2 text-[#D2A63C]" />
              <span className="text-sm font-medium hidden sm:inline">
                {currentLang.flag} {currentLang.code.toUpperCase()}
              </span>
              <span className="text-sm font-medium sm:hidden">
                {currentLang.flag}
              </span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-64 bg-gray-900 border-[#D2A63C]/30 text-white max-h-96 overflow-y-auto"
      >
        <DropdownMenuLabel className="text-[#D2A63C] font-bold flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Selecionar Idioma
        </DropdownMenuLabel>
        
        {detectedLanguage && detectedLanguage !== currentLanguage && (
          <>
            <DropdownMenuSeparator className="bg-gray-700" />
            <div className="px-2 py-1.5">
              <p className="text-xs text-gray-400 mb-1">🔍 Idioma Detectado:</p>
              <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-400">
                {SUPPORTED_LANGUAGES.find(l => l.code === detectedLanguage)?.flag} {detectedLanguage}
              </Badge>
            </div>
          </>
        )}

        {userCountry && (
          <div className="px-2 py-1">
            <p className="text-xs text-gray-500">📍 {userCountry}</p>
          </div>
        )}
        
        <DropdownMenuSeparator className="bg-gray-700" />

        {(() => {
          const renderItem = (lang: Language) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`cursor-pointer flex items-center justify-between py-2.5 ${
                currentLanguage === lang.code
                  ? 'bg-[#D2A63C]/20 text-[#D2A63C] font-semibold'
                  : 'text-gray-300 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{lang.flag}</span>
                <div>
                  <div className="text-sm font-medium">{lang.name}</div>
                  <div className="text-xs text-gray-500">{lang.nativeName}</div>
                </div>
              </div>
              {currentLanguage === lang.code && (
                <Check className="h-4 w-4 text-[#D2A63C]" />
              )}
            </DropdownMenuItem>
          )

          return (
            <div className="max-h-72 overflow-y-auto">
              <p className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
                Principais
              </p>
              {PRIORITY_LANGUAGES.map(renderItem)}
              <DropdownMenuSeparator className="bg-gray-700" />
              <p className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
                Outros idiomas
              </p>
              {OTHER_LANGUAGES.map(renderItem)}
            </div>
          )
        })()}

        <DropdownMenuSeparator className="bg-gray-700" />
        
        <div className="px-3 py-2 text-xs text-gray-500">
          💡 Tradução nativa MTM · 21 idiomas
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

