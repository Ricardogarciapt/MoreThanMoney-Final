import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Bot, Building2, CandlestickChart, GraduationCap, Mic, Server, UserRound } from "lucide-react"
import { linkAgendar } from "@/lib/agenda/link"
import { TESTEMUNHOS } from "@/lib/testemunhos"
import { CASOS, DEMOS, FAQ, OFERTAS, PERFIS } from "@/lib/site-solucoes/conteudo"

/**
 * /solucoes: o site de apresentação dos modelos de negócio da MTM (pedido do Ricardo, 16/11/2026).
 *
 * Também servido por domínio próprio (lib/site-solucoes/dominio.ts + middleware). Página única, de
 * propósito: o estudo de sites de agências de automação mostrou que a página que converte é a que
 * diz para quem é, mostra prova e tem UMA acção. A acção aqui é marcar o diagnóstico na agenda
 * própria (/agendar?t=negocios), nunca um Calendly.
 *
 * Paleta da casa: ouro #D2A63C / #E9C46A sobre carvão. Tema escuro fixo (a marca é escura).
 * Conteúdo editável em lib/site-solucoes/conteudo.ts. Sem números inventados.
 */

const ICONES: Record<string, typeof Building2> = {
  negocios: Building2,
  trading: CandlestickChart,
  traders: Bot,
  educadores: Mic,
  pessoas: UserRound,
}

const CTA_LABEL = "Marcar diagnóstico"

