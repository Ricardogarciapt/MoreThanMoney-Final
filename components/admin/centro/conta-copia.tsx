"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import type { FichaCopia } from "@/lib/copia-contas/servidor/ficha-copia"
import { NOMES_AUTO, NOMES_LIMITES, NOMES_SITE, NOMES_SUB, PALAVRA_RETIRAR, type EstrategiaDaFicha } from "@/lib/copia-contas/ficha-copia-regras"
import { useCentroCtx } from "./contexto"
import { Aviso, Botao, Pilula, Recolhivel, Tabela, Vazio, fmtNum, pedirCentro, pedirPalavra, td, th, useCentro } from "./ui"

/**
 * CÓPIA E RISCO DESTA CONTA — o bloco da gaveta da conta (Centro › Contas, backoffice Gestão › Contas &
 * cópia) onde o admin afina um subscritor sem sair da conta: risco/lote, SL/TP, BE e trailing, as
 * estratégias que segue (ligar, desligar, lote por estratégia), os limites do motor por conta
 * (mestres_contas) e «retirar da cópia».
 *
 * Tudo o que se grava aqui escreve na FONTE do desejo (ligação do site / conta e subscrições da MTM
 * Auto / mestres_contas) e o servidor ressincroniza as rotas com a mesma função do script — por isso
 * cada linha mostra o «lote previsto» (o que a regra dá) ao lado da rota que existe hoje.
 */
