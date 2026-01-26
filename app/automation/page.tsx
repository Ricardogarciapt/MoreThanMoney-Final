"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, RefreshCw, Bot, Zap, Shield, Clock, CheckCircle, Smartphone } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"

export default function AutomationPage() {
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
            Duas soluções revolucionárias para elevar o teu trading ao próximo nível
          </p>
        </div>

        {/* IQ Sync Section - Azul Escuro */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <div className="space-y-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-600/30 via-mtm-primary/20 to-cyan-600/30 rounded-xl p-4 border-2 border-blue-500/50">
                  <RefreshCw className="w-12 h-12 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">
                    IQ Sync
                  </h2>
                  <p className="text-xl text-blue-400 font-semibold">
                    Mantém-te ligado em Tempo Real
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-gray-300 text-lg leading-relaxed">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
                  <div>
                    <strong className="text-white">Ideias de Mercado:</strong> Entregues diretamente no teu dispositivo.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
                  <div>
                    <strong className="text-white">Execução Simples:</strong> Executa operações diretamente dentro da plataforma.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
                  <div>
                    <strong className="text-white">Orientação Contínua:</strong> Cada ideia é um ponto de partida para as tuas próprias decisões.
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-600/20 via-mtm-primary/10 to-cyan-600/20 border-2 border-blue-500/30 rounded-xl p-6 mt-8">
                <h3 className="text-xl font-bold text-blue-400 mb-3">Sistema "Receive → Review → Confirm"</h3>
                <p className="text-gray-300">
                  Manténs sempre o controlo final de cada decisão. Execução manual de ideias de mercado em tempo real.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="/swipetotrade" className="flex-1">
                  <Button className="w-full bg-gradient-to-r from-blue-600 via-mtm-primary to-cyan-600 hover:from-blue-500 hover:via-mtm-primary hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                    <Smartphone className="w-5 h-5 mr-2" />
                    Configurar IQ Sync
                  </Button>
                </Link>
                <Link href="https://iqonic.life/morethanmoney" target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full border-2 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300">
                    Ver no IQONIC
                  </Button>
                </Link>
              </div>
            </div>

            {/* Visual - Phone Mockup */}
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 rounded-3xl p-8 border-2 border-blue-500/30 backdrop-blur-sm">
                <div className="bg-black rounded-2xl p-4 shadow-2xl">
                  <div className="bg-gray-900 rounded-xl overflow-hidden">
                    {/* Phone Screen Mockup */}
                    <div className="aspect-[9/19] bg-gradient-to-br from-blue-950 to-cyan-950 rounded-lg p-2">
                      <div className="h-full bg-gray-900 rounded-lg p-4 space-y-4">
                        {/* Status Bar */}
                        <div className="flex justify-between items-center text-xs text-gray-400 mb-4">
                          <span>9:41</span>
                          <div className="flex gap-1">
                            <div className="w-4 h-2 bg-gray-600 rounded"></div>
                            <div className="w-4 h-2 bg-gray-600 rounded"></div>
                            <div className="w-4 h-2 bg-gray-600 rounded"></div>
                          </div>
                        </div>
                        
                        {/* Content Cards */}
                        <div className="space-y-3">
                          <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 bg-blue-500 rounded-full"></div>
                              <div>
                                <div className="text-white font-semibold text-sm">Tyler Collins</div>
                                <div className="text-blue-400 text-xs">Buy Signal</div>
                              </div>
                            </div>
                            <div className="text-green-400 font-bold text-lg">US100 ↑</div>
                          </div>
                          <div className="bg-cyan-600/20 border border-cyan-500/30 rounded-lg p-4">
                            <div className="text-white font-semibold text-sm mb-1">Market Idea</div>
                            <div className="text-cyan-400 text-xs">Review & Confirm</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="max-w-4xl mx-auto mb-20">
          <div className="h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
        </div>

        {/* IQ Auto Section - Roxo/Púrpura */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Visual - Phone Mockups */}
            <div className="relative order-2 md:order-1">
              <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 rounded-3xl p-8 border-2 border-purple-500/30 backdrop-blur-sm">
                <div className="grid grid-cols-3 gap-4">
                  {/* Phone 1 - Setup */}
                  <div className="bg-black rounded-2xl p-2 shadow-2xl">
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="aspect-[9/19] bg-gradient-to-br from-purple-950 to-pink-950 rounded-lg p-2">
                        <div className="h-full bg-gray-900 rounded-lg p-3 space-y-2">
                          <div className="text-xs text-gray-400 text-center mb-2">9:41</div>
                          <div className="text-white font-bold text-xs mb-2">Setup your account</div>
                          <div className="space-y-2">
                            <div className="bg-purple-600/20 border border-purple-500/30 rounded p-2 text-xs text-gray-300">Connect broker</div>
                            <div className="bg-purple-600/20 border border-purple-500/30 rounded p-2 text-xs text-gray-300">Pick strategy</div>
                            <div className="bg-purple-600/20 border border-purple-500/30 rounded p-2 text-xs text-gray-300">Set SafeGuard</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phone 2 - Strategies */}
                  <div className="bg-black rounded-2xl p-2 shadow-2xl">
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="aspect-[9/19] bg-gradient-to-br from-purple-950 to-pink-950 rounded-lg p-2">
                        <div className="h-full bg-gray-900 rounded-lg p-3 space-y-2">
                          <div className="text-xs text-gray-400 text-center mb-2">9:41</div>
                          <div className="text-white font-bold text-xs mb-2">Strategies</div>
                          <div className="space-y-1.5">
                            <div className="bg-purple-600/30 rounded p-1.5">
                              <div className="text-white text-xs font-semibold">US30 Sniper</div>
                              <div className="text-green-400 text-xs">+4 pips</div>
                            </div>
                            <div className="bg-cyan-600/30 rounded p-1.5">
                              <div className="text-white text-xs font-semibold">Tyler Collins</div>
                              <div className="text-green-400 text-xs">+102 pips</div>
                            </div>
                            <div className="bg-pink-600/30 rounded p-1.5">
                              <div className="text-white text-xs font-semibold">Ralph Danquah</div>
                              <div className="text-green-400 text-xs">+125 pips</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phone 3 - Chart */}
                  <div className="bg-black rounded-2xl p-2 shadow-2xl">
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="aspect-[9/19] bg-gradient-to-br from-purple-950 to-pink-950 rounded-lg p-2">
                        <div className="h-full bg-gray-900 rounded-lg p-3 space-y-2">
                          <div className="text-xs text-gray-400 text-center mb-2">9:41</div>
                          <div className="bg-purple-600/20 rounded p-2 h-16 flex items-center justify-center">
                            <div className="text-white text-xs font-semibold">Chart View</div>
                          </div>
                          <div className="bg-purple-600/20 border border-purple-500/30 rounded p-2">
                            <div className="text-white text-xs text-center">Remove Strategy</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text Content */}
            <div className="space-y-6 order-1 md:order-2">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-gradient-to-br from-purple-600/30 via-mtm-primary/20 to-pink-600/30 rounded-xl p-4 border-2 border-purple-500/50">
                  <Bot className="w-12 h-12 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">
                    IQ Auto
                  </h2>
                  <p className="text-xl text-purple-400 font-semibold">
                    A Revolução da Automação
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-600/20 via-mtm-primary/10 to-pink-600/20 border-2 border-purple-500/30 rounded-xl p-6 mb-6">
                <h3 className="text-2xl font-bold text-purple-400 mb-3">Set-it-once experience</h3>
                <p className="text-gray-300 leading-relaxed">
                  Fique conectado a estratégias de trading com uma experiência de configuração única que mantém a sua conta alinhada em segundo plano.
                </p>
              </div>

              <div className="space-y-4 text-gray-300 text-lg leading-relaxed">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-purple-400 flex-shrink-0 mt-1" />
                  <div>
                    <strong className="text-white">Totalmente Automatizado:</strong> Inicia, para, adiciona ou remove estratégias instantaneamente. Sem penalizações.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-purple-400 flex-shrink-0 mt-1" />
                  <div>
                    <strong className="text-white">SafeGuard:</strong> Proteção automática com gestão de risco e limites de capital.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-purple-400 flex-shrink-0 mt-1" />
                  <div>
                    <strong className="text-white">100% Automático:</strong> Mantém a conta alinhada com estratégias dos educadores em segundo plano.
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="https://iqonic.life/morethanmoney" target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button className="w-full bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:via-mtm-primary hover:to-pink-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                    <Bot className="w-5 h-5 mr-2" />
                    Ativar IQ Auto
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
            {/* IQ Sync Card */}
            <Card className="bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border-2 border-blue-500/30 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <RefreshCw className="w-10 h-10 text-blue-400" />
                  <h3 className="text-2xl font-bold text-white">IQ Sync</h3>
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

            {/* IQ Auto Card */}
            <Card className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <Bot className="w-10 h-10 text-purple-400" />
                  <h3 className="text-2xl font-bold text-white">IQ Auto</h3>
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
              <Link href="/swipetotrade">
                <Button className="bg-gradient-to-r from-blue-600 via-mtm-primary to-cyan-600 hover:from-blue-500 hover:via-mtm-primary hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Experimentar IQ Sync
                </Button>
              </Link>
              <Link href="https://iqonic.life/morethanmoney" target="_blank" rel="noopener noreferrer">
                <Button className="bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:via-mtm-primary hover:to-pink-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <Bot className="w-5 h-5 mr-2" />
                  Ativar IQ Auto
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