export default function SolucoesPage() {
  const agendar = linkAgendar("negocios")
  const casos = CASOS.filter((c) => c.autorizado)
  const vozes = TESTEMUNHOS.filter((t) => t.chat).slice(0, 3)

  return (
    <div className="min-h-[100dvh] bg-[#08090C] text-zinc-100 antialiased">
      {/* Navegação */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#08090C]/85 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="#topo" className="flex items-center gap-2">
            <Image src="/logo-mtm-transparent.png" alt="MoreThanMoney" width={36} height={36} priority />
            <span className="text-sm font-semibold tracking-tight">MoreThanMoney</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            <a href="#para-quem" className="hover:text-white">Para quem</a>
            <a href="#demos" className="hover:text-white">Demos</a>
            <a href="#precos" className="hover:text-white">Preços</a>
            <a href="#duvidas" className="hover:text-white">Dúvidas</a>
          </div>
          <a
            href={agendar}
            className="rounded-full bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
          >
            {CTA_LABEL}
          </a>
        </nav>
      </header>

      <main id="topo">
        {/* Herói: mensagem à esquerda, sistema real à direita */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-10%] top-[-20%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(210,166,60,0.18),transparent)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 md:grid-cols-[1.2fr_1fr] md:pt-20">
            <div>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
                Automatizamos o que te <span className="text-[#E9C46A]">rouba horas.</span>
              </h1>
              <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-zinc-400">
                Sites, apps e agentes de IA para pequenos negócios, traders e educadores. Construído por nós, sem subscrições externas.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={agendar}
                  className="inline-flex items-center gap-2 rounded-full bg-[#D2A63C] px-6 py-3 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
                >
                  {CTA_LABEL} <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#demos"
                  className="inline-flex items-center rounded-full border border-white/15 px-6 py-3 font-semibold text-zinc-200 transition hover:border-[#D2A63C]/60"
                >
                  Ver demos
                </a>
              </div>
            </div>
            <div className="relative mx-auto flex w-full max-w-sm justify-center gap-4">
              <Image
                src="/images/apresentacao/app-chat.jpg"
                alt="App MTM System: chat da comunidade"
                width={620}
                height={1344}
                priority
                className="w-1/2 translate-y-6 rounded-3xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(210,166,60,0.35)]"
              />
              <Image
                src="/images/apresentacao/app-aulas.jpg"
                alt="App MTM System: aulas"
                width={620}
                height={1344}
                className="w-1/2 -translate-y-4 rounded-3xl border border-white/10"
              />
            </div>
          </div>
        </section>

        {/* Para quem: bento com cinco perfis */}
        <section id="para-quem" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Onde te encaixas</h2>
          <p className="mt-3 max-w-[60ch] text-zinc-400">
            A mesma base tecnológica serve casos muito diferentes. Escolhe o teu.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {PERFIS.map((p, i) => {
              const Icone = ICONES[p.id] ?? Building2
              const larga = i === 0
              return (
                <article
                  key={p.id}
                  id={p.id}
                  className={[
                    "rounded-2xl border border-white/8 p-6 transition hover:border-[#D2A63C]/40",
                    larga ? "bg-gradient-to-br from-[#D2A63C]/15 to-transparent md:col-span-4 md:row-span-2" : "bg-white/[0.03]",
                    larga ? "" : i >= 3 ? "md:col-span-3" : "md:col-span-2",
                  ].join(" ")}
                >
                  <Icone className="h-6 w-6 text-[#E9C46A]" strokeWidth={1.75} />
                  <h3 className={larga ? "mt-4 text-2xl font-bold" : "mt-4 text-lg font-bold"}>{p.titulo}</h3>
                  <p className="mt-2 text-sm text-zinc-400">{p.dor}</p>
                  <p className="mt-3 text-sm text-zinc-200">{p.solucao}</p>
                  {larga && (
                    <ul className="mt-6 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                      {p.entregas.map((e) => (
                        <li key={e} className="rounded-lg bg-black/30 px-3 py-2">{e}</li>
                      ))}
                    </ul>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        {/* Como trabalhamos: três verbos em linha */}
        <section className="border-y border-white/5 bg-white/[0.02]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-3">
            {[
              { t: "Diagnosticar", d: "30 minutos para ver onde perdes tempo e dinheiro. Sem compromisso." },
              { t: "Construir", d: "Fazemos a página, a app ou o agente sobre o nosso sistema. Tu validas." },
              { t: "Acompanhar", d: "Entregamos a funcionar e ficamos por perto para afinar." },
            ].map((s) => (
              <div key={s.t}>
                <h3 className="text-xl font-bold text-[#E9C46A]">{s.t}</h3>
                <p className="mt-2 text-zinc-400">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Demos: o sistema que a MTM usa todos os dias */}
        <section id="demos" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">A primeira cliente somos nós</h2>
            <p className="mt-3 max-w-[60ch] text-zinc-400">
              Tudo o que oferecemos corre primeiro na MoreThanMoney. Estas são capturas reais da nossa app.
            </p>
          </div>
          <div className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:px-[max(1rem,calc((100vw_-_72rem)/2_+_1rem))]">
            {DEMOS.map((d) => (
              <figure key={d.img} className="w-[220px] shrink-0 snap-start">
                <Image
                  src={d.img}
                  alt={d.titulo}
                  width={620}
                  height={1344}
                  loading="lazy"
                  className="rounded-2xl border border-white/10"
                />
                <figcaption className="mt-3">
                  <span className="block font-semibold">{d.titulo}</span>
                  <span className="text-sm text-zinc-400">{d.texto}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Casos e vozes */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Casos e testemunhos</h2>
          {casos.length > 0 ? (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {casos.map((c) => (
                <article key={c.cliente} className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                  <p className="text-sm text-[#E9C46A]">{c.setor}</p>
                  <h3 className="mt-1 text-xl font-bold">{c.cliente}</h3>
                  <p className="mt-3 text-zinc-400">{c.problema}</p>
                  <p className="mt-2 text-zinc-300">{c.feito}</p>
                  <p className="mt-3 font-semibold">{c.resultado}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 max-w-[62ch] text-zinc-400">
              Estamos a fechar os primeiros casos de empresas com autorização para publicar. Até lá, mostramos-te projectos reais
              ao vivo na chamada de diagnóstico.
            </p>
          )}
          {vozes.length > 0 && (
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {vozes.map((v) => (
                <blockquote key={v.q} className="border-l-2 border-[#D2A63C]/60 pl-5">
                  <p className="line-clamp-3 text-zinc-200">“{v.q}”</p>
                  <footer className="mt-3 text-sm text-zinc-500">
                    {v.n}, membro da comunidade MTM
                    <span className="block">{v.l}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          )}
        </section>

        {/* Preços */}
        <section id="precos" className="border-t border-white/5 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">O que custa</h2>
            <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {OFERTAS.map((o, i) => (
                <div key={o.nome} className={i === 0 ? "rounded-2xl border border-[#D2A63C]/40 p-6 md:col-span-2" : ""}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold">{o.nome}</h3>
                    <span className={i === 0 ? "text-2xl font-black text-[#E9C46A]" : "font-semibold text-[#E9C46A]"}>{o.preco}</span>
                  </div>
                  <p className="text-sm text-zinc-500">{o.para}</p>
                  <p className="mt-2 text-zinc-400">{o.detalhe}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Porquê próprio */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-[auto_1fr]">
          <Server className="h-16 w-16 text-[#D2A63C]" strokeWidth={1.25} />
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">Tudo nosso, nada alugado</h2>
            <p className="mt-3 max-w-[65ch] text-zinc-400">
              Agenda, chat, automações e base de dados correm no nosso sistema. Menos mensalidades para ti, e ninguém de fora a
              mexer nos dados dos teus clientes.
            </p>
          </div>
        </section>

        {/* Dúvidas */}
        <section id="duvidas" className="mx-auto max-w-3xl px-4 pb-20">
          <h2 className="text-3xl font-bold tracking-tight">Dúvidas</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.p} className="group rounded-xl border border-white/8 bg-white/[0.03] p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.p}</summary>
                <p className="mt-3 text-zinc-400">{f.r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Fecho */}
        <section className="mx-auto mb-20 max-w-6xl px-4">
          <div className="rounded-3xl bg-gradient-to-br from-[#D2A63C] to-[#9C7A24] p-10 text-[#08090C] md:p-14">
            <GraduationCap className="h-8 w-8" />
            <h2 className="mt-4 max-w-[20ch] text-3xl font-black md:text-4xl">Vê onde perdes tempo, em 30 minutos.</h2>
            <a
              href={agendar}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#08090C] px-6 py-3 font-semibold text-[#E9C46A] transition active:scale-[0.98]"
            >
              {CTA_LABEL} <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-zinc-500 md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} MoreThanMoney. Conteúdo educativo, não constitui consultoria financeira.</p>
          <div className="flex gap-5">
            <a href="https://www.morethanmoney.pt" className="hover:text-zinc-300">morethanmoney.pt</a>
            <a href="/privacidade" className="hover:text-zinc-300">Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
