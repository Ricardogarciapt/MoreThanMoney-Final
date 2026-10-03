/**
 * AS CONVERSAS — a parte que fala com a base de dados.
 *
 * As decisões (janela, ordem do dia, transições) são puras e vivem em `crm.ts`. Isto só lê e
 * escreve, e faz duas coisas que ninguém deve ter de lembrar-se de fazer à mão:
 *
 *  · quando ELA escreve, a conversa nasce ou acorda e o contador de «por responder» sobe;
 *  · quando NÓS escrevemos, esse contador zera.
 *
 * ═══ PORQUE É QUE O CONTADOR IMPORTA ═══════════════════════════════════════════════════════
 *
 * É o número que ordena o dia de quem trabalha leads (ver `prioridade` em `crm.ts`). Um contador
 * que não zera põe conversas já respondidas no topo para sempre, e uma lista assim deixa de se
 * usar ao fim de dois dias — o que é pior do que não haver lista.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { EstadoConversa } from './crm'

const db = () => getSupabaseAdmin()

export interface LinhaConversa {
  id: string
  telefone: string
  nome: string | null
  negocio_id: string | null
  user_id: string | null
  estado: EstadoConversa
  responsavel: string | null
  ultima_entrada: string | null
  ultima_saida: string | null
  por_responder: number
  notas: string | null
  etiquetas: string[]
}

/**
 * ELA ESCREVEU.
 *
 * `upsert` por telefone e não «procura, e se não houver insere»: duas mensagens no mesmo segundo —
 * que é o normal quando alguém manda três linhas seguidas — criavam duas conversas com o mesmo
 * número, e a partir daí o histórico fica partido em dois sítios.
 *
 * O `estado` só se toca quando a conversa NASCE. Uma pessoa que já estava marcada como «ganho» e
 * escreve outra vez não volta a «novo» — continua ganha, com uma mensagem por responder.
 */
export async function registarEntradaNaConversa(p: {
  telefone: string
  nome?: string | null
  quando?: string
}): Promise<void> {
  const agora = p.quando ?? new Date().toISOString()
  try {
    const { data: ja } = await db()
      .from('whatsapp_conversas')
      .select('id, por_responder, nome')
      .eq('telefone', p.telefone)
      .maybeSingle()

    if (ja?.id) {
      await db().from('whatsapp_conversas').update({
        ultima_entrada: agora,
        por_responder: Number(ja.por_responder ?? 0) + 1,
        // O nome do perfil do WhatsApp só se escreve se ainda não houver nenhum: um nome posto à
        // mão por quem trabalha o lead vale mais do que o que a pessoa tem no telemóvel.
        ...(ja.nome ? {} : { nome: p.nome ?? null }),
        updated_at: agora,
      }).eq('id', ja.id)
      return
    }

    await db().from('whatsapp_conversas').insert({
      telefone: p.telefone,
      nome: p.nome ?? null,
      estado: 'novo',
      ultima_entrada: agora,
      por_responder: 1,
    })
  } catch (e) {
    // Nunca rebenta: a mensagem já está no livro, e uma conversa por criar resolve-se sozinha na
    // próxima entrada. Fazer o webhook falhar faria a Meta repetir a entrega em ciclo.
    console.error('[whatsapp/conversas] entrada não registada:', e instanceof Error ? e.message : e)
  }
}

/** NÓS ESCREVEMOS — a bola passa para o lado dela. */
export async function registarSaidaNaConversa(telefone: string, quando?: string): Promise<void> {
  const agora = quando ?? new Date().toISOString()
  try {
    const { data: ja } = await db().from('whatsapp_conversas').select('id, estado').eq('telefone', telefone).maybeSingle()
    if (!ja?.id) {
      await db().from('whatsapp_conversas').insert({
        telefone, estado: 'a_aguardar', ultima_saida: agora, por_responder: 0,
      })
      return
    }
    await db().from('whatsapp_conversas').update({
      ultima_saida: agora,
      por_responder: 0,
      // Responder a um «novo» põe-no em conversa. Os outros estados são decisão de quem trabalha o
      // lead e não se mexem por uma mensagem ter saído.
      ...(ja.estado === 'novo' ? { estado: 'a_falar' } : {}),
      updated_at: agora,
    }).eq('id', ja.id)
  } catch (e) {
    console.error('[whatsapp/conversas] saída não registada:', e instanceof Error ? e.message : e)
  }
}

/**
 * LIGAR A CONVERSA A QUEM JÁ CONHECEMOS.
 *
 * Procura um perfil e um negócio pelo telefone. Corre uma vez, quando a conversa nasce — e o que
 * encontra fica escrito, para a lista não ter de ir procurar a cada leitura.
 *
 * Compara pelos ÚLTIMOS 9 DÍGITOS: os números nesta casa estão escritos de seis maneiras
 * diferentes (`+351 912…`, `912…`, `00351912…`), e procurar pelo E.164 exacto era dizer «não
 * conheço esta pessoa» a metade dos clientes.
 */
export async function ligarConversaAoQueExiste(telefone: string): Promise<void> {
  try {
    const ultimos9 = telefone.replace(/\D/g, '').slice(-9)
    if (ultimos9.length < 9) return
    const like = `%${ultimos9}`

    const [{ data: perfil }, { data: negocio }] = await Promise.all([
      db().from('profiles').select('id, full_name').or(`phone.ilike.${like},whatsapp.ilike.${like}`).limit(1).maybeSingle(),
      db().from('vendas_negocios').select('id, nome').ilike('telefone', like).limit(1).maybeSingle(),
    ])
    if (!perfil?.id && !negocio?.id) return

    const { data: c } = await db().from('whatsapp_conversas').select('id, nome').eq('telefone', telefone).maybeSingle()
    if (!c?.id) return

    await db().from('whatsapp_conversas').update({
      ...(perfil?.id ? { user_id: perfil.id } : {}),
      ...(negocio?.id ? { negocio_id: negocio.id } : {}),
      ...(c.nome ? {} : { nome: perfil?.full_name ?? negocio?.nome ?? null }),
      updated_at: new Date().toISOString(),
    }).eq('id', c.id)
  } catch (e) {
    console.error('[whatsapp/conversas] não deu para ligar ao que existe:', e instanceof Error ? e.message : e)
  }
}

/** As conversas todas, para o painel ordenar. */
export async function lerConversas(limite = 200): Promise<LinhaConversa[]> {
  const { data } = await db()
    .from('whatsapp_conversas')
    .select('id, telefone, nome, negocio_id, user_id, estado, responsavel, ultima_entrada, ultima_saida, por_responder, notas, etiquetas')
    .order('ultima_entrada', { ascending: false, nullsFirst: false })
    .limit(limite)
  return (data ?? []) as unknown as LinhaConversa[]
}

/** O histórico de uma pessoa — o que se lê antes de responder. */
export async function lerHistorico(telefone: string, limite = 50) {
  const { data } = await db()
    .from('whatsapp_mensagens')
    .select('direcao, texto, template, estado, motivo, criado_em')
    .eq('telefone', telefone)
    .order('criado_em', { ascending: false })
    .limit(limite)
  return (data ?? []).reverse()
}
