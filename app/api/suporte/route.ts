import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { chaveValida, conversaPorChave, mensagensDe, novaChave, receberMensagem } from '@/lib/suporte/servidor'
import { ASSUNTOS_DO_BALAO, emailValido, type Assunto } from '@/lib/suporte/regras'
import type { MensagemIA } from '@/lib/ia/chamar'
import { idiomaApoio } from '@/lib/suporte/idiomas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O BALÃO DE APOIO — a porta pública.
 *
 * Qualquer pessoa pode escrever (membros, visitantes, leads), por isso a porta é estreita:
 *   · a conversa só se lê com a chave aleatória que o próprio browser guardou;
 *   · tectos por IP e por conversa (a IA grátis tem limites e um bot não os pode gastar);
 *   · CORS só para os sites da casa — o balão foi feito para poder ir também para o site novo de
 *     apresentação, que fala com esta mesma API e este mesmo CRM. Origens extra em SUPORTE_ORIGENS.
 */

const ORIGENS_BASE = ['https://www.morethanmoney.pt', 'https://morethanmoney.pt', 'http://localhost:3000', 'http://localhost:3001']

function origensPermitidas(): string[] {
  const extra = (process.env.SUPORTE_ORIGENS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return [...ORIGENS_BASE, ...extra]
}

function cors(req: NextRequest, res: NextResponse): NextResponse {
  const o = req.headers.get('origin')
  if (o && origensPermitidas().includes(o)) {
    res.headers.set('Access-Control-Allow-Origin', o)
    res.headers.set('Vary', 'Origin')
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  }
  return res
}

// Tectos simples em memória (por instância). Chega para travar um script; não é contabilidade.
const janela = new Map<string, number[]>()
function excedeu(chave: string, max: number, ms: number): boolean {
  const agora = Date.now()
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms)
  lista.push(agora)
  janela.set(chave, lista)
  if (janela.size > 5000) janela.clear()
  return lista.length > max
}

function ipDe(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconhecido'
}

export async function OPTIONS(req: NextRequest) {
  return cors(req, new NextResponse(null, { status: 204 }))
}

/** Ler a conversa (o balão chama isto ao abrir e, enquanto espera pela equipa, de tempos a tempos). */
export async function GET(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave')
  if (!chaveValida(chave)) return cors(req, NextResponse.json({ conversa: null, mensagens: [] }))
  if (excedeu(`g:${ipDe(req)}`, 120, 60_000)) return cors(req, NextResponse.json({ error: 'Calma, tenta daqui a pouco.' }, { status: 429 }))

  const db = getSupabaseAdmin()
  const conversa = await conversaPorChave(db, chave)
  if (!conversa) return cors(req, NextResponse.json({ conversa: null, mensagens: [] }))
  const depois = Number(req.nextUrl.searchParams.get('depois') ?? 0) || 0
  const mensagens = await mensagensDe(db, conversa.id, depois)
  return cors(
    req,
    NextResponse.json({ conversa: { estado: conversa.estado, assunto: conversa.assunto, temEmail: Boolean(conversa.email) }, mensagens }),
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const texto = String(body?.texto ?? '').trim().slice(0, 2000)
  if (!texto) return cors(req, NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 }))

  const ip = ipDe(req)
  if (excedeu(`p:${ip}`, 20, 10 * 60_000)) {
    return cors(req, NextResponse.json({ error: 'Muitas mensagens seguidas. Espera uns minutos, ou marca uma conversa em /agendar.' }, { status: 429 }))
  }

  const chave = chaveValida(body?.chave) ? (body.chave as string) : novaChave()
  const email = typeof body?.email === 'string' && emailValido(body.email) ? body.email.trim().toLowerCase().slice(0, 200) : null
  const nome = typeof body?.nome === 'string' ? body.nome.trim().slice(0, 120) || null : null
  const assuntoSugerido = (ASSUNTOS_DO_BALAO as readonly string[]).includes(body?.assunto) ? (body.assunto as Assunto) : null
  const pagina = typeof body?.pagina === 'string' ? body.pagina.slice(0, 300) : null
  // O idioma do site de quem escreve (um dos 21). Sem ele, a conversa fica no idioma que já tinha.
  const idioma = typeof body?.idioma === 'string' ? idiomaApoio(body.idioma) : null
  const historico: MensagemIA[] = Array.isArray(body?.historico)
    ? (body.historico as Array<{ role: string; content: string }>)
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 1500) }))
    : []

  // Sessão do site (cookie) quando o balão está no mesmo domínio: assim o CRM sabe que é membro.
  const userId = await userIdDoPedido(req).catch(() => null)
  const origem = req.headers.get('origin')
  const site = origem && origensPermitidas().includes(origem) ? origem : null

  try {
    const r = await receberMensagem(getSupabaseAdmin(), { chave, texto, userId, nome, email, pagina, site, historico, assuntoSugerido, idioma })
    return cors(req, NextResponse.json({ chave, ...r }))
  } catch (e) {
    console.error('[suporte]', e)
    return cors(req, NextResponse.json({ error: 'Não consegui registar a mensagem. Tenta outra vez daqui a pouco.' }, { status: 500 }))
  }
}
