/**
 * Resposta ao comunicado do incidente de 10/09 — o botão do email abre /incidente-10-09/<token>
 * e o formulário grava aqui. Uma resposta por token; responder outra vez substitui a anterior
 * (a pessoa pode mudar de ideias até a equipa fechar o caso).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

const DECISOES = new Set(['aceito', 'nao_aceito'])
const OPCOES = new Set(['estorno', 'encerramento', 'separacao'])

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = typeof corpo?.token === 'string' ? corpo.token.trim() : ''
  const decisao = typeof corpo?.decisao === 'string' ? corpo.decisao : ''
  const opcao = typeof corpo?.opcao === 'string' && corpo.opcao ? corpo.opcao : null
  const comentario = typeof corpo?.comentario === 'string' ? corpo.comentario.trim().slice(0, 2000) : ''

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return NextResponse.json({ ok: false, erro: 'link inválido' }, { status: 400 })
  if (!DECISOES.has(decisao)) return NextResponse.json({ ok: false, erro: 'escolhe aceito ou não aceito' }, { status: 400 })
  if (opcao && !OPCOES.has(opcao)) return NextResponse.json({ ok: false, erro: 'opção desconhecida' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: linha } = await db.from('incidente_10_09_respostas').select('id').eq('token', token).maybeSingle()
  if (!linha) return NextResponse.json({ ok: false, erro: 'link inválido ou expirado' }, { status: 404 })

  const { error } = await db.from('incidente_10_09_respostas').update({
    decisao, opcao_pu_prime: opcao, comentario: comentario || null,
    respondido_em: new Date().toISOString(),
    ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
  }).eq('id', linha.id)
  if (error) return NextResponse.json({ ok: false, erro: 'não foi possível guardar — tenta outra vez' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
