"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, ChevronDown } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ehIosNativo } from "@/lib/app-nativa"
import { useI18n } from "@/components/i18n-provider"
import Caminho3D from "./caminho-3d"
import { LINGUAS, NOME_LINGUA, TEXTOS, type Lingua, type Textos } from "./caminho-textos"

/**
 * O CAMINHO DO ECOSSISTEMA — os cinco passos do onboarding MTM, por ordem.
 *
 * Substitui o guia em HTML solto (public/onboarding-mtm.html), que tinha ficado para trás: mandava
 * marcar no Calendly (saiu a 30/09), punha o Tap to Trade na app MTM System (passou para o MTM Auto
 * a 05/10), prometia «resultados em 48 horas» e, sobretudo, não tinha o passo da corretora. Sem
 * conta na corretora não há «ganha enquanto aprendes»: os sinais não têm onde trabalhar. Por isso
 * a corretora é aqui o passo do meio, o mais explicado, e o único com vídeo próprio.
 *
 * Dois cuidados que não são de gosto:
 *  · Na app iOS (Apple 3.7.2, rejeição de 02/09/2026) não se angaria para a corretora nem se mostram
 *    preços de subscrição (3.1.1). Os passos 1 e 3 trocam de texto lá dentro, e o passo 2 dá-se
 *    por feito — quem lê isto na app já a instalou.
 *  · Os números (preços, depósito, bónus) chegam por props de quem os tem: `escada-precos` e
 *    `broker/deposito-minimo`. Nada de valores escritos à mão neste ficheiro.
 *
 * As línguas (PT, EN, ES, FR, DE, IT) vivem em `caminho-textos.tsx`; a escolha
 * é a mesma do resto do site (useI18n) e um link com ?lang= abre já na língua certa.
 *
 * O progresso fica no telemóvel (localStorage) e é ajudado pelo que se sabe da conta: com sessão,
 * o passo 1 está feito; com o UID da corretora guardado no perfil, o passo 3 também.
 */

export type DadosCaminho = {
  premium1oMes: string
  premiumMensal: string
  depositoMinimoUsd: number
  bonusPct: number
  linkAgendarOnboarding: string
  /**
   * O vídeo de 2 minutos da abertura de conta, por língua. Uma língua sem vídeo próprio mostra o
   * inglês, com uma nota a dizê-lo.
   */
  videosAbrirConta: Partial<Record<Lingua, string>>
  /** O vídeo curto com os cinco passos, por língua. Sem nenhum, o bloco não aparece. */
  videosPassos: Partial<Record<Lingua, string>>
}

/** O vídeo de uma língua, ou o inglês quando ela ainda não tem o seu (e então `emOutraLingua`). */
function videoPara(videos: Partial<Record<Lingua, string>>, l: Lingua) {
  if (videos[l]) return { src: videos[l]!, emOutraLingua: false }
  if (videos.en) return { src: videos.en, emOutraLingua: true }
  return null
}

const CHAVE = "mtm_onboarding_passos"
const TOTAL = 5

function lerFeitos(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || "[]")
    return Array.isArray(v) ? v.filter((n) => typeof n === "number") : []
  } catch {
    return []
  }
}

function gravarFeitos(feitos: number[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(feitos))
  } catch {}
}

