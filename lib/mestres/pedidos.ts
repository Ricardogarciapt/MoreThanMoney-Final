/**
 * OS PEDIDOS DO ADMIN AO MOTOR DAS MESTRES — quem executa cada estratégia, o que impede o live, e
 * a leitura e validação de cada mudança que o admin pede (modo por estratégia, modo por conta,
 * kill-switch, alertas vistos).
 *
 * Estava tudo dentro do `painel.ts`, que também monta o painel inteiro a partir de dez tabelas.
 * Saiu para aqui porque o admin da MTM Auto passou a mexer nos MESMOS modos, e a regra tem de ser
 * uma só: este ficheiro é puro (sem base, sem MetaApi) e existe IGUAL nos dois repositórios.
 * O `painel.ts` reexporta tudo, para quem já o importava não ter de mudar.
 *
 * As guardas de LIVE aqui repetem as do trigger da base (migração 116, `mestres_*_guarda`) só para
 * explicar ANTES de pedir; quem manda é sempre a base — o servidor devolve o erro dela.
 */
import type { ConfigGlobalMestres, EstrategiaMestre, ModoEstrategia } from './tipos'

export type Executor = 'motor' | 'copyfactory' | 'legado'
export type CampoModo = 'modo' | 'sinal_modo' | 't2t_modo'

export const NOME_CAMPO: Record<CampoModo, string> = {
  modo: 'Propagação (mestre → clientes)',
  sinal_modo: 'Sinal → mestre SIM',
  t2t_modo: 'Tap to Trade pelo motor',
}

export function executorDe(e: Pick<EstrategiaMestre, 'modo' | 'copyfactoryIds' | 'copyfactoryCortadoEm'>): { executor: Executor; nota: string } {
  if (e.modo === 'live') return { executor: 'motor', nota: 'o nosso motor envia da mestre SIM para as contas dos clientes (sem CopyFactory)' }
  const sombra = e.modo === 'sombra' ? ' · motor em sombra a registar o que faria' : ''
  if (e.copyfactoryIds.length && !e.copyfactoryCortadoEm) return { executor: 'copyfactory', nota: `CopyFactory ${e.copyfactoryIds.join(', ')}${sombra}` }
  return { executor: 'legado', nota: `caminho antigo (MTM Auto / execução directa / T2T)${sombra}` }
}

/** Espelho da guarda da base (116): porque é que pôr este campo em live seria recusado. */
export function motivoBloqueioLive(
  e: Pick<EstrategiaMestre, 'copyfactoryIds' | 'copyfactoryCortadoEm' | 'incluirMtmauto' | 'mtmautoCortadoEm'>,
  campo: CampoModo,
  global: ConfigGlobalMestres,
): string | null {
  if (!global.liveDesbloqueado) return 'live não desbloqueado na instalação (site_settings.mestres_motor.live_desbloqueado)'
  if (campo === 'modo' && e.copyfactoryIds.length && !e.copyfactoryCortadoEm) {
    return `CopyFactory por cortar (${e.copyfactoryIds.join(', ')}) — correr scripts/mestres/cortar-copyfactory.ts antes, senão ordens em dobro`
  }
  if (campo === 'modo' && e.incluirMtmauto && !e.mtmautoCortadoEm) return 'inclui contas MTM Auto mas o mtm-auto ainda executa esta estratégia (mtmauto_cortado_em vazio)'
  return null
}

export type PedidoMestres =
  | { tipo: 'estrategia'; slug: string; campo: CampoModo; valor: ModoEstrategia; confirmacao?: string }
  | { tipo: 'conta'; contaChave: string; valor: 'sombra' | 'live'; confirmacao?: string }
  | { tipo: 'kill'; valor: boolean; confirmacao?: string }
  | { tipo: 'alertas_vistos'; ids: (string | number)[] }

/** A palavra que o admin tem de escrever para cada mudança (o servidor recusa sem ela). */
export function palavraDeConfirmacao(p: PedidoMestres): string | null {
  switch (p.tipo) {
    case 'estrategia': return p.valor === 'live' ? `LIVE ${p.slug}` : 'CONFIRMAR'
    case 'conta': return p.valor === 'live' ? 'LIVE' : 'CONFIRMAR'
    case 'kill': return p.valor ? 'KILL' : 'RETOMAR'
    case 'alertas_vistos': return null
  }
}