export default function ContaCopia({ refConta, aoMudar }: { refConta: string; aoMudar: () => void }) {
  const ctx = useCentroCtx()
  const { dados: f, erro, recarregar } = useCentro<FichaCopia>(`/api/admin/centro/conta-copia?ref=${encodeURIComponent(refConta)}&v=${ctx.versao}`, 60_000)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const escrever = async (chave: string, corpo: Record<string, unknown>) => {
    setOcupado(chave); setMsg(null)
    const r = await pedirCentro<{ message?: string }>("/api/admin/centro/conta-copia", { method: "POST", body: { ref: refConta, ...corpo } })
    setOcupado(null)
    setMsg({ ok: r.success, texto: r.success ? r.data?.message ?? "feito" : r.error ?? "falhou" })
    if (r.success) { aoMudar(); void recarregar() }
    return r.success
  }

  if (erro && !f) return <Aviso tom="grave">Ficha de cópia: {erro}</Aviso>
  if (!f) return <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3 w-3 animate-spin" /> A ler a ficha de cópia…</div>

  const seguidas = f.estrategias.filter((e) => e.segue)
  const outras = f.estrategias.filter((e) => !e.segue)
  const abertas = f.estrategias.reduce((n, e) => n + (e.rota?.abertas ?? 0), 0)

  return (
    <section className="space-y-3 rounded-xl border border-[#D2A63C]/20 bg-[#D2A63C]/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#D2A63C]/80">Cópia e risco desta conta</p>
          <p className="text-[11px] text-zinc-500">Fonte: {f.fonte === "site" ? "ligação do site (mtmcopy_connections)" : "conta MTM Auto (mtmauto_accounts + subscrições)"} · chave <span className="font-mono">{f.chave ?? "—"}</span></p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pilula tom={f.limites.modo === "live" ? "grave" : "info"}>motor {f.limites.modo}{f.limites.existe ? "" : " (omissão)"}</Pilula>
          {f.limites.bloqueada && <Pilula tom="grave" title={f.limites.bloqueioMotivo ?? ""}>bloqueada</Pilula>}
          <Pilula>{seguidas.length} estratégia(s) · {abertas} aberta(s)</Pilula>
        </div>
      </div>
      {f.naoEDestino && <Aviso tom="info">Esta conta não é destino do motor das mestres: {f.naoEDestino}.</Aviso>}
      {f.avisos.map((a) => <Aviso key={a} tom="info">{a}</Aviso>)}
      {msg && <Aviso tom={msg.ok ? "info" : "grave"}>{msg.texto}</Aviso>}

      <Recolhivel titulo="Estratégias que segue" descricao="Ligar/desligar e o lote por estratégia. A rota nasce da escolha — nunca se edita à mão." aberto etiqueta={<Pilula tom={seguidas.length ? "ok" : "neutro"}>{seguidas.length}</Pilula>}>
        {seguidas.length === 0 ? <Vazio>Não segue nenhuma estratégia pelo motor.</Vazio> : (
          <Tabela min={720}>
            <thead><tr><th className={th}>Estratégia</th><th className={th}>Entrou por</th><th className={th}>Lote previsto</th><th className={th}>Rota hoje</th><th className={th}>Abertas</th><th className={th} /></tr></thead>
            <tbody>
              {seguidas.map((e) => (
                <LinhaEstrategia key={e.slug} e={e} f={f} ocupado={ocupado} escrever={escrever} abrirFicha={() => { ctx.fechar(); ctx.irPara("estrategias", { e: e.slug }) }} />
              ))}
            </tbody>
          </Tabela>
        )}
        {outras.length > 0 && !f.naoEDestino && (
          <div className="mt-3">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Ligar a outra estratégia (rota nova)</p>
            <div className="flex flex-wrap gap-1.5">
              {outras.map((e) => (
                <Botao key={e.slug} tom="ouro" disabled={ocupado != null}
                  title={f.fonte === "auto" && !e.incluirMtmauto ? "Esta estratégia não inclui contas MTM Auto: a subscrição grava-se mas a rota só nasce depois de o ligares na ficha da estratégia." : `Passa a seguir «${e.nome}» com o risco/lote desta conta.`}
                  onClick={() => {
                    const lote = window.prompt(`Ligar «${e.nome}».\n\nLote FIXO para esta estratégia (vazio = usar o risco % / lote da conta):`)
                    if (lote === null) return
                    void escrever(`ligar:${e.slug}`, { accao: "ligar", slug: e.slug, lote: lote.trim() ? Number(lote.replace(",", ".")) : null })
                  }}>
                  + {e.nome}{f.fonte === "auto" && !e.incluirMtmauto ? " ⚠" : ""}
                </Botao>
              ))}
            </div>
          </div>
        )}
      </Recolhivel>

      <Recolhivel titulo={f.fonte === "site" ? "Parâmetros da ligação (site)" : "Parâmetros da conta (MTM Auto)"} descricao="Risco, lote, SL/TP, símbolos, break-even e trailing. Valem para todas as estratégias desta conta.">
        {f.fonte === "site" ? <FormSite p={f.parametros} ocupado={ocupado} escrever={escrever} /> : <FormAuto p={f.parametros} ocupado={ocupado} escrever={escrever} />}
      </Recolhivel>

      <Recolhivel titulo="Limites do motor nesta conta" descricao="mestres_contas — somados entre todas as estratégias. O modo sombra/live muda-se aqui com a palavra LIVE." etiqueta={<Pilula>{f.limites.maxRiscoTotalPct} % · {f.limites.maxPosicoes} pos.</Pilula>}>
        <FormLimites f={f} ocupado={ocupado} escrever={escrever} depois={() => { aoMudar(); void recarregar() }} />
      </Recolhivel>

      {!f.naoEDestino && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/20 p-2">
          <p className="flex-1 text-[11px] text-zinc-400">Retirar da cópia: deixa TODAS as estratégias. O que está aberto continua gerido até fechar; a conta em si fica (apagar é «Remover…»).</p>
          <Botao tom="perigo" disabled={ocupado != null || seguidas.length === 0} onClick={() => {
            const c = pedirPalavra(`Retirar ${f.chave ?? refConta} da cópia (deixa ${seguidas.map((e) => e.nome).join(", ") || "—"}).`, PALAVRA_RETIRAR)
            if (c) void escrever("retirar", { accao: "retirar", confirmacao: c })
          }}>{ocupado === "retirar" && <Loader2 className="h-3 w-3 animate-spin" />}Retirar da cópia…</Botao>
        </div>
      )}
    </section>
  )
}

