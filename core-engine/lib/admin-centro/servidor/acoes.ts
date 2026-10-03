import { acaoConta, type AcaoConta } from '@/lib/copia-contas/servidor/contas'
import { loja } from '@/lib/mtmcopy/metaapi-loja'
import { esquecerCache } from '../cache'
import { CHAVE_FLAG_PADRAO, CONFIRMACOES } from '../regras'
import { API_NAO_EXISTE } from './infra'
import { registarAuditoria } from './outros'
import { db, ehUuid, ler } from './base'

/**
 * ACÇÕES do Centro — cada uma passa por um caminho que JÁ existe e está guardado, pede palavra de
 * confirmação e fica auditada (admin_centro_auditoria, 095; sem a tabela, nos logs).
 *
 *   pausar_monitores   → travão de quota global «*» (080): os monitores de fundo saltam leituras;
 *                        ordens, fechos e modificações dos clientes NUNCA param (metaapi-quota.ts)
 *   retomar_monitores  → limpa o travão global (não mexe no registo de contas inexistentes)
 *   desligar_motor_copia → site_settings.copia_contas.ligado=false (parar é sempre permitido)
 *   conta              → lib/copia-contas/servidor/contas.acaoConta (sincronizar/pausar/retomar/
 *                        deploy/undeploy/remover, com as mesmas confirmações e releituras)
 *   trocar_fonte       → função atómica mtmauto_trocar_fonte_execucao (084), que exige o veredicto
 *                        do espelho (082) na própria base
 *   flag_padrao        → site_settings.admin_centro_padrao (redirecciona /admin/mtmcopy → /admin/centro)
 */

export type Resposta = { ok: boolean; status: number; mensagem: string; detalhe?: unknown }

const OPERACOES_CONTA: AcaoConta[] = ['sincronizar', 'pausar', 'retomar', 'deploy', 'undeploy', 'remover']

export async function executarAcao(adminId: string, corpo: Record<string, unknown>): Promise<Resposta> {
  const acao = String(corpo.acao ?? '')
  const confirmacao = String(corpo.confirmacao ?? '').trim()
  let r: Resposta
  let alvo: string | null = null
  try {
    switch (acao) {
      case 'pausar_monitores': {
        if (confirmacao !== CONFIRMACOES.pausar_monitores) { r = { ok: false, status: 400, mensagem: `Escreve «${CONFIRMACOES.pausar_monitores}» para confirmar.` }; break }
        const minutos = Math.min(60, Math.max(1, Math.round(Number(corpo.minutos ?? 10))))
        const ate = Date.now() + minutos * 60_000
        alvo = '*'
        await loja().bloquear(['*'], ate, 'admin-centro', `pausa manual pelo admin (${minutos} min) no Centro de Controlo`)
        r = { ok: true, status: 200, mensagem: `Monitores de fundo em pausa até ${new Date(ate).toLocaleTimeString('pt-PT')} (${minutos} min). As ordens dos clientes continuam. As outras instâncias vêem a pausa em ≤ 15 s.` }
        break
      }
      case 'retomar_monitores': {
        if (confirmacao !== CONFIRMACOES.retomar_monitores) { r = { ok: false, status: 400, mensagem: `Escreve «${CONFIRMACOES.retomar_monitores}» para confirmar.` }; break }
        alvo = '*'
        const x = await ler(db().from('metaapi_simbolos_cache').update({ metaapi_quota_bloqueio_ate: null, metaapi_quota_motivo: 'retomado pelo admin (Centro de Controlo)' }).eq('account_id', '*').or(`metaapi_quota_api.is.null,metaapi_quota_api.neq.${API_NAO_EXISTE}`))
        r = x.erro || x.semTabela
          ? { ok: false, status: 500, mensagem: x.semTabela ? 'Migração 080 por aplicar.' : String(x.erro) }
          : { ok: true, status: 200, mensagem: 'Travão global limpo. Instâncias com o bloqueio em memória retomam quando ele expirar (máx. o que faltava).' }
        break
      }
      case 'desligar_motor_copia': {
        if (confirmacao !== CONFIRMACOES.desligar_motor_copia) { r = { ok: false, status: 400, mensagem: `Escreve «${CONFIRMACOES.desligar_motor_copia}» para confirmar.` }; break }
        alvo = 'site_settings:copia_contas'
        const x = await ler(db().from('site_settings').update({ value: { ligado: false, por: adminId, em: new Date().toISOString() } }).eq('key', 'copia_contas'))
        r = x.erro ? { ok: false, status: 500, mensagem: x.erro } : { ok: true, status: 200, mensagem: 'Motor da cópia entre contas desligado.' }
        break
      }
      case 'conta': {
        const ref = String(corpo.ref ?? '')
        const operacao = String(corpo.operacao ?? '') as AcaoConta
        alvo = ref
        if (!OPERACOES_CONTA.includes(operacao)) { r = { ok: false, status: 400, mensagem: 'Operação inválida.' }; break }
        const x = await acaoConta(ref, operacao, { confirmacao })
        r = { ok: x.ok, status: x.ok ? 200 : x.status ?? 400, mensagem: x.mensagem, detalhe: x.detalhe }
        break
      }
      case 'trocar_fonte': {
        const providerId = String(corpo.providerId ?? '')
        const fonte = String(corpo.fonte ?? '')
        alvo = `provider:${providerId}`
        if (!ehUuid(providerId) || !['mestre', 'espelho'].includes(fonte)) { r = { ok: false, status: 400, mensagem: 'Pedido inválido.' }; break }
        if (confirmacao !== 'CONFIRMAR') { r = { ok: false, status: 400, mensagem: 'Escreve «CONFIRMAR» para trocar a fonte de execução.' }; break }
        const { data, error } = await db().rpc('mtmauto_trocar_fonte_execucao', { p_provider: providerId, p_fonte: fonte, p_por: adminId })
        r = error
          ? { ok: false, status: /does not exist|could not find/i.test(error.message) ? 424 : 409, mensagem: /does not exist|could not find/i.test(error.message) ? 'Migração 084 por aplicar.' : error.message.replace(/^.*fonte_execucao: /, '') }
          : { ok: true, status: 200, mensagem: `Fonte de execução: ${fonte}.`, detalhe: data }
        break
      }
      case 'flag_padrao': {
        if (confirmacao !== CONFIRMACOES.flag_padrao) { r = { ok: false, status: 400, mensagem: `Escreve «${CONFIRMACOES.flag_padrao}» para confirmar.` }; break }
        const ligado = corpo.ligado === true
        alvo = `site_settings:${CHAVE_FLAG_PADRAO}`
        const x = await ler(db().from('site_settings').upsert({ key: CHAVE_FLAG_PADRAO, value: ligado, description: 'true = /admin/mtmcopy redirecciona para /admin/centro (Centro de Controlo MTM Auto)', updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: 'key' }))
        r = x.erro ? { ok: false, status: 500, mensagem: x.erro } : { ok: true, status: 200, mensagem: ligado ? '/admin/mtmcopy passa a abrir o Centro de Controlo (≤ 30 s).' : '/admin/mtmcopy volta a abrir a página antiga.' }
        break
      }
      default:
        return { ok: false, status: 400, mensagem: 'Acção desconhecida.' }
    }
  } catch (e) {
    r = { ok: false, status: 500, mensagem: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
  }
  esquecerCache('centro:')
  const { confirmacao: _c, ...pedido } = corpo
  await registarAuditoria({ adminId, acao, alvo, pedido, resultado: { mensagem: r.mensagem, status: r.status }, ok: r.ok })
  return r
}
