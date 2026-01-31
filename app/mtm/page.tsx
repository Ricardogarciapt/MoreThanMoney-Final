"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { 
  GraduationCap, 
  TrendingUp, 
  Shield, 
  Zap, 
  Target, 
  ArrowRight, 
  CheckCircle2,
  Users,
  Brain,
  BarChart3,
  Rocket,
  Crown,
  Sparkles,
  ChevronRight,
  PlayCircle,
  X
} from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"

export default function MTMLandingPage() {
  const [mounted, setMounted] = useState(false)
  const [videoId, setVideoId] = useState("RQIimjljeMI") // Fallback padrão

  useEffect(() => {
    setMounted(true)
    loadVideoConfig()
  }, [])

  const loadVideoConfig = async () => {
    try {
      const response = await fetch('/api/admin/content-config')
      if (response.ok) {
        const data = await response.json()
        const mtmVideo = data.videos?.find((video: any) => 
          video.page === '/mtm' || video.page === 'mtm'
        )
        if (mtmVideo?.videoId) {
          setVideoId(mtmVideo.videoId)
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração de vídeo:', error)
    }
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#D2A63C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">A carregar...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden">
      <ParticleBackground />
      
      {/* Hero Section */}
      <section className="relative z-10 container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Ganha enquanto aprendes
            </span>
            <br />
            <span className="text-white">a investir nos mercados financeiros</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
            Um ecossistema de educação financeira aplicada que substitui o caos da inexperiência por processos validados e risco controlado.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-[#D2A63C]/50"
            >
              <Link href="https://www.skool.com/morethanmoney" target="_blank" rel="noopener noreferrer">
                <GraduationCap className="w-5 h-5 mr-2" />
                Entrar na Comunidade Skool Gratuitamente
              </Link>
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              className="border-[#D2A63C]/50 text-[#D2A63C] hover:bg-[#D2A63C]/10 font-semibold text-lg px-8 py-6 rounded-xl"
              onClick={() => {
                const element = document.getElementById('realidade-mercado')
                element?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <PlayCircle className="w-5 h-5 mr-2" />
              Saber Mais
            </Button>
          </div>
        </div>
      </section>

      {/* A Realidade do Mercado */}
      <section id="realidade-mercado" className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/50 to-black">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#D2A63C]">
                A Realidade do Mercado
              </h2>
              <p className="text-xl text-gray-300">
                A maioria dos investidores falha porque enfrenta:
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-gray-900/80 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all">
                <CardContent className="p-6">
                  <div className="text-4xl mb-4">📚</div>
                  <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Excesso de Informação</h3>
                  <p className="text-gray-400">
                    Sem estrutura, sem direção clara
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/80 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all">
                <CardContent className="p-6">
                  <div className="text-4xl mb-4">😰</div>
                  <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Decisões Emocionais</h3>
                  <p className="text-gray-400">
                    Medo e ganância dominam as decisões
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-900/80 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all">
                <CardContent className="p-6">
                  <div className="text-4xl mb-4">📖</div>
                  <h3 className="text-xl font-bold text-[#D2A63C] mb-2">Teoria sem Prática</h3>
                  <p className="text-gray-400">
                    Conhecimento que não se traduz em lucro
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="bg-gradient-to-r from-[#D2A63C]/10 to-[#BB8525]/10 border border-[#D2A63C]/30 rounded-xl p-8 text-center">
              <p className="text-2xl font-semibold text-white mb-2">
                O Diagnóstico
              </p>
              <p className="text-xl text-gray-300">
                Não te falta vontade, falta-te o <span className="text-[#D2A63C] font-bold">ambiente certo</span> e um <span className="text-[#D2A63C] font-bold">processo replicável</span>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Porta de Entrada: Comunidade Skool */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-block bg-[#D2A63C]/20 border border-[#D2A63C]/50 rounded-full px-4 py-2 mb-4">
                <span className="text-[#D2A63C] font-semibold">PONTO DE PARTIDA</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
                A Porta de Entrada: Comunidade Skool
              </h2>
              <p className="text-xl text-gray-300">
                O teu ponto de partida <span className="text-[#D2A63C] font-bold">"Freemium"</span>
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <BarChart3 className="w-12 h-12 text-[#D2A63C] mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Básicos do Modelo de Negócio</h3>
                  <p className="text-gray-400">
                    Entende como os mercados funcionam na prática
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <Zap className="w-12 h-12 text-[#D2A63C] mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Ferramentas Profissionais</h3>
                  <p className="text-gray-400">
                    Tecnologia de ponta e condições otimizadas através dos nossos parceiros
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <GraduationCap className="w-12 h-12 text-[#D2A63C] mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Educação Prática</h3>
                  <p className="text-gray-400">
                    Conteúdos em Forex, Cripto e Gestão de Portefólio para aplicação imediata
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* A Escada de Sucesso MTM */}
      <section className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/50 to-black">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                  A Escada de Sucesso MTM
                </span>
              </h2>
              <p className="text-xl text-gray-300">
                O teu roadmap para a liberdade financeira
              </p>
            </div>
            
            {/* Escada Visual */}
            <div className="space-y-8">
              {/* Fase 1 */}
              <div className="flex flex-col md:flex-row items-center gap-6 bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-[#D2A63C]/30 rounded-2xl p-8 hover:border-[#D2A63C]/60 transition-all">
                <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-full flex items-center justify-center text-3xl font-bold text-black">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[#D2A63C] mb-2">Fase 1: Fundamentos</h3>
                  <p className="text-gray-300 text-lg">
                    Explora os conteúdos gratuitos no Skool e domina a psicologia de gestão de risco.
                  </p>
                </div>
                <Brain className="w-16 h-16 text-[#D2A63C]/50 flex-shrink-0" />
              </div>
              
              {/* Fase 2 */}
              <div className="flex flex-col md:flex-row items-center gap-6 bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-[#D2A63C]/30 rounded-2xl p-8 hover:border-[#D2A63C]/60 transition-all">
                <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-full flex items-center justify-center text-3xl font-bold text-black">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[#D2A63C] mb-2">Fase 2: Exposição Real</h3>
                  <p className="text-gray-300 text-lg">
                    Escolhe uma solução de arranque (passiva ou assistida) para começares a operar com capital real enquanto estudas.
                  </p>
                </div>
                <Rocket className="w-16 h-16 text-[#D2A63C]/50 flex-shrink-0" />
              </div>
              
              {/* Fase 3 */}
              <div className="flex flex-col md:flex-row items-center gap-6 bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-[#D2A63C]/30 rounded-2xl p-8 hover:border-[#D2A63C]/60 transition-all">
                <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-full flex items-center justify-center text-3xl font-bold text-black">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[#D2A63C] mb-2">Fase 3: Especialização</h3>
                  <p className="text-gray-300 text-lg">
                    Transita do "copiar" para o "executar", utilizando ferramentas de análise técnica aplicada.
                  </p>
                </div>
                <Target className="w-16 h-16 text-[#D2A63C]/50 flex-shrink-0" />
              </div>
              
              {/* Fase 4 */}
              <div className="flex flex-col md:flex-row items-center gap-6 bg-gradient-to-r from-gray-900/80 to-gray-800/80 border border-[#D2A63C]/30 rounded-2xl p-8 hover:border-[#D2A63C]/60 transition-all">
                <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-full flex items-center justify-center text-3xl font-bold text-black">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[#D2A63C] mb-2">Fase 4: Profissionalização</h3>
                  <p className="text-gray-300 text-lg">
                    Cria o teu próprio negócio de trading e gere portefólios de forma autónoma e consistente.
                  </p>
                </div>
                <Crown className="w-16 h-16 text-[#D2A63C]/50 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Escolhe o Teu Caminho */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                Escolhe o Teu Caminho
              </h2>
              <p className="text-xl text-gray-300">
                Soluções conceptuais adaptadas ao teu perfil
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* Caminho Passivo */}
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-[#D2A63C]/20 rounded-full flex items-center justify-center">
                      <Shield className="w-8 h-8 text-[#D2A63C]" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Caminho Passivo</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-[#D2A63C] font-semibold">Baixo Risco:</span> Portefólios geridos por profissionais onde o teu capital trabalha por ti enquanto observas.
                  </p>
                  <div className="flex items-center text-[#D2A63C] group-hover:translate-x-2 transition-transform">
                    <span className="font-semibold">Saber mais</span>
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </div>
                </CardContent>
              </Card>
              
              {/* Caminho Automático */}
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-[#D2A63C]/20 rounded-full flex items-center justify-center">
                      <Zap className="w-8 h-8 text-[#D2A63C]" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Caminho Automático</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-[#D2A63C] font-semibold">Tech:</span> Utilização de sistemas de inteligência artificial validados para execução sem erros emocionais.
                  </p>
                  <div className="flex items-center text-[#D2A63C] group-hover:translate-x-2 transition-transform">
                    <span className="font-semibold">Saber mais</span>
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </div>
                </CardContent>
              </Card>
              
              {/* Caminho Híbrido */}
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-[#D2A63C]/20 rounded-full flex items-center justify-center">
                      <Users className="w-8 h-8 text-[#D2A63C]" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Caminho Híbrido</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-[#D2A63C] font-semibold">Copy Trading:</span> Replica em tempo real as decisões de educadores globais enquanto aprendes a lógica por trás de cada trade.
                  </p>
                  <div className="flex items-center text-[#D2A63C] group-hover:translate-x-2 transition-transform">
                    <span className="font-semibold">Saber mais</span>
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </div>
                </CardContent>
              </Card>
              
              {/* Caminho Ativo */}
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-[#D2A63C]/30 hover:border-[#D2A63C]/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-[#D2A63C]/20 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-8 h-8 text-[#D2A63C]" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Caminho Ativo</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-[#D2A63C] font-semibold">Execução:</span> Para quem está pronto para assumir o controlo total e testar as suas próprias estratégias num ambiente controlado.
                  </p>
                  <div className="flex items-center text-[#D2A63C] group-hover:translate-x-2 transition-transform">
                    <span className="font-semibold">Saber mais</span>
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* A Diferença MoreThanMoney */}
      <section className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/50 to-black">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                A Diferença <span className="text-[#D2A63C]">MoreThanMoney</span>
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* Nós Não */}
              <Card className="bg-red-900/20 border-red-500/30">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
                    <X className="w-6 h-6" />
                    Nós Não
                  </h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start gap-3">
                      <span className="text-red-400 mt-1">✗</span>
                      <span>Vendemos promessas de dinheiro fácil</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-red-400 mt-1">✗</span>
                      <span>Incentivamos o "overtrading"</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-red-400 mt-1">✗</span>
                      <span>Prometemos resultados sem esforço</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              
              {/* Nós Sim */}
              <Card className="bg-[#D2A63C]/10 border-[#D2A63C]/30">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-bold text-[#D2A63C] mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6" />
                    Nós Sim
                  </h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start gap-3">
                      <span className="text-[#D2A63C] mt-1">✓</span>
                      <span>Exigimos processos e estrutura</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[#D2A63C] mt-1">✓</span>
                      <span>Focamo-nos em educação aplicada</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-[#D2A63C] mt-1">✓</span>
                      <span>Treinamos com capital real para criar experiência</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Vídeo de Apresentação */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
                Conhece a <span className="text-[#D2A63C]">MoreThanMoney</span>
              </h2>
            </div>
            <YouTubeEmbed 
              videoId={videoId}
              title="Apresentação MoreThanMoney"
              className="border border-[#D2A63C]/30 rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative z-10 py-20 bg-gradient-to-b from-black via-[#D2A63C]/10 to-black">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border border-[#D2A63C]/30 rounded-2xl p-12">
              <Sparkles className="w-16 h-16 text-[#D2A63C] mx-auto mb-6" />
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                Não prometemos atalhos.
              </h2>
              <h2 className="text-3xl md:text-5xl font-bold mb-8 text-[#D2A63C]">
                Prometemos estrutura.
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Estás pronto para subir o primeiro degrau?
              </p>
              <Button
                asChild
                size="lg"
                className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:from-[#BB8525] hover:to-[#D2A63C] text-black font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-[#D2A63C]/50"
              >
                <Link href="https://www.skool.com/morethanmoney" target="_blank" rel="noopener noreferrer">
                  <GraduationCap className="w-5 h-5 mr-2" />
                  Quero Aceder ao Skool e Começar Agora
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