type Escrever = (chave: string, corpo: Record<string, unknown>) => Promise<boolean>

function LinhaEstrategia({ e, f, ocupado, escrever, abrirFicha }: { e: EstrategiaDaFicha; f: FichaCopia; ocupado: string | null; escrever: Escrever; abrirFicha: () => void }) {
  const [aberto, setAberto] = useState(false)
  const r = e.rota
  return (
    <>
      <tr>
        <td className={td}><button type="button" className="text-left text-zinc-100 hover:text-[#E9C46A]" onClick={abrirFicha} title="Abrir a ficha da estratégia (s=estrategias&e=…)">{e.nome} →</button><span className="block text-[10.5px] text-zinc-500">{e.slug} · motor {e.modoMotor}</span></td>
        <td className={`${td} text-[11px]`}>{e.via ?? "—"}{e.loteSite != null && <span className="block text-zinc-500">{e.loteSite === true ? "risco da ligação" : `lote fixo ${e.loteSite}`}</span>}</td>
        <td className={`${td} text-[11px]`}>{e.lotePrevisto ? e.lotePrevisto.ok ? <><span className="font-mono text-zinc-100">{e.lotePrevisto.texto}</span><span className="block text-[10px] text-zinc-500">{e.lotePrevisto.origem}</span></> : <span className="text-amber-300">recusado: {e.lotePrevisto.motivo}</span> : "—"}</td>
        <td className={`${td} text-[11px]`}>{r ? <><Pilula tom={r.pausadaMotivo ? "aviso" : r.ativa ? (r.modo === "live" ? "grave" : "info") : "neutro"}>{r.pausadaMotivo ? "pausada" : r.ativa ? r.modo : "inactiva"}</Pilula><span className="block text-[10px] text-zinc-500">{r.modoLote} {fmtNum(r.valor, 4)}{r.pausadaMotivo ? ` · ${r.pausadaMotivo}` : ""}{!r.copiarModificacoes ? " · SL próprio" : ""}{!r.copiarParciais ? " · sem parciais" : ""}</span></> : <span className="text-amber-300">sem rota ainda</span>}</td>
        <td className={`${td} font-mono tabular-nums`}>{r?.abertas ?? 0}</td>
        <td className={td}>
          <div className="flex flex-wrap gap-1">
            <Botao onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : "Afinar"}</Botao>
            <Botao tom="perigo" disabled={ocupado != null} onClick={() => { if (window.confirm(`Deixar de seguir «${e.nome}»? O que está aberto continua gerido até fechar.`)) void escrever(`desligar:${e.slug}`, { accao: "desligar", slug: e.slug }) }}>Desligar</Botao>
          </div>
        </td>
      </tr>
      {aberto && (
        <tr><td colSpan={6} className="border-b border-white/[0.04] bg-black/30 px-3 py-2">
          {f.fonte === "site" ? <AfinarSite e={e} ocupado={ocupado} escrever={escrever} /> : <AfinarSub e={e} ocupado={ocupado} escrever={escrever} />}
        </td></tr>
      )}
    </>
  )
}

/** Site: o lote por estratégia É `strategy_lots[slug]` — grava-se com «ligar» (upsert), como no quadro. */
function AfinarSite({ e, ocupado, escrever }: { e: EstrategiaDaFicha; ocupado: string | null; escrever: Escrever }) {
  const [lote, setLote] = useState(e.loteSite && e.loteSite !== true ? String(e.loteSite) : "")
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Entrada rotulo="Lote fixo só nesta estratégia (0,01–50)" valor={lote} aoMudar={setLote} largura="w-28" />
      <Botao tom="ouro" disabled={ocupado != null || !lote.trim()} onClick={() => void escrever(`ligar:${e.slug}`, { accao: "ligar", slug: e.slug, lote: Number(lote.replace(",", ".")) })}>Gravar lote fixo</Botao>
      <Botao disabled={ocupado != null || e.loteSite === true} onClick={() => void escrever(`ligar:${e.slug}`, { accao: "ligar", slug: e.slug, lote: null })} title="strategy_lots[slug] = true: a rota usa o risco % / lote da ligação">Usar o risco da ligação</Botao>
      <p className="w-full text-[10.5px] text-zinc-500">BE e trailing nas ligações do site vêm da MESTRE (ficha da estratégia); a ligação copia as modificações de SL tal e qual.</p>
    </div>
  )
}

