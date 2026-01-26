"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Smartphone, Zap, Clock, Shield, Target, Users, TrendingUp, Download, Play, Apple, X, RefreshCw, CheckCircle, Bell } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"
import Image from "next/image"

export default function SwipeToTradePage() {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false)

  const openVideoModal = () => setIsVideoModalOpen(true)
  const closeVideoModal = () => setIsVideoModalOpen(false)
  return (
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Hero Section - Foco no IQ SYNC */}
        <div className="max-w-7xl mx-auto mb-16">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="text-2xl font-bold text-blue-400">iQ</span>
              <h1 className="text-5xl md:text-7xl font-bold">
                <span className="bg-gradient-to-r from-green-400 via-mtm-primary to-emerald-400 bg-clip-text text-transparent">IQ SYNC</span>
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto mb-4">
              Aceite ideias de trading em dois minutos e deixe o Educador gerir tudo automaticamente.
            </p>
            <p className="text-2xl text-mtm-primary font-semibold mb-8">
              Ganhe enquanto aprende!
            </p>
          </div>

          {/* Visual - Horizontal Card with IQ Sync Interface */}
          <div className="max-w-4xl mx-auto mb-12">
            <Card className="card-clean hover-lift bg-gradient-to-br from-green-600/20 via-mtm-primary/10 to-emerald-600/20 border-2 border-mtm-primary/50 rounded-3xl p-8 shadow-2xl">
              <div className="relative">
                {/* Badge de destaque */}
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-mtm-primary to-emerald-500 text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                    IQ Sync
                  </div>
                </div>
                
                {/* Horizontal Image Frame */}
                <div className="bg-gradient-to-br from-gray-900/90 to-black rounded-2xl p-4 shadow-inner border border-mtm-primary/30">
                  <div className="bg-gradient-to-br from-blue-950/50 to-cyan-950/50 rounded-xl overflow-hidden border-2 border-blue-500/40">
                    <div className="relative w-full" style={{ minHeight: '400px' }}>
                      {/* Glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-mtm-primary/10 to-cyan-500/20 blur-xl"></div>
                      
                      {/* Imagem Horizontal - Mostrar completa */}
                      <div className="relative w-full h-auto z-10">
                        <Image
                          src="/images/iqonic/Imagem Iq Sync.png"
                          alt="IQ Sync - Swipe to Trade Interface"
                          width={1200}
                          height={800}
                          className="w-full h-auto rounded-lg object-contain"
                          unoptimized
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Indicadores visuais */}
                <div className="mt-4 flex items-center justify-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-xs text-gray-400">Tempo Real</span>
                  </div>
                  <div className="w-px h-4 bg-gray-700"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-mtm-primary rounded-full"></div>
                    <span className="text-xs text-gray-400">IQ SYNC</span>
                  </div>
                </div>
                
                {/* Botão Ativa o IQ SYNC */}
                <div className="mt-6 flex justify-center">
                  <a
                    href="https://qrco.de/iqsync"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block"
                  >
                    <Button className="bg-gradient-to-r from-mtm-primary to-emerald-500 hover:from-emerald-500 hover:to-mtm-primary text-black font-bold text-lg px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg">
                      <Zap className="w-5 h-5 mr-2" />
                      Ativa o IQ SYNC
                    </Button>
                  </a>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Vídeo de Apresentação da App */}
        <div className="mb-12 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-8">
            Conhece a App IQ Sync
          </h2>
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-900 border border-mtm-primary/30 mb-8">
            <YouTubeEmbed 
              videoId="mpda6ySMUCQ"
              title="IQ Sync"
            />
          </div>
        </div>

        {/* Como Funciona o IQ SYNC */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-8">
            Como Funciona o IQ SYNC
          </h2>
          <p className="text-gray-300 text-center mb-8">
            Veja como é simples aceitar e executar sinais de trading em apenas alguns toques
          </p>
          
          <div className="grid md:grid-cols-4 gap-6 mb-12">
            <Card className="card-clean hover-lift">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-mtm-primary to-mtm-primary-dark rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-green-400">📱 1. Recebe Notificação</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center">
                  App envia alerta para novo sinal de trading
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-blue-400">⚡ 2. Aceita em 2min</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center mb-4">
                  Swipe para aceitar ou rejeitar o sinal
                </p>
                <Button 
                  onClick={openVideoModal}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Como Aceitar uma Trade
                </Button>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-purple-400">🤖 3. Educador Executa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center">
                  Sistema executa automaticamente a estratégia
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-mtm-primary">🎯 4. Ganha e Aprende</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 text-center">
                  Resultados e aprendizagem simultâneos
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Baixe a App IQONIC */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-4">
            Baixe a App IQONIC
          </h2>
          <p className="text-gray-300 text-center mb-8">
            Instale a aplicação para começar a receber e aceitar sinais de trading
          </p>
          
          <div className="flex justify-center gap-6">
            <Card className="card-clean hover-lift w-64">
              <CardContent className="text-center p-6">
                <div className="w-16 h-16 bg-gradient-to-r from-mtm-primary to-mtm-primary-dark rounded-full flex items-center justify-center mx-auto mb-4">
                  <Play className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">Android</h3>
                <p className="text-gray-400 text-sm mb-4">Disponível na Google Play Store</p>
                <Button 
                  onClick={() => window.open('https://play.google.com/store/apps/details?id=com.enigmalabs.iqsync', '_blank')}
                  className="w-full bg-gradient-to-r from-mtm-primary to-mtm-primary-dark hover:from-green-600 hover:to-emerald-700 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar para Android
                </Button>
              </CardContent>
            </Card>

            <Card className="card-clean hover-lift w-64">
              <CardContent className="text-center p-6">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Apple className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">iOS</h3>
                <p className="text-gray-400 text-sm mb-4">Disponível na App Store</p>
                <Button 
                  onClick={() => window.open('https://apps.apple.com/us/app/iq-sync/id6753764389', '_blank')}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar para iOS
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-gradient-to-r from-gray-900/50 to-gray-800/50 rounded-2xl p-8 mb-12">
          <h2 className="text-3xl font-bold text-green-400 mb-4">
            Comece a Ganhar Enquanto Aprende
          </h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            Junte-se aos milhares de traders que já estão a maximizar os seus retornos com o IQ SYNC da IQONIC
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://trading.iqonic.life">
              <Button className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black text-lg px-8 py-4">
                <Target className="w-5 h-5 mr-2" />
                Saber Mais
              </Button>
            </Link>
            <Link href="https://api.whatsapp.com/send/?phone=351912666699&text=Ola%20Gostaria%20de%20saber%20mais%20sobre%20o%20IQ%20SYNC">
              <Button className="bg-gradient-to-r from-mtm-primary to-mtm-primary-dark hover:from-green-600 hover:to-emerald-700 text-white text-lg px-8 py-4">
                <Users className="w-5 h-5 mr-2" />
                Falar com Especialista
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Video Modal */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl bg-black rounded-lg overflow-hidden">
            <button
              onClick={closeVideoModal}
              className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              style={{ zIndex: 100 }}
            >
              <X className="w-6 h-6" />
            </button>
            <YouTubeEmbed 
              videoId="TxQS2GW5NkE"
              title="Como Aceitar uma Trade - IQ SYNC"
              autoplay={true}
            />
          </div>
        </div>
      )}
    </main>
  )
}
