"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
  X,
  Copy,
  Bot,
  RefreshCw,
  Star,
  Award,
  LayoutList,
} from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"

const MTM_SECTION_NAV = [
  { id: "mtm-top", label: "Início" },
  { id: "mtm-diagnostico", label: "Diagnóstico" },
  { id: "mtm-ecossistema", label: "Ecossistema" },
  { id: "mtm-escada", label: "Escada" },
  { id: "mtm-solucoes", label: "Soluções" },
  { id: "mtm-modelo", label: "Modelo" },
  { id: "mtm-precos", label: "Preços" },
  { id: "mtm-porque", label: "Porquê MTM" },
  { id: "mtm-faq", label: "FAQ" },
] as const

type MtmExtraLink = { id: string; title: string; url: string }

export default function MTMLandingPage() {
  const [mounted, setMounted] = useState(false)
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false)
  const [presentationVideoId, setPresentationVideoId] = useState("hKAQ72MsAwU") // Fallback
  const [mtmPageLinks, setMtmPageLinks] = useState<MtmExtraLink[]>([])
  
  // URLs estáveis para imagens MTM (evitam problemas com acentos/espaços nos ficheiros)
  const getMtmImageUrl = (name: keyof typeof DEFAULT_MTM_IMAGES) =>
    `/api/mtm-image?name=${name}`

  const getImageUrl = (pathOrUrl: string) => {
    if (!pathOrUrl) return getMtmImageUrl('problema')
    if (pathOrUrl.startsWith('http')) return pathOrUrl
    if (pathOrUrl.startsWith('/api/mtm-image')) return pathOrUrl
    if (!pathOrUrl.startsWith('/')) pathOrUrl = '/' + pathOrUrl
    return encodeURI(pathOrUrl)
  }

  const DEFAULT_MTM_IMAGES = {
    problema: 'problema',
    ecossistema: 'ecossistema',
    estrategia1: 'estrategia1',
    estrategia2: 'estrategia2',
    escolhaCaminho: 'escolhaCaminho',
    diferenca: 'diferenca'
  } as const

  const [images, setImages] = useState<Record<string, string>>({
    problema: getMtmImageUrl('problema'),
    ecossistema: getMtmImageUrl('ecossistema'),
    estrategia1: getMtmImageUrl('estrategia1'),
    estrategia2: getMtmImageUrl('estrategia2'),
    escolhaCaminho: getMtmImageUrl('escolhaCaminho'),
    diferenca: getMtmImageUrl('diferenca')
  })

  useEffect(() => {
    setMounted(true)
    loadContentConfig()
  }, [])

  useEffect(() => {
    if (!isVideoModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsVideoModalOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isVideoModalOpen])

  const loadContentConfig = async () => {
    try {
      const response = await fetch("/api/admin/content-config")
      if (!response.ok) return

      let data: Record<string, unknown>
      try {
        data = await response.json()
      } catch {
        return
      }
      if (!data || typeof data !== "object") return

      // Links configuráveis para /mtm (admin content-config)
      const rawLinks = Array.isArray(data.links) ? data.links : []
      const forPage: MtmExtraLink[] = rawLinks
        .filter(
          (l: any) =>
            l &&
            typeof l === "object" &&
            l.page === "/mtm" &&
            typeof l.url === "string" &&
            l.url.trim() &&
            typeof l.title === "string" &&
            l.title.trim()
        )
        .map((l: any) => ({
          id: String(l.id || l.url),
          title: String(l.title).trim(),
          url: String(l.url).trim(),
        }))
      setMtmPageLinks(forPage)

      // Carregar vídeo
      const videos = Array.isArray(data.videos) ? data.videos : []
      const mtmVideo = videos.find(
        (video: any) => video?.page === "/mtm" && video?.section === "Video Modal"
      )
      if (mtmVideo?.videoId) {
        setPresentationVideoId(String(mtmVideo.videoId))
      }

      // Carregar imagens
      const mtmImages = (Array.isArray(data.images) ? data.images : []).filter(
        (img: any) => img?.page === "/mtm"
      )
      const imageMap: Record<string, string> = {}
      let estrategiaCount = 0

      mtmImages.forEach((img: any) => {
        let url =
          img.url && img.url.startsWith("http") ? img.url : img.url || ""

        if (url && !url.startsWith("http") && !url.startsWith("/")) {
          url = "/" + url
        }

        if (img.section === "O Diagnóstico") {
          imageMap.problema = url || getMtmImageUrl("problema")
        } else if (img.section === "EARN WHILE YOU LEARN") {
          imageMap.ecossistema = url || getMtmImageUrl("ecossistema")
        } else if (img.section === "A Escada do Sucesso") {
          estrategiaCount++
          const titleLower = (img.title || "").toLowerCase()
          const idLower = (img.id || "").toLowerCase()
          const urlLower = (url || "").toLowerCase()
          if (
            titleLower.includes("parte 1") ||
            titleLower.includes("1") ||
            idLower.includes("estrategia-1") ||
            idLower.includes("1png") ||
            urlLower.includes("1png") ||
            urlLower.includes("estrategia. image 1png")
          ) {
            imageMap.estrategia1 = url || getMtmImageUrl("estrategia1")
          } else if (
            titleLower.includes("parte 2") ||
            titleLower.includes("2") ||
            idLower.includes("estrategia-2") ||
            idLower.includes("image 2") ||
            urlLower.includes("image 2") ||
            urlLower.includes("a estratégia image 2")
          ) {
            imageMap.estrategia2 = url || getMtmImageUrl("estrategia2")
          } else if (estrategiaCount === 1) {
            imageMap.estrategia1 = url || getMtmImageUrl("estrategia1")
          } else if (estrategiaCount === 2) {
            imageMap.estrategia2 = url || getMtmImageUrl("estrategia2")
          }
        } else if (img.section === "As Soluções Tecnológicas") {
          imageMap.escolhaCaminho = url || getMtmImageUrl("escolhaCaminho")
        } else if (img.section === "O Modelo de Negócio") {
          imageMap.diferenca = url || getMtmImageUrl("diferenca")
        }
      })
      if (!imageMap.estrategia1) imageMap.estrategia1 = getMtmImageUrl("estrategia1")
      if (!imageMap.estrategia2) imageMap.estrategia2 = getMtmImageUrl("estrategia2")

      if (Object.keys(imageMap).length > 0) {
        setImages((prev) => ({ ...prev, ...imageMap }))
      }
    } catch (error) {
      console.error('Erro ao carregar configuração de conteúdo:', error)
    }
  }

  const openVideoModal = () => setIsVideoModalOpen(true)
  const closeVideoModal = () => setIsVideoModalOpen(false)

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
    <main id="mtm-top" className="min-h-screen bg-black text-white relative overflow-hidden scroll-pt-20">
      <ParticleBackground />

      <nav
        aria-label="Navegação por secções"
        className="relative z-20 sticky top-0 border-b border-purple-500/25 bg-black/85 backdrop-blur-md"
      >
        <div className="container mx-auto px-3 py-2 flex items-center gap-2 overflow-x-auto">
          <LayoutList className="w-4 h-4 text-purple-400 shrink-0 hidden sm:block" aria-hidden />
          {MTM_SECTION_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 rounded-full border border-purple-500/35 bg-gray-900/90 px-3 py-1.5 text-xs font-medium text-gray-200 hover:border-purple-400/60 hover:text-white transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Hero Section - Estética MoreThanMoney */}
      <section className="relative z-10 container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-6xl mx-auto text-center">
          {/* Logo MTM no centro */}
          <div className="mb-8 flex justify-center">
            <div className="relative w-32 h-32 md:w-40 md:h-40">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-cyan-600/20 rounded-full blur-2xl"></div>
              <div className="relative w-full h-full bg-gradient-to-br from-blue-900/40 via-purple-900/40 to-cyan-900/40 border-2 border-blue-500/30 rounded-full flex items-center justify-center">
                <span className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  MTM
                </span>
              </div>
            </div>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Não é sobre ter mais dinheiro.
            </span>
            <br />
            <span className="text-white">É sobre ter a estrutura para o manter.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-4xl mx-auto leading-relaxed">
            Ganha enquanto aprendes a investir nos mercados financeiros. Um ecossistema de educação aplicada, integrado com tecnologia de IA e risco controlado desde o primeiro dia.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-500 hover:via-purple-500 hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50 border-2 border-purple-400/30"
            >
              <Link href="https://www.skool.com/morethanmoney-1132/about" target="_blank" rel="noopener noreferrer">
                <Sparkles className="w-5 h-5 mr-2" />
                Entrar na nossa Plataforma de Ensino
              </Link>
            </Button>
            
            <Button
              size="lg"
              variant="outline"
              onClick={openVideoModal}
              className="border-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10 font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105"
            >
              <PlayCircle className="w-5 h-5 mr-2" />
              Ver Apresentação
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-gray-400">
            <Link href="/new-landing" className="text-purple-300 hover:text-white transition-colors">
              Site principal
            </Link>
            <span className="text-gray-600 hidden sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/register" className="text-purple-300 hover:text-white transition-colors">
              Criar conta
            </Link>
            <span className="text-gray-600 hidden sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/live-sessions" className="text-purple-300 hover:text-white transition-colors">
              Lives e academia
            </Link>
            <span className="text-gray-600 hidden sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/docs" className="text-purple-300 hover:text-white transition-colors">
              Documentos
            </Link>
          </div>

          {mtmPageLinks.length > 0 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
              {mtmPageLinks.map((link) =>
                link.url.startsWith("/") ? (
                  <Button
                    key={link.id}
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-purple-500/40 text-purple-200 hover:bg-purple-500/10"
                  >
                    <Link href={link.url}>{link.title}</Link>
                  </Button>
                ) : (
                  <Button
                    key={link.id}
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-purple-500/40 text-purple-200 hover:bg-purple-500/10"
                  >
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.title}
                    </a>
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      </section>

      {/* O Diagnóstico - Usando imagem Problema.png */}
      <section
        id="mtm-diagnostico"
        className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/50 to-black scroll-mt-20"
      >
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  O problema não é a tua falta de vontade.
                </span>
              </h2>
            </div>
            
            {/* Imagem do Problema */}
            <div className="mb-12 flex justify-center">
              <div className="relative max-w-4xl w-full">
                <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all">
                  <img
                    src={getImageUrl(images.problema)}
                    alt="O Problema"
                    className="w-full h-auto rounded-lg"
                    loading="lazy"
                    onError={(e) => {
                      const fallback = getMtmImageUrl('problema')
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                    }}
                  />
                </Card>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-2 border-blue-500/30 hover:border-blue-500/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <div className="text-4xl mb-4">📚</div>
                  <h3 className="text-xl font-bold text-blue-400 mb-2">Informação a mais, estrutura a menos</h3>
                  <p className="text-gray-300">
                    Perdidos no ruído do mercado
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/40 border-2 border-purple-500/30 hover:border-purple-500/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <div className="text-4xl mb-4">😰</div>
                  <h3 className="text-xl font-bold text-purple-400 mb-2">Emoções a mais, controlo a menos</h3>
                  <p className="text-gray-300">
                    O trading emocional destrói o capital
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/40 border-2 border-cyan-500/30 hover:border-cyan-500/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <div className="text-4xl mb-4">📖</div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-2">Teoria sem prática</h3>
                  <p className="text-gray-300">
                    Aprende-se muito, mas perde-se dinheiro na execução
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-cyan-600/20 border-2 border-purple-500/30 rounded-xl p-8 text-center">
              <p className="text-2xl font-semibold text-white mb-2">
                A Solução
              </p>
              <p className="text-xl text-gray-300">
                A <span className="text-[#D2A63C] font-bold">MoreThanMoney</span> reúne <span className="text-cyan-400 font-bold">educação, comunidade e tecnologia</span> num só ecossistema, criando a ponte entre a teoria e a profissionalização.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* O Conceito: EARN WHILE YOU LEARN - Usando imagem Ecossistema.png */}
      <section id="mtm-ecossistema" className="relative z-10 py-20 scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Tu estudas, o Ecossistema trabalha.
                </span>
              </h2>
            </div>

            {/* Imagem do Ecossistema */}
            <div className="mb-12 flex justify-center">
              <div className="relative max-w-5xl w-full">
                <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all">
                  <img
                    src={getImageUrl(images.ecossistema)}
                    alt="O Ecossistema"
                    className="w-full h-auto rounded-lg"
                    loading="lazy"
                    onError={(e) => {
                      const fallback = getMtmImageUrl('ecossistema')
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                    }}
                  />
                </Card>
              </div>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-2 border-blue-500/30 hover:border-blue-500/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <Shield className="w-12 h-12 text-blue-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Redução de Decisões Impulsivas</h3>
                  <p className="text-gray-300">
                    O sistema protege o teu capital das tuas emoções
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/40 border-2 border-purple-500/30 hover:border-purple-500/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <Rocket className="w-12 h-12 text-purple-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Exposição Real</h3>
                  <p className="text-gray-300">
                    Estar no mercado desde o Dia 1 com sistemas validados
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/40 border-2 border-cyan-500/30 hover:border-cyan-500/60 transition-all hover:scale-105">
                <CardContent className="p-6">
                  <GraduationCap className="w-12 h-12 text-cyan-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Educação Premium</h3>
                  <p className="text-gray-300">
                    Acesso a 100+ cursos que mudam a tua mentalidade financeira
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* A Escada do Sucesso - Usando imagem Estratégia.png */}
      <section
        id="mtm-escada"
        className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/50 to-black scroll-mt-20"
      >
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  A Escada do Sucesso
                </span>
              </h2>
              <p className="text-xl text-gray-300">
                O roadmap para profissionalização
              </p>
            </div>

            {/* Imagens da Estratégia - 2 imagens */}
            <div className="mb-12 space-y-6">
              <div className="flex justify-center">
                <div className="relative max-w-5xl w-full">
                  <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all">
                    <img
                      src={getImageUrl(images.estrategia1)}
                      alt="A Escada do Sucesso - Parte 1"
                      className="w-full h-auto rounded-lg"
                      loading="lazy"
                      onError={(e) => {
                        const fallback = getMtmImageUrl('estrategia1')
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                      }}
                    />
                  </Card>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="relative max-w-5xl w-full">
                  <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all">
                    <img
                      src={getImageUrl(images.estrategia2)}
                      alt="A Escada do Sucesso - Parte 2"
                      className="w-full h-auto rounded-lg"
                      loading="lazy"
                      onError={(e) => {
                        const fallback = getMtmImageUrl('estrategia2')
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                      }}
                    />
                  </Card>
                </div>
              </div>
            </div>
            
            {/* Fases */}
            <div className="space-y-6">
              <Card className="bg-gradient-to-r from-blue-900/40 via-purple-900/40 to-cyan-900/40 border-2 border-blue-500/30 rounded-2xl p-8 hover:border-blue-500/60 transition-all">
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-3xl font-bold text-white border-2 border-blue-400/50">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-blue-400 mb-2">Fase 1: Fundamentos (Skool)</h3>
                    <p className="text-gray-300 text-lg">
                      Domina a psicologia, a gestão de ordens e a filosofia MTM.
                    </p>
                  </div>
                  <Brain className="w-16 h-16 text-blue-400/50 flex-shrink-0" />
                </div>
              </Card>
              
              <Card className="bg-gradient-to-r from-blue-900/40 via-purple-900/40 to-cyan-900/40 border-2 border-purple-500/30 rounded-2xl p-8 hover:border-purple-500/60 transition-all">
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-3xl font-bold text-white border-2 border-purple-400/50">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-purple-400 mb-2">Fase 2: Bootcamp Prático</h3>
                    <p className="text-gray-300 text-lg">
                      Aprende análise técnica aplicada e identificação de liquidez com os scanners de IA da MoreThanMoney.
                    </p>
                  </div>
                  <Rocket className="w-16 h-16 text-purple-400/50 flex-shrink-0" />
                </div>
              </Card>
              
              <Card className="bg-gradient-to-r from-blue-900/40 via-purple-900/40 to-cyan-900/40 border-2 border-cyan-500/30 rounded-2xl p-8 hover:border-cyan-500/60 transition-all">
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-3xl font-bold text-white border-2 border-cyan-400/50">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-cyan-400 mb-2">Fase 3: Desenvolvimento Profissional</h3>
                    <p className="text-gray-300 text-lg">
                      Constrói portefólios diversificados e aprende a criar o teu próprio negócio de trading.
                    </p>
                  </div>
                  <Crown className="w-16 h-16 text-cyan-400/50 flex-shrink-0" />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* As Soluções Tecnológicas - Usando imagem Escolha de Caminho.png */}
      <section className="relative z-10 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                As Soluções Tecnológicas
              </h2>
              <p className="text-xl text-gray-300">
                O coração do ecossistema
              </p>
            </div>

            {/* Imagem da Escolha de Caminho */}
            <div className="mb-12 flex justify-center">
              <div className="relative max-w-5xl w-full">
                <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all">
                  <img
                    src={getImageUrl(images.escolhaCaminho)}
                    alt="Escolhe o Teu Caminho"
                    className="w-full h-auto rounded-lg"
                    loading="lazy"
                    onError={(e) => {
                      const fallback = getMtmImageUrl('escolhaCaminho')
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                    }}
                  />
                </Card>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-2 border-blue-500/30 hover:border-blue-500/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-600/30 to-blue-800/30 rounded-full flex items-center justify-center border-2 border-blue-500/50">
                      <Shield className="w-8 h-8 text-blue-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Solução 1: Gestão Passiva</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-blue-400 font-semibold">Iniciantes:</span> Portefólios geridos por profissionais para quem quer crescimento consistente sem esforço técnico.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/40 border-2 border-purple-500/30 hover:border-purple-500/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-purple-800/30 rounded-full flex items-center justify-center border-2 border-purple-500/50">
                      <Bot className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Solução 2: Automação Total</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-purple-400 font-semibold">IQAuto e Syphon AI:</span> Tecnologia de ponta com execução "Set-it-once", eliminando o erro humano.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/40 border-2 border-cyan-500/30 hover:border-cyan-500/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-600/30 to-cyan-800/30 rounded-full flex items-center justify-center border-2 border-cyan-500/50">
                      <Copy className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Solução 3: Modelo Híbrido</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-cyan-400 font-semibold">Copy Trading:</span> Replica as decisões de 30+ educadores globais enquanto entendes a lógica por trás de cada estratégia.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-blue-900/40 via-purple-900/40 to-cyan-900/40 border-2 border-purple-500/30 hover:border-purple-500/60 transition-all hover:scale-105 group">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-600/30 via-purple-600/30 to-cyan-600/30 rounded-full flex items-center justify-center border-2 border-purple-500/50">
                      <TrendingUp className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Solução 4: Execução Ativa</h3>
                  </div>
                  <p className="text-gray-300 mb-4 text-lg">
                    <span className="text-purple-400 font-semibold">Controlo Total:</span> O ambiente ideal para começares a testar as tuas próprias estratégias com baixo capital.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* O Modelo de Negócio - Usando imagem Diferença.png */}
      <section
        id="mtm-modelo"
        className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/50 to-black scroll-mt-20"
      >
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Eleva-te mais que o normal.
                </span>
              </h2>
            </div>

            {/* Imagem da Diferença */}
            <div className="mb-12 flex justify-center">
              <div className="relative max-w-5xl w-full">
                <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/60 transition-all">
                  <img
                    src={getImageUrl(images.diferenca)}
                    alt="A Diferença"
                    className="w-full h-auto rounded-lg"
                    loading="lazy"
                    onError={(e) => {
                      const fallback = getMtmImageUrl('diferenca')
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                    }}
                  />
                </Card>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-cyan-600/20 border-2 border-purple-500/30 rounded-xl p-8">
              <p className="text-xl text-gray-300 mb-4 text-center">
                Na <span className="text-[#D2A63C] font-bold">MoreThanMoney</span>, acreditamos na <span className="text-purple-400 font-bold">elevação</span>. Além de investidor, podes tornar-te um embaixador do ecossistema.
              </p>
              <p className="text-xl text-gray-300 mb-4 text-center">
                A Jornada: Começa como um aluno, torna-te um <span className="text-cyan-400 font-bold">Rising Star</span> e constrói uma fonte de rendimento residual ajudando outros a atingirem a liberdade financeira.
              </p>
              <p className="text-2xl font-semibold text-white text-center">
                "O dinheiro é uma ferramenta; o verdadeiro ativo é quem te tornas no processo."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Planos Skool MTM */}
      <section id="mtm-precos" className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/40 to-black scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                Preços do <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Skool MTM</span>
              </h2>
              <p className="text-gray-300 text-lg">Escolhe o plano ideal para a tua fase.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/80 border border-gray-700/70">
                <CardContent className="p-7">
                  <p className="text-3xl font-extrabold text-white">$5<span className="text-base font-medium text-gray-400">/month</span></p>
                  <p className="mt-1 text-xl font-semibold text-blue-300">Standard</p>
                  <ul className="mt-5 space-y-2 text-sm text-gray-200">
                    <li>Acesso a Curso Iniciante de Fast Start</li>
                    <li>Acesso a um Scanner de Mercado - Vitalicio</li>
                    <li>Acesso a Telegram de Ideias Manuais</li>
                    <li>Acesso a Chamadas de Sistema, executando Chamadas Educativas</li>
                    <li>Acesso as nossas parceiras de Mercado</li>
                  </ul>
                  <Button asChild className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold">
                    <Link href="https://www.skool.com/morethanmoney-1132/about" target="_blank" rel="noopener noreferrer">
                      JOIN STANDARD
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-900/60 to-gray-900/80 border-2 border-purple-500/50 shadow-[0_0_40px_rgba(139,92,246,0.2)]">
                <CardContent className="p-7">
                  <p className="text-3xl font-extrabold text-white">$65<span className="text-base font-medium text-gray-300">/month</span></p>
                  <p className="mt-1 text-xl font-semibold text-purple-300">Premium</p>
                  <ul className="mt-5 space-y-2 text-sm text-gray-100">
                    <li>Acesso ao Curso de Forex e CriptoMoedas da MoreThanMoney</li>
                    <li>Acesso a MTM Auto (1 Estrategia Apenas)</li>
                    <li>Acesso a App da MTM</li>
                    <li>Acesso ao Site da MoreThanMoney e suas aplicacoes</li>
                    <li>Acesso ao Copytrading da MTM - PAMM ou Conta Individual</li>
                    <li>Acesso aos Anteriores</li>
                  </ul>
                  <Button asChild className="mt-6 w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold">
                    <Link href="https://www.skool.com/morethanmoney-1132/about" target="_blank" rel="noopener noreferrer">
                      JOIN PREMIUM
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-cyan-900/60 to-gray-900/80 border border-cyan-500/50">
                <CardContent className="p-7">
                  <p className="text-3xl font-extrabold text-white">$2,400<span className="text-base font-medium text-gray-300">/year</span></p>
                  <p className="mt-1 text-xl font-semibold text-cyan-300">VIP</p>
                  <ul className="mt-5 space-y-2 text-sm text-gray-100">
                    <li>Acesso aos anteriores</li>
                    <li>Acesso a todos os Cursos da MoreThanMoney</li>
                    <li>Acesso aos Scanners da MoreThanMoney</li>
                    <li>Acesso a todas as estrategias da MTM</li>
                    <li>Acesso ao Provedor do nosso Hedge FUND</li>
                  </ul>
                  <Button asChild className="mt-6 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
                    <Link href="https://www.skool.com/morethanmoney-1132/about" target="_blank" rel="noopener noreferrer">
                      JOIN VIP
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Porquê a MTM? */}
      <section id="mtm-porque" className="relative z-10 py-20 scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                Porquê a <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">MTM</span>?
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              {/* Nós Não */}
              <Card className="bg-gradient-to-br from-red-900/40 to-red-800/40 border-2 border-red-500/30">
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
                  </ul>
                </CardContent>
              </Card>
              
              {/* Nós Sim */}
              <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/40 border-2 border-purple-500/30">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-bold text-purple-400 mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6" />
                    Nós Sim
                  </h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-1">✓</span>
                      <span>Focamo-nos em estrutura</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-1">✓</span>
                      <span>Exigimos processos</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-purple-400 mt-1">✓</span>
                      <span>Treinamos com capital real para criar experiência</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="mtm-faq"
        className="relative z-10 py-20 bg-gradient-to-b from-black via-gray-900/40 to-black scroll-mt-20"
      >
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
                Perguntas frequentes
              </h2>
              <p className="text-gray-400 text-sm md:text-base">
                Esclarecimentos sobre a jornada MTM e o ecossistema.
              </p>
            </div>
            <Accordion type="single" collapsible className="rounded-2xl border border-purple-500/25 bg-gray-900/50 px-4">
              <AccordionItem value="q1" className="border-purple-500/20">
                <AccordionTrigger className="text-left text-white hover:no-underline">
                  O que é o ecossistema MoreThanMoney?
                </AccordionTrigger>
                <AccordionContent className="text-gray-300 text-sm leading-relaxed">
                  A MoreThanMoney reúne o braço educacional e de comunidade (Skool, estrutura, processo) e a infraestrutura
                  de execução e tecnologia — scanners de IA, MTMcopier e app — onde aplicas o que aprendes. Juntos fecham o
                  ciclo: estudar com método e operar com ferramentas profissionais.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q2" className="border-purple-500/20">
                <AccordionTrigger className="text-left text-white hover:no-underline">
                  Preciso de experiência prévia em trading?
                </AccordionTrigger>
                <AccordionContent className="text-gray-300 text-sm leading-relaxed">
                  Não é obrigatório. O percurso começa por fundamentos e disciplina; a complexidade aumenta à medida que
                  consolidas prática. O foco é processo e gestão de risco, não promessas de retorno.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q3" className="border-purple-500/20">
                <AccordionTrigger className="text-left text-white hover:no-underline">
                  Como acedo à comunidade Skool?
                </AccordionTrigger>
                <AccordionContent className="text-gray-300 text-sm leading-relaxed">
                  Usa o botão &quot;Entrar na nossa Plataforma de Ensino&quot; nesta página — leva-te ao Skool oficial da
                  MoreThanMoney. Lá tens o conteúdo estruturado e acompanhamento da comunidade.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q4" className="border-purple-500/20">
                <AccordionTrigger className="text-left text-white hover:no-underline">
                  Há formação ao vivo?
                </AccordionTrigger>
                <AccordionContent className="text-gray-300 text-sm leading-relaxed">
                  Sim. No site podes aceder a{" "}
                  <Link href="/live-sessions" className="text-purple-400 hover:underline">
                    Lives e academia
                  </Link>{" "}
                  para sessões e canais quando estiverem disponíveis.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative z-10 py-20 bg-gradient-to-b from-black via-purple-900/20 to-black">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-gradient-to-br from-gray-900/90 via-purple-900/40 to-gray-800/90 border-2 border-purple-500/30 rounded-2xl p-12">
              <Sparkles className="w-16 h-16 text-purple-400 mx-auto mb-6" />
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
                Estás pronto para subir o primeiro degrau?
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Não prometemos atalhos. Prometemos estrutura.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-500 hover:via-purple-500 hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50 border-2 border-purple-400/30"
                >
                  <Link href="https://www.skool.com/morethanmoney-1132/about" target="_blank" rel="noopener noreferrer">
                    <GraduationCap className="w-5 h-5 mr-2" />
                    Quero Aceder ao Skool e Começar a Minha Jornada
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-2 border-[#D2A63C]/50 text-[#D2A63C] hover:bg-[#D2A63C]/10 font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300"
                >
                  <Link href="/mtmcopy">
                    <Star className="w-5 h-5 mr-2" />
                    Quero o MTMcopier
                  </Link>
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-8">
                * A participação não garante sucesso financeiro; resultados dependem do esforço pessoal e condições de mercado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de Vídeo de Apresentação */}
      {isVideoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mtm-video-modal-title"
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={closeVideoModal}
        >
          <div 
            className="relative w-full max-w-5xl bg-black rounded-lg overflow-hidden border-2 border-purple-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeVideoModal}
              className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white transition-colors"
              style={{ zIndex: 100 }}
            >
              <X className="w-6 h-6" />
            </button>
            <div className="p-4">
              <h3 id="mtm-video-modal-title" className="text-2xl font-bold text-white mb-4 text-center">
                Apresentação MoreThanMoney
              </h3>
              <YouTubeEmbed 
                videoId={presentationVideoId}
                title="Apresentação MoreThanMoney"
                autoplay={true}
                className="border border-purple-500/30"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
