import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Bot, Building2, CandlestickChart, Check, GraduationCap, Mic, Move3d, Server, Sparkles, UserRound } from "lucide-react"
import { linkAgendar } from "@/lib/agenda/link"
import { IDENTIFICACAO } from "@/lib/legal/identificacao"
import { CASOS, DEMOS, FAQ, PERFIS, PROXIMOS } from "@/lib/site-solucoes/conteudo"
import { CASO_MTM, SECTORES } from "@/lib/site-solucoes/automacao"
import { SimuladorSolucoes } from "@/components/solucoes/simulador"
import { HeroAoVivo } from "@/components/solucoes/hero-ao-vivo"
import { AreasInterativas } from "@/components/solucoes/areas-interativas"
import { CasosCiclo } from "@/components/solucoes/casos-ciclo"
import { VideoApresentacao } from "@/components/solucoes/video-apresentacao"
import { MenuTrabalhos } from "@/components/solucoes/menu-trabalhos"
import { DiaAntesDepois } from "@/components/solucoes/dia-antes-depois"
import { demoDoDia } from "@/lib/site-solucoes/demos-diarias"
import type { Metadata } from "next"
import { LOCALE_OG } from "@/lib/site-solucoes/i18n/base"
import { dicionario } from "@/lib/site-solucoes/i18n/dicionarios"
import { alternativas, idiomaDoPedido, tradutorServidor } from "@/lib/site-solucoes/i18n/servidor"
import { IdiomaSolucoes, SeletorIdioma } from "@/components/solucoes/idioma"
import { MiniTelemovel } from "@/components/solucoes/mini-telemovel"
import { MODELOS } from "@/lib/site-solucoes/showroom"
import MedicaoConsentida from "@/components/funis/medicao-consentida"

// Página dinâmica: o idioma vem de cada pedido (?lang=, cookie, browser). A «demo de hoje» muda
// sozinha à meia-noite de Lisboa.
type Props = { searchParams: Promise<{ lang?: string | string[] }> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t } = tradutorServidor(idioma)
  const titulo = t("MoreThanMoney Soluções | Sites, apps e agentes de IA para pequenos negócios")
  const descricao = t("Automatizamos o que te rouba horas: página com app, agentes de IA, scanners em licença, white label e cursos narrados. Sem subscrições externas.")
  return {
    title: titulo,
    description: descricao,
    alternates: alternativas("/solucoes", idioma),
    openGraph: { title: titulo, description: descricao, locale: LOCALE_OG[idioma], url: alternativas("/solucoes", idioma).canonical, images: ["/images/og/solucoes.jpg"] },
  }
}

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

