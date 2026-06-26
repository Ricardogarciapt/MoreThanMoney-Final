"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, RefreshCw, Bot, Zap, Shield, Clock, CheckCircle, Smartphone, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import Image from "next/image"

export default function AutomationPage() {
  // Slideshow state for MTM Copy
  const [autoIndex, setAutoIndex] = useState(0)
  const autoImages = [
    "/images/mtm/mtm-copy-1.svg",
    "/images/mtm/mtm-copy-2.svg"
  ]
  
  const nextAutoSlide = () => {
    setAutoIndex((autoIndex + 1) % autoImages.length)
  }
  
  const prevAutoSlide = () => {
    setAutoIndex((autoIndex - 1 + autoImages.length) % autoImages.length)
  }
  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden">
      <ParticleBackground />
      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Tecnologia que Liberta
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-4xl mx-auto mb-8">
            O acesso ao <span className="text-[#D2A63C] font-semibold">MTMcopier</span> — copia as estratégias da MoreThanMoney na tua conta, com controlo total ou 100% automático.
          </p>
        </div>

        {/* Tap to Trade MTM Section - Azul Escuro */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Visual - Horizontal Card - Destaque Principal */}
            <div className="relative order-2 md:order-1">
              <Card className="card-clean hover-lift bg-gradient-to-br from-blue-900/40 via-mtm-primary/10 to-cyan-900/40 border-2 border-blue-500/30 rounded-3xl p-6 shadow-2xl">
                <div className="bg-gray-900 rounded-2xl p-3 border border-gray-700/50">
                  {/* Horizontal Image - Mostrar completa */}
                  <div className="relative w-full" style={{ minHeight: '300px' }}>
                    <Image
                      src="/images/mtm/tap-to-trade-mtm.svg"
                      alt="Tap to Trade MTM"
                      width={1000}
                      height={600}
                      className="w-full h-auto rounded-lg object-contain"
                      unoptimized
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Text Content - Simplificado */}
            <div className="space-y-6 order-1 md:order-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-600/30 via-mtm-primary/20 to-cyan-600/30 rounded-xl p-4 border-2 border-blue-500/50">
                  <RefreshCw className="w-12 h-12 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">
                    Tap to Trade MTM
                  </h2>
                  <p className="text-xl text-blue-400 font-semibold">
                    Mantém-te ligado em Tempo Real
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-600/20 via-mtm-primary/10 to-cyan-600/20 border-2 border-blue-500/30 rounded-xl p-6">
                <h3 className="text-xl font-bold text-blue-400 mb-3">Sistema "Receive → Review → Confirm"</h3>
                <p className="text-gray-300">
                  Manténs sempre o controlo final de cada decisão. Execução manual de ideias de mercado em tempo real.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="/app-mobile?tab=tap-to-trade&setup=1" className="flex-1">
                  <Button className="w-full bg-gradient-to-r from-blue-600 via-mtm-primary to-cyan-600 hover:from-blue-500 hover:via-mtm-primary hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                    <Smartphone className="w-5 h-5 mr-2" />
                    Ativar Tap to Trade MTM
                  </Button>
                </Link>
                <Link href="/scanner-access" className="flex-1">
                  <Button variant="outline" className="w-full border-2 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300">
                    Ver Scanner ao Vivo
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="max-w-4xl mx-auto mb-20">
          <div className="h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
        </div>

        {/* MTM Copy Section - Roxo/Púrpura */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Visual - Slideshow Horizontal - Destaque Principal */}
            <div className="relative order-2 md:order-1">
              <Card className="card-clean hover-lift bg-gradient-to-br from-purple-900/40 via-mtm-primary/10 to-pink-900/40 border-2 border-purple-500/30 rounded-3xl p-6 shadow-2xl">
                <div className="bg-gray-900 rounded-2xl p-3 border border-gray-700/50 relative group">
                  {/* Horizontal Slideshow - Mostrar imagens completas */}
                  <div className="relative w-full" style={{ minHeight: '300px' }}>
                    <Image
                      src={autoImages[autoIndex]}
                      alt={`MTM Copy ${autoIndex + 1}`}
                      width={1000}
                      height={600}
                      className="w-full h-auto rounded-lg object-contain transition-opacity duration-500"
                      unoptimized
                    />
                    {/* Navigation Arrows */}
                    {autoImages.length > 1 && (
                      <>
                        <button
                          onClick={prevAutoSlide}
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 rounded-full p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                          <ChevronLeft className="w-5 h-5 text-white" />
                        </button>
                        <button
                          onClick={nextAutoSlide}
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 rounded-full p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        >
                          <ChevronRight className="w-5 h-5 text-white" />
                        </button>
                        {/* Dots Indicator */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                          {autoImages.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => setAutoIndex(idx)}
                              className={`w-2 h-2 rounded-full transition-all ${
                                idx === autoIndex ? 'bg-purple-400 w-6' : 'bg-gray-600'
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Text Content - Simplificado */}
            <div className="space-y-6 order-1 md:order-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-gradient-to-br from-purple-600/30 via-mtm-primary/20 to-pink-600/30 rounded-xl p-4 border-2 border-purple-500/50">
                  <Bot className="w-12 h-12 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">
                    MTM Copy
                  </h2>
                  <p className="text-xl text-purple-400 font-semibold">
                    A Revolução da Automação
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-600/20 via-mtm-primary/10 to-pink-600/20 border-2 border-purple-500/30 rounded-xl p-6">
                <h3 className="text-2xl font-bold text-purple-400 mb-3">Set-it-once experience</h3>
                <p className="text-gray-300 leading-relaxed mb-4">
                  Fique conectado a estratégias de trading com uma experiência de configuração única que mantém a sua conta alinhada em segundo plano.
                </p>
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mt-4">
                  <p className="text-sm text-gray-300">
                    <span className="text-purple-400 font-semibold">Add-on MTM Copy:</span>{" "}
                    <span className="text-white font-bold text-lg">+20€</span>
                    <span className="text-gray-400 text-sm ml-2">/mês</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="/mtmcopy" className="flex-1">
                  <Button className="w-full bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:via-mtm-primary hover:to-pink-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                    <Bot className="w-5 h-5 mr-2" />
                    Ativar MTM Copy
                  </Button>
                </Link>
                <Link href="https://wa.me/message/5NMUP53HEXVMB1" target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full border-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10 font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300">
                    Saber Mais
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Section */}
        <div className="max-w-6xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-12 text-center">
            Qual é a <span className="bg-gradient-to-r from-blue-400 via-mtm-primary to-purple-400 bg-clip-text text-transparent">Diferença?</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Tap to Trade MTM Card */}
            <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border-2 border-blue-500/30 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <RefreshCw className="w-10 h-10 text-blue-400" />
                  <h3 className="text-2xl font-bold text-white">Tap to Trade MTM</h3>
                </div>
                <div className="space-y-4 text-gray-300">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">Tempo Real:</strong> Recebe ideias de mercado instantaneamente
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">Controlo Total:</strong> Review e confirma cada operação
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">Execução Manual:</strong> Decides quando e como executar
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-blue-500/30">
                  <p className="text-sm text-blue-400 font-semibold">Ideal para traders que querem manter controlo total</p>
                </div>
              </CardContent>
            </Card>

            {/* MTM Copy Card */}
            <Card className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <Bot className="w-10 h-10 text-purple-400" />
                  <h3 className="text-2xl font-bold text-white">MTM Copy</h3>
                </div>
                <div className="space-y-4 text-gray-300">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">24/7 Automático:</strong> Funciona em segundo plano continuamente
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">SafeGuard:</strong> Proteção automática de risco e capital
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div>
                      <strong className="text-white">Set-it-once:</strong> Configura uma vez e esquece
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-purple-500/30">
                  <p className="text-sm text-purple-400 font-semibold">Ideal para traders que querem automação total</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Final */}
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border-2 border-mtm-primary/30 rounded-2xl p-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Pronto para <span className="text-mtm-primary">Elevar</span> o Teu Trading?
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Escolhe a solução que melhor se adapta ao teu estilo de trading e começa hoje mesmo.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/app-mobile?tab=tap-to-trade&setup=1">
                <Button className="bg-gradient-to-r from-blue-600 via-mtm-primary to-cyan-600 hover:from-blue-500 hover:via-mtm-primary hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Experimentar Tap to Trade MTM
                </Button>
              </Link>
              <Link href="/mtmcopy">
                <Button className="bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:via-mtm-primary hover:to-pink-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <Bot className="w-5 h-5 mr-2" />
                  Ativar MTM Copy
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
