/**
 * AS ESCRITAS da equipa, dos papéis e das comissões — e nenhuma delas sem porta e sem registo.
 *
 * Estão separadas das leituras (`lib/telegram-admin-equipa.ts`) por uma razão que não é de
 * arrumação: assim, TODAS as funções que escrevem estão num ficheiro só, todas recebem uma `Porta`
 * como primeiro argumento e todas passam por `comRegisto`. Uma escrita nova que se esqueça de uma
 * dessas duas coisas fica visível a olho nu — e a guarda `telegram-admin-equipa.check.ts` lê este
 * ficheiro e recusa-se a passar se alguma exportação sair da regra.
 *
 * `Porta` é o tipo que só se obtém do outro lado de `abrirPorta`, e `abrirPorta` só abre para o
 * chat de `TELEGRAM_ADMIN_CHAT_ID` cujo perfil ainda é admin activo. Não há aqui nenhuma função
 * que aceite um `chatId` — quem não tem porta não consegue sequer chamar isto.
 *
 * E o que isto NÃO FAZ, hoje nem nunca: pagar. Aprovar uma comissão é autorizar; o dinheiro sai
 * por transferência, com as mãos do dono, e marca-se pago no /admin com a referência à frente.
 *
 *   npx tsx lib/telegram-admin-equipa.check.ts
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { comRegisto, escaparHtml as esc, type Porta } from '@/lib/telegram-admin-porta'
import { PAPEL_NOME, type Papel } from '@/lib/backoffice-papeis'
import { eur, nomeMostravel, type DecisaoComissao } from '@/lib/telegram-admin-equipa'

/** O nome e o email de uma pessoa, para a mensagem e para o registo. Nunca lê credenciais. */
async function pessoa(id: string): Promise<{ nome: string; email: string | null }> {
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, email, username, full_name')
    .eq('id', id)
    .maybeSingle()
  const p = data as Record<string, string | null> | null
  return { nome: nomeMostravel(p ? { ...p, id } : { id }), email: (p?.email as string | null) ?? null }
}

// ═══════════════════════════ COMISSÕES ═══════════════════════════

/**
 * Aprova ou cancela uma comissão. NÃO paga.
 *
 * A escrita é condicionada a `estado = 'pendente'`: se, entre o ecrã e o segundo toque, alguém no
 * /admin já tiver decidido, a linha não muda e a resposta diz que já estava decidida. Sem essa
 * condição, um botão antigo numa mensagem antiga ressuscitava uma decisão — e era assim que uma
 * comissão cancelada voltava a aprovada sem ninguém pedir.
 */
export async function decidirComissao(porta: Porta, comissaoId: string, decisao: DecisaoComissao): Promise<string> {
  const db = getSupabaseAdmin()
  const { data: antes } = await db
    .from('vendas_comissoes')
    .select('id, beneficiario_id, papel, valor_cents, moeda, estado')
    .eq('id', comissaoId)
    .maybeSingle()
  if (!antes) return '🤷 Não encontrei essa comissão.'

  const a = antes as { beneficiario_id: string; papel: string; valor_cents: number; moeda: string; estado: string }
  if (a.estado !== 'pendente') {
    return `ℹ️ Essa comissão já não está pendente — está <b>${esc(a.estado)}</b>. Não mexi em nada.`
  }
  const quem = await pessoa(String(a.beneficiario_id))

  const r = await comRegisto(
    porta,
    {
      acao: `comissao:${decisao}`,
      alvo: `comissao:${comissaoId}`,
      pedido: { decisao, beneficiario: quem.email ?? a.beneficiario_id, valor_cents: a.valor_cents, papel: a.papel },
      antes: { estado: a.estado },
    },
    async () => {
      const agora = new Date().toISOString()
      const patch =
        decisao === 'aprovada'
          ? { estado: 'aprovada', aprovada_em: agora, aprovada_por: porta.adminId }
          : { estado: 'cancelada' }
      const { data, error } = await db
        .from('vendas_comissoes')
        .update(patch)
        // A condição vive na ESCRITA, não numa leitura anterior: entre ler e escrever cabe uma
        // decisão de outra pessoa, e é essa a corrida que isto fecha.
        .eq('id', comissaoId)
        .eq('estado', 'pendente')
        .select('id, estado')
      if (error) return { ok: false, texto: `⚠️ Não consegui gravar: ${esc(error.message)}` }
      if (!data?.length) {
        return { ok: false, texto: 'ℹ️ Alguém decidiu esta comissão entretanto — não repeti nada.' }
      }
      // O histórico da comissão é a segunda metade do registo: a auditoria diz que o dono decidiu,
      // isto diz o que a linha viveu. Falhar aqui não desfaz a decisão, mas grita nos logs.
      const { error: hist } = await db.from('vendas_comissoes_historico').insert({
        comissao_id: comissaoId,
        de: a.estado,
        para: decisao,
        por: porta.adminId,
        nota: `decidido no Telegram por ${porta.adminEmail}`,
      })
      if (hist) console.error('[telegram-equipa] histórico da comissão não escreveu:', hist.message)
      return {
        ok: true,
        depois: { estado: decisao },
        texto:
          decisao === 'aprovada'
            ? `✅ <b>Comissão aprovada.</b>\n\n${esc(quem.nome)} — ${eur(a.valor_cents, a.moeda)} (${esc(a.papel)}).\n\n` +
              '<i>Aprovada não é paga: o pagamento fazes tu, e marca-se pago no /admin com a referência.</i>'
            : `🚫 <b>Comissão cancelada.</b>\n\n${esc(quem.nome)} — ${eur(a.valor_cents, a.moeda)} (${esc(a.papel)}).\n\n` +
              '<i>A linha fica na base, cancelada e visível — não se apagou nada.</i>',
      }
    },
  )
  return r.texto
}

