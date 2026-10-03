import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { credenciaisWhatsApp, enviarWhatsApp, lerEstadoDoContacto } from '@/lib/whatsapp-mensageiro'
import { JANELA_MS, decidirEnvio, normalizarE164 } from '@/lib/whatsapp-envio'

export const dynamic = 'force-dynamic'

/**
 * O ECRÃ DE ESCREVER A ALGUÉM — a parte do servidor.
 *
 * O motor do WhatsApp já existia e não tinha interface: para falar com uma pessoa era preciso
 * chamar código. Isto abre-o ao dono, com a regra que mais importa desenhada no próprio ecrã.
 *
 * ═══ O GET NÃO É UM EXTRA ═══════════════════════════════════════════════════════════════════
 *
 * Diz, ANTES de se escrever uma palavra, o que vai acontecer a este número: se a janela das
 * {@link JANELA_MS} (24 horas) está aberta, se há consentimento, se a pessoa pediu para sair. Sem
 * isto, o ecrã seria uma caixa de texto que às vezes envia e às vezes não, e a pessoa que a usa
 * aprenderia a não confiar nela — que é o mesmo que não ter ecrã nenhum.
 *
 * A decisão MOSTRADA aqui é a MESMA função que decide no envio (`decidirEnvio`). Se fossem duas,
 * acabariam a discordar, e o ecrã passaria a mentir exactamente no caso difícil.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const bruto = request.nextUrl.searchParams.get('telefone') ?? ''
  const { e164, porque } = normalizarE164(bruto)
  if (!e164) return NextResponse.json({ ok: false, erro: 'numero_invalido', porque }, { status: 400 })

  const estado = await lerEstadoDoContacto(e164)
  const agora = Date.now()
  const podeTexto = decidirEnvio({ para: e164, tipo: 'texto', templateNome: null, finalidade: 'servico' }, estado, agora)
  const podeCampanha = decidirEnvio({ para: e164, tipo: 'template', templateNome: 'x', finalidade: 'campanha' }, estado, agora)

  const db = getSupabaseAdmin()
  const { data: historico } = await db
    .from('whatsapp_mensagens')
    .select('direcao, texto, template, estado, motivo, criado_em')
    .eq('telefone', e164)
    .order('criado_em', { ascending: false })
    .limit(20)

  const { creds, falta } = credenciaisWhatsApp()
  return NextResponse.json({
    ok: true,
    e164,
    estado: {
      ultimaEntrada: estado.ultimaEntradaIso,
      janelaAberta: podeTexto.pode,
      retirou: estado.retirou,
      baseLegal: estado.baseLegal,
      canal: estado.canal,
    },
    pode: {
      textoLivre: { pode: podeTexto.pode, porque: podeTexto.porque },
      campanha: { pode: podeCampanha.pode, porque: podeCampanha.porque },
    },
    // Sem credenciais nada sai. Diz-se no ecrã em vez de deixar a pessoa escrever e falhar no fim.
    credenciais: creds ? 'ok' : `em falta: ${falta}`,
    janelaHoras: Math.round(JANELA_MS / 3_600_000),
    historico: historico ?? [],
  })
}

/**
 * O envio. Não decide nada por si: entrega a `enviarWhatsApp`, que é o único caminho por onde sai
 * uma mensagem desta casa — decidir aqui outra vez seria criar uma segunda porta, e é sempre a
 * segunda porta que deixa passar o que a primeira travava.
 */
export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const body = (await request.json().catch(() => ({}))) as {
    para?: string
    texto?: string
    finalidade?: 'resposta' | 'servico' | 'campanha'
    template?: { nome?: string; idioma?: string; parametros?: string[] }
  }

  const para = String(body.para ?? '').trim()
  if (!para) return NextResponse.json({ ok: false, erro: 'sem_numero' }, { status: 400 })

  const finalidade = body.finalidade ?? 'servico'
  const template = body.template?.nome
    ? {
        nome: String(body.template.nome),
        idioma: String(body.template.idioma || 'pt_PT'),
        parametros: Array.isArray(body.template.parametros) ? body.template.parametros.map(String) : [],
      }
    : undefined
  const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
  if (!template && !texto) return NextResponse.json({ ok: false, erro: 'sem_corpo' }, { status: 400 })

  const r = await enviarWhatsApp({ para, finalidade, ...(template ? { template } : { texto }) })
  return NextResponse.json({ ok: r.enviado, ...r }, { status: r.enviado ? 200 : 422 })
}
