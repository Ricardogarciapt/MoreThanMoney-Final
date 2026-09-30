"use client"

/**
 * MARCAR UMA CHAMADA — o ecrã público.
 *
 * ═══ AS DECISÕES DE DESENHO QUE NÃO SÃO GOSTO ══════════════════════════════════════════════
 *
 *  · TRÊS PASSOS, um de cada vez: assunto → hora → dados. Um formulário que mostra tudo ao mesmo
 *    tempo faz a pessoa ler quinze campos antes de saber se há sequer hora para ela;
 *  · A HORA APARECE NO FUSO DE QUEM ESTÁ A OLHAR, lido do browser, e diz-se qual é. Quem marca do
 *    Brasil e vê «15:00» sem mais nada falta à chamada — e a culpa é de quem escreveu «15:00»;
 *  · O «para quem É» de cada assunto está no cartão. Metade do valor de segmentar está em dizer a
 *    quem aquilo NÃO serve, antes de a pessoa gastar dois minutos a marcar a chamada errada;
 *  · UM PASSO ATRÁS está sempre disponível. Escolher mal o assunto no primeiro ecrã não pode
 *    obrigar a recarregar a página.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, CalendarDays, Check, Clock, Loader2, MessageCircle, Video } from "lucide-react"

type Pergunta = { chave: string; rotulo: string; tipo: "texto" | "escolha"; opcoes?: string[]; obrigatoria?: boolean }
type Tipo = {
  slug: string
  nome: string
  descricao: string | null
  para_quem: string | null
  duracao_min: number
  local: "whatsapp" | "zoom" | "meet" | "presencial"
  perguntas: Pergunta[]
  cor: string
}
type Anfitriao = { anfitriao: { id: string; nome: string; fuso: string; temZoom: boolean }; horas: string[] }

const ONDE: Record<Tipo["local"], { texto: string; Icone: typeof Video }> = {
  whatsapp: { texto: "Chamada de WhatsApp", Icone: MessageCircle },
  zoom: { texto: "Zoom", Icone: Video },
  meet: { texto: "Google Meet", Icone: Video },
  presencial: { texto: "Presencial", Icone: CalendarDays },
}

/** O fuso do browser. Se o browser não souber dizer, assume-se Lisboa e diz-se isso na mesma. */
function fusoDoVisitante(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon" } catch { return "Europe/Lisbon" }
}

const CAMPO = "w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-[14px] text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-[#D2A63C]/60"