export default async function SolucoesPage({ searchParams }: Props) {
  const idioma = await idiomaDoPedido((await searchParams).lang)
  const { t, ligar } = tradutorServidor(idioma)
  const CTA_LABEL = t("Marcar diagnóstico")
  const agendar = linkAgendar("negocios")
  const casos = CASOS.filter((c) => c.autorizado)
  const demoHoje = demoDoDia()

  return (
    <IdiomaSolucoes idioma={idioma} dic={dicionario(idioma)}>
    <div lang={idioma} className="min-h-[100dvh] bg-[#08090C] text-zinc-100 antialiased">
      {/* Pixel Meta só com «Aceitar» (anúncios B2B, 20/11/2026) */}
      <MedicaoConsentida funil="b2b" conteudo="solucoes" />
      {/* Navegação */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#08090C]/85 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="#topo" className="flex items-center gap-2">
            <Image src="/logo-mtm-transparent.png" alt="MoreThanMoney" width={36} height={36} priority />
            <span className="text-sm font-semibold tracking-tight">MoreThanMoney</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            <a href="#o-que-automatizamos" className="hover:text-white">{t("Soluções")}</a>
            <a href="#simulador" className="hover:text-white">{t("Simulador")}</a>
            <a href="#casos" className="hover:text-white">{t("Casos")}</a>
            <Link href={ligar("/demos")} className="hover:text-white">{t("Demos")}</Link>
            <a href="#trabalhos" className="hover:text-white">{t("Trabalhos")}</a>
          </div>
          <div className="flex items-center gap-2">
            <SeletorIdioma idioma={idioma} rotulo={t("Idioma")} />
            <a
              href={agendar}
              className="hidden rounded-full bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98] sm:inline-flex"
            >
              {CTA_LABEL}
            </a>
          </div>
        </nav>
      </header>

      <main id="topo">
        {/* Herói: mensagem à esquerda, o agente a trabalhar à direita */}
        <section className="relative overflow-hidden">
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-12 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-20">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
                {t("Automatizamos o que te")} <span className="text-[#E9C46A]">{t("rouba horas.")}</span>
              </h1>
              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-zinc-400">{t("Mensagens, marcações, orçamentos e faturas a correr sozinhos, para quem ainda trabalha sem IA.")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={agendar}
                  className="inline-flex items-center gap-2 rounded-full bg-[#D2A63C] px-6 py-3 font-semibold text-[#08090C] transition hover:bg-[#E9C46A] active:scale-[0.98]"
                >
                  {CTA_LABEL} <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#simulador"
                  className="inline-flex items-center rounded-full border border-white/15 px-6 py-3 font-semibold text-zinc-200 transition hover:border-[#D2A63C]/60 active:scale-[0.98]"
                >{t("Pedir análise ao meu negócio")}</a>
              </div>
              <Link href={ligar("/solucoes/prototipo")} className="group mt-5 flex max-w-md items-center gap-3 rounded-2xl border border-[#D2A63C]/40 bg-[#D2A63C]/[0.08] px-4 py-3 transition hover:border-[#D2A63C]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D2A63C] text-black"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{t("Receber o protótipo da minha solução")}</span>
                  <span className="block text-xs text-zinc-400">{t("A nossa IA monta-o na hora. A demo com a tua marca segue até 24 h depois da reunião.")}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-[#E9C46A] transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link href={ligar("/demos#modelos")} className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#E9C46A] hover:text-white">
                {t("Ou vê já a app do teu negócio no showroom")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <HeroAoVivo />
          </div>
        </section>

        {/* Para quem: uma faixa com os negócios que servimos */}
        <div className="overflow-hidden border-y border-white/5 py-5" aria-label={t("Negócios que servimos")}>
          <div className="flex w-max gap-10 whitespace-nowrap text-lg font-semibold text-zinc-500 motion-safe:animate-[solucoes-faixa_40s_linear_infinite]">
            {[...SECTORES, ...SECTORES].map((x, i) => (
              <span key={i} className="flex items-center gap-10">
                {t(x.nome)}
                <span className="h-1.5 w-1.5 rounded-full bg-[#D2A63C]/60" aria-hidden />
              </span>
            ))}
          </div>
          <style>{`@keyframes solucoes-faixa{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        </div>

        {/* Factos de relance: o que nos distingue, em números que são nossos */}
        <section aria-label={t("Em números")} className="mx-auto max-w-6xl px-4 pt-14">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-4">
            {[
              { v: "24 h", k: t("para teres a demo com a tua marca") },
              { v: "14", k: t("soluções prontas a entregar") },
              { v: "5", k: t("línguas no mesmo sistema") },
              { v: "1", k: t("preço fechado, combinado antes de começarmos") },
            ].map((x) => (
              <div key={x.v} className="bg-[#0B0D12] p-5 md:p-7">
                <dt className="sr-only">{x.k}</dt>
                <dd className="bg-gradient-to-br from-[#F5DB8B] via-[#E9C46A] to-[#9C7A24] bg-clip-text text-4xl font-black tabular-nums text-transparent md:text-6xl">{x.v}</dd>
                <dd className="mt-2 text-sm text-zinc-400">{x.k}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* O que automatizamos: as dores de quem trabalha sem IA */}
        <section id="video" className="mx-auto max-w-5xl px-4 pt-20">
          <VideoApresentacao />
        </section>

        {/* Vitrine do showroom: a app do negócio antes de pagar */}
        <section id="vitrine" className="mx-auto max-w-6xl px-4 pt-24">
          <div className="relative overflow-hidden rounded-3xl border border-[#D2A63C]/30 bg-gradient-to-br from-[#D2A63C]/10 via-transparent to-transparent p-6 md:p-12">
            <div className="grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("Showroom")}</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">{t("Vê a app do teu negócio antes de pagares")}</h2>
                <p className="mt-4 max-w-[48ch] text-lg text-zinc-300">{t("Escolhe o teu sector, escreve o nome do teu negócio e experimenta a marcação como se fosses o teu cliente.")}</p>
                <ul className="mt-6 space-y-2 text-zinc-300">
                  {["8 sectores com ecrãs próprios", "Com o teu nome e a tua cor", "14 soluções prontas a entregar"].map((x) => (
                    <li key={x} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden="true" /> {t(x)}</li>
                  ))}
                </ul>
                <Link href={ligar("/demos#modelos")} className="mt-8 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full text-center bg-[#D2A63C] px-7 font-semibold text-black shadow-lg shadow-[#D2A63C]/20 hover:bg-[#E9C46A]">
                  {t("Experimentar com o meu nome")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href={ligar("/demos?ra=1#modelos")} className="mt-4 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#E9C46A] hover:text-white">
                  <Move3d className="h-4 w-4" aria-hidden="true" /> {t("Ou põe a app em realidade aumentada no teu balcão")}
                </Link>
              </div>
              <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-4 md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:px-0">
                {["restaurante", "barbearia", "ginasio", "imobiliaria"].map((id) => MODELOS.find((x) => x.id === id)!).map((m, i) => (
                  <Link key={m.id} href={ligar(`/demos?modelo=${m.id}#modelos`)} className={`group shrink-0 transition hover:-translate-y-1 ${i % 2 ? "md:mt-10" : ""}`} aria-label={`${t("Ver o modelo")}: ${t(m.sector)}`}>
                    <MiniTelemovel m={m} t={t} className="!w-[150px] md:!w-full" />
                    <p className="mt-2 text-center text-xs text-zinc-400 group-hover:text-[#E9C46A]">{t(m.sector)}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* O mesmo dia, sem e com IA */}
        <section id="o-teu-dia" className="mx-auto max-w-6xl px-4 pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("Antes e depois")}</p>
          <h2 className="mt-3 max-w-[22ch] text-3xl font-bold tracking-tight md:text-5xl">{t("O mesmo dia. Outra hora de fechar a porta.")}</h2>
          <p className="mt-3 max-w-[62ch] text-zinc-400">{t("Carrega no interruptor e vê o que deixa de ser contigo quando as automações correm por ti.")}</p>
          <div className="mt-10">
            <DiaAntesDepois />
          </div>
        </section>

        <section id="o-que-automatizamos" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="max-w-[24ch] text-3xl font-bold tracking-tight md:text-4xl">{t("O que te tiramos das mãos")}</h2>
          <p className="mt-3 max-w-[62ch] text-zinc-400">{t("Não é preciso perceber de IA. Começa pelo que te cansa todas as semanas: cada dor tem uma automação que já sabemos fazer.")}</p>
          <div className="mt-10">
            <AreasInterativas />
          </div>
        </section>

        {/* Simulador: o negócio de quem visita, desenhado com as automações */}
        <section id="simulador" className="border-y border-white/5 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("Vê o teu negócio com IA")}</h2>
            <p className="mt-3 max-w-[62ch] text-zinc-400">{t("Escolhe o teu sector e ajusta as horas. Mostramos-te as automações a funcionar e quanto tempo te devolvem.")}</p>
            <div className="mt-10">
              <SimuladorSolucoes agendar={agendar} />
            </div>
          </div>
        </section>

        {/* Casos reais */}
        <section id="casos" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("Projectos reais")}</h2>
          <p className="mt-3 max-w-[62ch] text-zinc-400">{t("O que construímos para quem já trabalha connosco. Os números ficam para quando cada cliente os medir.")}</p>
          <CasosCiclo casos={casos} />

          {/* Próximos projectos: o que está em cima da mesa */}
          <h3 className="mt-20 text-2xl font-bold md:text-3xl">{t("A seguir")}</h3>
          <p className="mt-2 max-w-[60ch] text-zinc-400">{t("Projectos que estamos a desenhar com novos clientes. Os nomes aparecem quando cada cliente der o OK.")}</p>
          <ol className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {PROXIMOS.map((p) => (
              <li key={t(p.setor)} className="border-t-2 border-[#D2A63C]/50 pt-5">
                <h4 className="text-lg font-bold">{t(p.setor)}</h4>
                <p className="mt-2 text-sm text-zinc-400">{t(p.desafio)}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
                  {p.vamosConstruir.map((v) => (
                    <li key={v} className="flex gap-2">
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {t(v)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        {/* Para quem: bento com cinco perfis */}
        <section id="para-quem" className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("Onde te encaixas")}</h2>
          <p className="mt-3 max-w-[60ch] text-zinc-400">{t("A mesma base tecnológica serve casos muito diferentes. Escolhe o teu.")}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {PERFIS.map((p, i) => {
              const Icone = ICONES[p.id] ?? Building2
              const larga = i === 0
              return (
                <article
                  key={p.id}
                  id={p.id}
                  className={[
                    "rounded-2xl border border-white/10 p-6 transition hover:border-[#D2A63C]/40",
                    larga ? "bg-gradient-to-br from-[#D2A63C]/15 to-transparent md:col-span-4 md:row-span-2" : "bg-white/[0.03]",
                    larga ? "" : i >= 3 ? "md:col-span-3" : "md:col-span-2",
                  ].join(" ")}
                >
                  <Icone className="h-6 w-6 text-[#E9C46A]" strokeWidth={1.75} />
                  <h3 className={larga ? "mt-4 text-2xl font-bold" : "mt-4 text-lg font-bold"}>{t(p.titulo)}</h3>
                  <p className="mt-2 text-sm text-zinc-400">{t(p.dor)}</p>
                  <p className="mt-3 text-sm text-zinc-200">{t(p.solucao)}</p>
                  {larga && (
                    <ul className="mt-6 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                      {p.entregas.map((e) => (
                        <li key={e} className="rounded-lg bg-black/30 px-3 py-2">{t(e)}</li>
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
              { t: t("Diagnosticar"), d: t("30 minutos para ver onde perdes tempo e dinheiro. Sem compromisso.") },
              { t: t("Construir"), d: t("Fazemos a página, a app ou o agente sobre o nosso sistema. Tu validas.") },
              { t: t("Acompanhar"), d: t("Entregamos a funcionar e ficamos por perto para afinar.") },
            ].map((s) => (
              <div key={s.t}>
                <h3 className="text-xl font-bold text-[#E9C46A]">{s.t}</h3>
                <p className="mt-2 text-zinc-400">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Demos: o sistema que a MTM usa todos os dias */}
        {demoHoje && (
          <section aria-label={t("Demo de hoje")} className="px-4 pt-16">
            <Link
              href={ligar(`/solucoes/demos/${demoHoje.slug}`)}
              className="group mx-auto flex max-w-6xl flex-col gap-3 rounded-3xl border border-[#D2A63C]/40 bg-gradient-to-br from-[#D2A63C]/10 to-transparent p-6 md:flex-row md:items-center md:justify-between md:p-8"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("Demo de hoje · uma nova todos os dias")}</p>
                <p className="mt-2 text-xl font-bold md:text-2xl">{t(demoHoje.titulo)}</p>
                <p className="mt-1 text-zinc-400">{t(demoHoje.promessa)}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#E9C46A]">
                {t("Ver em 1 minuto")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </Link>
            <div className="mx-auto mt-3 flex max-w-6xl justify-end">
              <Link href={ligar("/demos")} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-[#E9C46A]">
                {t("Ver todas as demos no showroom")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        <section id="demos" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("A primeira cliente somos nós")}</h2>
            <p className="mt-3 max-w-[60ch] text-zinc-400">{t("Tudo o que oferecemos corre primeiro na MoreThanMoney. Estas são capturas reais da nossa app.")}</p>
            <ul className="mt-6 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-3">
              {CASO_MTM.feito.map((f) => (
                <li key={f} className="flex gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {t(f)}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:px-[max(1rem,calc((100vw_-_72rem)/2_+_1rem))]">
            {DEMOS.map((d) => (
              <figure key={d.img} className="w-[220px] shrink-0 snap-start">
                <Image
                  src={d.img}
                  alt={t(d.titulo)}
                  width={620}
                  height={1344}
                  loading="lazy"
                  className="rounded-2xl border border-white/10"
                />
                <figcaption className="mt-3">
                  <span className="block font-semibold">{t(d.titulo)}</span>
                  <span className="text-sm text-zinc-400">{t(d.texto)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Menu de trabalhos */}
        <section id="trabalhos" className="border-y border-white/5 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t("O que podemos fazer por ti")}</h2>
            <p className="mt-3 max-w-[60ch] text-zinc-400">{t("Escolhe por onde começar. Cada trabalho corre sobre o nosso sistema e liga-se aos outros.")}</p>
            <div className="mt-10">
              <MenuTrabalhos agendar={agendar} />
            </div>
          </div>
        </section>

        {/* Porquê próprio */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-[auto_1fr]">
          <Server className="h-16 w-16 text-[#D2A63C]" strokeWidth={1.25} />
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">{t("Tudo nosso, nada alugado")}</h2>
            <p className="mt-3 max-w-[65ch] text-zinc-400">
              {t("Agenda, chat, automações e base de dados correm no nosso sistema. Menos mensalidades para ti, e ninguém de fora a mexer nos dados dos teus clientes.")}
            </p>
          </div>
        </section>

        {/* Dúvidas */}
        <section id="duvidas" className="mx-auto max-w-3xl px-4 pb-20">
          <h2 className="text-3xl font-bold tracking-tight">{t("Dúvidas")}</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.p} className="group rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{t(f.p)}</summary>
                <p className="mt-3 text-zinc-400">{t(f.r)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Fecho */}
        <section className="mx-auto mb-20 max-w-6xl px-4">
          <div className="rounded-3xl bg-gradient-to-br from-[#D2A63C] to-[#9C7A24] p-10 text-[#08090C] md:p-14">
            <GraduationCap className="h-8 w-8" />
            <h2 className="mt-4 max-w-[20ch] text-3xl font-black md:text-4xl">{t("Vê onde perdes tempo, em 30 minutos.")}</h2>
            <a
              href={agendar}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#08090C] px-6 py-3 font-semibold text-[#E9C46A] transition active:scale-[0.98]"
            >
              {CTA_LABEL} <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href={ligar("/solucoes/prototipo")}
              className="ml-0 mt-3 inline-flex items-center gap-2 rounded-full border border-[#08090C]/40 px-6 py-3 font-semibold text-[#08090C] transition hover:bg-[#08090C]/10 sm:ml-3"
            >
              <Sparkles className="h-4 w-4" /> {t("Receber o protótipo da minha solução")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-xs leading-relaxed text-zinc-500">
          <p className="max-w-[90ch]">
            {t("A MoreThanMoney presta serviços de tecnologia, marketing, automatização e educação. Não presta consultoria financeira ou de investimento, não gere carteiras nem recebe fundos de clientes. Exemplos e demonstrações mostram casos reais com autorização dos clientes; resultados variam e não são garantidos.")}
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:justify-between">
            <p>
              {IDENTIFICACAO.marca} · {IDENTIFICACAO.titular}, NIF {IDENTIFICACAO.nif} ·{" "}
              <a href={`mailto:${IDENTIFICACAO.email}`} className="hover:text-zinc-300">{IDENTIFICACAO.email}</a>
            </p>
            <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t("Informação legal")}>
              <a href="/terms" className="hover:text-zinc-300">{t("Termos de Serviços")}</a>
              <a href="/privacidade" className="hover:text-zinc-300">{t("Privacidade")}</a>
              <a href="/aviso-de-risco" className="hover:text-zinc-300">{t("Aviso de Risco")}</a>
              <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300">{t("Livro de Reclamações")}</a>
              <a href="https://www.morethanmoney.pt" className="hover:text-zinc-300">morethanmoney.pt</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
    </IdiomaSolucoes>
  )
}
