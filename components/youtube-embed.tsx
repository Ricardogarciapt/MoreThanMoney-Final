"use client"

import { useEffect, useState } from "react"

interface YouTubeEmbedProps {
  videoId: string
  title?: string
  autoplay?: boolean
  playlist?: string
  className?: string
}

// Mapeamento de idiomas do Google Translate para códigos de legenda do YouTube
const captionLanguageMap: Record<string, string> = {
  "pt": "pt",
  "en": "en",
  "es": "es",
  "fr": "fr",
  "de": "de",
  "it": "it",
  "zh-CN": "zh-Hans",
  "ja": "ja",
  "ar": "ar",
  "ru": "ru",
  "hi": "hi",
  "sr": "sr",
  "hr": "hr",
  "bs": "bs",
  "sq": "sq",
  "bg": "bg",
  "ro": "ro",
  "pl": "pl",
  "uk": "uk",
  "tr": "tr",
  "nl": "nl",
}

export default function YouTubeEmbed({ 
  videoId, 
  title = "Vídeo", 
  autoplay = false,
  playlist,
  className = ""
}: YouTubeEmbedProps) {
  const [detectedLanguage, setDetectedLanguage] = useState("pt")

  useEffect(() => {
    // Detectar idioma do Google Translate
    const detectLanguage = () => {
      // Tentar pegar o idioma selecionado no Google Translate
      const translateSelect = document.querySelector('.goog-te-combo') as HTMLSelectElement
      if (translateSelect && translateSelect.value && translateSelect.value !== '') {
        const selectedLang = translateSelect.value
        setDetectedLanguage(captionLanguageMap[selectedLang] || selectedLang || "pt")
        return
      }

      // Se não houver seleção, usar o idioma do navegador
      const browserLang = navigator.language.split('-')[0]
      setDetectedLanguage(captionLanguageMap[browserLang] || browserLang || "pt")
    }

    // Detectar no mount
    detectLanguage()

    // Observar mudanças no Google Translate
    const observer = setInterval(detectLanguage, 1000)

    return () => clearInterval(observer)
  }, [])

  // Parâmetros para ocultar marcas d'água e prevenir navegação
  const params = new URLSearchParams({
    rel: '0',                    // Não mostrar vídeos relacionados
    modestbranding: '1',         // Ocultar logo do YouTube
    showinfo: '0',               // Não mostrar info do vídeo
    controls: '1',               // Mostrar controles
    fs: '1',                     // Permitir fullscreen
    disablekb: '1',              // Desabilitar atalhos de teclado
    iv_load_policy: '3',         // Não mostrar anotações
    cc_load_policy: '1',         // Ativar legendas automaticamente
    cc_lang_pref: detectedLanguage, // Idioma preferido das legendas
    hl: detectedLanguage,        // Idioma da interface do player
    playsinline: '1',            // Play inline em mobile
    ...(autoplay && { autoplay: '1' }),
    ...(playlist && { list: playlist })
  })

  const embedUrl = `https://www.youtube.com/embed/${videoId}?${params.toString()}`

  return (
    <div className={`relative aspect-video rounded-xl overflow-hidden bg-black ${className}`}>
      <iframe
        src={embedUrl}
        title={title}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ border: 'none' }}
      />
      {/* Overlay invisível sobre o logo do YouTube (canto superior direito) */}
      <div 
        className="absolute top-0 right-0 w-28 h-20 bg-transparent cursor-default"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        style={{ pointerEvents: 'auto', zIndex: 1 }}
        title="Vídeo incorporado do YouTube"
      />
    </div>
  )
}