export default function Marcar({ slugInicial }: { slugInicial?: string }) {
  const [tipos, setTipos] = useState<Tipo[] | null>(null)
  const [escolhido, setEscolhido] = useState<Tipo | null>(null)
  const [agenda, setAgenda] = useState<Anfitriao[] | null>(null)
  const [hora, setHora] = useState<{ iso: string; anfitriaoId: string; anfitriao: string; temZoom: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [feito, setFeito] = useState<null | { inicio: string; anfitriao: string; local: string; joinUrl: string | null; token: string }>(null)

  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null)
  const [onde, setOnde] = useState<"whatsapp" | "zoom" | null>(null)

  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [telefone, setTelefone] = useState("")
  const [respostas, setRespostas] = useState<Record<string, string>>({})

  const fuso = useMemo(fusoDoVisitante, [])

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/agenda/tipos").then((x) => x.json()).catch(() => ({ tipos: [] }))
      const lista: Tipo[] = r.tipos ?? []
      setTipos(lista)
      if (slugInicial) setEscolhido(lista.find((t) => t.slug === slugInicial) ?? null)
    })()
  }, [slugInicial])

  const lerHoras = useCallback(async (t: Tipo) => {
    setAgenda(null)
    setErro(null)
    const r = await fetch(`/api/agenda/horas?tipo=${encodeURIComponent(t.slug)}&dias=21`)
      .then((x) => x.json())
      .catch(() => null)
    if (!r || r.error) { setErro("Não foi possível ler a agenda. Tenta daqui a pouco."); setAgenda([]); return }
    setAgenda(r.anfitrioes ?? [])
  }, [])

  useEffect(() => { if (escolhido) void lerHoras(escolhido) }, [escolhido, lerHoras])

  /** As horas de todos os anfitriões, agrupadas por dia no fuso de quem está a olhar. */
  const dias = useMemo(() => {
    if (!agenda) return []
    const mapa = new Map<string, Array<{ iso: string; anfitriaoId: string; anfitriao: string; temZoom: boolean }>>()
    for (const a of agenda) {
      for (const iso of a.horas) {
        const d = new Date(iso)
        const chave = d.toLocaleDateString("pt-PT", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" })
        mapa.set(chave, [...(mapa.get(chave) ?? []), { iso, anfitriaoId: a.anfitriao.id, anfitriao: a.anfitriao.nome, temZoom: a.anfitriao.temZoom }])
      }
    }
    return [...mapa.entries()]
      .map(([chave, horas]) => ({
        chave,
        quando: new Date(horas[0].iso),
        horas: horas.sort((x, y) => x.iso.localeCompare(y.iso)),
      }))
      .sort((a, b) => a.horas[0].iso.localeCompare(b.horas[0].iso))
  }, [agenda, fuso])

  /** O dia aberto: o que a pessoa escolheu, ou o primeiro com horas. */
  const diaAberto = useMemo(
    () => dias.find((d) => d.chave === diaEscolhido) ?? dias[0] ?? null,
    [dias, diaEscolhido],
  )

  const marcar = async () => {
    if (!escolhido || !hora) return
    setAEnviar(true); setErro(null)
    const r = await fetch("/api/agenda/marcar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tipo: escolhido.slug, inicio: hora.iso, anfitriao: hora.anfitriaoId,
        nome, email, telefone, fuso, respostas,
        local: onde ?? undefined,
      }),
    }).then((x) => x.json()).catch(() => ({ error: "Falhou. Tenta outra vez." }))
    setAEnviar(false)
    if (r?.ok) { setFeito({ ...r.marcacao }); return }
    setErro(r?.error ?? "Não foi possível marcar.")
    // A hora deixou de existir: volta-se a ler a agenda para a pessoa não escolher a mesma outra vez.
    if (r?.codigo === "hora_ocupada" && escolhido) { setHora(null); void lerHoras(escolhido) }
  }

  // ── Marcado ───────────────────────────────────────────────────────────────
  if (feito) {
    const d = new Date(feito.inicio)
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#D2A63C]/15 ring-1 ring-[#D2A63C]/40">
          <Check className="h-7 w-7 text-[#D2A63C]" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Está marcado.</h2>
        <p className="mt-3 text-[15px] text-zinc-300">
          {d.toLocaleDateString("pt-PT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" })}
          {" às "}
          <strong className="text-white">{d.toLocaleTimeString("pt-PT", { timeZone: fuso, hour: "2-digit", minute: "2-digit" })}</strong>
          <span className="text-zinc-500"> ({fuso.replace("_", " ")})</span>
        </p>
        <p className="mt-1 text-[14px] text-zinc-400">com {feito.anfitriao}</p>
        <p className="mt-4 text-[13.5px] text-zinc-400">
          {feito.local === "whatsapp"
            ? `Ligamos-te pelo WhatsApp para ${telefone}.`
            : feito.joinUrl
              ? <>Sala: <a className="text-[#E9C46A] underline" href={feito.joinUrl} target="_blank" rel="noreferrer">entrar</a></>
              : "O link da sala segue por email."}
        </p>
        <p className="mt-6 text-[12.5px] text-zinc-500">
          Enviámos a confirmação para {email}. Precisas de desmarcar?{" "}
          <a className="text-[#E9C46A] underline" href={`/agendar/gerir?t=${feito.token}`}>é aqui</a>.
        </p>
      </div>
    )
  }

  // ── 1. O assunto ──────────────────────────────────────────────────────────
  if (!escolhido) {
    return (
      <div>
        <Cabecalho titulo="Sobre o que queres falar?" sub="Escolhe o assunto — é o que decide com quem falas e quanto tempo precisamos." />
        {tipos === null ? <Espera /> : tipos.length === 0 ? (
          <p className="text-center text-[14px] text-zinc-500">A agenda está fechada de momento.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tipos.map((t) => {
              const { texto, Icone } = ONDE[t.local]
              return (
                <button
                  key={t.slug} type="button" onClick={() => { setEscolhido(t); setHora(null) }}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-[#D2A63C]/50 hover:bg-white/[0.05]"
                >
                  <span className="h-1 w-10 rounded-full" style={{ background: t.cor }} />
                  <h3 className="mt-3 text-[17px] font-semibold text-zinc-50 group-hover:text-[#E9C46A]">{t.nome}</h3>
                  {t.descricao && <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-400">{t.descricao}</p>}
                  {t.para_quem && <p className="mt-2 text-[12.5px] italic text-zinc-500">Para {t.para_quem.charAt(0).toLowerCase() + t.para_quem.slice(1)}</p>}
                  <span className="mt-4 flex items-center gap-3 text-[12px] text-zinc-500">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t.duracao_min} min</span>
                    <span className="flex items-center gap-1"><Icone className="h-3.5 w-3.5" /> {texto}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── 2. A hora ─────────────────────────────────────────────────────────────
  if (!hora) {
    return (
      <div>
        <Voltar onClick={() => setEscolhido(null)} />
        <Cabecalho
          titulo={escolhido.nome}
          sub={`${escolhido.duracao_min} minutos · ${ONDE[escolhido.local].texto} · horas no teu fuso (${fuso.replace("_", " ")})`}
        />
        {erro && <Aviso>{erro}</Aviso>}
        {agenda === null ? <Espera /> : dias.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-[14px] text-zinc-400">
            Não há horas livres nos próximos dias. Escreve-nos e marcamos à mão.
          </p>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            {/*
              A TIRA DE DIAS. Antes desenhavam-se todos os dias uns debaixo dos outros com TODAS as
              horas de cada um — três semanas de agenda davam duzentos botões e uma página que não
              acabava. Aqui escolhe-se o dia numa linha e só se vêem as horas desse dia: é a mesma
              informação, num ecrã em vez de dez.
            */}
            {/*
              A barra de deslocamento vai escondida: o CSS global da casa pinta-a de dourado e
              grosso, e por baixo de uma fila de dias isso lê-se como uma barra de progresso — a
              pessoa fica à espera que encha. A tira continua a deslizar com o dedo e com a roda.
            */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dias.map((d) => {
                const activo = d.chave === diaAberto?.chave
                return (
                  <button
                    key={d.chave} type="button" onClick={() => setDiaEscolhido(d.chave)}
                    className={`flex min-w-[58px] shrink-0 flex-col items-center rounded-xl border px-2 py-2 transition-colors ${
                      activo ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                    }`}
                  >
                    <span className="text-[10.5px] uppercase tracking-wide">
                      {d.quando.toLocaleDateString("pt-PT", { timeZone: fuso, weekday: "short" }).replace(".", "")}
                    </span>
                    <span className="text-[17px] font-semibold leading-tight tabular-nums">
                      {d.quando.toLocaleDateString("pt-PT", { timeZone: fuso, day: "numeric" })}
                    </span>
                    <span className="text-[9.5px] tabular-nums opacity-70">{d.horas.length}</span>
                  </button>
                )
              })}
            </div>

            {diaAberto && (
              <div className="border-t border-white/[0.07] pt-3">
                <p className="mb-2.5 text-[12.5px] capitalize text-zinc-400">
                  {diaAberto.quando.toLocaleDateString("pt-PT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" })}
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {diaAberto.horas.map((h) => (
                    <button
                      key={h.iso + h.anfitriaoId} type="button" onClick={() => setHora(h)}
                      title={`com ${h.anfitriao}`}
                      className="rounded-lg border border-white/12 bg-black/30 py-2 text-center text-[13.5px] tabular-nums text-zinc-200 transition-colors hover:border-[#D2A63C]/60 hover:bg-[#D2A63C]/10 hover:text-[#E9C46A]"
                    >
                      {new Date(h.iso).toLocaleTimeString("pt-PT", { timeZone: fuso, hour: "2-digit", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── 3. Os dados ───────────────────────────────────────────────────────────
  const d = new Date(hora.iso)
  return (
    <div className="mx-auto max-w-lg">
      <Voltar onClick={() => setHora(null)} />
      <Cabecalho titulo="Falta só saber quem és." sub={
        `${escolhido.nome} · ${d.toLocaleDateString("pt-PT", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" })} às ${d.toLocaleTimeString("pt-PT", { timeZone: fuso, hour: "2-digit", minute: "2-digit" })} · com ${hora.anfitriao}`
      } />
      {erro && <Aviso>{erro}</Aviso>}
      <div className="space-y-3">
        {/*
          ONDE FALAMOS. Só aparece quando há mesmo uma sala de Zoom do outro lado (`temZoom`, que
          vem com as horas). Oferecer Zoom sem link é prometer uma sala que não existe, e isso
          descobre-se à hora da chamada — o pior momento possível.
        */}
        {hora.temZoom && (
          <Campo rotulo="Onde falamos">
            <div className="flex gap-1.5">
              {([["whatsapp", "Chamada de WhatsApp"], ["zoom", "Zoom"]] as const).map(([v, rotulo]) => {
                const activo = (onde ?? (escolhido.local === "zoom" ? "zoom" : "whatsapp")) === v
                return (
                  <button
                    key={v} type="button" onClick={() => setOnde(v)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${activo ? "bg-[#D2A63C] text-black" : "border border-white/12 text-zinc-300 hover:bg-white/5"}`}
                  >
                    {v === "zoom" ? <Video className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />} {rotulo}
                  </button>
                )
              })}
            </div>
          </Campo>
        )}
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} placeholder="Como te chamas" /></Campo>
        <Campo rotulo="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" className={CAMPO} placeholder="para onde vai a confirmação" /></Campo>
        <Campo rotulo={(onde ?? escolhido.local) === "whatsapp" ? "WhatsApp (é por aqui que ligamos)" : "Telemóvel (opcional)"}>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" className={CAMPO} placeholder="+351 9xx xxx xxx" />
        </Campo>
        {escolhido.perguntas?.map((q) => (
          <Campo key={q.chave} rotulo={q.rotulo + (q.obrigatoria ? "" : " (opcional)")}>
            {q.tipo === "escolha" ? (
              <div className="flex flex-wrap gap-1.5">
                {(q.opcoes ?? []).map((o) => (
                  <button
                    key={o} type="button"
                    onClick={() => setRespostas((r) => ({ ...r, [q.chave]: r[q.chave] === o ? "" : o }))}
                    className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${respostas[q.chave] === o ? "bg-[#D2A63C] text-black" : "border border-white/12 text-zinc-300 hover:bg-white/5"}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={respostas[q.chave] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [q.chave]: e.target.value }))}
                rows={3} className={CAMPO} placeholder="Escreve à vontade"
              />
            )}
          </Campo>
        ))}
      </div>
      <button
        type="button" onClick={() => void marcar()} disabled={aEnviar}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D2A63C] px-4 py-3 text-[15px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {aEnviar ? <><Loader2 className="h-4 w-4 animate-spin" /> A marcar…</> : "Marcar a chamada"}
      </button>
      <p className="mt-3 text-center text-[11.5px] text-zinc-500">
        Usamos os teus dados só para esta chamada e para falar contigo sobre ela.
      </p>
    </div>
  )
}

function Cabecalho({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[22px] font-semibold tracking-tight text-zinc-50">{titulo}</h2>
      {sub && <p className="mt-1.5 text-[13.5px] text-zinc-400">{sub}</p>}
    </div>
  )
}

function Voltar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500 transition-colors hover:text-[#D2A63C]">
      <ArrowLeft className="h-3.5 w-3.5" /> voltar
    </button>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] uppercase tracking-wider text-zinc-500">{rotulo}</span>
      {children}
    </label>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">{children}</p>
}

function Espera() {
  return <div className="flex items-center justify-center py-14 text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> um instante…</div>
}
