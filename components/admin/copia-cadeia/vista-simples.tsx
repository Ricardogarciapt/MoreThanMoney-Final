"use client"

/**
 * A VISTA SIMPLES DA CADEIA — «quem copia o quê», de relance.
 *
 * Uma coluna por estratégia, as contas mestre em cima como ESTRATÉGIAS (é o que elas são: a mestre
 * é a conta que a estratégia usa para negociar, não uma conta a mais na lista), a fonte do sinal
 * por cima delas e os subscritores por baixo.
 *
 * O que esta vista NUNCA faz: dizer «live» porque `copia_rotas.modo` diz «live». Esse campo está
 * `shadow` em TODAS as linhas da base e não é o modo de execução — ver o cabeçalho de
 * `lib/copia-contas/cadeia.ts`. O que se pinta aqui é o `efectivo` que vem do servidor, calculado
 * com a mesma regra que o motor corre (`lib/mestres/decisao.ts`).
 */

import type { Cadeia, NoEstrategia, SubscritorCadeia } from "@/lib/copia-contas/cadeia"
import { Aviso, Azulejo, Painel, Pilula, Vazio } from "../centro/ui"
import { MarcaProveniencia, PctLinhaDeAgua } from "../centro/linha-de-agua"
import { fmtNum } from "../centro/ui"

const NOME_EFECTIVO = { live: "live", sombra: "sombra", parado: "parado" } as const
const NOME_EXECUTOR: Record<NoEstrategia["executor"], string> = {
  motor: "motor nosso",
  copyfactory: "CopyFactory",
  legado: "caminho antigo",
  parado: "não executa",
}

export function LinhaSubscritor({ s, compacto }: { s: SubscritorCadeia; compacto?: boolean }) {
  const nome = s.etiqueta ?? s.descricao ?? s.ref
  return (
    <div className="flex items-start gap-2 border-b border-white/[0.04] px-2 py-1.5 last:border-b-0" title={`${s.motivo}${s.pausadaMotivo ? ` · pausada: ${s.pausadaMotivo}` : ""}`}>
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.efectivo === "live" ? "#f87171" : s.efectivo === "sombra" ? "#60a5fa" : "#52525b" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-zinc-200">{nome}</p>
        {!compacto && <p className="truncate text-[10.5px] text-zinc-500">{s.email ?? s.descricao ?? s.ref}</p>}
        <p className="truncate text-[10px] text-zinc-500">
          {s.lote}
          {s.tipo === "t2t" && " · T2T"}
          {s.abertas > 0 && ` · ${s.abertas} aberta${s.abertas === 1 ? "" : "s"}`}
          {s.pausadaMotivo && ` · pausada (${s.pausadaMotivo})`}
        </p>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">{NOME_EFECTIVO[s.efectivo]}</span>
    </div>
  )
}