/** MTM Auto: a subscrição tem risco/lote/BE/trailing próprios; `herda` = o valor da conta. */
function AfinarSub({ e, ocupado, escrever }: { e: EstrategiaDaFicha; ocupado: string | null; escrever: Escrever }) {
  const s = e.subscricao
  const [v, setV] = useState<Record<string, unknown>>({})
  useEffect(() => { setV({}) }, [e.slug])
  if (!s) return <Vazio>Sem subscrição — liga primeiro.</Vazio>
  const val = (k: string, actual: unknown) => (k in v ? v[k] : actual)
  const tri = (k: string, actual: boolean | null) => {
    const x = val(k, actual)
    return x === true ? "sim" : x === false ? "nao" : "herda"
  }
  const campos: Record<string, unknown> = { ...v }
  return (
    <div className="space-y-2">
      {s.noutraConta && <Aviso tom="aviso">Esta subscrição aponta para OUTRA conta deste utilizador — a rota nasce lá, não aqui.</Aviso>}
      <div className="flex flex-wrap items-end gap-2">
        <Escolha rotulo={NOMES_SUB.modo_risco} valor={String(val("modo_risco", s.modoRisco ?? "conta"))} opcoes={[["conta", "da conta"], ["risco", "risco %"], ["lote", "lote fixo"], ["multiplicador", "multiplicador"]]} aoMudar={(x) => setV({ ...v, modo_risco: x })} />
        <Entrada rotulo={NOMES_SUB.risco_pct} valor={txt(val("risco_pct", s.riscoPct))} aoMudar={(x) => setV({ ...v, risco_pct: x })} largura="w-20" />
        <Entrada rotulo={NOMES_SUB.lote_fixo} valor={txt(val("lote_fixo", s.loteFixo))} aoMudar={(x) => setV({ ...v, lote_fixo: x })} largura="w-20" />
        <Entrada rotulo={NOMES_SUB.multiplicador} valor={txt(val("multiplicador", s.multiplicador))} aoMudar={(x) => setV({ ...v, multiplicador: x })} largura="w-20" />
        <Entrada rotulo={NOMES_SUB.max_posicoes} valor={txt(val("max_posicoes", s.maxPosicoes))} aoMudar={(x) => setV({ ...v, max_posicoes: x })} largura="w-16" />
        <Escolha rotulo={NOMES_SUB.be_ativo} valor={tri("be_ativo", s.beAtivo)} opcoes={[["herda", "herda"], ["sim", "sim"], ["nao", "não"]]} aoMudar={(x) => setV({ ...v, be_ativo: x === "herda" ? null : x === "sim" })} />
        <Escolha rotulo={NOMES_SUB.trailing_ativo} valor={tri("trailing_ativo", s.trailingAtivo)} opcoes={[["herda", "herda"], ["sim", "sim"], ["nao", "não"]]} aoMudar={(x) => setV({ ...v, trailing_ativo: x === "herda" ? null : x === "sim" })} />
        <Escolha rotulo={NOMES_SUB.auto_aceitar} valor={val("auto_aceitar", s.autoAceitar) ? "sim" : "nao"} opcoes={[["sim", "sim"], ["nao", "não (sem rota)"]]} aoMudar={(x) => setV({ ...v, auto_aceitar: x === "sim" })} />
        <Botao tom="ouro" disabled={ocupado != null || !Object.keys(v).length} onClick={async () => { if (await escrever(`sub:${e.slug}`, { accao: "subscricao", slug: e.slug, campos })) setV({}) }}>Gravar subscrição</Botao>
      </div>
      <p className="text-[10.5px] text-zinc-500">BE/trailing «sim» na conta ou na subscrição = a conta gere o próprio stop e a rota NÃO copia as modificações de SL da mestre; «não» nos dois = copia o SL da mestre tal e qual.</p>
    </div>
  )
}

