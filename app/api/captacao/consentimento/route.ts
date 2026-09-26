import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  PONTOS_DE_CAPTURA,
  ehEmailDeMentira,
  emailUtilizavel,
  normalizarEmail,
} from '@/lib/captacao-consentimento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONDE O CONSENTIMENTO ENTRA — a única porta pela qual a lista de campanhas pode crescer.
 *
 * PORQUE É QUE ISTO TEVE DE SER CONSTRUÍDO
 * A 26/09 a base tem 187 emails distintos e ZERO registos de consentimento de marketing. Não é que
 * estivesse mal preenchido: não havia sítio nenhum para o preencher. `email_preferences` existe e
 * está vazia, e nenhum formulário, bot ou checkout escrevia lá.
 *
 * Sem esta porta, «engordar a lista» só se faz de duas maneiras: raspando endereços ou presumindo
 * que quem se registou aceitou tudo. As duas dão no mesmo sítio — queixas de spam e o domínio da
 * MTM a cair na caixa de lixo dos clientes que pagam.
 *
 * O QUE ESTA ROTA FAZ
 * Escreve UMA linha no livro (`captacao_consentimento`): quem, onde, com que texto à frente, e
 * quando. Nada mais. Não manda email de boas-vindas, não inscreve em sequência nenhuma, não dispara
 * funil. O material que a pessoa pediu é entregue por quem a serviu — esta rota só registra a
 * permissão, porque misturar as duas coisas é como se perde a prova quando o envio falha.
 *
 * DELETE retira o consentimento. Escreve `retirado_em` na linha que existe em vez de a apagar: o
 * livro é um livro, e a data em que alguém pediu para sair é a parte mais importante de guardar.
 */

/** O texto que a pessoa viu, por canal. Vem do código e não do pedido: senão qualquer um escreve o que quer. */
function provaDoCanal(canal: string): string | null {
  return PONTOS_DE_CAPTURA.find((p) => p.canal === canal)?.pedido ?? null
}

export async function POST(req: NextRequest) {
  let corpo: Record<string, unknown>
  try {
    corpo = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 })
  }

  const canal = String(corpo.canal ?? '').trim()
  const email = normalizarEmail(corpo.email as string)
  const telefone = String(corpo.telefone ?? '').trim()
  const telegramChatId = String(corpo.telegram_chat_id ?? '').trim()
  const instagramHandle = String(corpo.instagram_handle ?? '')
    .trim()
    .replace(/^@/, '')

  /**
   * O canal tem de ser um dos que existem no código.
   *
   * Aceitar um canal qualquer que venha no pedido transformava o livro numa lista de rótulos
   * inventados — e a pergunta «onde é que eu vos dei isto?» voltava a não ter resposta, que é o
   * problema que o livro existe para resolver.
   */
  const prova = provaDoCanal(canal)
  if (!prova) {
    return NextResponse.json(
      { error: 'canal desconhecido', canais: PONTOS_DE_CAPTURA.map((p) => p.canal) },
      { status: 400 },
    )
  }

  if (!email && !telefone && !telegramChatId && !instagramHandle) {
    return NextResponse.json({ error: 'sem forma de identificar a pessoa' }, { status: 400 })
  }
  if (email && (!emailUtilizavel(email) || ehEmailDeMentira(email))) {
    return NextResponse.json({ error: 'email não utilizável' }, { status: 400 })
  }

  /**
   * A CAIXA TEM DE TER SIDO MARCADA, E POR ELA.
   *
   * `aceitou` vem explícito e sem valor por omissão. Uma rota que registasse consentimento só por
   * ter sido chamada era uma rota que transformava qualquer submissão de formulário em permissão —
   * exactamente o atalho que faz uma lista parecer grande e não valer nada.
   */
  if (corpo.aceitou !== true) {
    return NextResponse.json({ error: 'sem aceitação explícita não se registra consentimento' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { error } = await db.from('captacao_consentimento').insert({
    email: email || null,
    telefone: telefone || null,
    telegram_chat_id: telegramChatId || null,
    instagram_handle: instagramHandle || null,
    canal,
    base_legal: 'consentimento',
    // A prova é o texto do código, não o que o cliente disse que mostrou.
    prova,
    origem_url: typeof corpo.origem_url === 'string' ? corpo.origem_url.slice(0, 500) : null,
    nota: typeof corpo.nota === 'string' ? corpo.nota.slice(0, 500) : null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Não se devolve nada sobre a pessoa. Uma rota pública que confirma «este email já estava na
  // lista» é uma rota que deixa qualquer um testar endereços contra a nossa base.
  return NextResponse.json({ ok: true })
}

/**
 * Retirar. Nunca falha por não haver nada: dizer a alguém «não estavas na lista» quando ele pediu
 * para sair é a pior resposta possível, e o resultado prático é o mesmo — não recebe.
 */
export async function DELETE(req: NextRequest) {
  const email = normalizarEmail(req.nextUrl.searchParams.get('email'))
  if (!email || !emailUtilizavel(email)) {
    return NextResponse.json({ error: 'email inválido' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()

  // Marca as linhas existentes. Se não houver nenhuma, escreve-se uma a registar a saída — a pessoa
  // pode ter entrado por um caminho que não deixou registo, e a vontade dela fica gravada de igual
  // maneira.
  const { data } = await db
    .from('captacao_consentimento')
    .update({ retirado_em: agora, retirado_por: 'pedido da pessoa' })
    .eq('email', email)
    .is('retirado_em', null)
    .select('id')

  if (!data || data.length === 0) {
    await db.from('captacao_consentimento').insert({
      email,
      canal: 'pedido_de_saida',
      base_legal: 'sem_base',
      prova: 'Pediu para não receber mais emails. Não havia registo anterior de consentimento.',
      retirado_em: agora,
      retirado_por: 'pedido da pessoa',
    })
  }

  return NextResponse.json({ ok: true })
}
