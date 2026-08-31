"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, RefreshCw, Bot, Zap, Shield, Clock, CheckCircle, Smartphone, ChevronLeft, ChevronRight, LineChart } from "lucide-react"
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
                <Link href="/mtmauto" className="flex-1">
                  <Button className="w-full bg-gradient-to-r from-blue-600 via-mtm-primary to-cyan-600 hover:from-blue-500 hover:via-mtm-primary hover:to-cyan-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                    <Smartphone className="w-5 h-5 mr-2" />
                    Ativar Tap to Trade
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

        {/* Execução automática: dois produtos, dois públicos.
            Manter os dois debaixo do mesmo nome confundia quem chega — um é o serviço do site
            para quem já cá está, o outro é uma app que se descarrega e funciona sozinha. */}
        <div className="max-w-7xl mx-auto mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Execução <span className="bg-gradient-to-r from-purple-400 via-mtm-primary to-amber-400 bg-clip-text text-transparent">automática</span>
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Duas formas de o mesmo motor trabalhar por ti. A diferença não é a tecnologia — é onde
              estás no teu percurso.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* MTM Copy — o serviço do site, para quem já sabe o que quer */}
            <Card className="bg-gradient-to-br from-purple-900/40 via-mtm-primary/5 to-pink-900/30 border-2 border-purple-500/30 backdrop-blur-sm flex flex-col">
              <CardContent className="p-8 flex flex-col flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-purple-600/20 rounded-xl p-3 border border-purple-500/40">
                    <Bot className="w-9 h-9 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">MTM Copy</h3>
                    <p className="text-purple-400 font-semibold text-sm">No site · traders intermédios</p>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed mt-4">
                  Para quem já opera e quer controlo fino: várias contas, lote por estratégia,
                  filtros de símbolos, contas financiadas e regras de risco por conta. Configura-se
                  uma vez e fica a correr em segundo plano.
                </p>

                <ul className="mt-5 space-y-2.5 text-gray-300 text-sm">
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />Várias contas MT4/MT5 em simultâneo</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />Lote fixo, risco % ou multiplicador, por conta</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />Presets para contas financiadas (prop firms)</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />Gestão pelo motor: break-even, parciais e trailing</li>
                </ul>

                <div className="mt-auto pt-6">
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-black text-white">+20€</span>
                    <span className="text-gray-400 text-sm">/mês, sobre a tua subscrição MTM</span>
                  </div>
                  <Link href="/mtmcopy">
                    <Button className="w-full bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-lg px-6 py-6 rounded-xl transition-all duration-300 hover:scale-[1.02]">
                      <Bot className="w-5 h-5 mr-2" />
                      Ativar MTM Copy
                    </Button>
                  </Link>
                  <p className="text-xs text-gray-500 mt-3 text-center">Requer conta MTM · pagamento via Stripe</p>
                </div>
              </CardContent>
            </Card>

            {/* MTM Auto — a app, para quem começa ou vem de fora */}
            <Card className="bg-gradient-to-br from-amber-900/30 via-mtm-primary/10 to-yellow-900/20 border-2 border-mtm-primary/40 backdrop-blur-sm flex flex-col">
              <CardContent className="p-8 flex flex-col flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-mtm-primary/20 rounded-xl p-3 border border-mtm-primary/40">
                    <Smartphone className="w-9 h-9 text-mtm-primary" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">MTM Auto</h3>
                    <p className="text-mtm-primary font-semibold text-sm">App · iniciantes e quem vem de fora</p>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed mt-4">
                  Descarregas, ligas a tua conta de corretora e escolhes quem copias. Não precisas
                  de ser membro nem de perceber de trading — a app trata do risco, dos alvos e do
                  stop, e diz-te em português porque é que um sinal não abriu.
                </p>

                <ul className="mt-5 space-y-2.5 text-gray-300 text-sm">
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-mtm-primary shrink-0 mt-0.5" />Tap to Trade: aceitas cada sinal com um toque</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-mtm-primary shrink-0 mt-0.5" />Ou cópia automática, se preferires não decidir</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-mtm-primary shrink-0 mt-0.5" />Uma conta real e uma demo incluídas</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-mtm-primary shrink-0 mt-0.5" />iOS, Android e web — notificações a cada sinal</li>
                </ul>

                <div className="mt-auto pt-6">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-black text-white">25€</span>
                    <span className="text-gray-400 text-sm">/mês · descarregar é grátis</span>
                  </div>
                  {/* A isenção é a razão pela qual muitos não pagam nada — esconder isso seria
                      cobrar a quem já nos dá receita do outro lado. */}
                  <p className="text-sm text-mtm-primary mb-4">
                    Conta real PU Prime validada? Não pagas nada.
                  </p>
                  <Link href="/mtmauto">
                    <Button className="w-full bg-gradient-to-r from-mtm-primary to-amber-500 hover:from-amber-400 hover:to-mtm-primary text-black font-bold text-lg px-6 py-6 rounded-xl transition-all duration-300 hover:scale-[1.02]">
                      <Smartphone className="w-5 h-5 mr-2" />
                      Conhecer a MTM Auto
                    </Button>
                  </Link>
                  <p className="text-xs text-gray-500 mt-3 text-center">Sem conta MTM · funciona com qualquer corretora MT4/MT5</p>
                </div>
              </CardContent>
            </Card>

            {/* MTM Sensei EA — para quem já vive dentro do MetaTrader e não quer sair de lá.
                Não é copy trading: o robô lê o mercado na própria máquina do cliente. */}
            <Card className="bg-gradient-to-br from-emerald-900/30 via-mtm-primary/5 to-teal-900/25 border-2 border-emerald-500/30 backdrop-blur-sm flex flex-col">
              <CardContent className="p-8 flex flex-col flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-emerald-600/20 rounded-xl p-3 border border-emerald-500/40">
                    <LineChart className="w-9 h-9 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">MTM Sensei EA</h3>
                    <p className="text-emerald-400 font-semibold text-sm">MetaTrader 5 · quem quer o robô na sua conta</p>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed mt-4">
                  Não copia ninguém: é a nossa leitura de mercado a correr no teu MetaTrader.
                  Analisa, entra, tira parciais e faz trailing sozinho — e tens o painel no gráfico
                  para tomares conta quando quiseres.
                </p>

                <ul className="mt-5 space-y-2.5 text-gray-300 text-sm">
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Vinte confirmações antes de cada entrada</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Quatro saídas parciais, breakeven e trailing</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Filtro de notícias e modo prop firm</li>
                  <li className="flex gap-2.5"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Instalador automático para Windows e macOS</li>
                </ul>

                <div className="mt-auto pt-6">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-black text-white">297€</span>
                    <span className="text-gray-400 text-sm">/ano · ou 1000€ vitalícia</span>
                  </div>
                  <p className="text-sm text-emerald-400 mb-4">
                    Premium, VIP ou Fundador? Não pagas nada.
                  </p>
                  <Link href="/sensei-ea">
                    <Button className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-lg px-6 py-6 rounded-xl transition-all duration-300 hover:scale-[1.02]">
                      <LineChart className="w-5 h-5 mr-2" />
                      Ver o MTM Sensei EA
                    </Button>
                  </Link>
                  <p className="text-xs text-gray-500 mt-3 text-center">Uma conta MT5 por licença · qualquer corretora com MT5</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Comparação: a pergunta que fica é "qual é a minha?" — e responde-se com o dia a dia
            de cada uma, não com listas de funcionalidades. */}
        <div className="max-w-6xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 text-center">
            Qual é a <span className="bg-gradient-to-r from-purple-400 via-mtm-primary to-amber-400 bg-clip-text text-transparent">minha?</span>
          </h2>
          <p className="text-lg text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            O motor é o mesmo nas duas. O que muda é quanto queres decidir.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-gradient-to-br from-purple-900/40 to-pink-900/30 border-2 border-purple-500/30 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <Bot className="w-10 h-10 text-purple-400" />
                  <div>
                    <h3 className="text-2xl font-bold text-white">MTM Copy</h3>
                    <p className="text-sm text-purple-400 font-semibold">no site · traders intermédios</p>
                  </div>
                </div>
                <div className="space-y-4 text-gray-300">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div><strong className="text-white">Controlo fino:</strong> lote, risco e símbolos por conta e por estratégia</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div><strong className="text-white">Várias contas:</strong> pessoal, demo e financiadas ao mesmo tempo</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div><strong className="text-white">Set-it-once:</strong> configuras uma vez e corre em segundo plano</div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-purple-500/30 flex items-center justify-between">
                  <p className="text-sm text-purple-400 font-semibold">Para quem já opera</p>
                  <p className="text-white font-bold">+20€<span className="text-gray-400 text-sm font-normal">/mês</span></p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-900/30 to-yellow-900/20 border-2 border-mtm-primary/40 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <Smartphone className="w-10 h-10 text-mtm-primary" />
                  <div>
                    <h3 className="text-2xl font-bold text-white">MTM Auto</h3>
                    <p className="text-sm text-mtm-primary font-semibold">app · iniciantes e quem vem de fora</p>
                  </div>
                </div>
                <div className="space-y-4 text-gray-300">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-mtm-primary flex-shrink-0 mt-1" />
                    <div><strong className="text-white">Tap to Trade:</strong> o sinal chega, tu tocas, a ordem entra</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-mtm-primary flex-shrink-0 mt-1" />
                    <div><strong className="text-white">Risco tratado:</strong> o lote sai do teu saldo, com tecto por trade</div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RefreshCw className="w-5 h-5 text-mtm-primary flex-shrink-0 mt-1" />
                    <div><strong className="text-white">Sem ecossistema:</strong> não é preciso ser membro MTM</div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-mtm-primary/30 flex items-center justify-between">
                  <p className="text-sm text-mtm-primary font-semibold">Para quem está a começar</p>
                  <p className="text-white font-bold">25€<span className="text-gray-400 text-sm font-normal">/mês</span></p>
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
            <p className="text-xl text-gray-300 mb-2 max-w-2xl mx-auto">
              Duas portas para o mesmo motor. Escolhe pela tua experiência, não pelo preço.
            </p>
            {/* Dizer para quem é cada uma poupa o cliente a uma escolha errada — e a nós um
                reembolso e uma conversa de suporte. */}
            <p className="text-base text-gray-400 mb-8 max-w-2xl mx-auto">
              Já operas e queres controlo fino sobre várias contas? <b className="text-purple-300">MTM Copy</b>.
              Estás a começar, ou vens de fora do ecossistema? <b className="text-mtm-primary">MTM Auto</b>.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/mtmcopy">
                <Button className="bg-gradient-to-r from-purple-600 via-mtm-primary to-pink-600 hover:from-purple-500 hover:via-mtm-primary hover:to-pink-500 text-white font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <Bot className="w-5 h-5 mr-2" />
                  MTM Copy · 20€/mês
                </Button>
              </Link>
              <Link href="/mtmauto">
                <Button className="bg-gradient-to-r from-mtm-primary to-amber-500 hover:from-amber-400 hover:to-mtm-primary text-black font-bold text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105">
                  <Smartphone className="w-5 h-5 mr-2" />
                  MTM Auto · 25€/mês
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
