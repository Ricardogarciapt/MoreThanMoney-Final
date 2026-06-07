"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  BookOpen,
  BarChart3,
  Smartphone,
  Brain,
  TrendingUp,
  MessageSquare,
  Video,
  Users,
  Zap,
  Check,
  Star,
  UserCheck,
  Quote,
  ChevronDown,
  RefreshCw,
  Bot,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import ParticleBackground from "@/components/particle-background"
import LiveActivityTicker from "@/components/live-activity-ticker"
import { getRandomTestimonials } from "@/lib/testimonials-service"
import type { Testimonial } from "@/lib/testimonials-service"

// ─── Path Selector ─────────────────────────────────────────────────────────────

const PATHS = [
  {
    id: "learn",
    icon: BookOpen,
    emoji: "🎓",
    label: "Quero aprender de verdade",
    color: "#D2A63C",
    bg: "from-[#D2A63C]/10 to-[#BB8525]/5",
    border: "border-[#D2A63C]/30",
    description: "Sobe de nível com o Pack Premium: cursos completos de Forex, Criptomoedas, Marketing Digital e IA, mais a comunidade e a app MTM incluídas.",
    features: [
      "Cursos de Forex, Criptomoedas, Marketing Digital e AI",
      "Comunidade Skool MTM + grupo ativo de traders",
      "Aulas e Live Sessions Premium com o Ricardo",
      "Mentor AI avançado disponível 24/7",
      "Tudo o que está incluído no Pack Membro",
    ],
    cta: "Ver Pack Premium",
    href: "/register?plan=premium",
    badge: "Pack Premium — €65/mês",
  },
  {
    id: "balance",
    emoji: "⚖️",
    icon: Smartphone,
    label: "Quero equilíbrio",
    color: "#10B981",
    bg: "from-emerald-500/10 to-emerald-900/5",
    border: "border-emerald-500/30",
    description: "O melhor dos dois mundos: a app MoreThanMoney completa + o pack certo para o teu momento — sem teres de escolher entre comunidade, ferramentas e ritmo próprio.",
    features: [
      "App MTM System completa (iOS + Android)",
      "Pack Membro €35/mês ou Pack Premium €65/mês",
      "Feed social, chat da comunidade e portfólio ao vivo",
      "Mentor AI + Live Sessions de trading",
      "Escolhe e muda de pack quando quiseres",
    ],
    cta: "Ver os Packs",
    href: "/register",
    badge: "Pack Membro €35 · Premium €65/mês",
  },
  {
    id: "tools",
    emoji: "🛠️",
    icon: BarChart3,
    label: "Quero as ferramentas de análise",
    color: "#8B5CF6",
    bg: "from-purple-500/10 to-purple-900/5",
    border: "border-purple-500/30",
    description: "Acede aos scanners TradingView exclusivos da MTM para identificar oportunidades no mercado — sem teres de estar colado aos gráficos o dia todo.",
    features: [
      "Gold Killer Scanner — Ouro e XAU/USD",
      "MTM Scanner V3.4 — Multi-ativo",
      "Sensei X — estratégia de IA multi-confluência",
      "Pack Total com todos os scanners incluídos",
      "Tutorial de configuração incluído",
    ],
    cta: "Ver Scanners",
    href: "/scanners",
    badge: "Pack Total — €35/mês",
  },
]

// ─── Technology Card ───────────────────────────────────────────────────────────

