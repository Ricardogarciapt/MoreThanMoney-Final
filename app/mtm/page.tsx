"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { X, ExternalLink, GraduationCap } from "lucide-react"
import { supabase } from "@/lib/supabase"
import YouTubeEmbed from "@/components/youtube-embed"
import ParticleBackground from "@/components/particle-background"
import Link from "next/link"

export default function MTMPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showEducationPopup, setShowEducationPopup] = useState(false)
  const [showSkoolBrowser, setShowSkoolBrowser] = useState(false)
  const [videoId, setVideoId] = useState("RQIimjljeMI") // Fallback padrão

  useEffect(() => {
    checkAuth()
    loadVideoConfig()
  }, [])

  const loadVideoConfig = async () => {
    try {
      const response = await fetch('/api/admin/content-config')
      if (!response.ok) {
        throw new Error('Erro ao buscar configuração')
      }
      
      const data = await response.json()
      
      // Buscar vídeo configurado para a página /mtm
      const mtmVideo = data.videos?.find((video: any) => 
        video.page === '/mtm' || video.page === 'mtm'
      )
      
      if (mtmVideo?.videoId) {
        setVideoId(mtmVideo.videoId)
        console.log('✅ [MTM] Vídeo carregado do admin:', mtmVideo.videoId)
      } else {
        console.log('⚠️ [MTM] Nenhum vídeo configurado no admin, usando fallback')
      }
    } catch (error) {
      console.error('❌ [MTM] Erro ao carregar configuração de vídeo:', error)
      // Manter o fallback padrão
    }
  }

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsAuthenticated(true)
        // Mostrar popup se estiver logado e ainda não foi fechado nesta sessão
        const popupShown = sessionStorage.getItem('mtm_education_popup_shown')
        if (!popupShown) {
          setShowEducationPopup(true)
        }
      }
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error)
    }
  }

  const handleClosePopup = () => {
    setShowEducationPopup(false)
    sessionStorage.setItem('mtm_education_popup_shown', 'true')
  }

  const handleGoToAcademy = () => {
    setShowSkoolBrowser(true)
    setShowEducationPopup(false)
  }

  return (
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      
      <section className="container mx-auto px-4 py-12 relative z-10">
        {/* Header */}
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-[#D2A63C]">MoreThanMoney</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8">
            A Tua Plataforma de Educação Financeira
          </p>
        </div>

        {/* Video Modal Section */}
        <div className="max-w-5xl mx-auto mb-12">
          <YouTubeEmbed 
            videoId={videoId}
            title="Apresentação MoreThanMoney"
            className="border border-[#D2A63C]/30 rounded-lg"
          />
        </div>

        {/* Mission Section */}
        <div className="max-w-6xl mx-auto mb-12">
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-[#D2A63C]/30 rounded-2xl p-8 md:p-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#D2A63C] mb-6 text-center">
              A Nossa Missão
            </h2>
            <p className="text-lg text-gray-300 mb-8 text-center max-w-4xl mx-auto leading-relaxed">
              Educar as pessoas e dar acesso à literacia financeira através de uma segmentação de educação de comunidade.
            </p>

            {/* Education Categories */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800/50 border border-[#D2A63C]/20 rounded-xl p-6 hover:border-[#D2A63C]/50 transition-all">
                <div className="text-4xl mb-4">💹</div>
                <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Forex & Crypto</h3>
                <p className="text-gray-400 text-sm">
                  Educação completa em trading de Forex e Criptomoedas
                </p>
              </div>

              <div className="bg-gray-800/50 border border-[#D2A63C]/20 rounded-xl p-6 hover:border-[#D2A63C]/50 transition-all">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Portfólios</h3>
                <p className="text-gray-400 text-sm">
                  Gestão de portfólios de cripto e ETFs
                </p>
              </div>

              <div className="bg-gray-800/50 border border-[#D2A63C]/20 rounded-xl p-6 hover:border-[#D2A63C]/50 transition-all">
                <div className="text-4xl mb-4">📱</div>
                <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Marketing Digital</h3>
                <p className="text-gray-400 text-sm">
                  Estratégias de marketing digital e crescimento
                </p>
              </div>

              <div className="bg-gray-800/50 border border-[#D2A63C]/20 rounded-xl p-6 hover:border-[#D2A63C]/50 transition-all">
                <div className="text-4xl mb-4">🧠</div>
                <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Mindset & Fitness</h3>
                <p className="text-gray-400 text-sm">
                  Desenvolvimento pessoal e bem-estar
                </p>
              </div>

              <div className="bg-gray-800/50 border border-[#D2A63C]/20 rounded-xl p-6 hover:border-[#D2A63C]/50 transition-all">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Soluções IA</h3>
                <p className="text-gray-400 text-sm">
                  Criação de soluções de IA drag and drop para fontes de renda digital
                </p>
              </div>

              <div className="bg-gray-800/50 border border-[#D2A63C]/20 rounded-xl p-6 hover:border-[#D2A63C]/50 transition-all">
                <div className="text-4xl mb-4">🌐</div>
                <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Networking</h3>
                <p className="text-gray-400 text-sm">
                  Prospeção, validação e expansão de negócio
                </p>
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-xl p-6 mt-8">
              <h3 className="text-2xl font-bold text-[#D2A63C] mb-4">O Que Oferecemos</h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <span className="text-[#D2A63C] mt-1">✓</span>
                  <span>Produtos estruturados para MLM, simplificando o onboarding</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#D2A63C] mt-1">✓</span>
                  <span>Ajudamos investidores particulares a profissionalizarem-se com IA, scanners e sistemas de negociação</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#D2A63C] mt-1">✓</span>
                  <span>Networking para tirar partido das formações e aumentar a base de dados</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="max-w-2xl mx-auto text-center">
          <Button
            onClick={handleGoToAcademy}
            className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-[#D2A63C]/50"
            size="lg"
          >
            <GraduationCap className="w-5 h-5 mr-2" />
            Ir para a Academia MTM
          </Button>
        </div>
      </section>

      {/* Education Connection Popup (se logado) */}
      <Dialog open={isAuthenticated && showEducationPopup} onOpenChange={(open) => {
        if (!open) {
          handleClosePopup()
        }
      }}>
        <DialogContent className="bg-gray-900 border-[#D2A63C]/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#D2A63C]">
              Educação MTM
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">
              Queres aceder à nossa plataforma de educação completa? Liga-te à Educação MTM e acede a todo o conteúdo exclusivo!
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleGoToAcademy}
                className="flex-1 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-bold"
              >
                <GraduationCap className="w-4 h-4 mr-2" />
                Ligar à Educação MTM
              </Button>
              <Button
                onClick={handleClosePopup}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Agora não
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Skool Browser Modal */}
      <Dialog open={showSkoolBrowser} onOpenChange={setShowSkoolBrowser}>
        <DialogContent className="bg-gray-900 border-[#D2A63C]/30 max-w-[95vw] w-full h-[95vh] p-0 flex flex-col [&>button]:hidden">
          <DialogHeader className="p-4 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-[#D2A63C] flex items-center gap-2">
                <GraduationCap className="w-5 h-5" />
                Academia MTM - Skool
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => window.open('https://www.skool.com/morethanmoney', '_blank')}
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir em nova aba
                </Button>
                <button
                  onClick={() => setShowSkoolBrowser(false)}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 w-full overflow-hidden relative min-h-0">
            <iframe
              src="https://www.skool.com/morethanmoney"
              className="w-full h-full border-0"
              title="Academia MTM - Skool"
              allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation allow-modals"
              style={{ 
                minHeight: '100%',
                width: '100%',
                border: 'none'
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

