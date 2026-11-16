/**
 * DESBLOQUEIO AUTOMÁTICO das contas de cópia (16/11/2026, ordem do Ricardo: «o agente pode
 * desbloqueá-las sozinho, claramente que sim»).
 *
 * O motor bloqueia uma conta ao fim de N falhas técnicas seguidas (`mestres_contas.bloqueada_em`) e
 * o bloqueio não expira. Desde o #162 «Position not found» e «Invalid stops» já não contam como
 * falha — mas enquanto a VPS correr um bundle antigo voltam a bloquear contas saudáveis (10-13/11:
 * cinco contas Premium II paradas dias por ajustes de trailing a posições que a corretora já tinha
 * fechado no SL/TP).
 *
 * Regra: uma conta bloqueada cuja causa é CONHECIDA e inofensiva (o que `eFalhaTecnica` já diz que
 * não é avaria) desbloqueia-se sozinha; o admin só recebe o aviso. Bloqueio por avaria real
 * (credenciais, conta desligada, sem margem…) fica como está, para uma pessoa olhar.
 */
import { eFalhaTecnica } from './decisao'

export interface ContaBloqueada {
  conta_chave: string
  conta_ref?: string | null
  bloqueio_motivo: string | null
  ultima_falha: string | null
}

/** O texto da causa, sem o prefixo «N falhas seguidas: » que o motor põe no motivo. */
export function causaDoBloqueio(c: Pick<ContaBloqueada, 'bloqueio_motivo' | 'ultima_falha'>): string {
  const motivo = String(c.bloqueio_motivo ?? '').replace(/^\s*\d+\s+falhas seguidas:\s*/i, '').trim()
  return motivo || String(c.ultima_falha ?? '').trim()
}

/** Desbloqueia sozinha só quando há causa escrita e nenhuma das causas é avaria técnica. */
export function podeDesbloquearSozinha(c: Pick<ContaBloqueada, 'bloqueio_motivo' | 'ultima_falha'>): boolean {
  const causa = causaDoBloqueio(c)
  if (!causa) return false
  if (eFalhaTecnica(causa)) return false
  if (c.ultima_falha && eFalhaTecnica(c.ultima_falha)) return false
  return true
}