const TECHNOLOGIES = [
  {
    id: "iq-sync",
    emoji: "🔄",
    title: "IQ Sync",
    subtitle: "Mantém-te ligado em tempo real",
    color: "#3B82F6",
    gradient: "from-blue-900/30 to-cyan-900/10",
    border: "border-blue-500/30",
    description:
      "Sistema \"Receive → Review → Confirm\": recebes as ideias de mercado em tempo real, revês cada uma e confirmas tu mesmo a execução. Mantens sempre o controlo final de cada decisão — sem automação cega.",
    features: [
      { icon: RefreshCw, label: "Sincronização de ideias em tempo real" },
      { icon: ShieldCheck, label: "Confirmação manual — controlo total" },
      { icon: Smartphone, label: "Funciona direto da app MTM System" },
      { icon: Zap, label: "Execução rápida sem saltar entre apps" },
      { icon: TrendingUp, label: "Ideal para quem quer aprender a decidir" },
    ],
    cta: "Explorar Tecnologia",
    href: "/automation",
    platforms: ["App MTM System", "iOS · Android"],
  },
  {
    id: "iq-auto",
    emoji: "🤖",
    title: "IQ Auto",
    subtitle: "A revolução da automação",
    color: "#A855F7",
    gradient: "from-purple-900/30 to-pink-900/10",
    border: "border-purple-500/30",
    description:
      "Experiência \"set-it-once\": configuras uma vez e ficas ligado às estratégias de trading da MTM, com a tua conta a manter-se alinhada em segundo plano — automação completa para quem quer libertar tempo.",
    features: [
      { icon: Bot, label: "Configuração única — depois corre sozinho" },
      { icon: Zap, label: "Estratégias MTM sempre atualizadas" },
      { icon: ShieldCheck, label: "Conta sempre alinhada em segundo plano" },
      { icon: Brain, label: "Pensado para quem quer total liberdade" },
      { icon: TrendingUp, label: "Add-on premium a partir de $59,99/mês" },
    ],
    cta: "Explorar Tecnologia",
    href: "/automation",
    platforms: ["Add-on IQONIC", "Integração via IQ Sync"],
  },
]

// ─── Pack Pricing ──────────────────────────────────────────────────────────────