function FormSite({ p, ocupado, escrever }: { p: Record<string, unknown>; ocupado: string | null; escrever: Escrever }) {
  const [v, setV] = useState<Record<string, unknown>>({})
  const val = (k: string) => (k in v ? v[k] : p[k])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Escolha rotulo={NOMES_SITE.lot_mode} valor={String(val("lot_mode") ?? "risk_percent")} opcoes={[["risk_percent", "risco %"], ["fixed", "lote fixo"]]} aoMudar={(x) => setV({ ...v, lot_mode: x })} />
        <Entrada rotulo={NOMES_SITE.lot_value} valor={txt(val("lot_value"))} aoMudar={(x) => setV({ ...v, lot_value: x })} largura="w-24" />
        <Entrada rotulo={NOMES_SITE.max_risk_percent} valor={txt(val("max_risk_percent"))} aoMudar={(x) => setV({ ...v, max_risk_percent: x })} largura="w-20" />
        <Interruptor rotulo={NOMES_SITE.copy_sl} ligado={val("copy_sl") !== false} onClick={() => setV({ ...v, copy_sl: !(val("copy_sl") !== false) })} />
        <Interruptor rotulo={NOMES_SITE.copy_tp} ligado={val("copy_tp") !== false} onClick={() => setV({ ...v, copy_tp: !(val("copy_tp") !== false) })} />
        <Interruptor rotulo={NOMES_SITE.auto_trailing_stop} ligado={val("auto_trailing_stop") === true} onClick={() => setV({ ...v, auto_trailing_stop: val("auto_trailing_stop") !== true })} />
        <Entrada rotulo={NOMES_SITE.trailing_stop_points} valor={txt(val("trailing_stop_points"))} aoMudar={(x) => setV({ ...v, trailing_stop_points: x })} largura="w-20" />
        <Entrada rotulo={NOMES_SITE.symbols_whitelist} valor={Array.isArray(val("symbols_whitelist")) ? (val("symbols_whitelist") as string[]).join(", ") : String(val("symbols_whitelist") ?? "")} aoMudar={(x) => setV({ ...v, symbols_whitelist: x })} largura="w-56" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Botao tom="ouro" disabled={ocupado != null || !Object.keys(v).length} onClick={async () => { if (await escrever("parametros", { accao: "parametros", campos: v })) setV({}) }}>Gravar parâmetros</Botao>
        <span className="text-[10.5px] text-zinc-500">{p.prop_firm_type ? `prop firm ${String(p.prop_firm_type)} · ` : ""}método {String(p.copy_method ?? "—")}{p.copyfactory_strategy_pick ? ` · pick ${String(p.copyfactory_strategy_pick)}` : ""}. O trailing MTMcopier é do caminho antigo (MetaApi); no motor das mestres o BE/trailing vem da estratégia.</span>
      </div>
    </div>
  )
}

