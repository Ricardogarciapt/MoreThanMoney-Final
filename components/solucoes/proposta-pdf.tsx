"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowRight, Download, X } from "lucide-react"
import type { RelatorioAnalise } from "@/lib/site-solucoes/analise"
import { dataAteOnde, factos, numeroProposta } from "@/lib/site-solucoes/factos"
import { IDENTIFICACAO } from "@/lib/legal/identificacao"
import { useT } from "@/components/solucoes/idioma"

/**
 * A proposta em PDF do /solucoes (pedido do Ricardo, 21/11/2026: «o PDF de projeto pode e deve
 * ser melhorado», com factos wow simples de perceber).
 *
 * Quatro páginas A4 desenhadas para impressão (o «Guardar em PDF» do browser): capa escura com o
 * facto maior, «em 10 segundos» com o ano e a semana em imagem, o plano e os próximos passos com
 * QR para marcar. No ecrã abre como pré-visualização à escala; no papel cada página é uma folha.
 *
 * Os números são só os do simulador (factos.ts), com os pressupostos escritos na última página.
 */

const L = 794 // A4 a 96 dpi
const A = 1123
const OURO = "#D2A63C"
const OURO_CLARO = "#E9C46A"
const CARVAO = "#08090C"

export function PropostaPDF({ rel, agendar, onFechar }: { rel: RelatorioAnalise; agendar: string; onFechar: () => void }) {
  const { t, tf, n, idioma } = useT()
  const [montado, setMontado] = useState(false)
  const [escala, setEscala] = useState(1)
  const [qr, setQr] = useState<string | null>(null)
  const fechar = useRef(onFechar)
  fechar.current = onFechar
  const hoje = useMemo(() => new Date(), [])
  const numero = numeroProposta(rel.empresa, hoje)
  const urlAgendar = useMemo(() => {
    const u = new URL(agendar, "https://www.morethanmoney.pt")
    u.searchParams.set("proposta", numero)
    return u.toString()
  }, [agendar, numero])
  const f = factos(rel.totais)
  const temHoras = rel.oportunidades.length > 0 && rel.totais.horasSemana > 0
  const ate = dataAteOnde(f.diasRepetidosAno, hoje.getFullYear())
  const fmtData = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(idioma === "pt" ? "pt-PT" : idioma, { timeZone: "UTC", ...o }).format(d)
  const validade = new Date(hoje.getTime() + 30 * 864e5)
  const paginas = temHoras ? 4 : 3

  useEffect(() => {
    setMontado(true)
    const ajustar = () => setEscala(Math.min(1, (window.innerWidth - 24) / L))
    ajustar()
    window.addEventListener("resize", ajustar)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current()
    window.addEventListener("keydown", esc)
    const antes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    import("qrcode")
      .then((Q) => Q.toDataURL(urlAgendar, { margin: 1, width: 360, color: { dark: CARVAO, light: "#FFFFFF" } }))
      .then(setQr)
      .catch(() => setQr(null))
    return () => {
      window.removeEventListener("resize", ajustar)
      window.removeEventListener("keydown", esc)
      document.body.style.overflow = antes
    }
  }, [urlAgendar])

  if (!montado) return null

  const Rodape = ({ p, escuro }: { p: number; escuro?: boolean }) => (
    <div className={`absolute inset-x-[56px] bottom-[28px] flex justify-between text-[10px] tracking-wide ${escuro ? "text-white/40" : "text-black/40"}`}>
      <span>MoreThanMoney · {t("Proposta")} {numero}</span>
      <span>{tf("Página {p} de {n}", { p, n: paginas })}</span>
    </div>
  )

  const Pagina = ({ children, escuro }: { children: React.ReactNode; escuro?: boolean }) => (
    <div className="proposta-folha mx-auto mb-6" style={{ width: L * escala, height: A * escala }}>
      <section
        className="proposta-pagina relative overflow-hidden shadow-2xl shadow-black/60"
        style={{ width: L, height: A, transform: `scale(${escala})`, transformOrigin: "top left", background: escuro ? CARVAO : "#FBFAF7", color: escuro ? "#F4F4F5" : "#15171C" }}
      >
        {children}
      </section>
    </div>
  )

  const max = Math.max(1, ...rel.oportunidades.map((o) => o.horasAno))
  const DIAS_UTEIS = 230 // 46 semanas × 5 dias
  const repetidos = Math.min(DIAS_UTEIS, f.diasRepetidosAno)
  const recuperados = Math.min(repetidos, f.diasAno)

  return createPortal(
    <div className="proposta-raiz fixed inset-0 z-[200] overflow-y-auto bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t("Proposta em PDF")}>
      <style>{`
        @page { size: A4; margin: 0 }
        @media print {
          html, body { background: #fff !important; overflow: visible !important }
          body > *:not(.proposta-raiz) { display: none !important }
          .proposta-raiz { position: static !important; background: none !important; overflow: visible !important; backdrop-filter: none !important }
          .proposta-barra { display: none !important }
          .proposta-folha { width: 210mm !important; height: 297mm !important; margin: 0 !important; break-after: page; page-break-after: always }
          .proposta-folha:last-child { break-after: auto; page-break-after: auto }
          .proposta-pagina { transform: none !important; box-shadow: none !important; width: 210mm !important; height: 297mm !important }
          .proposta-raiz * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }
        }
      `}</style>

      <div className="proposta-barra sticky top-0 z-10 mb-6 flex items-center justify-between gap-3 border-b border-white/10 bg-[#08090C]/95 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{t("Proposta em PDF")}</p>
          <p className="truncate text-sm text-zinc-300">{rel.empresa} · {numero}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#D2A63C] px-5 text-sm font-semibold text-black hover:bg-[#E9C46A]">
            <Download className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">{t("Descarregar PDF")}</span><span className="sm:hidden">PDF</span>
          </button>
          <button type="button" onClick={onFechar} aria-label={t("Fechar")} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 hover:border-white/40">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 1 · Capa */}
      <Pagina escuro>
        <svg className="absolute -right-[180px] top-[150px]" width="720" height="720" viewBox="0 0 720 720" aria-hidden="true">
          <defs>
            <radialGradient id="pp-brilho" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={OURO} stopOpacity="0.35" />
              <stop offset="70%" stopColor={OURO} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="360" cy="360" r="360" fill="url(#pp-brilho)" />
          {[300, 250, 200, 150].map((r, i) => (
            <circle key={r} cx="360" cy="360" r={r} fill="none" stroke={OURO} strokeOpacity={0.12 + i * 0.05} strokeWidth="1" strokeDasharray={i % 2 ? "2 8" : undefined} />
          ))}
          {temHoras && (
            <circle
              cx="360" cy="360" r="250" fill="none" stroke={OURO_CLARO} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 250 * f.fatiaAutomatizavel} ${2 * Math.PI * 250}`} transform="rotate(-90 360 360)"
            />
          )}
        </svg>
        <div className="absolute inset-x-[56px] top-[52px] flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mtm-transparent.png" alt="" width={44} height={44} />
            <div>
              <p className="text-[15px] font-bold tracking-tight">MoreThanMoney</p>
              <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: OURO }}>{t("Soluções")}</p>
            </div>
          </div>
          <div className="text-right text-[11px] leading-5 text-white/60">
            <p className="font-semibold text-white/90">{numero}</p>
            <p>{fmtData(hoje, { day: "numeric", month: "long", year: "numeric" })}</p>
            <p>{tf("Válida até {data}", { data: fmtData(validade, { day: "numeric", month: "short" }) })}</p>
          </div>
        </div>

        <div className="absolute inset-x-[56px] top-[250px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.3em]" style={{ color: OURO }}>{t("Proposta de automação")}</p>
          <h1 className="mt-4 max-w-[560px] break-words text-[64px] font-black leading-[0.95] tracking-tight">{rel.empresa}</h1>
          <p className="mt-4 text-[17px] text-white/60">{t(rel.sector)}</p>
        </div>

        <div className="absolute inset-x-[56px] top-[600px]">
          {temHoras ? (
            <>
              <p className="text-[150px] font-black leading-none tabular-nums" style={{ color: OURO_CLARO }}>{n(f.diasAno)}</p>
              <p className="mt-2 max-w-[440px] text-[26px] font-bold leading-tight">{t("dias de trabalho por ano voltam para ti.")}</p>
              <p className="mt-4 text-[15px] text-white/60">
                {tf("≈ {s} semanas de 40 h · {m} minutos por dia útil", { s: n(f.semanasAno, 1), m: n(f.minutosDia) })}
              </p>
            </>
          ) : (
            <p className="max-w-[520px] text-[34px] font-bold leading-tight">{t("Três passos para o teu negócio trabalhar por ti, mesmo quando não estás.")}</p>
          )}
        </div>

        <div className="absolute inset-x-[56px] bottom-[72px] flex items-end justify-between gap-6 border-t border-white/10 pt-6">
          <div className="max-w-[440px]">
            <p className="text-[12px] text-white/50">{t("Preparada para")}</p>
            <p className="text-[18px] font-bold">{rel.empresa}</p>
            <p className="mt-3 text-[12px] leading-5 text-white/50">{t("Estimativa preliminar a partir do que nos contaste. Não é promessa de lucro nem de poupança.")}</p>
          </div>
          {qr && (
            <div className="flex items-center gap-3">
              <p className="max-w-[120px] text-right text-[11px] leading-4 text-white/60">{t("Aponta a câmara para marcar a conversa")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="" width={96} height={96} className="rounded-lg bg-white p-1" />
            </div>
          )}
        </div>
        <Rodape p={1} escuro />
      </Pagina>

      {/* 2 · Em 10 segundos */}
      {temHoras && (
        <Pagina>
          <div className="absolute inset-x-[56px] top-[56px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#9C7A24" }}>{t("Em 10 segundos")}</p>
            <h2 className="mt-2 text-[38px] font-black leading-tight tracking-tight">{t("O que muda no teu negócio")}</h2>
            <p className="mt-3 max-w-[620px] text-[14px] leading-6 text-black/60">{rel.resumo}</p>

            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { v: n(rel.totais.horasSemana, 1), u: t("h / semana"), d: t("vão hoje para tarefas repetidas") },
                { v: n(rel.totais.recuperaveisAno), u: t("h / ano"), d: t("passam para a IA") },
                { v: n(f.minutosDia), u: t("min / dia"), d: t("livres em cada dia útil") },
                { v: `${n(rel.totais.eurosAno)} €`, u: t("/ ano"), d: t("é quanto vale esse tempo") },
              ].map((x, i) => (
                <div key={i} className="rounded-2xl p-5" style={{ background: i === 0 ? CARVAO : "#fff", color: i === 0 ? "#fff" : undefined, border: i === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>
                  <p className="flex items-baseline gap-2">
                    <span className="text-[44px] font-black leading-none tabular-nums" style={{ color: i === 0 ? OURO_CLARO : CARVAO }}>{x.v}</span>
                    <span className="text-[14px] font-semibold" style={{ color: i === 0 ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.45)" }}>{x.u}</span>
                  </p>
                  <p className="mt-2 text-[13px]" style={{ color: i === 0 ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.6)" }}>{x.d}</p>
                </div>
              ))}
            </div>

            {/* O ano em dias úteis */}
            <div className="mt-10">
              <h3 className="text-[20px] font-bold">
                {ate ? tf("Este ano, até {data}, foi só isto.", { data: fmtData(ate, { day: "numeric", month: "long" }) }) : t("O teu ano em dias úteis")}
              </h3>
              <p className="mt-1 text-[13px] text-black/55">
                {tf("Cada quadrado é um dia útil. {r} dias inteiros por ano em tarefas repetidas; {d} podem passar para a IA.", { r: n(repetidos), d: n(recuperados) })}
              </p>
              <div className="mt-4 grid gap-[3px]" style={{ gridTemplateColumns: "repeat(46, minmax(0, 1fr))" }} aria-hidden="true">
                {Array.from({ length: DIAS_UTEIS }, (_, i) => {
                  // coluna = semana, linha = dia: preenche por colunas para ler como um calendário
                  const semana = i % 46
                  const dia = Math.floor(i / 46)
                  const ordem = semana * 5 + dia
                  const cor = ordem < recuperados ? OURO : ordem < repetidos ? "#E7D6A6" : "rgba(0,0,0,0.07)"
                  return <span key={i} className="aspect-square rounded-[2px]" style={{ background: cor }} />
                })}
              </div>
              <div className="mt-3 flex gap-5 text-[11px] text-black/55">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: OURO }} /> {t("a IA faz por ti")}</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#E7D6A6" }} /> {t("continua contigo")}</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "rgba(0,0,0,0.07)" }} /> {t("o resto do teu trabalho")}</span>
              </div>
            </div>

            {/* A semana de 40 h */}
            <div className="mt-10">
              <h3 className="text-[20px] font-bold">{t("A tua semana de 40 horas")}</h3>
              <div className="mt-3 flex h-[44px] overflow-hidden rounded-xl" style={{ background: "rgba(0,0,0,0.06)" }}>
                <div className="flex items-center justify-center text-[12px] font-bold text-black" style={{ width: `${f.fatiaSemana * f.fatiaAutomatizavel * 100}%`, background: OURO }}>
                  {f.fatiaSemana * f.fatiaAutomatizavel > 0.12 ? t("IA") : ""}
                </div>
                <div className="flex items-center justify-center text-[12px] font-semibold text-black/70" style={{ width: `${f.fatiaSemana * (1 - f.fatiaAutomatizavel) * 100}%`, background: "#E7D6A6" }} />
                <div className="flex flex-1 items-center justify-center text-[12px] text-black/45">{t("trabalho que só tu fazes")}</div>
              </div>
              <p className="mt-2 text-[12px] text-black/55">
                {tf("{h} h das tuas 40 h semanais são tarefas repetidas. A IA fica com {r} h.", { h: n(rel.totais.horasSemana, 1), r: n(rel.totais.recuperaveisSemana, 1) })}
              </p>
            </div>

            {/* Para teres uma ideia: as mesmas horas noutras medidas */}
            <div className="mt-10">
              <h3 className="text-[20px] font-bold">{t("Para teres uma ideia")}</h3>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { v: n(f.diasAno / 21, 1), d: t("meses de trabalho de uma pessoa, por ano") },
                  { v: n(f.semanasAno, 1), d: t("semanas de 40 h que deixam de ser contigo") },
                  { v: `${Math.floor(f.minutosDia / 60)}h${String(f.minutosDia % 60).padStart(2, "0")}`, d: t("mais cedo a fechar, todos os dias úteis") },
                ].map((x) => (
                  <div key={x.d} className="rounded-2xl border-l-4 bg-white p-4" style={{ borderColor: OURO }}>
                    <p className="text-[30px] font-black leading-none tabular-nums">{x.v}</p>
                    <p className="mt-2 text-[12px] leading-5 text-black/60">{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Rodape p={2} />
        </Pagina>
      )}

      {/* 3 · O plano */}
      <Pagina>
        <div className="absolute inset-x-[56px] top-[56px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#9C7A24" }}>{t("O plano")}</p>
          <h2 className="mt-2 text-[38px] font-black leading-tight tracking-tight">{t("Por onde começávamos")}</h2>

          {temHoras ? (
            <ol className="mt-6 space-y-4">
              {rel.oportunidades.map((o, i) => (
                <li key={o.area} className="rounded-2xl border border-black/[0.08] bg-white p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[17px] font-bold"><span style={{ color: "#9C7A24" }}>{i + 1}.</span> {t(o.area)}</p>
                    <p className="shrink-0 text-[13px] font-semibold tabular-nums text-black/60">{tf("{h} h/ano", { h: n(o.horasAno) })}</p>
                  </div>
                  <div className="mt-2 h-[6px] rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${(o.horasAno / max) * 100}%`, background: `linear-gradient(90deg, ${OURO}, ${OURO_CLARO})` }} />
                  </div>
                  <p className="mt-3 text-[14px] font-semibold">{t(o.implementamos)}</p>
                  <p className="mt-1 text-[12px] leading-5 text-black/60">{o.exemplos.map((x) => t(x)).join(" · ")}</p>
                  <p className="mt-2 text-[12px] text-black/50">{t("Resolve-se com:")} <b className="text-black/80">{t(o.oferta)}</b></p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 max-w-[620px] text-[15px] leading-7 text-black/65">{rel.resumo}</p>
          )}

          {(rel.leitura || rel.ideias.length > 0) && (
            <div className="mt-6 rounded-2xl p-5" style={{ background: CARVAO, color: "#fff" }}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: OURO }}>{t("O que vemos no teu negócio")}</p>
              {rel.leitura && <p className="mt-2 text-[13px] leading-6 text-white/80">{rel.leitura}</p>}
              {rel.ideias.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[12px] text-white/75">
                  {rel.ideias.slice(0, 4).map((x) => (
                    <li key={x} className="flex gap-2"><span style={{ color: OURO }}>◆</span> {x}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h3 className="mt-8 text-[20px] font-bold">{t("Os primeiros 30 dias")}</h3>
          <div className="relative mt-5">
            <div className="absolute left-[14px] right-[14px] top-[14px] h-[2px]" style={{ background: `linear-gradient(90deg, ${OURO}, rgba(210,166,60,.15))` }} />
            <ol className="relative grid grid-cols-3 gap-4">
              {rel.primeiros30Dias.map((x, i) => (
                <li key={x}>
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-black" style={{ background: i === 0 ? OURO : "#fff", border: `2px solid ${OURO}`, color: CARVAO }}>{i + 1}</span>
                  <p className="mt-3 text-[12px] leading-5 text-black/70">{x}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <Rodape p={temHoras ? 3 : 2} />
      </Pagina>

      {/* 4 · Próximos passos */}
      <Pagina>
        <div className="absolute inset-x-[56px] top-[56px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#9C7A24" }}>{t("Próximos passos")}</p>
          <h2 className="mt-2 text-[38px] font-black leading-tight tracking-tight">{t("Do papel para o teu negócio")}</h2>

          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { t: t("Diagnosticar"), d: t("30 minutos para ver onde perdes tempo e dinheiro. Sem compromisso.") },
              { t: t("Construir"), d: t("Fazemos a página, a app ou o agente sobre o nosso sistema. Tu validas.") },
              { t: t("Acompanhar"), d: t("Entregamos a funcionar e ficamos por perto para afinar.") },
            ].map((p, i) => (
              <div key={p.t} className="rounded-2xl border border-black/[0.08] bg-white p-5">
                <p className="text-[34px] font-black leading-none" style={{ color: OURO }}>0{i + 1}</p>
                <p className="mt-3 text-[16px] font-bold">{p.t}</p>
                <p className="mt-1 text-[12px] leading-5 text-black/60">{p.d}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-8 text-[20px] font-bold">{t("Porque connosco")}</h3>
          <ul className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            {[
              t("Preço fechado: sabes o valor antes de começarmos."),
              t("A demo com a tua marca antes de pagares."),
              t("Agenda, chat e automações no nosso sistema: menos mensalidades externas."),
              t("Os dados dos teus clientes ficam contigo."),
            ].map((x) => (
              <li key={x} className="flex gap-2 rounded-xl bg-black/[0.035] px-3.5 py-3"><span style={{ color: "#9C7A24" }}>✓</span> {x}</li>
            ))}
          </ul>

          <h3 className="mt-8 text-[20px] font-bold">{t("O que te vamos perguntar")}</h3>
          <ul className="mt-3 space-y-2 text-[13px] text-black/70">
            {rel.perguntas.map((x) => (
              <li key={x} className="flex gap-2"><span className="font-black" style={{ color: OURO }}>?</span> {x}</li>
            ))}
          </ul>

          <div className="mt-8 flex items-center gap-6 rounded-3xl p-6" style={{ background: CARVAO, color: "#fff" }}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="" width={132} height={132} className="shrink-0 rounded-xl bg-white p-1.5" />
            )}
            <div>
              <p className="text-[24px] font-black leading-tight">{t("Marca a conversa da análise completa")}</p>
              <p className="mt-2 text-[13px] text-white/60">{t("Aponta a câmara ao código ou abre:")}</p>
              <p className="mt-1 break-all text-[13px] font-semibold" style={{ color: OURO_CLARO }}>{urlAgendar.replace(/^https:\/\/(www\.)?/, "")}</p>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-[56px] bottom-[60px] space-y-2 border-t border-black/10 pt-4 text-[9.5px] leading-[14px] text-black/45">
          <p>{rel.pressupostos}</p>
          <p>
            {t("A MoreThanMoney presta serviços de tecnologia, marketing, automatização e educação. Não presta consultoria financeira ou de investimento, não gere carteiras nem recebe fundos de clientes. Exemplos e demonstrações mostram casos reais com autorização dos clientes; resultados variam e não são garantidos.")}
          </p>
          <p>{IDENTIFICACAO.marca} · {IDENTIFICACAO.titular}, NIF {IDENTIFICACAO.nif} · {IDENTIFICACAO.email} · morethanmoney.pt/solucoes</p>
        </div>
        <Rodape p={paginas} />
      </Pagina>

      <p className="proposta-barra pb-10 text-center text-xs text-zinc-500">
        <ArrowRight className="mr-1 inline h-3 w-3" aria-hidden="true" />
        {t("No telemóvel: Descarregar PDF → Partilhar → Guardar em Ficheiros.")}
      </p>
    </div>,
    document.body,
  )
}
