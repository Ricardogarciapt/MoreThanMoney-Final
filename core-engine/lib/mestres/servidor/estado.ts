/**
 * ESTADO DO MOTOR DAS MESTRES em memória (serviço do VPS) — relido da base:
 *  · site_settings.mestres_motor (ligado / kill / live_desbloqueado) de 2 em 2 s → o kill-switch
 *    chega ao processo em ≤ 2 s e é verificado outra vez imediatamente antes de cada escrita;
 *  · mestres_estrategias e mestres_contas de 10 em 10 s (tabelas pequenas, uma leitura cada).
 *
 * Leitura falhada = mantém o último estado BOM, excepto o kill: se a leitura do interruptor falhar
 * três vezes seguidas, o processo trata-se como em kill (não escreve às cegas).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decidirModo } from '../decisao'
import {
  CONFIG_GLOBAL_FECHADA, contaPorOmissao, lerConfigGlobal, lerContaMestres, lerEstrategiaMestre,
  type ConfigGlobalMestres, type ContaMestres, type EstrategiaMestre, type ModoDecidido,
} from '../tipos'
import type { RotaCopia } from '../../copia-contas/tipos'

export type RotaMestres = RotaCopia & { mestres?: boolean; tipo_rota?: string | null; estrategia_slug?: string | null; pausada_motivo?: string | null }

export class EstadoMestres {
  global: ConfigGlobalMestres = { ...CONFIG_GLOBAL_FECHADA }
  estrategias = new Map<string, EstrategiaMestre>()
  contas = new Map<string, ContaMestres>()
  private falhasGlobal = 0
  private lidoTabelasEm = 0
  /** a migração 116 ainda não foi aplicada (tabelas em falta) */
  semTabelas = false

  constructor(private db: SupabaseClient, private escritaNoProcesso: boolean, private log: (...a: unknown[]) => void = () => undefined) {}

  async recarregar(forcarTabelas = false): Promise<void> {
    const { data, error } = await this.db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()
    if (error) {
      this.falhasGlobal++
      if (this.falhasGlobal >= 3 && !this.global.kill) {
        this.global = { ...this.global, kill: true }
        this.log('[mestres] interruptor ilegível 3× — a tratar como KILL até voltar a ler')
      }
    } else {
      this.falhasGlobal = 0
      const antes = this.global
      this.global = data ? lerConfigGlobal(data.value) : { ...CONFIG_GLOBAL_FECHADA }
      if (antes.kill !== this.global.kill) this.log(`[mestres] kill-switch ${this.global.kill ? 'ACCIONADO' : 'levantado'}`)
      if (antes.ligado !== this.global.ligado) this.log(`[mestres] motor ${this.global.ligado ? 'ligado' : 'desligado'}`)
    }
    if (!forcarTabelas && Date.now() - this.lidoTabelasEm < 10_000) return
    const [e, c] = await Promise.all([
      this.db.from('mestres_estrategias').select('*'),
      this.db.from('mestres_contas').select('*'),
    ])
    if (e.error?.code === '42P01' || c.error?.code === '42P01') { this.semTabelas = true; return }
    this.semTabelas = false
    if (!e.error) this.estrategias = new Map((e.data ?? []).map((r) => { const x = lerEstrategiaMestre(r); return [x.slug.toLowerCase(), x] }))
    if (!c.error) this.contas = new Map((c.data ?? []).map((r) => { const x = lerContaMestres(r); return [x.contaChave, x] }))
    this.lidoTabelasEm = Date.now()
  }

  estrategiaDaRota(r: RotaMestres): EstrategiaMestre | null {
    return r.estrategia_slug ? this.estrategias.get(String(r.estrategia_slug).toLowerCase()) ?? null : null
  }

  contaDaRota(r: RotaMestres): ContaMestres {
    return this.contas.get(r.destino_chave) ?? contaPorOmissao(r.destino_chave, r.destino_ref)
  }

  modo(r: RotaMestres): { modo: ModoDecidido; motivo: string } {
    return decidirModo({
      global: this.global, escritaNoProcesso: this.escritaNoProcesso,
      estrategia: this.estrategiaDaRota(r), conta: this.contas.get(r.destino_chave) ?? null,
      rota: { ativa: r.ativa, estado: r.estado, tipo_rota: r.tipo_rota ?? 'estrategia', destino_ref: r.destino_ref },
    })
  }

  /** Kill-switch / motor desligado / escrita desligada no processo → nenhuma escrita na corretora. */
  podeEscrever(): boolean {
    return this.escritaNoProcesso && this.global.ligado && !this.global.kill
  }

  resumo() {
    return {
      ligado: this.global.ligado, kill: this.global.kill, live_desbloqueado: this.global.liveDesbloqueado, escrita: this.escritaNoProcesso,
      sem_tabelas: this.semTabelas,
      estrategias: [...this.estrategias.values()].map((e) => `${e.slug}:${e.modo}/${e.t2tModo}/${e.sinalModo}${e.copyfactoryIds.length && !e.copyfactoryCortadoEm ? ':cf-por-cortar' : ''}`),
      contas_live: [...this.contas.values()].filter((c) => c.modo === 'live').length,
      contas_bloqueadas: [...this.contas.values()].filter((c) => c.bloqueada).length,
    }
  }
}