function FormAuto({ p, ocupado, escrever }: { p: Record<string, unknown>; ocupado: string | null; escrever: Escrever }) {
  const [v, setV] = useState<Record<string, unknown>>({})
  const val = (k: string) => (k in v ? v[k] : p[k])
  const sw = (k: string, omissao = true) => <Interruptor key={k} rotulo={NOMES_AUTO[k]} ligado={omissao ? val(k) !== false : val(k) === true} onClick={() => setV({ ...v, [k]: !(omissao ? val(k) !== false : val(k) === true) })} />
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Escolha rotulo={NOMES_AUTO.modo_lote} valor={String(val("modo_lote") ?? "risk_percent")} opcoes={[["risk_percent", "risco %"], ["fixed", "lote fixo"], ["multiplier", "multiplicador"]]} aoMudar={(x) => setV({ ...v, modo_lote: x })} />
        <Entrada rotulo={NOMES_AUTO.risco_pct} valor={txt(val("risco_pct"))} aoMudar={(x) => setV({ ...v, risco_pct: x })} largura="w-20" />
        <Entrada rotulo={NOMES_AUTO.risco_max_pct} valor={txt(val("risco_max_pct"))} aoMudar={(x) => setV({ ...v, risco_max_pct: x })} largura="w-20" />
        <Entrada rotulo={NOMES_AUTO.lote_valor} valor={txt(val("lote_valor"))} aoMudar={(x) => setV({ ...v, lote_valor: x })} largura="w-20" />
        <Entrada rotulo={NOMES_AUTO.multiplicador} valor={txt(val("multiplicador"))} aoMudar={(x) => setV({ ...v, multiplicador: x })} largura="w-20" />
        <Entrada rotulo={NOMES_AUTO.max_posicoes} valor={txt(val("max_posicoes"))} aoMudar={(x) => setV({ ...v, max_posicoes: x })} largura="w-16" />
        <Entrada rotulo={NOMES_AUTO.be_gatilho} valor={txt(val("be_gatilho"))} aoMudar={(x) => setV({ ...v, be_gatilho: x })} largura="w-16" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {sw("copia_ativa")}{sw("copiar_sl")}{sw("copiar_tp")}{sw("be_ativo")}{sw("trailing_ativo")}{sw("espelhar_saidas", false)}{sw("protecao_equity", false)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Entrada rotulo={NOMES_AUTO.equity_minima} valor={txt(val("equity_minima"))} aoMudar={(x) => setV({ ...v, equity_minima: x })} largura="w-24" />
        <Entrada rotulo={NOMES_AUTO.perda_diaria_max} valor={txt(val("perda_diaria_max"))} aoMudar={(x) => setV({ ...v, perda_diaria_max: x })} largura="w-24" />
        <Entrada rotulo={NOMES_AUTO.ganho_diario_max} valor={txt(val("ganho_diario_max"))} aoMudar={(x) => setV({ ...v, ganho_diario_max: x })} largura="w-24" />
        <Entrada rotulo={NOMES_AUTO.simbolos_permitidos} valor={Array.isArray(val("simbolos_permitidos")) ? (val("simbolos_permitidos") as string[]).join(", ") : String(val("simbolos_permitidos") ?? "")} aoMudar={(x) => setV({ ...v, simbolos_permitidos: x })} largura="w-56" />
        <Botao tom="ouro" disabled={ocupado != null || !Object.keys(v).length} onClick={async () => { if (await escrever("parametros", { accao: "parametros", campos: v })) setV({}) }}>Gravar parâmetros</Botao>
      </div>
      <p className="text-[10.5px] text-zinc-500">Os mesmos limites da app (risco 0,1–5 %, máx. 50 posições). Vazio nos tectos diários/equity mínima = sem limite. «Seguir as saídas do educador» = copiar parciais e SL da mestre; desligado, os alvos são os da conta.</p>
    </div>
  )
}

