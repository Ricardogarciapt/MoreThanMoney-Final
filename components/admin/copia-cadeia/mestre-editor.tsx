"use client"

/**
 * O EDITOR DO NÓ DA CONTA MESTRE — as regras de segurança na ORIGEM da cadeia.
 *
 * ═══ PORQUE ESTE ECRÃ É DIFERENTE DOS OUTROS ════════════════════════════════════════════════
 *
 * Cada controlo traz o seu ESTADO de `lib/copia-contas/mestre-controlos.ts`, e um controlo marcado
 * «NÃO APLICADO» aparece riscado, desactivado e com o motivo por baixo. Não é decoração defensiva: a
 * 29/09 mediu-se que `sl_minimo_pips = 100` no GoldKiller não era lido por motor nenhum, e o painel
 * antigo mostrava o 100 como se ele estivesse a proteger alguém. Um campo editável é uma promessa —
 * aqui só se promete o que tem motor, e diz-se onde ele está.
 *
 * ═══ O QUE ESTE ECRÃ ESCREVE ════════════════════════════════════════════════════════════════
 *
 * Só `mtmauto_providers.sinais_config`, e por MERGE: as travas em `.travas`, as automações de saída
 * nas cinco chaves de fracção do risco. Nada mais. As colunas antigas (`be_gatilho`,
 * `trailing_*_pips`, `sl_minimo_pips`) têm o seu ecrã em `?s=estrategias` e não se escrevem daqui —
 * dar-lhes uma segunda porta era como um stop mínimo desaparece sem ninguém pedir.
 *
 * Gravar mostra a mensagem do servidor, que vem da RELEITURA da base. Se a releitura discordar, o
 * ecrã di-lo em vez de dizer «gravado».
 */

import { useState } from "react"
import {
  CONTROLOS_MESTRE, GRUPOS, ROTULO_ESTADO, controlosDoGrupo, type Controlo, type EstadoControlo,
} from "@/lib/copia-contas/mestre-controlos"
import { LIMITES_GESTAO, type GestaoMestre } from "@/lib/copia-contas/mestre-gestao"
import type { TravasMestre } from "@/lib/copia-contas/mestre-travas"
import type { NoEstrategia } from "@/lib/copia-contas/cadeia"
import { Aviso, Botao, Gaveta, Pilula, pedirCentro } from "../centro/ui"

