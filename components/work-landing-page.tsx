"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Globe,
  GraduationCap,
  CheckCircle2,
  TrendingUp,
  Target,
  ArrowDown,
  ChevronRight,
  Sparkles,
} from "lucide-react"

const WHATSAPP_LINK = "https://wa.link/yyml5v"

function useScrollReveal() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth"
    return () => {
      document.documentElement.style.scrollBehavior = ""
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const els = container.querySelectorAll<HTMLElement>("[data-reveal]")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true")
          }
        })
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return containerRef
}

export default function WorkLandingPage() {
  const containerRef = useScrollReveal()

  return (
    <div ref={containerRef} className="work-landing bg-black text-white antialiased overflow-x-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .work-landing [data-reveal] {
          opacity: 0;
          transform: translateY(36px);
          transition: opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .work-landing [data-reveal][data-visible="true"] {
          opacity: 1;
          transform: translateY(0);
        }
        .work-landing [data-reveal].reveal-scale {
          transform: translateY(24px) scale(0.97);
        }
        .work-landing [data-reveal].reveal-scale[data-visible="true"] {
          transform: translateY(0) scale(1);
        }
        .work-landing [data-reveal].delay-1 { transition-delay: 0.08s; }
        .work-landing [data-reveal].delay-2 { transition-delay: 0.16s; }
        .work-landing [data-reveal].delay-3 { transition-delay: 0.24s; }
        .work-landing [data-reveal].delay-4 { transition-delay: 0.32s; }
        .work-landing [data-reveal].delay-5 { transition-delay: 0.4s; }
        @keyframes work-shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .work-hero-title-glow {
          background: linear-gradient(90deg, #fef3c7 0%, #fcd34d 25%, #f59e0b 50%, #fcd34d 75%, #fef3c7 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: work-shimmer 8s linear infinite;
        }
        .work-hero-bg {
          background: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(26,26,26,0.98) 0%, black 70%);
        }
        .work-section-curve {
          height: 6rem;
          background: radial-gradient(ellipse 80% 100% at 50% 100%, #0a0a0a 0%, transparent 70%);
        }
        .work-card-netflix {
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1),
            border-color 0.3s ease,
            background 0.3s ease;
        }
        .work-card-netflix:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 24px 48px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.15), 0 20px 50px -20px rgba(212,175,55,0.25);
        }
        .work-btn-cta {
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.3s ease,
            background 0.3s ease;
        }
        .work-btn-cta:hover {
          transform: scale(1.03);
          box-shadow: 0 0 40px -5px rgba(212,175,55,0.5);
        }
        @keyframes work-timeline-dot {
          0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
          70% { box-shadow: 0 0 0 12px rgba(212,175,55,0); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
        }
        .work-landing [data-visible="true"] .work-timeline-dot {
          animation: work-timeline-dot 1.5s ease-out;
        }
      `}} />

      {/* Header estilo Netflix: gradiente para transparente */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/90 to-transparent pt-2 pb-4 transition-all duration-300">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/new-landing" className="flex items-center flex-shrink-0">
            <Image
              src="/icon-512x512.png"
              alt="MoreThanMoney"
              width={512}
              height={512}
              className="h-9 w-auto transition-opacity hover:opacity-90"
              priority
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/tradingfloor"
              className="work-btn-cta rounded-full border border-white/25 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              Trading Floor
            </Link>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="work-btn-cta rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/95 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.4)]"
            >
              Falar com a equipa
            </a>
          </div>
        </div>
      </header>

      {/* 1. HERO - fundo Netflix: preto + radial suave + transição para secção */}
      <section className="work-hero-bg relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-16">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.4)_60%,black_100%)]" />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <div data-reveal className="mb-8 flex justify-center">
            <Image
              src="/icon-512x512.png"
              alt="MoreThanMoney"
              width={512}
              height={512}
              className="h-14 w-auto sm:h-16 md:h-20 drop-shadow-[0_0_40px_rgba(212,175,55,0.15)]"
              priority
            />
          </div>
          <p
            data-reveal
            className="mb-6 text-sm font-medium uppercase tracking-[0.25em] text-amber-400/90"
          >
            Recrutamento · Equipa de Crescimento
          </p>
          <h1
            data-reveal
            className="delay-1 text-4xl font-extralight tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Constrói o Futuro da{" "}
            <span className="work-hero-title-glow font-semibold">MoreThanMoney</span>
          </h1>
          <p
            data-reveal
            className="delay-2 mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl"
          >
            Estamos a construir uma equipa global de pessoas ambiciosas para expandir
            a comunidade MoreThanMoney.
          </p>
          <ul
            data-reveal
            className="delay-3 mt-10 flex flex-wrap justify-center gap-6 text-sm text-zinc-500 sm:gap-10"
          >
            <li className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-amber-500/80" />
              Modelo 100% remoto
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-500/80" />
              Sistema já validado
            </li>
            <li className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500/80" />
              Comissões recorrentes
            </li>
          </ul>
          <div data-reveal className="delay-4 mt-14">
            <a
              href="#vagas"
              className="work-btn-cta inline-flex items-center gap-2 rounded-full bg-amber-500 px-8 py-4 text-base font-medium text-black hover:bg-amber-400"
            >
              Explorar Oportunidades
              <ChevronRight className="h-5 w-5" />
            </a>
          </div>
        </div>
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-zinc-500">
          <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
          <div className="h-10 w-6 rounded-full border-2 border-white/20 flex justify-center pt-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80 animate-bounce" />
          </div>
        </div>
      </section>
      <div className="work-section-curve w-full relative -mt-24" aria-hidden />

      {/* 2. SOCIAL PROOF */}
      <section className="relative bg-black py-28 px-6">
        <div className="mx-auto max-w-5xl">
          <h2
            data-reveal
            className="text-center text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            Uma comunidade em crescimento global
          </h2>
          <p
            data-reveal
            className="delay-1 mx-auto mt-6 max-w-2xl text-center text-zinc-400 leading-relaxed"
          >
            A MoreThanMoney é uma comunidade focada em educação financeira, trading e
            crescimento pessoal. Estamos a construir uma rede global de pessoas que
            querem dominar dinheiro, mercados e oportunidades digitais.
          </p>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Globe, label: "Comunidade internacional", delay: "delay-1" },
              { icon: GraduationCap, label: "Formação contínua", delay: "delay-2" },
              { icon: CheckCircle2, label: "Sistema validado", delay: "delay-3" },
              { icon: TrendingUp, label: "Crescimento global", delay: "delay-4" },
            ].map((item) => (
              <div
                key={item.label}
                data-reveal
                className={item.delay}
              >
                <div className="work-card-netflix group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:border-amber-500/25 hover:bg-white/[0.05]">
                  <item.icon className="h-10 w-10 text-amber-500/90 mb-4 transition-transform duration-300 group-hover:scale-110" />
                  <p className="font-medium text-white">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. MISSÃO */}
      <section className="relative bg-black border-t border-white/[0.06] py-28 px-6">
        <div className="relative mx-auto max-w-3xl text-center">
          <h2
            data-reveal
            className="text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            A nossa missão
          </h2>
          <p
            data-reveal
            className="delay-1 mt-8 text-lg leading-relaxed text-zinc-400"
          >
            Democratizar o acesso à educação financeira e às oportunidades digitais.
            Acreditamos que qualquer pessoa, em qualquer parte do mundo, deve ter
            acesso às ferramentas necessárias para construir independência financeira.
          </p>
          <p
            data-reveal
            className="delay-2 mt-6 text-zinc-500"
          >
            Estamos a construir uma equipa global que quer fazer parte deste movimento.
          </p>
        </div>
      </section>

      {/* 4. OPORTUNIDADE */}
      <section className="relative bg-black border-t border-white/[0.06] py-28 px-6">
        <div className="mx-auto max-w-5xl">
          <h2
            data-reveal
            className="text-center text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            Mais do que trabalho. Uma oportunidade de crescimento.
          </h2>
          <p
            data-reveal
            className="delay-1 mx-auto mt-6 max-w-2xl text-center text-zinc-400 leading-relaxed"
          >
            A equipa de crescimento expande a comunidade globalmente. Modelo baseado em
            performance: cada membro constrói rendimento recorrente enquanto escala a comunidade.
          </p>
          <p
            data-reveal
            className="delay-2 mx-auto mt-4 max-w-xl text-center text-sm text-amber-400/90"
          >
            O teu papel não é vender. É conteúdo, visão, liderança e cultura. A máquina converte.
          </p>
          <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Sistema comprovado",
              "Formação interna",
              "Scripts de vendas",
              "Comunidade ativa",
              "Crescimento global",
              "Trabalho remoto",
            ].map((label) => (
              <li
                key={label}
                data-reveal
                className="delay-1 work-card-netflix flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-4 hover:border-amber-500/20 hover:bg-white/[0.04]"
              >
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-amber-500/90" />
                <span className="text-white">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 5. VAGAS ABERTAS */}
      <section id="vagas" className="relative bg-black border-t border-white/[0.06] py-28 px-6 scroll-mt-20">
        <div className="relative mx-auto max-w-6xl">
          <h2
            data-reveal
            className="text-center text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            Vagas abertas
          </h2>
          <p
            data-reveal
            className="delay-1 mx-auto mt-4 max-w-xl text-center text-zinc-500"
          >
            Junta-te à equipa de crescimento.
          </p>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {[
              {
                title: "Setter",
                desc: "Responsável por iniciar conversas com potenciais membros e qualificar interessados.",
                responsibilities: [
                  "Conversar com leads",
                  "Qualificar interessados",
                  "Marcar calls com closers",
                ],
                compensation: "5%–10% por cliente fechado · possibilidade de rendimento recorrente",
              },
              {
                title: "Closer",
                desc: "Responsável por realizar calls com potenciais membros e converter interessados em membros da comunidade.",
                responsibilities: [
                  "Realizar calls",
                  "Explicar o sistema",
                  "Converter leads",
                ],
                compensation: "15%–30% por venda fechada",
              },
              {
                title: "Growth Partner",
                desc: "Responsável por gerar novas oportunidades e ajudar a expandir a comunidade globalmente.",
                responsibilities: [
                  "Prospectar novos interessados",
                  "Expandir rede",
                  "Criar oportunidades",
                ],
                compensation: "Comissões por cliente e possibilidade de criar equipa.",
              },
            ].map((role) => (
              <div
                key={role.title}
                data-reveal
                className="delay-1 reveal-scale"
              >
                <div className="work-card-netflix group h-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:border-amber-500/30 hover:bg-white/[0.05]">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 transition-transform duration-300 group-hover:scale-110 group-hover:bg-amber-500/20">
                      <Sparkles className="h-6 w-6 text-amber-500/90" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">{role.title}</h3>
                  </div>
                  <p className="mb-6 text-zinc-400 leading-relaxed">{role.desc}</p>
                  <p className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Responsabilidades
                  </p>
                  <ul className="mb-6 space-y-2">
                    {role.responsibilities.map((r) => (
                      <li key={r} className="flex items-center gap-2 text-sm text-zinc-300">
                        <ChevronRight className="h-4 w-4 text-amber-500/70" />
                        {r}
                      </li>
                    ))}
                  </ul>
                  <p className="mb-8 text-sm text-amber-400/90">{role.compensation}</p>
                  <Link
                    href="/docs/forms/work"
                    className="work-btn-cta inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-3.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 hover:shadow-[0_0_24px_-8px_rgba(212,175,55,0.4)]"
                  >
                    Candidatar-me
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. PERFIL IDEAL */}
      <section className="relative bg-black border-t border-white/[0.06] py-28 px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            data-reveal
            className="text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            Quem procuramos
          </h2>
          <ul className="mt-12 space-y-4 text-left sm:mx-auto sm:max-w-md">
            {[
              "Mentalidade empreendedora",
              "Boa comunicação",
              "Consistência",
              "Ambição",
              "Vontade de aprender",
            ].map((item) => (
              <li
                key={item}
                data-reveal
                className="flex items-center gap-3 text-zinc-300"
              >
                <Target className="h-5 w-5 flex-shrink-0 text-amber-500/80" />
                {item}
              </li>
            ))}
          </ul>
          <p
            data-reveal
            className="delay-1 mt-10 text-sm text-zinc-500"
          >
            Não é necessário experiência em vendas. Fornecemos formação interna.
          </p>
        </div>
      </section>

      {/* 7. PROCESSO */}
      <section className="relative bg-black border-t border-white/[0.06] py-28 px-6">
        <div className="mx-auto max-w-3xl">
          <h2
            data-reveal
            className="text-center text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            Processo de seleção
          </h2>
          <div className="mt-16 space-y-0">
            {[
              "Contacto inicial via WhatsApp",
              "Conversa com a equipa",
              "Acesso à formação",
              "Integração na equipa",
              "Início de atividade",
            ].map((step, i) => (
              <div
                key={step}
                data-reveal
                className="delay-1 flex gap-6 border-l-2 border-white/[0.08] pl-8 pb-12 last:pb-0"
              >
                <span className="work-timeline-dot -ml-[41px] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-amber-500/50 bg-[#050505] text-sm font-medium text-amber-400">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-zinc-300">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. CULTURA */}
      <section className="relative bg-black border-t border-white/[0.06] py-28 px-6">
        <div className="relative mx-auto max-w-3xl text-center">
          <h2
            data-reveal
            className="text-3xl font-light tracking-tight text-white sm:text-4xl"
          >
            Construímos pessoas, não apenas resultados
          </h2>
          <p
            data-reveal
            className="delay-1 mt-8 text-lg leading-relaxed text-zinc-400"
          >
            Na MoreThanMoney acreditamos que crescimento financeiro começa com
            crescimento pessoal. A nossa equipa é composta por pessoas disciplinadas,
            focadas e com mentalidade de crescimento.
          </p>
          <p
            data-reveal
            className="delay-2 mt-6 text-zinc-500"
          >
            Se procuras apenas um emprego, este provavelmente não é o lugar certo.
          </p>
          <p
            data-reveal
            className="delay-3 mt-4 text-white"
          >
            Se procuras crescimento, oportunidade e comunidade, então queremos conhecer-te.
          </p>
        </div>
      </section>

      {/* 9. CTA FINAL */}
      <section className="relative bg-black border-t border-white/[0.06] py-32 px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(212,175,55,0.06),transparent)]" />
        <div className="relative mx-auto max-w-2xl text-center">
          <div data-reveal className="mb-8 flex justify-center">
            <Image
              src="/icon-512x512.png"
              alt="MoreThanMoney"
              width={512}
              height={512}
              className="h-10 w-auto opacity-90"
            />
          </div>
          <h2
            data-reveal
            className="delay-1 text-3xl font-light tracking-tight text-white sm:text-4xl md:text-5xl"
          >
            Queres fazer parte da expansão da MoreThanMoney?
          </h2>
          <p
            data-reveal
            className="delay-1 mt-6 text-zinc-400"
          >
            Estamos a selecionar pessoas ambiciosas para crescer connosco.
          </p>
          <div data-reveal className="delay-2 mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/docs/forms/work"
              className="work-btn-cta inline-flex items-center gap-2 rounded-full bg-amber-500 px-10 py-5 text-lg font-medium text-black hover:bg-amber-400"
            >
              Candidatar-me agora
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="work-btn-cta inline-flex items-center gap-2 rounded-full border border-white/25 px-8 py-4 text-sm font-medium text-white hover:bg-white/10"
            >
              Falar com a equipa
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-black border-t border-white/[0.06] py-10 px-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Link href="/new-landing" className="flex-shrink-0">
            <Image
              src="/icon-512x512.png"
              alt="MoreThanMoney"
              width={512}
              height={512}
              className="h-8 w-auto opacity-80 transition-opacity hover:opacity-100"
            />
          </Link>
          <span className="text-sm text-zinc-500">
            © {new Date().getFullYear()} MoreThanMoney. Todos os direitos reservados.
          </span>
        </div>
      </footer>
    </div>
  )
}