const PACKS = [
  {
    id: "app_member",
    name: "Pack Membro App",
    emoji: "📱",
    price: "€35",
    period: "/mês",
    color: "#10B981",
    border: "border-emerald-500/30",
    bg: "from-emerald-500/10 to-emerald-900/5",
    popular: false,
    features: [
      "App MTM (iOS + Android)",
      "Feed social da comunidade",
      "Chat da comunidade",
      "Live sessions de trading",
      "Mentor AI básico",
      "Portfólio MTM ao vivo",
    ],
    cta: "Começar com €35/mês",
    href: "/register?plan=app_member",
  },
  {
    id: "premium",
    name: "Pack Premium",
    emoji: "💎",
    price: "€65",
    period: "/mês",
    color: "#D2A63C",
    border: "border-[#D2A63C]/50",
    bg: "from-[#D2A63C]/15 to-[#BB8525]/5",
    popular: true,
    features: [
      "Tudo do Pack Membro",
      "Acesso Premium ao chat",
      "Cursos de Forex e Cripto",
      "Cursos de Marketing Digital",
      "Cursos de Inteligência Artificial",
      "Mentor AI premium (ilimitado)",
      "Scanner Gold Killer incluído",
      "Trade Ideas — canal premium",
    ],
    cta: "Começar com €65/mês",
    href: "/register?plan=premium",
  },
  {
    id: "scanners",
    name: "Pack Scanners",
    emoji: "🔍",
    price: "€35",
    period: "/mês",
    color: "#8B5CF6",
    border: "border-purple-500/30",
    bg: "from-purple-500/10 to-purple-900/5",
    popular: false,
    features: [
      "Gold Killer Scanner",
      "MTM Scanner V3.4",
      "Sensei X Scanner",
      "Acesso TradingView invite-only",
      "Alertas automáticos",
      "Tutorial em vídeo",
      "Actualizações incluídas",
    ],
    cta: "Ver Scanners",
    href: "/scanners",
  },
]

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NewLandingPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [activePath, setActivePath] = useState<string | null>(null)

  useEffect(() => {
    setTestimonials(getRandomTestimonials(6))
  }, [])

  useEffect(() => {
    if (testimonials.length === 0) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 3
        return next >= testimonials.length ? 0 : next
      })
    }, 6000)
    return () => clearInterval(interval)
  }, [testimonials.length])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden">
      <ParticleBackground />
      <LiveActivityTicker />

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-16 pb-8">
        <div className="text-center max-w-4xl mx-auto z-10 relative">
          <Badge className="mb-6 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30 px-4 py-2 text-sm">
            🔥 Plataforma de Trading & Educação — Portugal
          </Badge>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight">
            <span className="bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Aprende.
            </span>{" "}
            <span className="text-white">Analisa.</span>{" "}
            <span className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Cresce.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            A MTM combina <strong className="text-white">educação real</strong>,{" "}
            <strong className="text-white">tecnologia de análise</strong> e uma{" "}
            <strong className="text-white">comunidade ativa</strong> para trader que quer evoluir de verdade.
          </p>

          {/* Vídeo de Apresentação */}
          <div className="mb-12 max-w-4xl mx-auto">
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-900 border border-mtm-primary/30">
              <iframe
                src="https://www.youtube.com/embed/dgd0-mLIrMw?autoplay=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3"
                title="Apresentação MoreThanMoney"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>
          </div>

          {/* História Pessoal */}
          <div className="bg-gradient-to-r from-mtm-primary/10 to-amber-500/10 border border-mtm-primary/30 rounded-xl p-6 mb-8 max-w-4xl mx-auto">
            <p className="text-xl md:text-2xl text-gray-300 mb-4 max-w-3xl mx-auto">
              Aos 41 anos, depois de 3 anos a usar a aprendizagem no modelo da <strong className="text-mtm-primary">IQONIC</strong> e seguir os ensinamentos de <strong>Warren Buffett</strong> e <strong>Eric Worre</strong>,
              criei algo que transformou vidas.
            </p>
            <p className="text-lg text-gray-400 mb-4">
              <em>"Não é sobre ter mais dinheiro, é sobre ter mais <strong>liberdade</strong> para viver a vida que verdadeiramente queres."</em>
            </p>
            <p className="text-base text-gray-300 max-w-3xl mx-auto">
              A MoreThanMoney nasceu da necessidade real de combinar <strong className="text-white">educação sólida</strong> com tecnologia avançada,
              criando um sistema que <strong>duplica resultados</strong> através de <strong>ação disciplinada</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button
              size="lg"
              className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold px-8 py-4 text-base"
              onClick={() => scrollTo("choose-path")}
            >
              Escolhe o teu caminho
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10 px-8 py-4 text-base"
              onClick={() => scrollTo("technologies")}
            >
              Ver as tecnologias
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            {[
              { label: "Comunidade activa", value: "🏆" },
              { label: "Scanners exclusivos", value: "3" },
              { label: "Cursos disponíveis", value: "📚" },
              { label: "Live sessions/mês", value: "🎥" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-1.5">
                <span>{stat.value}</span>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce z-10">
          <ChevronDown className="w-6 h-6 text-[#D2A63C]/60" />
        </div>
      </section>

      {/* ── CHOOSE YOUR PATH ─────────────────────────────────────────────────── */}
      <section id="choose-path" className="py-24 px-4 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">🎯 O teu caminho</Badge>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Por onde queres <span className="text-[#D2A63C]">começar?</span>
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-lg">
              Cada pessoa tem o seu ritmo. Escolhe o que faz mais sentido para ti agora.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PATHS.map((path) => {
              const Icon = path.icon
              const isActive = activePath === path.id
              return (
                <button
                  key={path.id}
                  onClick={() => setActivePath(isActive ? null : path.id)}
                  className={`text-left rounded-2xl border p-6 transition-all duration-300 bg-gradient-to-br ${path.bg} ${path.border} ${
                    isActive ? "scale-[1.02] shadow-2xl" : "hover:scale-[1.01]"
                  }`}
                  style={{ borderColor: isActive ? path.color : undefined, boxShadow: isActive ? `0 0 40px ${path.color}20` : undefined }}
                >
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${path.color}20`, border: `1px solid ${path.color}40` }}
                    >
                      <span className="text-2xl">{path.emoji}</span>
                    </div>
                    <div>
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${path.color}15`, color: path.color, border: `1px solid ${path.color}30` }}
                      >
                        {path.badge}
                      </span>
                      <h3 className="font-bold text-white text-lg mt-1 leading-tight">{path.label}</h3>
                    </div>
                  </div>

                  <p className="text-gray-400 text-sm leading-relaxed mb-4">{path.description}</p>

                  {/* Features (shown when active) */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isActive ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <ul className="space-y-1.5 mb-4">
                      {path.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                          <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: path.color }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CTA */}
                  <Link
                    href={path.href}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm mt-2 transition-all"
                    style={{
                      backgroundColor: path.color,
                      color: "#000",
                    }}
                  >
                    {path.cta}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── TWO TECHNOLOGIES ─────────────────────────────────────────────────── */}
      <section id="technologies" className="py-24 px-4 relative z-10 bg-gray-900/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">⚡ Tecnologia</Badge>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Duas tecnologias que{" "}
              <span className="text-[#D2A63C]">libertam</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Construídas especificamente para traders que querem resultados — sem complicação, sem perder tempo.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {TECHNOLOGIES.map((tech) => {
              return (
                <div
                  key={tech.id}
                  className={`rounded-2xl border bg-gradient-to-br ${tech.gradient} ${tech.border} overflow-hidden`}
                >
                  {/* Color band */}
                  <div className="h-1.5" style={{ background: `linear-gradient(to right, ${tech.color}, ${tech.color}88)` }} />

                  <div className="p-7">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-5">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                        style={{ backgroundColor: `${tech.color}15`, border: `1.5px solid ${tech.color}30` }}
                      >
                        {tech.emoji}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: tech.color }}>
                          {tech.subtitle}
                        </p>
                        <h3 className="text-xl font-black text-white">{tech.title}</h3>
                      </div>
                    </div>

                    <p className="text-gray-300 text-sm leading-relaxed mb-6">{tech.description}</p>

                    {/* Feature list */}
                    <ul className="space-y-2.5 mb-6">
                      {tech.features.map(({ icon: Icon, label }) => (
                        <li key={label} className="flex items-center gap-3 text-sm text-gray-300">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${tech.color}15` }}
                          >
                            <Icon className="w-4 h-4" style={{ color: tech.color }} />
                          </div>
                          {label}
                        </li>
                      ))}
                    </ul>

                    {/* Platform badges */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {tech.platforms.map((p) => (
                        <span
                          key={p}
                          className="text-[11px] px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: `${tech.color}10`, color: tech.color, border: `1px solid ${tech.color}25` }}
                        >
                          {p}
                        </span>
                      ))}
                    </div>

                    {/* CTA */}
                    <Link href={tech.href}>
                      <Button
                        className="w-full font-bold text-sm"
                        style={{ backgroundColor: tech.color, color: "#000" }}
                      >
                        {tech.cta}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>

          {/* App mobile — pré-visualização em formato telemóvel */}
          <div className="mt-16 rounded-2xl border border-[#D2A63C]/20 bg-gray-900/50 p-6 md:p-10">
            <div className="text-center mb-10">
              <p className="text-sm text-[#D2A63C] mb-2 uppercase tracking-widest font-bold">MTM System App</p>
              <h3 className="text-2xl md:text-3xl font-black mb-2">Tudo isto, no bolso</h3>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Uma pré-visualização real do que encontras dentro da app — feed, chat, portfólio, scanners e mentor AI, em formato telemóvel.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
              {/* Frame 1 — Feed social */}
              <div className="w-[230px] rounded-[2rem] border-4 border-gray-800 bg-black shadow-2xl overflow-hidden">
                <div className="h-5 bg-gray-900 flex items-center justify-center">
                  <div className="w-16 h-2.5 rounded-full bg-gray-800" />
                </div>
                <div className="bg-gradient-to-b from-gray-900 to-black p-3 space-y-2.5 min-h-[280px]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1">Feed</p>
                  <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-[#D2A63C]/30" />
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-white">Ricardo MTM</p>
                        <p className="text-[8px] text-gray-500">há 12 min</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-300 leading-relaxed">XAU/USD a testar resistência-chave 📈 Vamos acompanhar de perto…</p>
                    <div className="flex items-center gap-3 mt-2 text-[8px] text-gray-500">
                      <span>❤️ 128</span><span>💬 24</span><span>↗ partilhar</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/30" />
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-white">Comunidade MTM</p>
                        <p className="text-[8px] text-gray-500">há 1h</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-300 leading-relaxed">Live Session esta noite às 21h — não percas! 🔴</p>
                  </div>
                </div>
              </div>

              {/* Frame 2 — Chat em tempo real */}
              <div className="w-[230px] rounded-[2rem] border-4 border-gray-800 bg-black shadow-2xl overflow-hidden">
                <div className="h-5 bg-gray-900 flex items-center justify-center">
                  <div className="w-16 h-2.5 rounded-full bg-gray-800" />
                </div>
                <div className="bg-gradient-to-b from-gray-900 to-black p-3 space-y-2 min-h-[280px] flex flex-col">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1">Chat · Comunidade</p>
                  <div className="self-start max-w-[75%] rounded-xl rounded-tl-sm bg-gray-800 px-2.5 py-1.5">
                    <p className="text-[9px] text-gray-200">Alguém mais a seguir o setup do EUR/USD? 👀</p>
                  </div>
                  <div className="self-end max-w-[75%] rounded-xl rounded-tr-sm bg-[#D2A63C]/90 px-2.5 py-1.5">
                    <p className="text-[9px] text-black font-medium">Sim! Já entrei na zona dos 1.0850 ✅</p>
                  </div>
                  <div className="self-start max-w-[75%] rounded-xl rounded-tl-sm bg-gray-800 px-2.5 py-1.5">
                    <p className="text-[9px] text-gray-200">Boa gestão 🔥 manda print depois</p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 rounded-full bg-gray-900 border border-gray-800 px-3 py-1.5">
                    <p className="text-[8px] text-gray-500 flex-1">Escreve uma mensagem…</p>
                    <span className="text-[10px]">➤</span>
                  </div>
                </div>
              </div>

              {/* Frame 3 — Portfólio + Scanner */}
              <div className="w-[230px] rounded-[2rem] border-4 border-gray-800 bg-black shadow-2xl overflow-hidden">
                <div className="h-5 bg-gray-900 flex items-center justify-center">
                  <div className="w-16 h-2.5 rounded-full bg-gray-800" />
                </div>
                <div className="bg-gradient-to-b from-gray-900 to-black p-3 space-y-2.5 min-h-[280px]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1">Portfólio ao vivo</p>
                  <div className="rounded-xl bg-gray-900/80 border border-gray-800 p-2.5">
                    <p className="text-[8px] text-gray-500">Saldo total</p>
                    <p className="text-base font-black text-emerald-400">+18,4%</p>
                    <div className="flex items-end gap-1 h-8 mt-1.5">
                      {[40, 55, 35, 70, 60, 80, 65].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-emerald-500/40" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold px-1 pt-1">Scanner · Sinal</p>
                  <div className="rounded-xl bg-gray-900/80 border border-[#D2A63C]/30 p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-white">XAU/USD</p>
                      <p className="text-[8px] text-emerald-400">Compra detetada</p>
                    </div>
                    <span className="text-[8px] px-2 py-1 rounded-full bg-[#D2A63C]/20 text-[#D2A63C] font-bold">BUY</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bullet points — porquê a app */}
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 max-w-2xl mx-auto mt-10 text-sm text-gray-300">
              {[
                "Feed social com as ideias e análises da equipa MTM",
                "Chat em tempo real com a comunidade (iOS e Android)",
                "Portfólio MTM ao vivo, sempre atualizado",
                "Scanners com sinais diretos no teu telemóvel",
                "Mentor AI disponível 24/7 para tirar dúvidas",
                "Live Sessions e notificações em tempo real",
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D2A63C] mt-0.5 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>

            <p className="text-xs text-gray-600 mt-8 text-center">Disponível para iOS e Android</p>
            <div className="flex justify-center gap-4 mt-4">
              <a
                href="https://apps.apple.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors"
              >
                <span>🍎</span> App Store
              </a>
              <a
                href="/app-mobile"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors"
              >
                <span>🤖</span> Android (PWA)
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 relative z-10">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">💳 Planos</Badge>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Simples. <span className="text-[#D2A63C]">Transparente.</span> Sem surpresas.
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-lg">
              Escolhe o plano que se adequa ao teu momento. Podes cancelar a qualquer hora.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PACKS.map((pack) => (
              <div
                key={pack.id}
                className={`relative rounded-2xl border bg-gradient-to-br ${pack.bg} ${pack.border} p-6 flex flex-col`}
                style={{ boxShadow: pack.popular ? `0 0 60px ${pack.color}20` : undefined }}
              >
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#D2A63C] text-black text-xs font-black px-4 py-1.5 rounded-full">
                      🔥 Mais escolhido
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="text-center mb-6">
                  <span className="text-4xl">{pack.emoji}</span>
                  <h3 className="font-black text-white text-lg mt-2">{pack.name}</h3>
                  <div className="flex items-baseline justify-center gap-1 mt-3">
                    <span className="text-4xl font-black text-white">{pack.price}</span>
                    <span className="text-gray-400 text-sm">{pack.period}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-8 flex-1">
                  {pack.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 flex-shrink-0" style={{ color: pack.color }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link href={pack.href}>
                  <Button
                    className="w-full font-bold py-5 text-sm"
                    style={{ backgroundColor: pack.color, color: "#000" }}
                  >
                    {pack.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-600 mt-8">
            7 dias de garantia nos planos mensais. Sem compromisso de continuidade.
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 relative z-10 bg-gray-900/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">⭐ Testemunhos</Badge>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              O que dizem os{" "}
              <span className="text-[#D2A63C]">nossos membros</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.slice(currentIndex, currentIndex + 3).map((t: Testimonial) => (
              <div
                key={t.id}
                className="rounded-2xl border border-[#D2A63C]/20 bg-gradient-to-br from-[#D2A63C]/5 to-transparent p-6"
              >
                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#D2A63C] text-[#D2A63C]" />
                  ))}
                </div>

                <Quote className="w-6 h-6 text-[#D2A63C]/30 mb-2" />
                <p className="text-gray-300 text-sm leading-relaxed mb-6 italic">"{t.content}"</p>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center font-bold text-[#D2A63C] text-sm">
                    {t.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-gray-500">{t.location}</p>
                      {t.verified && (
                        <UserCheck className="w-3 h-3 text-green-400" />
                      )}
                    </div>
                  </div>
                </div>

                {t.profit && (
                  <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Resultado</span>
                    <span className="font-bold text-green-400">{t.profit}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Navigation dots */}
          <div className="flex justify-center gap-2 mt-10">
            {Array.from({ length: Math.ceil(testimonials.length / 3) }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx * 3)}
                className={`rounded-full transition-all duration-300 ${
                  idx === Math.floor(currentIndex / 3)
                    ? "bg-[#D2A63C] w-8 h-2"
                    : "bg-gray-700 w-2 h-2 hover:bg-gray-500"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 relative z-10">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="rounded-3xl border border-[#D2A63C]/30 bg-gradient-to-br from-[#D2A63C]/10 to-[#BB8525]/5 p-10">
            <div className="text-5xl mb-4">🚀</div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Pronto para{" "}
              <span className="text-[#D2A63C]">evoluir de verdade?</span>
            </h2>
            <p className="text-gray-300 text-lg mb-8 max-w-xl mx-auto">
              Junta-te a uma comunidade de traders que aprende, analisa e cresce — com as ferramentas certas ao teu lado.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button
                  size="lg"
                  className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-black px-10 py-5 text-base"
                >
                  Começar agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/scanners">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10 px-10 py-5 text-base"
                >
                  Ver scanners
                </Button>
              </Link>
            </div>
            <p className="text-xs text-gray-600 mt-5">
              Sem permanência mínima · Cancelamento a qualquer momento · Suporte em português
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
