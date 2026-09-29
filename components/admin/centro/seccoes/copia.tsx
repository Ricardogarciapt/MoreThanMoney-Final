"use client"

import type { carregarCopia } from "@/lib/admin-centro/servidor/outros"
import type { CadeiaLida } from "@/lib/copia-contas/servidor/cadeia"
import CopiaEntreContas from "@/components/admin/mtmauto-copia/copia-entre-contas"
import EventosCopia from "@/components/admin/mtmauto-copia/eventos"
import VistaSimples from "@/components/admin/copia-cadeia/vista-simples"
import QuadroCadeia from "@/components/admin/copia-cadeia/quadro"

import { CONFIRMACOES } from "@/lib/admin-centro/regras"
import { useEffect, useState } from "react"
import { useCentroCtx } from "../contexto"
import { Aviso, Azulejo, BotaoLer, Botao, Chip, Painel, Pilula, Recolhivel, fmtMs, fmtNum, pedirCentro, pedirPalavra, useCentro } from "../ui"

type Copia = Awaited<ReturnType<typeof carregarCopia>>

/** O separador escolhido fica guardado: quem trabalha no quadro não o quer fechado a cada visita. */
const CHAVE_VISTA = "centro:copia:vista"

export default function SeccaoCopia() {
  const ctx = useCentroCtx()
  const [vista, setVista] = useState<"lista" | "quadro">("lista")
  // Lê-se depois do primeiro desenho para o servidor e o cliente renderizarem o mesmo (hidratação).
  useEffect(() => {
    try { if (window.localStorage.getItem(CHAVE_VISTA) === "quadro") setVista("quadro") } catch { /* sem localStorage, fica a lista */ }
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem(CHAVE_VISTA, vista) } catch { /* nada a fazer */ }
  }, [vista])
  const { dados: c, erro, aCarregar, recarregar, lidoEm } = useCentro<Copia>(`/api/admin/centro/copia?v=${ctx.versao}`, 20_000)
  // A CADEIA («quem copia o quê») é a primeira leitura do ecrã: vem antes dos azulejos, porque é a
  // pergunta que o dono faz. Endpoint à parte para uma falha da 116 não levar a secção inteira.
  const { dados: cadeia, erro: erroCadeia, recarregar: recarregarCadeia } = useCentro<CadeiaLida>(`/api/admin/mtmauto-copia/cadeia?v=${ctx.versao}`, 30_000)

  const ligarMotor = async () => {
    const palavra = pedirPalavra("Ligar o motor da cópia entre contas EM SOMBRA (regista o que faria; não envia ordens).", "CONFIRMAR")
    if (!palavra) return
    const r = await pedirCentro("/api/admin/mtmauto-copia/interruptores", { method: "PATCH", body: { ligado: true, confirmacao: palavra } })
    if (!r.success) alert(r.error)
    ctx.depoisDeAcao(); void recarregar()
  }
  const desligarMotor = async () => {
    const palavra = pedirPalavra("Desligar o motor da cópia entre contas.", CONFIRMACOES.desligar_motor_copia)
    if (!palavra) return
    const r = await pedirCentro("/api/admin/centro/acoes", { method: "POST", body: { acao: "desligar_motor_copia", confirmacao: palavra } })
    if (!r.success) alert(r.error)
    ctx.depoisDeAcao(); void recarregar()
  }

  const res = c?.porResultado ?? {}
  return (
    <div className="space-y-4">
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {c?.pendente && <Aviso>Migração 078 por aplicar — as tabelas da cópia entre contas não existem.</Aviso>}

      {/* QUEM COPIA O QUÊ — fonte de sinais → conta mestre (estratégia) → subscritores.
          O quadro de arrastar VIVE AQUI DENTRO, num separador. Estava num `Recolhivel` fechado por
          omissão, três écrans abaixo: o dono abria a página, não via arrastar nada e concluía, com
          razão, que não existia. Um painel com dois separadores não esconde nenhum dos dois. */}
      <Painel
        titulo="Quem copia o quê"
        sub="A cadeia inteira: fonte do sinal → conta mestre (a estratégia) → quem a segue. O live/sombra de cada linha é o que o motor decide agora, não a coluna copia_rotas.modo."
        accao={
          <div className="flex gap-1.5">
            <Chip activo={vista === "lista"} onClick={() => setVista("lista")}>Lista</Chip>
            <Chip activo={vista === "quadro"} onClick={() => setVista("quadro")}>Quadro (arrastar)</Chip>
          </div>
        }
      >
        {erroCadeia && <Aviso tom="grave">{erroCadeia}</Aviso>}
        {!cadeia && !erroCadeia && <p className="text-[12px] text-zinc-500">A ler a cadeia…</p>}
        {cadeia && (vista === "lista"
          ? <VistaSimples c={cadeia} />
          : <QuadroCadeia c={cadeia} recarregar={() => { void recarregarCadeia(); void recarregar() }} />)}
      </Painel>

      <div className="flex flex-wrap items-center gap-2">
        <Pilula tom={c?.motorLigado ? "info" : "neutro"} vivo={c?.motorLigado}>motor {c?.motorLigado ? "ligado (sombra)" : "desligado"}</Pilula>
        <Pilula tom={c?.liveDesbloqueado ? "grave" : "ok"}>live {c?.liveDesbloqueado ? "desbloqueado" : "bloqueado"}</Pilula>
        {c && (c.motorLigado ? <Botao tom="perigo" onClick={desligarMotor}>Desligar motor</Botao> : <Botao tom="ouro" onClick={ligarMotor}>Ligar em sombra</Botao>)}
        <div className="ml-auto"><BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Azulejo rotulo="Rotas" valor={c?.rotas ?? "—"} sub={`${c?.ativas ?? 0} activas`} />
        <Azulejo rotulo="Pedidos" valor={c?.pedidos ?? "—"} tom={c?.pedidos ? "info" : "neutro"} sub="clientes à espera" />
        <Azulejo rotulo="Em live" valor={c?.live ?? "—"} tom={c?.live ? "grave" : "ok"} />
        <Azulejo rotulo="Eventos 24 h" valor={fmtNum(c?.eventos24h)} sub={`${c?.eventosPendentes ?? 0} por processar`} tom={(c?.eventosPendentes ?? 0) > 200 ? "aviso" : "neutro"} />
        <Azulejo rotulo="Pretendidas / reais" valor={`${c?.pretendidasVsReais.pretendidas ?? 0}/${c?.pretendidasVsReais.reais ?? 0}`} sub="sombra regista só a pretendida" />
        <Azulejo rotulo="Latência p50" valor={fmtMs(c?.latenciaP50Ms)} />
        <Azulejo rotulo="Latência p95" valor={fmtMs(c?.latenciaP95Ms)} tom={(c?.latenciaP95Ms ?? 0) > 1500 ? "aviso" : "neutro"} />
        <Azulejo rotulo="Copiador 068" valor={c?.legado.copiadores ?? "—"} sub={`${c?.legado.ativos ?? 0} activos (legado)`} />
      </div>
      {Object.keys(res).length > 0 && (
        <p className="text-[11px] text-zinc-500">Resultados 24 h: {Object.entries(res).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
      )}

      <Painel titulo="Rotas de cópia" sub="Criar, aprovar pedidos, pausar, sombra/live (live bloqueado), apagar — os mesmos caminhos guardados de /api/admin/mtmauto-copia/rotas.">
        <CopiaEntreContas userIdInicial={ctx.filtro.userId ?? null} />
      </Painel>
      <Recolhivel titulo="Eventos (pretendido vs real)" descricao="Registo unificado com filtros e CSV." aberto={Boolean(ctx.filtro.eventos)}>
        <EventosCopia />
      </Recolhivel>
    </div>
  )
}
