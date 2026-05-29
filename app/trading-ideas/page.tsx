"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ExternalLink, 
  Users, 
  MessageCircle, 
  Star, 
  Target, 
  Zap, 
  Shield, 
  TrendingUp 
} from "lucide-react"
import Link from "next/link"
import ParticleBackground from "@/components/particle-background"
import ProtectedPage from "@/components/protected-page"
import { CyberpunkCard } from "@/components/cyberpunk-card"

const telegramGroups = [
  {
    id: 1,
    emoji: "🎯",
    name: "MoreThanMoney Trade Ideas",
    description: "Grupo VIP onde partilhamos posições para entrar com devida gestão no mercado",
    badge: "VIP",
    badgeColor: "from-mtm-primary to-mtm-primary-dark",
    members: "96+ membros",
    status: "9 online",
    features: [
      "Posições VIP",
      "Gestão de Risco",
      "Análises Técnicas",
      "Suporte Direto"
    ],
    link: "https://t.me/+2XMn1YEjfjYwYTE0",
    bgGradient: "from-mtm-primary to-mtm-primary-dark",
    btnColor: "from-mtm-primary to-mtm-primary-dark"
  },
  {
    id: 3,
    emoji: "⭐",
    name: "SuperNova US30",
    description: "Alertas exclusivos do indicador SuperNova para US30 com sinais de entrada precisos",
    badge: "SuperNova",
    badgeColor: "from-purple-600 to-pink-600",
    members: "Exclusivo membros",
    status: "Alertas 24/7",
    features: [
      "Indicador SuperNova",
      "Sinais US30",
      "Alertas Automáticos",
      "Análises Técnicas"
    ],
    link: "https://t.me/+dWQ5vKPS3YQ3MmEx",
    bgGradient: "from-purple-600 to-pink-600",
    btnColor: "from-purple-600 to-pink-600"
  },
  {
    id: 4,
    emoji: "⭐",
    name: "SuperNova NAS",
    description: "Alertas do indicador SuperNova para NASDAQ com oportunidades de trading",
    badge: "SuperNova",
    badgeColor: "from-purple-600 to-pink-600",
    members: "Exclusivo membros",
    status: "Alertas 24/7",
    features: [
      "Indicador SuperNova",
      "Sinais NASDAQ",
      "Alertas Automáticos",
      "Análises Técnicas"
    ],
    link: "https://t.me/+vZ7KjcLih2Q5NzFh",
    bgGradient: "from-pink-600 to-purple-600",
    btnColor: "from-pink-600 to-purple-600"
  },
  {
    id: 5,
    emoji: "⭐",
    name: "SuperNova Gold",
    description: "Alertas do indicador SuperNova para XAU/USD com sinais de ouro",
    badge: "SuperNova",
    badgeColor: "from-purple-600 to-pink-600",
    members: "Exclusivo membros",
    status: "Alertas 24/7",
    features: [
      "Indicador SuperNova",
      "Sinais XAU/USD",
      "Alertas Automáticos",
      "Análises Técnicas"
    ],
    link: "https://t.me/+stmWG_NxaENjODcx",
    bgGradient: "from-amber-600 to-orange-600",
    btnColor: "from-amber-600 to-orange-600"
  },
  {
    id: 6,
    emoji: "⭐",
    name: "SuperNova GER30",
    description: "Alertas do indicador SuperNova para DAX com oportunidades alemãs",
    badge: "SuperNova",
    badgeColor: "from-purple-600 to-pink-600",
    members: "Exclusivo membros",
    status: "Alertas 24/7",
    features: [
      "Indicador SuperNova",
      "Sinais DAX",
      "Alertas Automáticos",
      "Análises Técnicas"
    ],
    link: "https://t.me/+ZkRyvAX6FxRhMDVh",
    bgGradient: "from-green-600 to-emerald-600",
    btnColor: "from-green-600 to-emerald-600"
  },
  {
    id: 7,
    emoji: "⭐",
    name: "SuperNova BTC",
    description: "Alertas do indicador SuperNova para Bitcoin com sinais cripto",
    badge: "SuperNova",
    badgeColor: "from-purple-600 to-pink-600",
    members: "Exclusivo membros",
    status: "Alertas 24/7",
    features: [
      "Indicador SuperNova",
      "Sinais BTC",
      "Alertas Automáticos",
      "Análises Técnicas"
    ],
    link: "https://t.me/+vQGeP1QS5vhjMWRh",
    bgGradient: "from-orange-500 to-yellow-500",
    btnColor: "from-orange-500 to-yellow-500"
  },
  {
    id: 8,
    emoji: "🔍",
    name: "MoreThanMoney Scanner",
    description: "Scanner exclusivo MoreThanMoney com alertas de mercado em tempo real",
    badge: "Scanner",
    badgeColor: "from-mtm-primary-light to-mtm-primary",
    members: "Exclusivo membros",
    status: "Scanner 24/7",
    features: [
      "Scanner Exclusivo",
      "Alertas Tempo Real",
      "Análises Avançadas",
      "Suporte VIP"
    ],
    link: "/scanner-access",
    bgGradient: "from-mtm-primary-light to-mtm-primary",
    btnColor: "from-mtm-primary-light to-mtm-primary",
    isInternal: true
  }
]

