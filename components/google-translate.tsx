"use client"

import { useEffect, useState } from "react"

declare global {
  interface Window {
    google?: any
    googleTranslateElementInit?: () => void
  }
}

// Mapeamento de códigos de idioma do navegador para códigos do Google Translate
const languageMap: Record<string, string> = {
  "en": "en",
  "es": "es",
  "fr": "fr",
  "de": "de",
  "it": "it",
  "zh": "zh-CN",
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
  "pt": "pt",
}

export default function GoogleTranslate() {
  // Temporariamente desativado para resolver problemas de build
  return null
  
  const [mounted, setMounted] = useState(false)
  const [hasAutoTranslated, setHasAutoTranslated] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    
    console.log('🌐 [GOOGLE TRANSLATE HEAD] Inicializando...')

    // Verificar se já foi traduzido automaticamente nesta sessão
    let autoTranslated = false
    try {
      autoTranslated = sessionStorage.getItem("mtm_auto_translated") === "true"
      if (autoTranslated) {
        setHasAutoTranslated(true)
      }
    } catch (e) {
      console.warn('⚠️ [GOOGLE TRANSLATE] SessionStorage não disponível')
    }

    // Aguarda um pouco para evitar conflitos de hidratação
    let timer: NodeJS.Timeout | null = null
    
    // Verificar se já existe função de inicialização para evitar loops
    if (!window.googleTranslateElementInit) {
      timer = setTimeout(() => {
        // Função de inicialização do Google Translate
        window.googleTranslateElementInit = () => {
          if (window.google && window.google.translate && !hasAutoTranslated) {
            console.log('🌐 [GOOGLE TRANSLATE] Inicializando widget...')
            try {
              new window.google.translate.TranslateElement(
                {
                  pageLanguage: "pt",
                  includedLanguages: "en,es,fr,de,it,nl,zh-CN,ja,ar,ru,hi,sr,hr,bs,sq,bg,ro,pl,uk,tr",
                  layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
                  autoDisplay: false,
                  multilanguagePage: true,
                },
                "google_translate_element"
              )
          
            // Aguardar widget estar pronto
            setTimeout(() => {
              const combo = document.querySelector('.goog-te-combo')
              if (combo) {
                console.log('✅ [GOOGLE TRANSLATE] Widget pronto e disponível!')
              } else {
                console.warn('⚠️ [GOOGLE TRANSLATE] Widget inicializado mas combo não encontrado')
              }
            }, 1000)

            // Tradução automática baseada no idioma do navegador
            if (!hasAutoTranslated && !autoTranslated) {
                setTimeout(() => {
                  // ✅ VERIFICAÇÃO CRÍTICA: Se o utilizador escolheu manualmente, NÃO aplicar auto-tradução
                  const userManualSelection = sessionStorage.getItem('mtm_user_manual_selection')
                  const autoTranslateDisabled = localStorage.getItem('mtm_auto_translate_disabled')
                  
                  if (userManualSelection === 'true' || autoTranslateDisabled === 'true') {
                    console.log('⏭️ [GOOGLE TRANSLATE] Utilizador escolheu manualmente - pulando tradução automática')
                    return
                  }
                  
                  const userLang = navigator.language.split("-")[0] // Ex: "en-US" -> "en"
                  const targetLang = languageMap[userLang]

                  // Se o idioma do usuário não é português, traduz automaticamente
                  if (targetLang && targetLang !== "pt") {
                    console.log(`🌐 Tradução automática detectada: ${userLang} -> ${targetLang}`)
                    
                    // Trigger da tradução automática
                    const selectElement = document.querySelector(".goog-te-combo") as HTMLSelectElement
                    if (selectElement) {
                      selectElement.value = targetLang
                      selectElement.dispatchEvent(new Event("change"))
                      sessionStorage.setItem("mtm_auto_translated", "true")
                      setHasAutoTranslated(true)
                    }
                  }
                }, 1500)
              }
            } catch (error) {
              console.error('❌ [GOOGLE TRANSLATE] Erro ao inicializar:', error)
            }
          } else {
            console.log('⚠️ [GOOGLE TRANSLATE] Widget já inicializado, pulando...')
          }
        }

        // Carregar o script do Google Translate se ainda não foi carregado
        if (!document.getElementById("google-translate-script")) {
          const script = document.createElement("script")
          script.id = "google-translate-script"
          script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
          script.async = true
          document.body.appendChild(script)
        } else if (window.google && window.google.translate) {
          // Se o script já foi carregado, inicializa diretamente
          window.googleTranslateElementInit()
        }
      }, 1000)

    return () => {
      clearTimeout(timer)
    }
  }, [mounted, hasAutoTranslated])

  if (!mounted) {
    return null
  }

  return (
    <>
      <div id="google_translate_element" suppressHydrationWarning />
      <style jsx global>{`
        /* Estilização do Google Translate */
        #google_translate_element {
          display: inline-block;
        }

        .goog-te-banner-frame {
          display: none !important;
        }

        .goog-te-gadget {
          font-family: inherit !important;
          font-size: 0 !important;
        }

        .goog-te-gadget .goog-te-combo {
          background: linear-gradient(135deg, #D2A63C 0%, #BB8525 100%) !important;
          border: 2px solid #F3F3E6 !important;
          border-radius: 0.75rem !important;
          color: #000000 !important;
          padding: 0.625rem 1rem !important;
          font-size: 0.875rem !important;
          font-family: inherit !important;
          font-weight: 700 !important;
          outline: none !important;
          cursor: pointer !important;
          transition: all 0.3s ease-in-out !important;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3) !important;
        }

        .goog-te-gadget .goog-te-combo:hover {
          background: linear-gradient(135deg, #BB8525 0%, #D2A63C 100%) !important;
          border-color: #F3F3E6 !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 12px rgba(210, 166, 60, 0.4) !important;
        }

        .goog-te-gadget .goog-te-combo:focus {
          border-color: #D2A63C !important;
          box-shadow: 0 0 0 2px rgba(210, 166, 60, 0.2) !important;
        }

        .goog-te-gadget .goog-te-combo option {
          background-color: #1F2937 !important;
          color: white !important;
        }

        /* Remover o link "Powered by" */
        .goog-logo-link {
          display: none !important;
        }

        .goog-te-gadget .goog-te-gadget-simple {
          background-color: transparent !important;
          border: none !important;
          padding: 0 !important;
        }

        .goog-te-gadget .goog-te-gadget-simple .goog-te-menu-value {
          color: white !important;
        }

        .goog-te-gadget .goog-te-gadget-simple .goog-te-menu-value span {
          color: white !important;
          border: none !important;
        }

        /* Remover o banner superior do Google Translate */
        body {
          top: 0 !important;
        }

        .skiptranslate {
          display: inline-block !important;
        }

        /* Estilização customizada para o dropdown */
        .goog-te-combo {
          margin: 0 !important;
        }

        /* Ocultar o iframe do Google Translate */
        .goog-te-banner-frame.skiptranslate {
          display: none !important;
        }

        iframe.goog-te-banner-frame {
          display: none !important;
        }

        iframe.skiptranslate {
          display: none !important;
        }

        body.translated-ltr {
          top: 0 !important;
        }

        body.translated-rtl {
          top: 0 !important;
        }

        /* Melhorias visuais */
        .goog-te-gadget img {
          display: none !important;
        }

        .goog-te-gadget-simple {
          background: transparent !important;
          border: none !important;
        }

        .goog-te-menu-value span:first-child {
          display: none !important;
        }

        .goog-te-menu-value:before {
          content: "🌐 Idioma";
          font-size: 0.875rem;
          margin-right: 0.5rem;
          font-weight: 700;
          color: #000000;
        }

        /* REMOVER COMPLETAMENTE O POPUP DE CLASSIFICAÇÃO */
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        .VIpgJd-ZVi9od-aZ2wEe {
          display: none !important;
          visibility: hidden !important;
        }

        /* Balão/Popup de "Classificar tradução" */
        div[role="dialog"],
        div[aria-label*="Classificar"],
        div[aria-label*="translate"],
        .goog-te-balloon-frame,
        .goog-te-ftab-float,
        .goog-te-ftab {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Remover TODOS os iframes do Google Translate exceto o necessário */
        iframe.goog-te-ftab-frame,
        iframe[src*="translate_suggestions"] {
          display: none !important;
          visibility: hidden !important;
        }

        /* Forçar ocultação de elementos flutuantes */
        body > .VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
        body > .goog-te-ftab-float,
        body > [class*="goog-te"] {
          display: none !important;
        }

        /* REMOVER TEXTO "Classificar esta tradução" */
        span:contains("Classificar esta tradução"),
        span:contains("O seu feedback"),
        span:contains("Texto original"),
        div:contains("ajudar a melhorar o Google Tradutor") {
          display: none !important;
          visibility: hidden !important;
        }

        /* Remover TODOS os elementos de feedback/rating */
        .goog-te-balloon,
        .goog-te-balloon-frame,
        [class*="feedback"],
        [class*="rating"],
        [aria-label*="Classificar"],
        [aria-label*="feedback"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          position: absolute !important;
          left: -9999px !important;
          pointer-events: none !important;
        }

        /* Ocultar TODOS os tooltips e overlays do Google */
        .VIpgJd-ZVi9od-aZ2wEe-OiiCO,
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf-ti6hGc,
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf-UvYJrd,
        [class*="VIpgJd"] {
          display: none !important;
          visibility: hidden !important;
        }
      `}</style>
      
      {/* JavaScript para remover popup agressivamente */}
      <script dangerouslySetInnerHTML={{
        __html: `
          // Remover popup de classificação e textos a cada 300ms
          setInterval(function() {
            // Remover popups e balões
            var popups = document.querySelectorAll('.VIpgJd-ZVi9od-aZ2wEe-wOHMyf, .VIpgJd-ZVi9od-aZ2wEe, .goog-te-balloon-frame, .goog-te-ftab-float, .goog-te-ftab, [role="dialog"], [class*="VIpgJd"]');
            popups.forEach(function(popup) {
              if (popup && popup.parentNode) {
                popup.parentNode.removeChild(popup);
              }
            });
            
            // Remover iframes de sugestões
            var iframes = document.querySelectorAll('iframe[src*="translate_suggestions"], iframe.goog-te-ftab-frame');
            iframes.forEach(function(iframe) {
              if (iframe && iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
              }
            });
            
            // Remover elementos com texto específico
            var allElements = document.querySelectorAll('span, div, p');
            allElements.forEach(function(el) {
              var text = el.textContent || '';
              if (text.includes('Classificar esta tradução') || 
                  text.includes('O seu feedback') || 
                  text.includes('Texto original') ||
                  text.includes('ajudar a melhorar o Google Tradutor')) {
                // Ocultar o elemento e seus pais
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.style.opacity = '0';
                if (el.parentElement) {
                  el.parentElement.style.display = 'none';
                  if (el.parentElement.parentElement) {
                    el.parentElement.parentElement.style.display = 'none';
                  }
                }
              }
            });
          }, 300);
          
          // Observer para remover quando aparecer
          var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
              mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                  if (node.classList && (
                    node.classList.contains('VIpgJd-ZVi9od-aZ2wEe-wOHMyf') ||
                    node.classList.contains('VIpgJd-ZVi9od-aZ2wEe') ||
                    node.classList.contains('goog-te-balloon-frame') ||
                    node.classList.contains('goog-te-ftab-float') ||
                    node.classList.contains('goog-te-ftab')
                  )) {
                    if (node.parentNode) {
                      node.parentNode.removeChild(node);
                    }
                  }
                }
              });
            });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        `
      }} />
    </>
  )
}
