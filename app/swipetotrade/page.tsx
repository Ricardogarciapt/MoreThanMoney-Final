"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Smartphone, Zap, Clock, Shield, Target, Users, TrendingUp, Download, Play, Apple, X } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"

export default function SwipeToTradePage() {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false)

  const openVideoModal = () => setIsVideoModalOpen(true)
  const closeVideoModal = () => setIsVideoModalOpen(false)
  return (
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gradient-to-r from-mtm-primary to-mtm-primary-dark rounded-2xl">
              <Smartphone className="h-12 w-12 text-white" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-2xl font-bold text-mtm-primary">iQ</span>
            <h1 className="text-4xl md:text-6xl font-bold">
              <span className="text-green-400">Swipe to Trade</span>
            </h1>
          </div>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
            Aceite ideias de trading em dois minutos e deixe o Educador gerir tudo automaticamente.
          </p>
          <p className="text-lg text-mtm-primary font-semibold mb-8">
            Ganhe enquanto aprende!
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <Badge variant="outline" className="border-green-500 text-green-400 px-4 py-2">
              <Clock className="w-4 h-4 mr-2" />
              2min Tempo de Resposta
            </Badge>
            <Badge variant="outline" className="border-green-500 text-green-400 px-4 py-2">
              <Target className="w-4 h-4 mr-2" />
              95% Taxa de Sucesso
            </Badge>
            <Badge variant="outline" className="border-green-500 text-green-400 px-4 py-2">
              <Zap className="w-4 h-4 mr-2" />
              24/7 Sinais Disponíveis
            </Badge>
            <Badge variant="outline" className="border-green-500 text-green-400 px-4 py-2">
              <Shield className="w-4 h-4 mr-2" />
              Auto Gestão Completa
            </Badge>
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
              title="IQ Sync - Swipe to Trade"
            />
          </div>
        </div>

        {/* Como Funciona o Swipe to Trade */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-8">
            Como Funciona o Swipe to Trade
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

        {/* Como Funciona o Processo */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center text-mtm-primary mb-4">
            Como Funciona o Processo
          </h2>
          <p className="text-gray-300 text-center mb-8">
            Do sinal à execução em apenas alguns passos simples
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="text-green-400 flex items-center">
                  <Zap className="w-6 h-6 mr-2" />
                  Resposta Rápida
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300">
                  Aceite ou rejeite sinais de trading em apenas 2 minutos após receber a notificação
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="text-mtm-primary flex items-center">
                  <Users className="w-6 h-6 mr-2" />
                  Aprenda Enquanto Ganha
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300">
                  O Educador gere tudo automaticamente enquanto você observa e aprende as estratégias
                </p>
              </CardContent>
            </Card>

            <Card className="card-clean">
              <CardHeader>
                <CardTitle className="text-purple-400 flex items-center">
                  <Shield className="w-6 h-6 mr-2" />
                  Gestão Automática
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300">
                  Stop-loss, take-profit e gestão de risco são executados automaticamente pelo sistema
                </p>
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
            Junte-se aos milhares de traders que já estão a maximizar os seus retornos com o sistema Swipe to Trade da IQONIC
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="https://trading.iqonic.life">
              <Button className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black text-lg px-8 py-4">
                <Target className="w-5 h-5 mr-2" />
                Saber Mais
              </Button>
            </Link>
            <Link href="https://api.whatsapp.com/send/?phone=351912666699&text=Ola%20Gostaria%20de%20saber%20mais%20sobre%20o%20Swipe%20to%20Trade">
              <Button className="bg-gradient-to-r from-mtm-primary to-mtm-primary-dark hover:from-green-600 hover:to-emerald-700 text-white text-lg px-8 py-4">
                <Users className="w-5 h-5 mr-2" />
                Falar com Especialista
              </Button>
            </Link>
          </div>
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="card-clean">
            <CardHeader>
              <CardTitle className="text-mtm-primary">O Que Dizem os Utilizadores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-gray-300 italic mb-2">
                    "Finalmente uma app que torna o trading simples. Em 2 minutos tenho tudo decidido!"
                  </p>
                  <p className="text-mtm-primary font-semibold">- João M., Lisboa</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-gray-300 italic mb-2">
                    "Os sinais são muito precisos e a interface é intuitiva. Recomendo!"
                  </p>
                  <p className="text-mtm-primary font-semibold">- Maria S., Porto</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-clean">
            <CardHeader>
              <CardTitle className="text-green-400">Suporte e Recursos</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                <li className="flex items-center">
                  <Users className="w-5 h-5 text-green-400 mr-3" />
                  <span className="text-gray-300">Suporte técnico 24/7</span>
                </li>
                <li className="flex items-center">
                  <Shield className="w-5 h-5 text-green-400 mr-3" />
                  <span className="text-gray-300">Gestão de risco integrada</span>
                </li>
                <li className="flex items-center">
                  <Clock className="w-5 h-5 text-green-400 mr-3" />
                  <span className="text-gray-300">Atualizações em tempo real</span>
                </li>
                <li className="flex items-center">
                  <Target className="w-5 h-5 text-green-400 mr-3" />
                  <span className="text-gray-300">Backtesting completo</span>
                </li>
              </ul>
            </CardContent>
          </Card>
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
              title="Como Aceitar uma Trade - Swipe to Trade"
              autoplay={true}
            />
          </div>
        </div>
      )}
    </main>
  )
}