function FormLimites({ f, ocupado, escrever, depois }: { f: FichaCopia; ocupado: string | null; escrever: Escrever; depois: () => void }) {
  const l = f.limites
  const [v, setV] = useState<Record<string, unknown>>({})
  const [aMudarModo, setAMudarModo] = useState(false)
  const val = (k: string, actual: unknown) => (k in v ? v[k] : actual)
  const mudarModo = async (valor: "sombra" | "live") => {
    if (!f.chave) return
    const c = pedirPalavra(valor === "live" ? `Pôr ${f.chave} em LIVE: o motor passa a enviar ordens reais a esta conta em TODAS as estratégias (se a estratégia também estiver live).` : `Voltar ${f.chave} a sombra: o motor só regista o que faria.`, valor === "live" ? "LIVE" : "CONFIRMAR")
    if (!c) return
    setAMudarModo(true)
    const r = await pedirCentro<{ message?: string }>("/api/admin/mtmauto-copia/mestres", { method: "POST", body: { tipo: "conta", contaChave: f.chave, valor, confirmacao: c } })
    setAMudarModo(false)
    window.alert(r.success ? r.data?.message ?? "feito" : r.error ?? "falhou")
    if (r.success) depois()
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Entrada rotulo={NOMES_LIMITES.lote_fixo_forcado} valor={txt(val("lote_fixo_forcado", l.loteFixoForcado))} aoMudar={(x) => setV({ ...v, lote_fixo_forcado: x })} largura="w-24" />
        <Entrada rotulo={NOMES_LIMITES.max_posicoes} valor={txt(val("max_posicoes", l.maxPosicoes))} aoMudar={(x) => setV({ ...v, max_posicoes: x })} largura="w-20" />
        <Entrada rotulo={NOMES_LIMITES.max_risco_total_pct} valor={txt(val("max_risco_total_pct", l.maxRiscoTotalPct))} aoMudar={(x) => setV({ ...v, max_risco_total_pct: x })} largura="w-20" />
        <Entrada rotulo={NOMES_LIMITES.max_lote_total} valor={txt(val("max_lote_total", l.maxLoteTotal))} aoMudar={(x) => setV({ ...v, max_lote_total: x })} largura="w-20" />
        <Botao tom="ouro" disabled={ocupado != null || !Object.keys(v).length || !f.chave} onClick={async () => { if (await escrever("limites", { accao: "limites", campos: v })) setV({}) }}>Gravar limites</Botao>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] text-zinc-500">Modo desta conta no motor: <b className="text-zinc-300">{l.modo}</b>{l.existe ? "" : " (sem linha — omissão)"}. Vale para todas as estratégias; o live efectivo exige também a estratégia em live.</span>
        {l.modo === "live"
          ? <Botao disabled={aMudarModo || !f.chave} onClick={() => void mudarModo("sombra")}>Voltar a sombra</Botao>
          : <Botao tom="perigo" disabled={aMudarModo || !f.chave} onClick={() => void mudarModo("live")}>Pôr em LIVE…</Botao>}
      </div>
      <p className="text-[10.5px] text-zinc-500">Lote fixo forçado = contas com bónus (Monaxa 20X): o risco % sobre um saldo inflacionado não serve. Vazio = desligado. O risco total máx. é o «saldo de risco» da conta: a soma do risco de todas as posições abertas não passa daqui.</p>
    </div>
  )
}

// ── peças ───────────────────────────────────────────────────────────────────

const txt = (v: unknown) => (v == null ? "" : String(v))

function Entrada({ rotulo, valor, aoMudar, largura = "w-24" }: { rotulo: string; valor: string; aoMudar: (v: string) => void; largura?: string }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{rotulo}</span>
      <input value={valor} onChange={(e) => aoMudar(e.target.value)} className={`${largura} rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white focus:border-[#D2A63C]/60 focus:outline-none`} />
    </label>
  )
}

function Escolha({ rotulo, valor, opcoes, aoMudar }: { rotulo: string; valor: string; opcoes: Array<[string, string]>; aoMudar: (v: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{rotulo}</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white focus:border-[#D2A63C]/60 focus:outline-none">
        {opcoes.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </label>
  )
}

function Interruptor({ ligado, rotulo, onClick, disabled }: { ligado: boolean; rotulo: string; onClick: () => void; disabled?: boolean }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition-colors duration-200 hover:border-[#D2A63C]/40 disabled:opacity-50">
      <span className={`relative h-3.5 w-6 rounded-full transition-colors duration-200 ${ligado ? "bg-[#D2A63C]" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-black transition-transform duration-200 ${ligado ? "translate-x-3" : "translate-x-0.5"}`} />
      </span>
      {rotulo}
    </button>
  )
}
