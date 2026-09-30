import { NextResponse, type NextRequest } from 'next/server'
import { marcar, tipoPorSlug, ics } from '@/lib/agenda/servidor'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * MARCAR UMA CHAMADA. Rota ABERTA, e tem de ser: quem marca uma apresentação do ecossistema é,
 * por definição, alguém que ainda não é cliente.
 *
 * ═══ O QUE ESTA ROTA NÃO FAZ ═══════════════════════════════════════════════════════════════
 *
 * Não cria conta, não dá acesso a nada, não mexe em direitos. Uma chamada marcada é uma chamada
 * marcada. A conta nasce quando a pessoa se registar ou comprar — e isso tem o seu próprio caminho,
 * com as suas próprias guardas.
 *
 * ═══ O LIMITE ══════════════════════════════════════════════════════════════════════════════
 *
 * Três marcações por email e por dia. Sem limite, uma pessoa (ou um guião) enche a agenda de uma
 * semana em segundos e ninguém consegue marcar nada — e ao contrário de uma tabela com lixo, uma
 * agenda entupida é um prejuízo imediato. Conta-se por EMAIL e não por IP: o abuso que importa aqui
 * é reservar horas, e isso faz-se com emails diferentes do mesmo sítio tão bem como do contrário.
 */
const POR_EMAIL_POR_DIA = 3

function limpar(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max)
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const slugTipo = limpar(corpo.tipo, 60)
  const inicioIso = limpar(corpo.inicio, 40)
  const nome = limpar(corpo.nome, 160)
  const email = limpar(corpo.email, 200).toLowerCase()
  const telefone = limpar(corpo.telefone, 40) || null

  if (!nome || nome.length < 2) return NextResponse.json({ error: 'Escreve o teu nome.', campo: 'nome' }, { status: 400 })
  if (!EMAIL_OK.test(email)) return NextResponse.json({ error: 'Esse email não parece válido.', campo: 'email' }, { status: 400 })

  const tipo = await tipoPorSlug(slugTipo)
  if (!tipo) return NextResponse.json({ error: 'Esse tipo de chamada não existe.' }, { status: 404 })

  // Numa chamada de WhatsApp o número NÃO é opcional: é o sítio onde a chamada acontece. Deixar
  // marcar sem ele é marcar uma chamada que não se pode fazer.
  if (tipo.local === 'whatsapp' && (!telefone || telefone.replace(/\D/g, '').length < 9)) {
    return NextResponse.json({ error: 'Precisamos do teu número de WhatsApp — é por aí que a chamada acontece.', campo: 'telefone' }, { status: 400 })
  }

  // As perguntas obrigatórias do tipo. Validam-se aqui e não só no ecrã: um formulário validado só
  // no browser valida-se a si próprio.
  const respostas: Record<string, unknown> = {}
  const dadas = (corpo.respostas && typeof corpo.respostas === 'object' ? corpo.respostas : {}) as Record<string, unknown>
  for (const q of tipo.perguntas ?? []) {
    const v = limpar(dadas[q.chave], 1000)
    if (q.obrigatoria && !v) return NextResponse.json({ error: `Falta responder: ${q.rotulo}`, campo: q.chave }, { status: 400 })
    if (v) respostas[q.chave] = v
  }

  const db = getSupabaseAdmin()
  const { count } = await db.from('agenda_marcacoes')
    .select('id', { count: 'exact', head: true })
    .ilike('email', email)
    .eq('estado', 'marcada')
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
  if ((count ?? 0) >= POR_EMAIL_POR_DIA) {
    return NextResponse.json({ error: 'Já tens chamadas marcadas que chegue por hoje. Se precisas de outra, responde ao email da confirmação.' }, { status: 429 })
  }

  const r = await marcar({
    slugTipo, inicioIso, nome, email, telefone,
    anfitriaoId: limpar(corpo.anfitriao, 40) || null,
    fusoConvidado: limpar(corpo.fuso, 64) || null,
    respostas,
    utm: (corpo.utm && typeof corpo.utm === 'object' ? corpo.utm : {}) as Record<string, unknown>,
  })

  if (!r.ok) {
    return NextResponse.json({ error: r.mensagem, codigo: r.codigo }, { status: r.codigo === 'hora_ocupada' ? 409 : 400 })
  }

  // O aviso ao convidado e a nós. Nenhum deles pode fazer a resposta falhar: a chamada já está
  // marcada, e é isso que a pessoa precisa de ver no ecrã.
  void avisar({ ...r, tipoNome: tipo.nome, local: tipo.local, nome, email, telefone }).catch((e) =>
    console.error('[agenda] avisos:', e))

  return NextResponse.json({
    ok: true,
    marcacao: { inicio: r.inicio, fim: r.fim, anfitriao: r.anfitriao, local: r.local, joinUrl: r.joinUrl, token: r.token },
  })
}

/**
 * Os avisos. O WhatsApp só sai quando HÁ número e quando as regras de `whatsapp-envio` deixam —
 * essa biblioteca conhece a janela das 24 horas e o consentimento, e é ela que manda. Aqui não se
 * tenta contorná-la: uma confirmação a mais não vale perder o número da casa.
 */
async function avisar(p: {
  id: string
  token: string
  inicio: string
  fim: string
  anfitriao: string
  tipoNome: string
  local: string
  nome: string
  email: string
  telefone: string | null
  joinUrl: string | null
}): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
  const quando = new Date(p.inicio).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'full', timeStyle: 'short' })
  const onde = p.local === 'whatsapp'
    ? `Ligamos-te pelo WhatsApp para ${p.telefone}.`
    : p.joinUrl ? `Link da sala: ${p.joinUrl}` : 'O link segue por email antes da chamada.'

  try {
    // O transporte e a marca da casa são os de sempre (`mail-transport`): um email de confirmação
    // que chega com outro aspecto do que o resto faz a pessoa duvidar que veio de nós.
    const { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } = await import('@/lib/mail-transport')
    await createMailTransporter().sendMail({
      from: mailFrom(),
      to: p.email,
      subject: `Chamada marcada: ${p.tipoNome} — ${quando}`,
      attachments: brandedMailAttachments(),
      html: prepareBrandedEmailHtml(`
        <p>Olá ${p.nome},</p>
        <p>Está marcado: <strong>${p.tipoNome}</strong> com ${p.anfitriao}.</p>
        <p><strong>${quando}</strong> (hora de Lisboa)</p>
        <p>${onde}</p>
        <p>Se precisares de desmarcar: <a href="${base}/agendar/gerir?t=${p.token}">cancelar esta chamada</a>.</p>
        <p>Até já,<br>MoreThanMoney</p>`),
    })
  } catch (e) {
    console.error('[agenda] o email de confirmação não saiu:', e)
  }
}