const MODOS: ModoEstrategia[] = ['desligado', 'sombra', 'live']
const CAMPOS: CampoModo[] = ['modo', 'sinal_modo', 't2t_modo']

/** Lê o corpo de um pedido (vem do browser: nunca confiar na forma). */
export function lerPedido(corpo: unknown): PedidoMestres | { erro: string } {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const confirmacao = typeof c.confirmacao === 'string' ? c.confirmacao.trim() : undefined
  switch (c.tipo) {
    case 'estrategia': {
      const slug = String(c.slug ?? '').trim()
      if (!slug || slug.length > 60) return { erro: 'slug obrigatório' }
      if (!CAMPOS.includes(c.campo as CampoModo)) return { erro: `campo inválido (${CAMPOS.join(' | ')})` }
      if (!MODOS.includes(c.valor as ModoEstrategia)) return { erro: `valor inválido (${MODOS.join(' | ')})` }
      return { tipo: 'estrategia', slug, campo: c.campo as CampoModo, valor: c.valor as ModoEstrategia, confirmacao }
    }
    case 'conta': {
      const contaChave = String(c.contaChave ?? '').trim()
      if (!/^(mt|tl):/.test(contaChave) || contaChave.length > 200) return { erro: 'contaChave inválida' }
      if (c.valor !== 'sombra' && c.valor !== 'live') return { erro: 'valor inválido (sombra | live)' }
      return { tipo: 'conta', contaChave, valor: c.valor, confirmacao }
    }
    case 'kill':
      if (typeof c.valor !== 'boolean') return { erro: 'valor (boolean) obrigatório' }
      return { tipo: 'kill', valor: c.valor, confirmacao }
    case 'alertas_vistos': {
      const ids = Array.isArray(c.ids) ? c.ids.filter((i) => /^\d{1,18}$/.test(String(i))).slice(0, 200) as (string | number)[] : []
      if (!ids.length) return { erro: 'ids obrigatórios' }
      return { tipo: 'alertas_vistos', ids }
    }
    default:
      return { erro: 'tipo inválido (estrategia | conta | kill | alertas_vistos)' }
  }
}

/**
 * A mudança pode seguir para a base? Confirma a palavra e repete as guardas da 116 para dar ao admin
 * uma mensagem clara (a base volta a verificar tudo no trigger — este passo nunca a substitui).
 */
export function validarPedido(
  p: PedidoMestres,
  ctx: { global: ConfigGlobalMestres; estrategia?: EstrategiaMestre | null; contaExiste?: boolean },
): { ok: true } | { ok: false; status: number; erro: string } {
  const palavra = palavraDeConfirmacao(p)
  if (palavra && (!('confirmacao' in p) || p.confirmacao !== palavra)) return { ok: false, status: 400, erro: `Escreve «${palavra}» para confirmar.` }
  if (p.tipo === 'estrategia') {
    if (!ctx.estrategia) return { ok: false, status: 404, erro: `estratégia ${p.slug} não está no motor das mestres (mestres_estrategias)` }
    if (p.valor === 'live') {
      const m = motivoBloqueioLive(ctx.estrategia, p.campo, ctx.global)
      if (m) return { ok: false, status: 409, erro: m }
    }
  }
  if (p.tipo === 'conta') {
    if (!ctx.contaExiste) return { ok: false, status: 404, erro: 'conta sem rota no motor das mestres' }
    if (p.valor === 'live' && !ctx.global.liveDesbloqueado) return { ok: false, status: 409, erro: 'live não desbloqueado na instalação (site_settings.mestres_motor.live_desbloqueado)' }
  }
  return { ok: true }
}

/** O novo valor de site_settings.mestres_motor para o kill-switch (nunca mexe em ligado/live_desbloqueado). */
export function valorKill(atual: ConfigGlobalMestres, kill: boolean): { ligado: boolean; kill: boolean; live_desbloqueado: boolean } {
  return { ligado: atual.ligado, kill, live_desbloqueado: atual.liveDesbloqueado }
}
