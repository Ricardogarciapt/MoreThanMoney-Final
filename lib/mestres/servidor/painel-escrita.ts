/**
 * MUDANÇAS DO ADMIN NO MOTOR DAS MESTRES — modo por estratégia (propagação / sinal / T2T), modo por
 * conta, kill-switch e alertas vistos. Só é chamado por rotas embrulhadas em `soAdmin` (admin verificado
 * no servidor). Cada mudança:
 *   1. exige a palavra de confirmação (lib/mestres/painel.palavraDeConfirmacao);
 *   2. repete as guardas da 116 para explicar ANTES (validarPedido) — e a BASE volta a verificar tudo
 *      no trigger `mestres_*_guarda` (live sem `live_desbloqueado`, sem corte da CopyFactory ou com o
 *      MTM Auto ainda a executar → a base recusa e a mensagem dela chega ao admin tal e qual);
 *   3. relê a linha depois de escrever (a resposta de uma escrita não é prova);
 *   4. fica na auditoria do Centro (admin_centro_auditoria).
 *
 * O painel NÃO liga o motor (`ligado`) nem desbloqueia o live (`live_desbloqueado`): isso fica na
 * base, por decisão do dono. Parar (kill) é sempre permitido.
 */
import { esquecerCache } from '@/lib/admin-centro/cache'
import { db } from '@/lib/admin-centro/servidor/base'
import { registarAuditoria } from '@/lib/admin-centro/servidor/outros'
import { lerConfigGlobal, lerEstrategiaMestre } from '../tipos'
import { validarPedido, valorKill, type PedidoMestres } from '../painel'
import { CHAVE_CACHE_PAINEL } from './painel-leitura'

export interface RespostaMudanca { ok: boolean; status: number; mensagem: string; detalhe?: unknown }

export async function aplicarPedidoMestres(adminId: string, p: PedidoMestres): Promise<RespostaMudanca> {
  let r: RespostaMudanca
  let alvo: string | null = null
  try {
    const { data: cfgLinha, error: eCfg } = await db().from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()
    if (eCfg) return { ok: false, status: 500, mensagem: eCfg.message }
    if (!cfgLinha) return { ok: false, status: 409, mensagem: 'site_settings.mestres_motor em falta (a migração 116 está aplicada?)' }
    const global = lerConfigGlobal(cfgLinha.value)

    switch (p.tipo) {
      case 'estrategia': {
        alvo = `mestres_estrategias:${p.slug}:${p.campo}`
        const { data: linha } = await db().from('mestres_estrategias').select('*').eq('slug', p.slug).maybeSingle()
        const est = linha ? lerEstrategiaMestre(linha) : null
        const v = validarPedido(p, { global, estrategia: est })
        if (!v.ok) { r = { ok: false, status: v.status, mensagem: v.erro }; break }
        const antes = (linha as Record<string, unknown>)[p.campo]
        const { error } = await db().from('mestres_estrategias').update({ [p.campo]: p.valor, updated_by: adminId }).eq('slug', p.slug)
        if (error) { r = { ok: false, status: 409, mensagem: `A base recusou: ${error.message}` }; break }
        const { data: relida } = await db().from('mestres_estrategias').select(p.campo).eq('slug', p.slug).maybeSingle()
        const agora = (relida as Record<string, unknown> | null)?.[p.campo]
        r = agora === p.valor
          ? { ok: true, status: 200, mensagem: `${p.slug}: ${p.campo} ${String(antes)} → ${p.valor}. O serviço do VPS relê em ≤ 10 s.`, detalhe: { antes, agora } }
          : { ok: false, status: 500, mensagem: `Gravado mas a releitura dá «${String(agora)}» — confirmar na base.` }
        break
      }
      case 'conta': {
        alvo = `mestres_contas:${p.contaChave}`
        const [{ data: conta }, { data: rota }] = await Promise.all([
          db().from('mestres_contas').select('conta_chave, modo').eq('conta_chave', p.contaChave).maybeSingle(),
          db().from('copia_rotas').select('destino_ref, user_id').eq('mestres', true).eq('destino_chave', p.contaChave).neq('estado', 'recusada').limit(1).maybeSingle(),
        ])
        const v = validarPedido(p, { global, contaExiste: Boolean(conta || rota) })
        if (!v.ok) { r = { ok: false, status: v.status, mensagem: v.erro }; break }
        const escrita = conta
          ? await db().from('mestres_contas').update({ modo: p.valor }).eq('conta_chave', p.contaChave)
          : await db().from('mestres_contas').insert({ conta_chave: p.contaChave, conta_ref: String(rota!.destino_ref), user_id: rota!.user_id ?? null, modo: p.valor, notas: `criada pelo painel (admin ${adminId})` })
        if (escrita.error) { r = { ok: false, status: 409, mensagem: `A base recusou: ${escrita.error.message}` }; break }
        const { data: relida } = await db().from('mestres_contas').select('modo').eq('conta_chave', p.contaChave).maybeSingle()
        r = relida?.modo === p.valor
          ? { ok: true, status: 200, mensagem: `Conta ${p.contaChave}: ${conta?.modo ?? 'sombra (omissão)'} → ${p.valor}. Vale para TODAS as estratégias desta conta.` }
          : { ok: false, status: 500, mensagem: `Gravado mas a releitura dá «${String(relida?.modo)}» — confirmar na base.` }
        break
      }
      case 'kill': {
        alvo = 'site_settings:mestres_motor.kill'
        const v = validarPedido(p, { global })
        if (!v.ok) { r = { ok: false, status: v.status, mensagem: v.erro }; break }
        const t0 = Date.now()
        const { error } = await db().from('site_settings').update({ value: valorKill(global, p.valor) }).eq('key', 'mestres_motor')
        if (error) { r = { ok: false, status: 500, mensagem: error.message }; break }
        if (p.valor) await db().from('mestres_alertas').insert({ tipo: 'kill', mensagem: `kill-switch accionado no painel de admin (${adminId})` })
        const { data: relida } = await db().from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle()
        const k = lerConfigGlobal(relida?.value).kill
        r = k === p.valor
          ? { ok: true, status: 200, mensagem: p.valor ? `KILL gravado em ${Date.now() - t0} ms — o serviço pára em ≤ 2 s (nem saídas).` : 'Kill levantado. As aberturas atrasadas são recusadas; as saídas que ficaram na fila seguem.' }
          : { ok: false, status: 500, mensagem: 'Gravado mas a releitura não bate — confirmar na base.' }
        break
      }
      case 'alertas_vistos': {
        alvo = `mestres_alertas:${p.ids.length}`
        const { error } = await db().from('mestres_alertas').update({ visto_em: new Date().toISOString() }).in('id', p.ids.map(String)).is('visto_em', null)
        r = error ? { ok: false, status: 500, mensagem: error.message } : { ok: true, status: 200, mensagem: `${p.ids.length} alerta(s) marcados como vistos.` }
        break
      }
    }
  } catch (e) {
    r = { ok: false, status: 500, mensagem: e instanceof Error ? e.message : String(e) }
  }
  esquecerCache(CHAVE_CACHE_PAINEL)
  for (const k of ['centro:estrategias', 'centro:contas', 'centro:funded']) esquecerCache(k)
  await registarAuditoria({ adminId, acao: `mestres:${p.tipo}`, alvo, pedido: { ...p, confirmacao: undefined }, resultado: r!, ok: r!.ok })
  return r!
}