export default function TradingIdeasPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/trading-ideas" loadingMessage="A verificar acesso às ideias de trading...">
      <div className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      
      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-mtm-primary mb-6">
            Trade Ideas & Comunidade
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Junte-se aos nossos grupos exclusivos de trading e tenha acesso a análises, posições VIP e uma comunidade ativa de traders profissionais.
          </p>
        </div>

        {/* Grupos Telegram */}
        <div className="grid lg:grid-cols-2 gap-8 mb-16">
          {telegramGroups.map((group, index) => (
            <CyberpunkCard 
              key={group.id}
              animationDirection={index % 2 === 0 ? "left" : "right"}
              delay={Math.floor(index / 2)}
            >
              <div className="relative p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="cyberpunk-icon">
                      <span className="text-2xl">{group.emoji}</span>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-cyberpunk mb-2">
                        {group.name}
                      </h3>
                      <Badge className={`bg-gradient-to-r ${group.badgeColor} text-white border-0`}>
                        {group.badge}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-300 text-base leading-relaxed mb-6">
                  {group.description}
                </p>

                <div className="space-y-6">
                {/* Stats */}
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <div className="flex items-center space-x-2">
                    <Users className="h-4 w-4" />
                    <span>{group.members}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <MessageCircle className="h-4 w-4" />
                    <span>{group.status}</span>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-mtm-primary text-sm uppercase tracking-wide">
                    Características Principais
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {group.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center space-x-2 text-sm text-gray-300">
                        <Star className="h-3 w-3 text-mtm-primary fill-current flex-shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                  {/* Button */}
                  <div className="pt-4">
                    {group.isInternal ? (
                      <Link href={group.link}>
                        <Button className="w-full btn-cyberpunk py-3">
                          <Shield className="h-4 w-4 mr-2" />
                          Aceder ao Scanner
                        </Button>
                      </Link>
                    ) : (
                      <a 
                        href={group.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Button className="w-full btn-cyberpunk py-3">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Juntar ao Grupo
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </CyberpunkCard>
          ))}
        </div>

        {/* Info Cards */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {/* Benefícios VIP */}
          <CyberpunkCard animationDirection="bottom" delay={0}>
            <div className="p-6">
              <div className="flex items-center mb-6">
                <div className="cyberpunk-icon">
                  <TrendingUp className="h-6 w-6 text-mtm-primary" />
                </div>
                <h3 className="text-xl font-bold text-cyberpunk ml-4">Benefícios VIP</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <Star className="h-4 w-4 text-mtm-primary fill-current flex-shrink-0" />
                  <span>Alertas automáticos do SuperNova</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <Star className="h-4 w-4 text-mtm-primary fill-current flex-shrink-0" />
                  <span>Scanner em tempo real</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <Star className="h-4 w-4 text-mtm-primary fill-current flex-shrink-0" />
                  <span>Comunidade ativa de traders</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <Star className="h-4 w-4 text-mtm-primary fill-current flex-shrink-0" />
                  <span>Suporte direto da equipa</span>
                </div>
              </div>
            </div>
          </CyberpunkCard>

          {/* Como Funciona */}
          <Card className="bg-black border-mtm-primary/30">
            <CardHeader>
              <CardTitle className="text-xl text-mtm-primary flex items-center space-x-2">
                <MessageCircle className="h-5 w-5" />
                <span>Como Funciona</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <div className="w-6 h-6 bg-mtm-primary text-black rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  1
                </div>
                <span>Junte-se ao grupo escolhido</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <div className="w-6 h-6 bg-mtm-primary text-black rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  2
                </div>
                <span>Receba alertas automáticos</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <div className="w-6 h-6 bg-mtm-primary text-black rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  3
                </div>
                <span>Interaja com a comunidade</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <div className="w-6 h-6 bg-mtm-primary text-black rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  4
                </div>
                <span>Melhore suas estratégias</span>
              </div>
            </CardContent>
          </Card>

          {/* Dicas Importantes */}
          <Card className="bg-black border-mtm-primary/30">
            <CardHeader>
              <CardTitle className="text-xl text-mtm-primary flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Dicas Importantes</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-300">
                <p className="font-semibold text-mtm-primary mb-2">⚠️ Gestão de Risco</p>
                <p>Sempre use stop-loss e não arrisque mais do que pode perder</p>
              </div>
              <div className="text-sm text-gray-300">
                <p className="font-semibold text-mtm-primary mb-2">📱 Alertas Automáticos</p>
                <p>Os grupos SuperNova enviam alertas automáticos do indicador</p>
              </div>
              <div className="text-sm text-gray-300">
                <p className="font-semibold text-mtm-primary mb-2">🤝 Comunidade</p>
                <p>Participe ativamente e aprenda com outros traders</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA Final */}
        <div className="text-center mt-16">
          <Card className="bg-black border-mtm-primary/50 max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle className="text-3xl text-mtm-primary">
                Pronto para Elevar o Seu Trading?
              </CardTitle>
              <CardDescription className="text-lg text-gray-300">
                Junte-se à nossa comunidade e transforme a sua abordagem ao mercado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap justify-center gap-4">
                <a 
                  href="https://t.me/+2XMn1YEjfjYwYTE0" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <Button className="bg-gradient-to-r from-mtm-primary to-mtm-primary-dark hover:opacity-90 text-black font-semibold px-8 py-3">
                    <Target className="h-4 w-4 mr-2" />
                    MoreThanMoney VIP
                  </Button>
                </a>
                <a 
                  href="https://t.me/+dWQ5vKPS3YQ3MmEx" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <Button 
                    variant="outline" 
                    className="border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white font-semibold px-8 py-3"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    SuperNova US30
                  </Button>
                </a>
                <Link href="/scanner-access">
                  <Button 
                    variant="outline" 
                    className="border-mtm-primary text-mtm-primary hover:bg-mtm-primary hover:text-black font-semibold px-8 py-3"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Aceder aos Scanners
                  </Button>
                </Link>
              </div>
              <p className="text-sm text-gray-400">
                🔒 Todos os grupos são seguros e moderados pela equipa MoreThanMoney
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </ProtectedPage>
  )
}

