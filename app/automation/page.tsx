"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Bot, Zap, TrendingUp, Shield, Clock, Users, Target } from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import { useScrollAnimation } from "@/lib/use-scroll-animation"
import { CyberpunkCard } from "@/components/cyberpunk-card"

export default function AutomationPage() {
  return (
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-mtm-primary">Automatização</span> Inteligente
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
            Transforme o seu trading com a nossa plataforma de automatização avançada. 
            Scanners AI, sinais automáticos e copytrading profissional para resultados consistentes.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <Badge variant="outline" className="border-amber-500 text-mtm-primary px-4 py-2">
              <Bot className="w-4 h-4 mr-2" />
              95% Taxa de Precisão
            </Badge>
            <Badge variant="outline" className="border-amber-500 text-mtm-primary px-4 py-2">
              <Clock className="w-4 h-4 mr-2" />
              24/7 Operacional
            </Badge>
            <Badge variant="outline" className="border-amber-500 text-mtm-primary px-4 py-2">
              <Users className="w-4 h-4 mr-2" />
              500+ Utilizadores Ativos
            </Badge>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          <CyberpunkCard animationDirection="left" delay={0}>
            <div className="p-6">
              <div className="cyberpunk-icon mb-6">
                <Bot className="w-8 h-8 text-mtm-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-cyberpunk">Scanners AI Avançados</h3>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Algoritmos proprietários que analisam milhares de ativos em tempo real
              </p>
              <ul className="space-y-3 text-gray-300 mb-8">
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  MTM Gold Killer V2.1
                </li>
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Scanner MTM V3.4
                </li>
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Análise Multi-Timeframe
                </li>
              </ul>
              <Link href="/scanner">
                <Button className="w-full btn-cyberpunk py-4">
                  Ver Scanners
                </Button>
              </Link>
            </div>
          </CyberpunkCard>

          <CyberpunkCard animationDirection="bottom" delay={1}>
            <div className="p-6">
              <div className="cyberpunk-icon mb-6">
                <Zap className="w-8 h-8 text-mtm-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-cyberpunk">Sinais Automáticos</h3>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Receba alertas precisos baseados em padrões comprovados
              </p>
              <ul className="space-y-3 text-gray-300 mb-8">
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Alertas em Tempo Real
                </li>
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Telegram Integration
                </li>
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Filtros Personalizáveis
                </li>
              </ul>
              <Link href="/swipetotrade">
                <Button className="w-full btn-cyberpunk py-4">
                  Swipe to Trade
                </Button>
              </Link>
            </div>
          </CyberpunkCard>

          <CyberpunkCard animationDirection="right" delay={2}>
            <div className="p-6">
              <div className="cyberpunk-icon mb-6">
                <TrendingUp className="w-8 h-8 text-mtm-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-cyberpunk">Copytrading Profissional</h3>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Copie as estratégias dos traders mais bem-sucedidos
              </p>
              <ul className="space-y-3 text-gray-300 mb-6">
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Seleção Automática
                </li>
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Gestão de Risco
                </li>
                <li className="flex items-center">
                  <ArrowRight className="w-4 h-4 text-mtm-primary mr-3" />
                  Relatórios Detalhados
                </li>
              </ul>
              <div className="bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-purple-400 mb-2">Programas de Investimento</h4>
                <p className="text-sm text-gray-300 mb-3">
                  Agende uma apresentação personalizada dos nossos programas de investimento
                </p>
              </div>
              <Link href="https://wa.me/message/5NMUP53HEXVMB1">
                <Button className="w-full btn-cyberpunk py-4">
                  Agendar Apresentação
                </Button>
              </Link>
            </div>
          </CyberpunkCard>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-gradient-to-r from-gray-900/50 to-gray-800/50 rounded-2xl p-8 mb-12">
          <h2 className="text-3xl font-bold text-mtm-primary mb-4">
            Pronto para Automatizar o Seu Trading?
          </h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            Junte-se a centenas de traders que já transformaram os seus resultados com a nossa 
            plataforma de automatização. Comece hoje e veja a diferença.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/scanner-access">
              <Button className="btn-primary text-lg px-8 py-4">
                <Target className="w-5 h-5 mr-2" />
                Aceder aos Scanners
              </Button>
            </Link>
            <Link href="https://wa.me/+351912666699?text=Ol%C3%A1%20gostaria%20de%20ter%20acesso%20aos%20Scanners%20MTM">
              <Button variant="outline" className="btn-secondary text-lg px-8 py-4">
                <ArrowRight className="w-5 h-5 mr-2" />
                Falar no WhatsApp
              </Button>
            </Link>
          </div>
        </div>

        {/* Benefits */}
        <div className="grid md:grid-cols-2 gap-8">
          <CyberpunkCard animationDirection="left" delay={3}>
            <div className="p-6">
              <div className="flex items-center mb-6">
                <div className="cyberpunk-icon">
                  <Shield className="w-6 h-6 text-mtm-primary" />
                </div>
                <h3 className="text-2xl font-bold ml-4 text-cyberpunk">
                  Porquê Escolher a Nossa Automatização?
                </h3>
              </div>
              <ul className="space-y-6">
                <li className="flex items-start">
                  <div className="w-3 h-3 bg-mtm-primary rounded-full mt-2 mr-4 flex-shrink-0 animate-pulse"></div>
                  <div>
                    <h4 className="font-bold text-white mb-2">Algoritmos Proprietários</h4>
                    <p className="text-gray-400 leading-relaxed">Desenvolvidos especificamente para o mercado português e europeu</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <div className="w-3 h-3 bg-mtm-primary rounded-full mt-2 mr-4 flex-shrink-0 animate-pulse"></div>
                  <div>
                    <h4 className="font-bold text-white mb-2">Backtesting Rigoroso</h4>
                    <p className="text-gray-400 leading-relaxed">Todos os algoritmos são testados em dados históricos extensivos</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <div className="w-3 h-3 bg-mtm-primary rounded-full mt-2 mr-4 flex-shrink-0 animate-pulse"></div>
                  <div>
                    <h4 className="font-bold text-white mb-2">Suporte 24/7</h4>
                    <p className="text-gray-400 leading-relaxed">Equipa técnica sempre disponível para ajudar</p>
                  </div>
                </li>
              </ul>
            </div>
          </CyberpunkCard>

          <CyberpunkCard animationDirection="right" delay={4}>
            <div className="p-6">
              <h3 className="text-2xl font-bold mb-8 text-cyberpunk text-center">
                Resultados Comprovados
              </h3>
              <div className="space-y-8">
                <div className="text-center">
                  <div className="text-5xl font-bold text-cyberpunk mb-3 tracking-wider">95%</div>
                  <p className="text-gray-400 text-lg">Taxa de Precisão dos Sinais</p>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-bold text-cyberpunk mb-3 tracking-wider">24/7</div>
                  <p className="text-gray-400 text-lg">Monitorização Contínua</p>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-bold text-cyberpunk mb-3 tracking-wider">500+</div>
                  <p className="text-gray-400 text-lg">Traders Ativos</p>
                </div>
              </div>
            </div>
          </CyberpunkCard>
        </div>
      </div>
    </main>
  )
}