export default function CaminhoMtm({ dados }: { dados: DadosCaminho }) {
  const [ios, setIos] = useState(false)
  const [feitos, setFeitos] = useState<number[]>([])
  const [aberto, setAberto] = useState<number | null>(1)
  const { lang: langSite, setLang: setLangSite } = useI18n()
  const [lingua, setLingua] = useState<Lingua>("pt")
  const t = TEXTOS[lingua]

  // A língua do site manda (é a do seletor do cabeçalho e a do perfil); uma que esta página não
  // tenha cai no inglês.
  useEffect(() => {
    setLingua(linguaDe(langSite) ?? (langSite === "pt" ? "pt" : "en"))
  }, [langSite])

  useEffect(() => {
    // Um link com ?lang= (o que se partilha com quem é de fora) abre já nessa língua.
    const daUrl = linguaDe(new URLSearchParams(window.location.search).get("lang"))
    if (daUrl) {
      setLingua(daUrl)
      setLangSite(daUrl)
    }
    const noIos = ehIosNativo()
    setIos(noIos)
    const base = lerFeitos()
    if (noIos && !base.includes(2)) base.push(2)
    setFeitos(base)
    setAberto([1, 2, 3, 4, 5].find((n) => !base.includes(n)) ?? null)

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) return
        const auto = [1]
        const { data } = await supabase
          .from("profiles")
          .select("broker_uid")
          .eq("id", session.user.id)
          .single()
        if (data?.broker_uid) auto.push(3)
        setFeitos((f) => {
          const novo = Array.from(new Set([...f, ...auto]))
          gravarFeitos(novo)
          return novo
        })
        // Abre o primeiro passo que falta, em vez de obrigar a fechar os que já estão feitos.
        setAberto([1, 2, 3, 4, 5].find((n) => !auto.includes(n) && !base.includes(n)) ?? null)
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mudarLingua = (l: Lingua) => {
    setLingua(l)
    setLangSite(l)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("lang", l)
      window.history.replaceState(null, "", url.toString())
    } catch {}
  }

  const alternarFeito = (n: number) => {
    setFeitos((f) => {
      const novo = f.includes(n) ? f.filter((x) => x !== n) : [...f, n]
      gravarFeitos(novo)
      return novo
    })
    if (!feitos.includes(n)) setAberto(n < TOTAL ? n + 1 : null)
  }

  const n = feitos.filter((x) => x >= 1 && x <= TOTAL).length
  const pct = Math.round((n / TOTAL) * 100)
  const comum = {
    ios,
    feitos,
    aberto,
    jaFiz: t.jaFiz,
    desfazer: t.desfazer,
    onAbrir: (p: number) => setAberto(aberto === p ? null : p),
    onFeito: alternarFeito,
  }
  const video = videoPara(dados.videosAbrirConta, lingua)
  const videoPassos = videoPara(dados.videosPassos, lingua)

  return (
    <div lang={lingua}>
      <style>{ANIMACOES}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/onboarding" className="text-[13px] text-[#8a8a95] hover:text-white">
          ← Onboarding
        </Link>
        <SeletorLingua atual={lingua} onMudar={mudarLingua} />
      </div>

      <header className="relative mt-6 grid items-center gap-2 sm:mt-8 sm:grid-cols-[1fr_250px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(210,166,60,0.22), transparent 70%)" }}
        />
        <Caminho3D
          feitos={feitos}
          className="absolute -top-4 right-0 h-[240px] w-[200px] opacity-40 sm:relative sm:opacity-100 sm:right-auto sm:top-auto sm:order-2 sm:h-[300px] sm:w-full"
        />
        <div className="relative">
          <p className="mtm-sobe text-[12px] font-semibold uppercase tracking-[0.18em] text-[#D2A63C]">{t.eyebrow}</p>
          <h1
            className="mtm-sobe mt-3 bg-gradient-to-br from-white via-white to-[#E9C46A] bg-clip-text text-[34px] font-bold leading-[1.1] tracking-tight text-transparent sm:text-[44px]"
            style={{ animationDelay: "80ms" }}
          >
            {t.titulo}
          </h1>
          <p className="mtm-sobe mt-4 max-w-xl text-[15px] leading-relaxed text-[#b9b9c3]" style={{ animationDelay: "160ms" }}>
            {t.intro}
          </p>
          <ul className="mtm-sobe mt-5 flex flex-wrap gap-2" style={{ animationDelay: "240ms" }}>
            {t.factos.map((f) => (
              <li
                key={f}
                className="rounded-full border border-[#D2A63C]/30 bg-[#D2A63C]/[0.06] px-3 py-1 text-[12px] font-medium text-[#E9C46A] backdrop-blur-sm"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section
        aria-live="polite"
        className="mtm-sobe relative mt-8 flex items-center gap-4 rounded-2xl border border-[#23262F] bg-[#101217]/90 p-4 backdrop-blur"
        style={{ animationDelay: "320ms" }}
      >
        <Anel pct={pct} />
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-white">{n === TOTAL ? t.tudoFeito : t.progresso(n, TOTAL)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1b1d24]">
            <div
              className="mtm-brilho h-full rounded-full transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      {videoPassos && (
        <section className="mtm-sobe mt-6" style={{ animationDelay: "380ms" }}>
          <p className="mb-2 text-[13px] font-semibold text-[#E9C46A]">{t.videoPassos}</p>
          <div className="overflow-hidden rounded-2xl border border-[#3a2f17] bg-black shadow-[0_0_60px_-18px_rgba(210,166,60,0.45)]">
            <video key={videoPassos.src} className="aspect-video w-full" src={videoPassos.src} controls playsInline preload="metadata" />
          </div>
          {videoPassos.emOutraLingua && t.p3.notaVideo && (
            <p className="mt-2 text-[12px] text-[#8a8a95]">{t.p3.notaVideo.split(".")[0]}.</p>
          )}
        </section>
      )}

      <ol className="relative mt-8 space-y-3 before:absolute before:bottom-6 before:left-[35px] before:top-6 before:w-px before:bg-gradient-to-b before:from-[#D2A63C]/50 before:via-[#23262F] before:to-[#23262F]">
        <Passo n={1} titulo={t.p1.titulo} resumo={ios ? t.p1.resumoIos : t.p1.resumo} {...comum}>
          {ios ? (
            <p>{t.p1.ios}</p>
          ) : (
            <>
              <p>{t.p1.corpo}</p>
              <ul className="mt-3 space-y-1.5">
                {t.p1.itens(dados).map((i) => (
                  <Item key={i}>{i}</Item>
                ))}
              </ul>
              <Dica>{t.p1.dica}</Dica>
              <Botao href="/register">{t.p1.cta}</Botao>
            </>
          )}
        </Passo>

        <Passo n={2} titulo={t.p2.titulo} resumo={t.p2.resumo} {...comum}>
          <p>{t.p2.corpo}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Plataforma titulo={t.p2.iphone} href="https://apps.apple.com/app/id6778558643" cta="App Store" />
            <Plataforma
              titulo={t.p2.android}
              href="/downloads/MoreThanMoney.apk"
              cta={t.p2.ctaApk}
              nota={t.p2.notaApk}
            />
            <Plataforma titulo={t.p2.computador} href="/app-mobile" cta={t.p2.ctaBrowser} nota={t.p2.notaBrowser} />
          </div>
          <Dica>{t.p2.dica}</Dica>
        </Passo>

        <Passo n={3} titulo={t.p3.titulo} resumo={t.p3.resumo} destaque {...comum}>
          {ios ? <p>{t.p3.ios}</p> : <PassoCorretora dados={dados} t={t} video={video} />}
        </Passo>

        <Passo n={4} titulo={t.p4.titulo} resumo={t.p4.resumo} {...comum}>
          <p>{t.p4.corpo}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Escolha {...t.p4.auto} href="/onboarding/mtm-auto" />
            <Escolha {...t.p4.alertas} href="/alertas-mtm" />
          </div>
          <Dica>{t.p4.dica}</Dica>
        </Passo>

        <Passo n={5} titulo={t.p5.titulo} resumo={t.p5.resumo} {...comum}>
          <p>{t.p5.corpo}</p>
          <ul className="mt-3 space-y-1.5">
            {t.p5.academias.map((a) => (
              <Item key={a}>{a}</Item>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao href="/live-sessions">{t.p5.ctaAcademias}</Botao>
            <Botao href={dados.linkAgendarOnboarding} secundario>
              {t.p5.ctaChamada}
            </Botao>
          </div>
          <p className="mt-4 text-[13px] text-[#8a8a95]">{t.p5.nota}</p>
        </Passo>
      </ol>

      <p className="mt-10 text-[13px] leading-relaxed text-[#8a8a95]">
        {t.duvidas(
          <a href="https://instagram.com/morethanmoney.pt" className="text-[#D2A63C]">
            @morethanmoney.pt
          </a>,
          <a href="mailto:morethanmoneypt@gmail.com" className="text-[#D2A63C]">
            morethanmoneypt@gmail.com
          </a>,
        )}
      </p>
      <p className="mt-6 text-[13px] leading-relaxed text-[#7a7a84]">{t.aviso}</p>
    </div>
  )
}

/**
 * As animações da página, todas em CSS: entrada em cascata, cartões que inclinam, o número que
 * salta quando o passo fica feito e o brilho da barra. Com `prefers-reduced-motion` param todas.
 */
const ANIMACOES = `
@keyframes mtm-sobe{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes mtm-desce{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes mtm-pop{0%{transform:scale(.5)}60%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes mtm-brilho{from{background-position:200% 0}to{background-position:-200% 0}}
.mtm-sobe{animation:mtm-sobe .7s cubic-bezier(.2,.7,.2,1) both}
.mtm-desce{animation:mtm-desce .35s ease-out both}
.mtm-pop{animation:mtm-pop .45s cubic-bezier(.3,1.6,.5,1) both}
.mtm-brilho{background:linear-gradient(90deg,#D2A63C 0%,#E9C46A 40%,#fff3c8 50%,#E9C46A 60%,#D2A63C 100%);background-size:200% 100%;animation:mtm-brilho 3.5s linear infinite}
.mtm-cartao{--rx:0deg;--ry:0deg;transform:perspective(900px) rotateX(var(--rx)) rotateY(var(--ry));transition:transform .25s ease-out,border-color .3s,box-shadow .3s}
.mtm-cartao:hover{box-shadow:0 18px 40px -24px rgba(210,166,60,.45)}
.mtm-aberto{box-shadow:0 24px 60px -30px rgba(210,166,60,.5)}
@media (prefers-reduced-motion:reduce){.mtm-sobe,.mtm-desce,.mtm-pop,.mtm-brilho{animation:none}.mtm-cartao{transform:none;transition:none}}
`

function linguaDe(v: string | null | undefined): Lingua | null {
  const l = (v || "").slice(0, 2).toLowerCase()
  return (LINGUAS as readonly string[]).includes(l) ? (l as Lingua) : null
}

function SeletorLingua({ atual, onMudar }: { atual: Lingua; onMudar: (l: Lingua) => void }) {
  return (
    <div role="group" aria-label="Idioma / Language" className="flex rounded-full border border-[#23262F] bg-[#101217] p-1">
      {LINGUAS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onMudar(l)}
          aria-pressed={atual === l}
          title={NOME_LINGUA[l]}
          className={`min-h-[32px] rounded-full px-3 text-[12px] font-semibold uppercase tracking-wide transition-colors ${
            atual === l ? "bg-[#D2A63C] text-black" : "text-[#8a8a95] hover:text-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function Anel({ pct }: { pct: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#1b1d24" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="#D2A63C"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[12px] font-bold tabular-nums text-white">
        {pct}%
      </span>
    </div>
  )
}

/**
 * O passo da corretora, contado pela ordem do registo na PU Prime: perfil e verificação primeiro,
 * conta real depois, depósito no fim. É a ordem em que a corretora deixa fazer as coisas, e quem a
 * tenta saltar fica parado num ecrã sem perceber porquê.
 */
function PassoCorretora({
  dados,
  t,
  video,
}: {
  dados: DadosCaminho
  t: Textos
  video: { src: string; emOutraLingua: boolean } | null
}) {
  return (
    <>
      <p>{t.p3.intro}</p>

      {video && (
        <div className="mt-4 overflow-hidden rounded-xl border border-[#3a2f17] bg-black shadow-[0_0_40px_-12px_rgba(210,166,60,0.35)]">
          <video
            key={video.src}
            className="aspect-video w-full"
            src={video.src}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      )}
      {video?.emOutraLingua && t.p3.notaVideo && <p className="mt-2 text-[12px] text-[#8a8a95]">{t.p3.notaVideo}</p>}

      <ol className="mt-5 space-y-3">
        {t.p3.sub.map((s, i) => (
          <SubPasso key={s.titulo} n={"abcde"[i]} titulo={s.titulo}>
            {s.texto(dados)}
          </SubPasso>
        ))}
      </ol>

      <div className="mt-5 rounded-xl border border-[#3a2f17] bg-[#17140c] p-4 text-[13px] leading-relaxed text-[#d9cfb6]">
        <p className="font-semibold text-[#E9C46A]">{t.p3.enganosTitulo}</p>
        <ul className="mt-2 space-y-1">
          {t.p3.enganos.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Botao href="/abrir-conta" externo>
          {t.p3.ctaAbrir}
        </Botao>
        <Botao href="/app-mobile/accountopen" secundario>
          {t.p3.ctaUid}
        </Botao>
        <Botao href="https://t.me/MoreThanMoney_aibot?start=lead" secundario>
          {t.p3.ctaTelegram}
        </Botao>
      </div>
    </>
  )
}

function Passo({
  n,
  titulo,
  resumo,
  feitos,
  aberto: qualAberto,
  destaque = false,
  jaFiz,
  desfazer,
  onAbrir,
  onFeito,
  children,
}: {
  n: number
  titulo: string
  resumo: string
  feitos: number[]
  aberto: number | null
  destaque?: boolean
  ios: boolean
  jaFiz: string
  desfazer: string
  onAbrir: (n: number) => void
  onFeito: (n: number) => void
  children: React.ReactNode
}) {
  const feito = feitos.includes(n)
  const aberto = qualAberto === n
  // Inclinação 3D ao passar o rato, só com o cartão fechado e só com rato (no toque não há hover).
  const inclinar = (e: React.PointerEvent<HTMLLIElement>) => {
    if (aberto || e.pointerType !== "mouse") return
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--rx", `${(0.5 - (e.clientY - r.top) / r.height) * 6}deg`)
    e.currentTarget.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`)
  }
  const endireitar = (e: React.PointerEvent<HTMLLIElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg")
    e.currentTarget.style.setProperty("--ry", "0deg")
  }
  return (
    <li
      onPointerMove={inclinar}
      onPointerLeave={endireitar}
      className={`mtm-sobe mtm-cartao relative overflow-hidden rounded-2xl border ${aberto ? "mtm-aberto" : ""}`}
      style={{
        borderColor: destaque || aberto ? "rgba(210,166,60,0.45)" : "#23262F",
        background: destaque ? "#16140E" : "#12141A",
        animationDelay: `${420 + n * 70}ms`,
      }}
    >
      <button
        type="button"
        onClick={() => onAbrir(n)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span
          key={feito ? "feito" : "por-fazer"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${feito ? "mtm-pop" : ""}`}
          style={{
            background: feito ? "linear-gradient(135deg,#E9C46A,#D2A63C)" : "rgba(210,166,60,0.12)",
            color: feito ? "#0b0b0e" : "#D2A63C",
            boxShadow: feito ? "0 0 18px rgba(210,166,60,0.55)" : "inset 0 0 0 1px rgba(210,166,60,0.25)",
          }}
        >
          {feito ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
        </span>
        <span className="flex-1">
          <span className="block text-[16px] font-semibold text-white">{titulo}</span>
          <span className="block text-[13px] text-[#8a8a95]">{resumo}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8a8a95] transition-transform ${aberto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {aberto && (
        <div className="mtm-desce border-t border-[#23262F] px-5 pb-5 pt-4 text-[14px] leading-relaxed text-[#b9b9c3]">
          {children}
          <button
            type="button"
            onClick={() => onFeito(n)}
            className={`mt-5 inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-[13px] font-medium ${
              feito
                ? "text-[#8a8a95] hover:text-white"
                : "border border-[#D2A63C]/40 text-[#E9C46A] hover:bg-[#D2A63C]/10"
            }`}
          >
            {feito ? desfazer : jaFiz}
          </button>
        </div>
      )}
    </li>
  )
}

function SubPasso({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#3a3d47] text-[12px] font-semibold text-[#D2A63C]">
        {n}
      </span>
      <div>
        <p className="font-semibold text-white">{titulo}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#D2A63C]" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function Dica({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-lg bg-[#1b1d24] px-3 py-2.5 text-[13px] text-[#c9c9d1]">{children}</p>
}

function Botao({
  href,
  children,
  secundario = false,
  externo = false,
}: {
  href: string
  children: React.ReactNode
  secundario?: boolean
  externo?: boolean
}) {
  const classe = secundario
    ? "inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 py-2.5 text-[14px] text-zinc-200 hover:border-[#D2A63C]/60 hover:text-[#E9C46A]"
    : "inline-flex min-h-[44px] items-center rounded-lg bg-[#D2A63C] px-4 py-2.5 text-[14px] font-semibold text-black hover:opacity-90"
  // /abrir-conta é um redireccionamento para fora do site: abre noutro separador para o guia
  // continuar aberto aqui, que é onde está o passo seguinte.
  if (externo || /^https?:/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`mt-4 ${classe}`}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={`mt-4 ${classe}`}>
      {children}
    </Link>
  )
}

function Plataforma({ titulo, href, cta, nota }: { titulo: string; href: string; cta: string; nota?: string }) {
  return (
    <a
      href={href}
      className="flex flex-col rounded-xl border border-[#23262F] bg-[#0e1015] p-4 hover:border-[#D2A63C]/50"
    >
      <span className="text-[14px] font-semibold text-white">{titulo}</span>
      {nota && <span className="mt-1 text-[12px] text-[#8a8a95]">{nota}</span>}
      <span className="mt-3 text-[13px] font-semibold text-[#D2A63C]">{cta} →</span>
    </a>
  )
}

function Escolha({
  titulo,
  texto,
  para,
  href,
  cta,
}: {
  titulo: string
  texto: string
  para: string
  href: string
  cta: string
}) {
  return (
    <Link href={href} className="flex flex-col rounded-xl border border-[#23262F] bg-[#0e1015] p-4 hover:border-[#D2A63C]/50">
      <span className="text-[15px] font-semibold text-white">{titulo}</span>
      <span className="mt-1.5 flex-1 text-[13px] leading-relaxed text-[#b9b9c3]">{texto}</span>
      <span className="mt-2 text-[12px] text-[#8a8a95]">{para}</span>
      <span className="mt-3 text-[13px] font-semibold text-[#D2A63C]">{cta} →</span>
    </Link>
  )
}
