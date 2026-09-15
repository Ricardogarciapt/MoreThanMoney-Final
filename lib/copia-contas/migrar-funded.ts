/**
 * MIGRAR O COPIADOR MTM FUNDED (068) PARA ROTAS DE CÓPIA (078) — o mapeamento, sem base de dados.
 * O script (scripts/copia-contas/migrar-funded-copiers.ts) só lê, chama isto e grava.
 *
 * Decisões do dono (15/09):
 *   · estado = 'aprovada' se o copiador estava activo; senão 'pedido' (fica à espera de decisão);
 *   · ativa  = o `ativo` antigo; modo = 'shadow' SEMPRE (a fechadura global do live não muda);
 *   · o mesmo modo de lote, valor, lote máximo, máximo de posições, SL/TP e filtro de símbolos.
 *
 * O que NÃO tem equivalente na rota nova fica escrito nas notas (e o script avisa):
 *   · `perda_diaria_max` — o motor novo ainda não tem perda diária por rota;
 *   · `valor` nulo em proporcional_saldo → 1 (é o que o 068 assumia); em fixo/risco_pct → recusa
 *     (sem valor não há lote certo, e inventar um é dinheiro real).
 */
import { chaveFisica, validarRota, type ArestaRota, type LinhaContaCopia } from './regras'
import type { ModoLoteCopia } from './tipos'

export interface CopiadorAntigo {
  id: string
  user_id: string
  account_id: string
  destino_tipo: 'mtmcopy' | 'mtmauto' | 'tradelocker' | string
  destino_id: string
  modo_lote: string
  valor: number | null
  lote_max: number | null
  max_posicoes: number | null
  perda_diaria_max: number | null
  copiar_sl: boolean
  copiar_tp: boolean
  simbolos: string[] | null
  ativo: boolean
  pausado_motivo: string | null
  created_by: string | null
}

export interface LinhaRotaMigrada {
  user_id: string
  origem_tipo: 'mtmfunded'
  origem_ref: string
  origem_chave: string
  destino_tipo: LinhaContaCopia['plataforma']
  destino_ref: string
  destino_chave: string
  rotulo: string
  modo_lote: ModoLoteCopia
  valor: number
  lote_max: number | null
  max_abertas: number | null
  copiar_sl: boolean
  copiar_tp: boolean
  filtro_simbolos: string[]
  ativa: boolean
  modo: 'shadow'
  estado: 'aprovada' | 'pedido'
  pedido_pelo_cliente: false
  notas: string | null
  pausada_motivo: string | null
  created_by: string | null
  aprovada_em: string | null
  migrada_de: string
}

export type ResultadoMigracao =
  | { ok: true; linha: LinhaRotaMigrada; avisos: string[] }
  | { ok: false; motivo: string }

const MODOS: ModoLoteCopia[] = ['multiplicador', 'fixo', 'risco_pct', 'proporcional_saldo']

/** Referência da conta de destino na rota nova. */
export function refDoDestinoAntigo(c: Pick<CopiadorAntigo, 'destino_tipo' | 'destino_id'>): string | null {
  if (c.destino_tipo === 'mtmcopy') return `site:${c.destino_id}`
  if (c.destino_tipo === 'mtmauto') return `auto:${c.destino_id}`
  return null // tradelocker nunca foi suportado pelo 068 (o trigger de dono recusava)
}

export function rotaDoCopiador(
  c: CopiadorAntigo,
  /** a conta de destino lida (lerContaPorRef), ou null se já não existe */
  destino: LinhaContaCopia | null,
  existentes: ArestaRota[],
  agoraIso: string,
): ResultadoMigracao {
  const destinoRef = refDoDestinoAntigo(c)
  if (!destinoRef) return { ok: false, motivo: `destino ${c.destino_tipo} sem equivalente (o 068 nunca o executou)` }
  if (!destino) return { ok: false, motivo: `conta de destino ${destinoRef} já não existe` }
  if (!MODOS.includes(c.modo_lote as ModoLoteCopia)) return { ok: false, motivo: `modo de lote ${c.modo_lote} desconhecido` }
  const modo = c.modo_lote as ModoLoteCopia
  const avisos: string[] = []

  let valor = c.valor == null ? null : Number(c.valor)
  if (valor == null || !(valor > 0)) {
    if (modo === 'proporcional_saldo' || modo === 'multiplicador') {
      valor = 1
      avisos.push('valor vazio → 1')
    } else {
      return { ok: false, motivo: `modo ${modo} sem valor — não se inventa um lote` }
    }
  }
  if (modo === 'risco_pct' && valor > 10) return { ok: false, motivo: `risco ${valor}% acima do máximo de 10%` }
  if (valor > 100) return { ok: false, motivo: `valor ${valor} acima de 100` }

  const origem: LinhaContaCopia = { ref: `funded:${c.account_id}`, plataforma: 'mtmfunded', userId: c.user_id, fundedAccountId: c.account_id }
  const v = validarRota(origem, destino, existentes)
  if (!v.ok) return { ok: false, motivo: v.mensagem }

  const notas: string[] = [`Migrada do copiador MTM Funded (068) ${c.id}.`]
  if (c.perda_diaria_max != null) {
    notas.push(`Perda diária máx. ${c.perda_diaria_max}% NÃO é aplicada pelo motor novo.`)
    avisos.push(`perda_diaria_max=${c.perda_diaria_max}% sem equivalente`)
  }
  const loteMax = c.lote_max != null && Number(c.lote_max) > 0 ? Number(c.lote_max) : null
  const maxAbertas = c.max_posicoes != null && Number(c.max_posicoes) > 0 ? Math.round(Number(c.max_posicoes)) : null

  return {
    ok: true,
    avisos,
    linha: {
      user_id: c.user_id,
      origem_tipo: 'mtmfunded',
      origem_ref: origem.ref,
      origem_chave: chaveFisica(origem)!,
      destino_tipo: destino.plataforma,
      destino_ref: destinoRef,
      destino_chave: v.destinoChave,
      rotulo: 'Copiador MTM Funded (migrado)',
      modo_lote: modo,
      valor,
      lote_max: loteMax,
      max_abertas: maxAbertas,
      copiar_sl: c.copiar_sl !== false,
      copiar_tp: c.copiar_tp !== false,
      filtro_simbolos: [...new Set((c.simbolos ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))],
      ativa: c.ativo === true,
      modo: 'shadow',
      estado: c.ativo ? 'aprovada' : 'pedido',
      pedido_pelo_cliente: false,
      notas: notas.join(' '),
      pausada_motivo: c.ativo ? null : (c.pausado_motivo ?? 'inactivo no copiador 068'),
      created_by: c.created_by,
      aprovada_em: c.ativo ? agoraIso : null,
      migrada_de: c.id,
    },
  }
}

/**
 * Cópias REAIS abertas pelo 068 (funded_copy_positions 'aberta'/'enviando') não se migram: a rota
 * nova nasce em SOMBRA, e em sombra o motor marca a ponte como fechada sem tocar no destino — a
 * posição real ficava órfã. Um copiador com pontes abertas fica no 068 até elas fecharem.
 */
export function motivoPontesAbertas(abertas: number): string | null {
  return abertas > 0 ? `${abertas} cópia(s) reais abertas no destino — migrar só depois de fecharem` : null
}