/** Exportada para a página da estratégia no Centro: a MESMA coluna do quadro, filtrada a uma estratégia. */
export function Coluna({ n }: { n: NoEstrategia }) {
  return (
    <div className="flex min-w-[260px] flex-1 flex-col rounded-xl border border-white/[0.07] bg-zinc-900/40">
      {/* 1. A FONTE — onde nasce o sinal. */}
      <p className="truncate border-b border-white/[0.05] px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-zinc-500" title="De onde entra o sinal desta estratégia">
        {n.fonte}
      </p>

      {/* 2. A ESTRATÉGIA e a conta MESTRE dela — o topo da árvore. */}
      <div className="border-b border-white/[0.07] px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#D2A63C]">{n.nome}</p>
          {!n.ativo && <Pilula tom="neutro">inactivo</Pilula>}
        </div>
        <p className="truncate text-[10.5px] text-zinc-500" title={n.executorNota}>
          quem executa: {NOME_EXECUTOR[n.executor]}
        </p>
        {/* A MESTRE, com o saldo e a linha de água: é a conta de onde sai a ordem, e sem a distância
            à linha de partida o número dela não diz se a estratégia está a ganhar. */}
        <div className="mt-1">
          <p className="truncate font-mono text-[11px] text-zinc-400" title="A conta mestre desta estratégia — é a conta de onde o motor envia">
            mestre {n.contaMestre ? `${n.contaMestre.etiqueta ?? n.contaMestre.login ?? n.contaMestre.id.slice(0, 8)}` : "— em falta"}
          </p>
          {n.contaMestre && (
            <p className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-zinc-300">{n.contaMestre.saldo == null ? "—" : fmtNum(n.contaMestre.saldo, 2)}</span>
              <MarcaProveniencia p={n.contaMestre.linhaDeAgua.proveniencia} />
              <PctLinhaDeAgua l={n.contaMestre.linhaDeAgua} />
              {n.contaMestre.saldoInicial != null && <span className="text-[10px] text-zinc-600">de {fmtNum(n.contaMestre.saldoInicial, 0)}</span>}
            </p>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Pilula tom={n.modoPedido === "live" ? "grave" : n.modoPedido === "sombra" ? "info" : "neutro"}>cópia {n.modoPedido}</Pilula>
          <Pilula tom={n.t2tModo === "live" ? "grave" : n.t2tModo === "sombra" ? "info" : "neutro"}>T2T {n.t2tModo}</Pilula>
          {/* As travas de RAIZ também aparecem na LISTA, não só no quadro: quem só abre esta vista
              tem de ver que a mestre emite sem nenhuma protecção, sem ter de trocar de separador. */}
          <Pilula tom={n.comTravas ? "ok" : "aviso"} title={n.comTravas ? "A mestre tem travas de raiz (janela, fim de semana, drawdown do dia, margem)." : "Nada impede esta mestre de emitir fora de horas, em cima de uma notícia ou já a perder o dia. Editar no separador Quadro → regras…"}>
            {n.comTravas ? "com travas" : "sem travas"}
          </Pilula>
        </div>
        {/* «BE a 1,25× · trailing arranca a 2× e segue a 1,25×» — as automações de saída em texto. */}
        <p className="mt-1 truncate font-mono text-[10px] text-zinc-500" title={n.gestaoTexto}>{n.gestaoTexto}</p>
      </div>

      {/* 3. OS SUBSCRITORES — quem copia. */}
      <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-1">
        <p className="flex-1 text-[10.5px] text-zinc-500">
          {n.contagem.total} subscritor{n.contagem.total === 1 ? "" : "es"}
        </p>
        {n.contagem.live > 0 && <Pilula tom="grave">{n.contagem.live} live</Pilula>}
        {n.contagem.sombra > 0 && <Pilula tom="info">{n.contagem.sombra} sombra</Pilula>}
        {n.contagem.parado > 0 && <Pilula tom="neutro">{n.contagem.parado} parado</Pilula>}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {n.subscritores.length === 0
          ? <p className="px-3 py-3 text-[11.5px] text-zinc-600">Ninguém copia esta estratégia.</p>
          : n.subscritores.map((s) => <LinhaSubscritor key={s.rotaId} s={s} />)}
      </div>
    </div>
  )
}

export default function VistaSimples({ c }: { c: Cadeia & { pendente?: boolean } }) {
  const total = c.estrategias.reduce((a, e) => a + e.contagem.total, 0)
  const live = c.estrategias.reduce((a, e) => a + e.contagem.live, 0)
  const contas = new Set(c.estrategias.flatMap((e) => e.subscritores.map((s) => s.chave))).size

  return (
    <div className="space-y-3">
      {c.pendente && <Aviso>Migração 116 por aplicar — sem `mestres_estrategias` não há cadeia para mostrar.</Aviso>}
      {c.avisos.map((a, i) => <Aviso key={i} tom="grave">{a}</Aviso>)}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Azulejo rotulo="Estratégias" valor={c.estrategias.length} sub="cada uma com a sua mestre" />
        <Azulejo rotulo="Laços de cópia" valor={total} sub="rotas activas + pausadas" />
        <Azulejo rotulo="Contas a copiar" valor={contas} sub="contas físicas distintas" />
        <Azulejo rotulo="A executar em live" valor={live} tom={live ? "grave" : "ok"} sub="pela regra do motor" />
        <Azulejo rotulo="Motor" valor={c.motor.kill ? "KILL" : c.motor.ligado ? "ligado" : "desligado"} tom={c.motor.kill ? "grave" : c.motor.ligado ? "info" : "neutro"} sub={c.motor.escritaNoProcesso ? "VPS a escrever" : "VPS em sombra"} />
        <Azulejo rotulo="Cópia conta→conta" valor={c.contaAConta.length} sub="fora das estratégias" />
      </div>

      <div className="flex flex-wrap gap-2">
        {c.estrategias.length === 0 ? <Vazio>Sem estratégias.</Vazio> : c.estrategias.map((n) => <Coluna key={n.chave} n={n} />)}
      </div>

      {(c.contaAConta.length > 0 || c.orfas.length > 0) && (
        <Painel titulo="Fora das estratégias" sub="Cópia conta→conta do mesmo dono (078) e rotas cujo slug já não bate com nenhuma estratégia.">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-white/[0.06]">
              <p className="border-b border-white/[0.05] px-2 py-1 text-[10.5px] uppercase tracking-wider text-zinc-500">conta → conta ({c.contaAConta.length})</p>
              {c.contaAConta.length === 0 ? <p className="px-2 py-2 text-[11.5px] text-zinc-600">Nenhuma.</p> : c.contaAConta.map((s) => <LinhaSubscritor key={s.rotaId} s={s} compacto />)}
            </div>
            <div className="rounded-lg border border-rose-500/20">
              <p className="border-b border-white/[0.05] px-2 py-1 text-[10.5px] uppercase tracking-wider text-rose-300">órfãs ({c.orfas.length})</p>
              {c.orfas.length === 0 ? <p className="px-2 py-2 text-[11.5px] text-zinc-600">Nenhuma.</p> : c.orfas.map((s) => <LinhaSubscritor key={s.rotaId} s={s} compacto />)}
            </div>
          </div>
        </Painel>
      )}

      <p className="text-[10.5px] leading-relaxed text-zinc-600">
        O «live / sombra / parado» de cada linha é o que o MOTOR decide agora (site_settings.mestres_motor +
        mestres_estrategias + mestres_contas + MESTRES_ESCRITA no VPS), não a coluna <code>copia_rotas.modo</code> —
        essa está <code>shadow</code> em todas as linhas e pertence às fechaduras da cópia conta-a-conta.
      </p>
    </div>
  )
}