const TOM_ESTADO: Record<EstadoControlo, "ok" | "info" | "aviso" | "neutro"> = {
  aplicado: "ok", "so-sombra": "info", "so-ecra": "aviso", "nao-aplicado": "neutro",
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

/** Os campos editam-se como TEXTO para «vazio» existir — vazio é o único modo de desligar uma regra. */
type Rascunho = {
  janelaLigada: boolean; janelaDe: string; janelaAte: string; janelaDias: number[]
  fimLigado: boolean; fimDia: number; fimHora: string
  notLigado: boolean; notAntes: string; notDepois: string; notImpacto: "alto" | "medio"; notMoedas: string
  dd: string; margem: string
  beFracaoDoRisco: string; beOffsetFracaoDoRisco: string
  trailingInicioFracaoDoRisco: string; trailingFracaoDoRisco: string; semTrailing: boolean
}

function paraRascunho(t: TravasMestre, g: GestaoMestre): Rascunho {
  const s = (v: number | null) => (v == null ? "" : String(v))
  return {
    janelaLigada: t.janela != null,
    janelaDe: t.janela?.de ?? "07:00",
    janelaAte: t.janela?.ate ?? "20:00",
    janelaDias: t.janela?.dias ?? [1, 2, 3, 4, 5],
    fimLigado: t.fimDeSemana != null,
    fimDia: t.fimDeSemana?.dia ?? 5,
    fimHora: t.fimDeSemana?.hora ?? "20:00",
    notLigado: t.noticias != null,
    notAntes: String(t.noticias?.minutosAntes ?? 15),
    notDepois: String(t.noticias?.minutosDepois ?? 15),
    notImpacto: t.noticias?.impacto ?? "alto",
    notMoedas: (t.noticias?.moedas ?? []).join(", "),
    dd: s(t.maxDdDiarioPct),
    margem: s(t.margemLivreMinPct),
    beFracaoDoRisco: s(g.beFracaoDoRisco),
    beOffsetFracaoDoRisco: s(g.beOffsetFracaoDoRisco),
    trailingInicioFracaoDoRisco: s(g.trailingInicioFracaoDoRisco),
    trailingFracaoDoRisco: s(g.trailingFracaoDoRisco),
    semTrailing: g.semTrailing,
  }
}

/** O rascunho → o corpo do pedido. A NORMALIZAÇÃO é do servidor (a mesma que o motor corre). */
function corpoDoPedido(r: Rascunho): { travas: Record<string, unknown>; gestao: Record<string, unknown> } {
  const n = (v: string) => (v.trim() === "" ? null : Number(v))
  const travas: Record<string, unknown> = {}
  if (r.janelaLigada) travas.janela = { de: r.janelaDe, ate: r.janelaAte, dias: r.janelaDias }
  if (r.fimLigado) travas.fimDeSemana = { dia: r.fimDia, hora: r.fimHora }
  if (r.notLigado) {
    travas.noticias = {
      minutosAntes: n(r.notAntes) ?? 0, minutosDepois: n(r.notDepois) ?? 0, impacto: r.notImpacto,
      moedas: r.notMoedas.split(",").map((x) => x.trim()).filter(Boolean),
    }
  }
  if (n(r.dd) != null) travas.maxDdDiarioPct = n(r.dd)
  if (n(r.margem) != null) travas.margemLivreMinPct = n(r.margem)
  return {
    travas,
    // As quatro fracções vão SEMPRE (vazio = apagar a chave); `semTrailing` é um booleano.
    gestao: {
      beFracaoDoRisco: r.beFracaoDoRisco, beOffsetFracaoDoRisco: r.beOffsetFracaoDoRisco,
      trailingInicioFracaoDoRisco: r.trailingInicioFracaoDoRisco, trailingFracaoDoRisco: r.trailingFracaoDoRisco,
      semTrailing: r.semTrailing,
    },
  }
}

export default function MestreEditor({ no, fechar, feito }: { no: NoEstrategia; fechar: () => void; feito: () => void }) {
  const [r, setR] = useState<Rascunho>(() => paraRascunho(no.travas, no.gestao))
  const [base] = useState<Rascunho>(() => paraRascunho(no.travas, no.gestao))
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const p = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }))
  const alterado = JSON.stringify(r) !== JSON.stringify(base)

  const gravar = async () => {
    setAGravar(true); setMsg(null)
    const res = await pedirCentro<{ mensagem?: string }>("/api/admin/mtmauto-copia/cadeia", {
      method: "POST", body: { accao: "travas", slug: no.slug, ...corpoDoPedido(r) },
    })
    setAGravar(false)
    if (res.success) { setMsg({ ok: true, texto: res.data?.mensagem ?? "gravado" }); feito() }
    else setMsg({ ok: false, texto: res.error ?? "não deu para gravar" })
  }

  const naoAplicados = CONTROLOS_MESTRE.filter((c) => c.estado === "nao-aplicado").length

  return (
    <Gaveta
      aberta
      largura="max-w-3xl"
      titulo={<span>Conta Mestre · <span className="text-[#D2A63C]">{no.nome}</span></span>}
      sub={`Configurar aqui é configurar na ORIGEM: tudo o que esta mestre emitir sai já com estas travas, para as ${no.contagem.total} conta(s) que a seguem. Escreve só em mtmauto_providers.sinais_config.`}
      aoFechar={fechar}
    >
      {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}

      {/* O número que não se esconde: quantos controlos desta tabela não fazem nada hoje. */}
      <Aviso tom="aviso">
        {naoAplicados} dos {CONTROLOS_MESTRE.length} controlos desta mestre <strong>não têm motor que os leia</strong> e estão
        marcados em baixo. São campos que já existiam na base e que o painel antigo mostrava como se funcionassem —
        por exemplo <code className="text-amber-100">sl_minimo_pips = 100</code> no GoldKiller. Ficam à vista, desactivados,
        para ninguém contar com eles.
      </Aviso>

      {/* ── 1 · automações de saída ── */}
      <Secao g={0}>
        <p className="mb-2 text-[11px] text-zinc-500">
          Em <strong className="text-zinc-300">fracção do risco</strong>, não em pips: «BE aos 30 pips» quer dizer coisas
          diferentes num stop de 20 e num de 200. 1,0 = o lucro igualou o risco inicial.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <NumeroControlo chave="beFracaoDoRisco" r={r} p={p} lim={LIMITES_GESTAO.beFracaoDoRisco} sufixo="× risco" />
          <NumeroControlo chave="beOffsetFracaoDoRisco" r={r} p={p} lim={LIMITES_GESTAO.beOffsetFracaoDoRisco} sufixo="× risco" />
          <NumeroControlo chave="trailingInicioFracaoDoRisco" r={r} p={p} lim={LIMITES_GESTAO.trailingInicioFracaoDoRisco} sufixo="× risco" />
          <NumeroControlo chave="trailingFracaoDoRisco" r={r} p={p} lim={LIMITES_GESTAO.trailingFracaoDoRisco} sufixo="× risco" />
        </div>
        <Interruptor
          chave="semTrailing"
          ligado={r.semTrailing}
          aoMudar={(v) => p("semTrailing", v)}
          rotuloSim="fecha no alvo FIXO"
          rotuloNao="Trailing Profit: o alvo flutua com a tendência"
        />
        {[/* os que existem e não se editam aqui: dizem-no */ "be_gatilho", "trailing_passo_pips", "trailing_tempo_real", "saidasFracaoDoRisco"].map((k) => (
          <SoLeitura key={k} chave={k} />
        ))}
      </Secao>

      {/* ── 2 · filtro de horários ── */}
      <Secao g={1}>
        <Bloco
          chave="janela"
          ligado={r.janelaLigada}
          aoMudar={(v) => p("janelaLigada", v)}
          resumo={`${r.janelaDe}–${r.janelaAte} UTC · ${r.janelaDias.length === 7 || !r.janelaDias.length ? "todos os dias" : r.janelaDias.map((d) => DIAS[d]).join(" ")}`}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Hora rotulo="de" valor={r.janelaDe} aoMudar={(v) => p("janelaDe", v)} />
            <Hora rotulo="até" valor={r.janelaAte} aoMudar={(v) => p("janelaAte", v)} />
            <div className="flex gap-1">
              {DIAS.map((d, i) => (
                <button
                  key={d} type="button"
                  onClick={() => p("janelaDias", r.janelaDias.includes(i) ? r.janelaDias.filter((x) => x !== i) : [...r.janelaDias, i].sort())}
                  className={`rounded px-1.5 py-1 text-[10.5px] ${r.janelaDias.includes(i) ? "bg-[#D2A63C] text-black" : "border border-white/10 text-zinc-400 hover:bg-white/5"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[10.5px] text-zinc-500">
            Tudo em UTC. <code>22:00–06:00</code> é válido e passa a meia-noite — é a janela normal do ouro.
            Nenhum dia marcado = todos.
          </p>
        </Bloco>

        <Bloco
          chave="fimDeSemana"
          ligado={r.fimLigado}
          aoMudar={(v) => p("fimLigado", v)}
          resumo={`a partir de ${DIAS[r.fimDia]} ${r.fimHora} UTC não abre até segunda`}
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">
              dia
              <select
                value={r.fimDia} onChange={(e) => p("fimDia", Number(e.target.value))}
                className="ml-1 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-white"
              >
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
            <Hora rotulo="a partir de" valor={r.fimHora} aoMudar={(v) => p("fimHora", v)} />
          </div>
          <p className="mt-1 text-[10.5px] text-zinc-500">
            Evita o <strong>gap de domingo</strong>: uma posição aberta à sexta à noite reabre já do outro lado do stop, e
            isso não é risco que se meça em pips. Sábado e domingo contam como fechados, para um relay atrasado não
            entregar um sinal de sexta no sábado de manhã.
          </p>
        </Bloco>

        <Bloco
          chave="noticias"
          ligado={r.notLigado}
          aoMudar={(v) => p("notLigado", v)}
          resumo={`−${r.notAntes}/+${r.notDepois} min · impacto ${r.notImpacto}${r.notMoedas ? ` · ${r.notMoedas}` : " · todas as moedas"}`}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Mini rotulo="min antes" valor={r.notAntes} aoMudar={(v) => p("notAntes", v)} />
            <Mini rotulo="min depois" valor={r.notDepois} aoMudar={(v) => p("notDepois", v)} />
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">
              impacto
              <select
                value={r.notImpacto} onChange={(e) => p("notImpacto", e.target.value as "alto" | "medio")}
                className="ml-1 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-white"
              >
                <option value="alto">só alto</option>
                <option value="medio">médio ou acima</option>
              </select>
            </label>
            <label className="min-w-[140px] flex-1 text-[10px] uppercase tracking-wider text-zinc-500">
              moedas (vazio = todas)
              <input
                value={r.notMoedas} onChange={(e) => p("notMoedas", e.target.value)} placeholder="USD, EUR"
                className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-white"
              />
            </label>
          </div>
        </Bloco>

        {["horario", "max_trades_dia", "simbolos_permitidos"].map((k) => <SoLeitura key={k} chave={k} />)}
      </Secao>

      {/* ── 3 · risco raiz ── */}
      <Secao g={2}>
        <div className="grid gap-2 sm:grid-cols-2">
          <NumeroControlo chave="maxDdDiarioPct" r={r} campo="dd" p={p} lim={{ min: 0.1, max: 50 }} sufixo="%" />
          <NumeroControlo chave="margemLivreMinPct" r={r} campo="margem" p={p} lim={{ min: 1, max: 95 }} sufixo="%" />
        </div>
        <p className="mt-1 text-[10.5px] text-zinc-500">
          O drawdown mede-se contra a equity do <strong>início do dia</strong> (<code>sim_ancora_dia</code>), não contra o
          saldo inicial da conta. Atingido, a mestre deixa de abrir — e como tudo o que os seguidores recebem vem dela, a
          cadeia pára na origem <strong>sem se escrever nada em conta nenhuma</strong>: bloquear cada seguidor deixá-lo-ia
          sem receber as SAÍDAS do que já tem aberto, que é pior do que o prejuízo que se queria travar.
        </p>
        {["sl_minimo_pips", "risco_default_pct", "max_posicoes", "max_risco_total_pct", "max_atraso_abertura_s"].map((k) => (
          <SoLeitura key={k} chave={k} />
        ))}
      </Secao>

      <div className="sticky bottom-0 -mx-4 mt-3 flex items-center gap-2 border-t border-white/10 bg-zinc-950/95 px-4 py-2 backdrop-blur">
        <Botao tom="ouro" onClick={() => void gravar()} disabled={aGravar || !alterado}>
          {aGravar ? "A gravar…" : alterado ? "Gravar na mestre" : "Sem alterações"}
        </Botao>
        <p className="text-[10.5px] text-zinc-500">
          Aplica-se no sinal seguinte, e só a <strong>aberturas</strong>: o BE, o trailing e os fechos do que já está
          aberto passam sempre.
        </p>
      </div>
    </Gaveta>
  )
}

// ── peças ───────────────────────────────────────────────────────────────────

function Secao({ g, children }: { g: number; children: React.ReactNode }) {
  const grupo = GRUPOS[g]
  return (
    <section className="mt-3 rounded-lg border border-white/[0.07] p-3">
      <p className="text-[12.5px] font-semibold text-[#E9C46A]">{grupo.nome}</p>
      <p className="mb-2 text-[11px] text-zinc-500">{grupo.sub}</p>
      {children}
    </section>
  )
}

const acharControlo = (chave: string): Controlo | undefined => CONTROLOS_MESTRE.find((c) => c.chave === chave)

/** A etiqueta de honestidade: onde é que este controlo é lido, ou que não é. */
function Estado({ c }: { c: Controlo }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Pilula tom={TOM_ESTADO[c.estado]} title={c.lidoPor.length ? `Lido por:\n${c.lidoPor.join("\n")}` : "Nenhum motor o lê."}>
        {ROTULO_ESTADO[c.estado]}
      </Pilula>
      {c.lidoPor[0] && <code className="text-[9.5px] text-zinc-600">{c.lidoPor[0]}</code>}
    </span>
  )
}

/** Um número editável que SÓ é editável se o controlo tiver motor. */
function NumeroControlo({
  chave, campo, r, p, lim, sufixo,
}: {
  chave: string; campo?: keyof Rascunho; r: Rascunho
  p: <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => void
  lim: { min: number; max: number }; sufixo: string
}) {
  const c = acharControlo(chave)
  const k = (campo ?? chave) as keyof Rascunho
  const morto = c?.estado === "nao-aplicado"
  return (
    <div className={morto ? "opacity-50" : ""}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className={`text-[11px] ${morto ? "text-zinc-500 line-through" : "text-zinc-300"}`}>{c?.rotulo ?? chave}</p>
        {c && <Estado c={c} />}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <input
          value={String(r[k] ?? "")} onChange={(e) => p(k, e.target.value as never)} disabled={morto}
          inputMode="decimal" placeholder="—"
          className="w-24 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-white disabled:cursor-not-allowed"
        />
        <span className="text-[10.5px] text-zinc-500">{sufixo} · {lim.min}–{lim.max} · vazio desliga</span>
      </div>
      {c && <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{c.nota}</p>}
    </div>
  )
}

function Interruptor({ chave, ligado, aoMudar, rotuloSim, rotuloNao }: {
  chave: string; ligado: boolean; aoMudar: (v: boolean) => void; rotuloSim: string; rotuloNao: string
}) {
  const c = acharControlo(chave)
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[11px] text-zinc-300">{c?.rotulo ?? chave}</p>
        {c && <Estado c={c} />}
      </div>
      <div className="mt-0.5 flex gap-1.5">
        <button
          type="button" onClick={() => aoMudar(false)}
          className={`rounded px-2 py-1 text-[11px] ${!ligado ? "bg-[#D2A63C] text-black" : "border border-white/10 text-zinc-400 hover:bg-white/5"}`}
        >
          {rotuloNao}
        </button>
        <button
          type="button" onClick={() => aoMudar(true)}
          className={`rounded px-2 py-1 text-[11px] ${ligado ? "bg-[#D2A63C] text-black" : "border border-white/10 text-zinc-400 hover:bg-white/5"}`}
        >
          {rotuloSim}
        </button>
      </div>
      {c && <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{c.nota}</p>}
    </div>
  )
}

/** Um bloco de trava que se liga/desliga inteiro, e mostra o resumo quando está fechado. */
function Bloco({ chave, ligado, aoMudar, resumo, children }: {
  chave: string; ligado: boolean; aoMudar: (v: boolean) => void; resumo: string; children: React.ReactNode
}) {
  const c = acharControlo(chave)
  return (
    <div className="mt-2 rounded border border-white/[0.06] p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button" onClick={() => aoMudar(!ligado)}
          className={`rounded px-2 py-0.5 text-[11px] ${ligado ? "bg-[#D2A63C] text-black" : "border border-white/10 text-zinc-400 hover:bg-white/5"}`}
        >
          {ligado ? "ligada" : "desligada"}
        </button>
        <p className="text-[11.5px] text-zinc-200">{c?.rotulo ?? chave}</p>
        {c && <Estado c={c} />}
        {ligado && <span className="ml-auto font-mono text-[10px] text-zinc-500">{resumo}</span>}
      </div>
      {c?.estado === "nao-aplicado" && <Aviso tom="aviso">{c.nota}</Aviso>}
      {ligado && <div className="mt-2">{children}</div>}
    </div>
  )
}

/**
 * Um controlo que EXISTE na base e que este ecrã não edita — ou porque não tem motor, ou porque o
 * dono dele é outro ecrã. Mostrar é melhor do que esconder: o gestor que procura «stop mínimo» tem de
 * o encontrar, e encontrar com ele o motivo por que não está aqui a funcionar.
 */
function SoLeitura({ chave }: { chave: string }) {
  const c = acharControlo(chave)
  if (!c) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 border-t border-white/[0.04] pt-1.5">
      <code className="text-[10px] text-zinc-600">{c.coluna}</code>
      <p className={`text-[11px] ${c.estado === "nao-aplicado" ? "text-zinc-500 line-through" : "text-zinc-400"}`}>{c.rotulo}</p>
      <Estado c={c} />
      <p className="w-full text-[10px] leading-snug text-zinc-500">{c.nota}</p>
    </div>
  )
}

function Hora({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-zinc-500">
      {rotulo}
      <input
        type="time" value={valor} onChange={(e) => aoMudar(e.target.value)}
        className="ml-1 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-white"
      />
    </label>
  )
}

function Mini({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-zinc-500">
      {rotulo}
      <input
        value={valor} onChange={(e) => aoMudar(e.target.value)} inputMode="numeric"
        className="ml-1 w-16 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[12px] text-white"
      />
    </label>
  )
}