// ═══════════════════════════ PAPÉIS ═══════════════════════════

/**
 * Dá ou retira um papel. Retirar NUNCA apaga a linha — marca `retirado_at`.
 *
 * O porquê é o mesmo da rota do /admin: quando alguém disser «eu era closer em Outubro», a resposta
 * tem de estar na base. E dar um papel que a pessoa já tem não reinicia a data de atribuição: a
 * antiguidade no papel é um facto, não um efeito secundário de um toque repetido.
 */
export async function mexerPapel(porta: Porta, userId: string, papel: Papel, dar: boolean): Promise<string> {
  const db = getSupabaseAdmin()
  const quem = await pessoa(userId)
  const { data: perfil } = await db.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!perfil) return '🤷 Não encontrei esse perfil — um papel só se dá a quem já tem conta.'

  const { data: activos } = await db
    .from('backoffice_papeis')
    .select('id')
    .eq('user_id', userId)
    .eq('papel', papel)
    .is('retirado_at', null)
    .limit(1)
  const jaTem = Boolean(activos?.length)
  if (dar && jaTem) return `ℹ️ ${esc(quem.nome)} já é <b>${PAPEL_NOME[papel]}</b>. Não mexi em nada.`
  if (!dar && !jaTem) return `ℹ️ ${esc(quem.nome)} não tem o papel de <b>${PAPEL_NOME[papel]}</b>. Não mexi em nada.`

  const r = await comRegisto(
    porta,
    {
      acao: `papel:${dar ? 'dar' : 'retirar'}`,
      alvo: `perfil:${userId}`,
      pedido: { papel, pessoa: quem.email ?? userId },
      antes: { tinha: jaTem },
    },
    async () => {
      if (dar) {
        const { error } = await db.from('backoffice_papeis').insert({
          user_id: userId,
          papel,
          atribuido_por: porta.adminId,
          nota: `dado no Telegram por ${porta.adminEmail}`,
        })
        if (error) return { ok: false, texto: `⚠️ Não consegui dar o papel: ${esc(error.message)}` }
        return {
          ok: true,
          depois: { tem: true },
          texto: `✅ <b>${esc(quem.nome)} é agora ${PAPEL_NOME[papel]}.</b>\n\n<i>Entra no backoffice com esse papel de imediato.</i>`,
        }
      }
      const { data, error } = await db
        .from('backoffice_papeis')
        .update({ retirado_at: new Date().toISOString(), retirado_por: porta.adminId })
        .eq('user_id', userId)
        .eq('papel', papel)
        .is('retirado_at', null)
        .select('id')
      if (error) return { ok: false, texto: `⚠️ Não consegui retirar o papel: ${esc(error.message)}` }
      if (!data?.length) return { ok: false, texto: 'ℹ️ Já não havia papel activo para retirar.' }
      return {
        ok: true,
        depois: { tem: false },
        texto:
          `🚫 <b>${esc(quem.nome)} deixou de ser ${PAPEL_NOME[papel]}.</b>\n\n` +
          '<i>Efeito imediato. A linha fica na base marcada como retirada — o histórico não se apaga.</i>',
      }
    },
  )
  return r.texto
}

// ═══════════════════════════ PLANO DE COMISSÃO ═══════════════════════════

/**
 * Põe uma pessoa num plano de comissão (`afiliado_legado_50` ou `padrao`).
 *
 * Reusa `definirPlanoDaPessoa` em vez de escrever o upsert aqui: o plano é o que decide quanto
 * alguém ganha, e duas escritas para a mesma coisa são duas oportunidades de divergirem.
 */
export async function mudarPlano(porta: Porta, userId: string, plano: string): Promise<string> {
  const db = getSupabaseAdmin()
  const quem = await pessoa(userId)
  const { data: linha } = await db.from('vendas_pessoa_plano').select('plano').eq('pessoa_id', userId).maybeSingle()
  const actual = String((linha as { plano?: string } | null)?.plano ?? 'padrao')
  if (actual === plano) return `ℹ️ ${esc(quem.nome)} já está no plano <code>${esc(plano)}</code>. Não mexi em nada.`

  const r = await comRegisto(
    porta,
    {
      acao: 'plano_comissao:definir',
      alvo: `perfil:${userId}`,
      pedido: { plano, pessoa: quem.email ?? userId },
      antes: { plano: actual },
    },
    async () => {
      const { definirPlanoDaPessoa } = await import('@/lib/vendas/regras')
      await definirPlanoDaPessoa(db, {
        pessoaId: userId,
        plano,
        definidoPor: porta.adminId,
        nota: `mudado no Telegram por ${porta.adminEmail}`,
      })
      return {
        ok: true,
        depois: { plano },
        texto:
          `✅ <b>${esc(quem.nome)} passou para <code>${esc(plano)}</code>.</b>\n\n` +
          `Antes: <code>${esc(actual)}</code>.\n\n` +
          '<i>Vale para as vendas NOVAS — não recalcula nada do que já foi calculado.</i>',
      }
    },
  )
  return r.texto
}
