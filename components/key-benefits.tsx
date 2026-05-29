"use client"

import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, Shield, Zap, Users, Brain, DollarSign, Clock, Award } from "lucide-react"

const benefits = [
  {
    icon: TrendingUp,
    title: "Taxa de Sucesso",
    description: "Nossos scanners têm uma precisão comprovada de 78% em sinais de trading",
    color: "from-green-400 to-green-600",
  },
  {
    icon: Shield,
    title: "Gestão de Risco Avançada",
    description: "Sistemas semi-automáticos de stop-loss e take-profit para proteger seu capital",
    color: "from-blue-400 to-blue-600",
  },
  {
    icon: Zap,
    title: "Sinais em Tempo Real",
    description: "Receba alertas instantâneos diretamente no seu dispositivo",
    color: "from-gold-400 to-gold-600",
  },
  {
    icon: Users,
    title: "Comunidade Exclusiva",
    description: "Acesso a uma comunidade de traders de sucesso",
    color: "from-purple-400 to-purple-600",
  },
  {
    icon: Brain,
    title: "IA Proprietária",
    description: "Algoritmos de inteligência artificial desenvolvidos por equipas de topo",
    color: "from-cyan-400 to-cyan-600",
  },
  {
    icon: DollarSign,
    title: "ROI Médio de 42%",
    description: "Retorno médio de investimento dos nossos membros em 6 meses",
    color: "from-emerald-400 to-emerald-600",
  },
  {
    icon: Clock,
    title: "Suporte Direto",
    description: "Equipa de distribuição disponível diretamente, 7 dias por semana",
    color: "from-orange-400 to-orange-600",
  },
  {
    icon: Award,
    title: "Educação Auditada",
    description: "Acesso a uma educação Auditade e de evolução Progressiva",
    color: "from-red-400 to-red-600",
  },
]

export default function KeyBenefits() {
  return (
    <section className="py-20 bg-gradient-to-b from-gray-900 to-black relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-gold-400 to-gold-600">
            Por Que Escolher MoreThanMoney?
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Mais de 3 anos de experiência no mercado financeiro, tecnologia de ponta e resultados comprovados
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon
            return (
              <Card
                key={index}
                className="bg-black/50 border-gray-800 backdrop-blur-sm hover:border-gold-500/50 transition-all duration-300 transform hover:scale-105 group"
              >
                <CardContent className="p-6 text-center">
                  <div
                    className={`w-16 h-16 rounded-full bg-gradient-to-r ${benefit.color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-3">{benefit.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{benefit.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Trust Indicators */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-gold-400 mb-2">5+</div>
            <div className="text-gray-400">Anos de Experiência</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-green-400 mb-2">PIPS 2.4M+</div>
            <div className="text-gray-400">Lucros dos Membros</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-400 mb-2">100+</div>
            <div className="text-gray-400">Membros Ativos</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-purple-400 mb-2">99.9%</div>
            <div className="text-gray-400">Uptime do Sistema</div>
          </div>
        </div>
      </div>
    </section>
  )
}
