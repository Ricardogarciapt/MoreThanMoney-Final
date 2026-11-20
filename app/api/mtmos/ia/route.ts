import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { chamarIA, mensagemIndisponivel, type MensagemIA } from '@/lib/ia/chamar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ferramenta = { name: string; description?: string; inputSchema?: unknown }

// O cérebro do Jarvis no site. A página executa as ferramentas (ler pendentes, marcar feito, SQL
// de leitura…); aqui a IA só decide: responder ou pedir UMA ferramenta. IA grátis primeiro.
export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const b = await req.json().catch(() => null) as { mensagens?: MensagemIA[]; ferramentas?: Ferramenta[] } | null
  const mensagens = (b?.mensagens ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }))
  if (!mensagens.length || mensagens[mensagens.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'a conversa tem de acabar numa mensagem do utilizador' }, { status: 400 })
  }
  const ferramentas = (b?.ferramentas ?? []).slice(0, 20)
  const lista = ferramentas.map((f) => `- ${f.name}: ${f.description ?? ''}${f.inputSchema ? ` · argumentos: ${JSON.stringify(f.inputSchema)}` : ''}`).join('\n')
  const sistema = `Responde SEMPRE em JSON, num de dois formatos:
{"ferramenta":"<nome>","args":{...}}  para usar uma ferramenta (uma de cada vez; o resultado volta-te na mensagem seguinte), ou
{"resposta":"<o que dizes ao Ricardo>"}  quando já podes responder.
Ferramentas disponíveis:
${lista || '(nenhuma)'}`
  try {
    const r = await chamarIA({ sistema, mensagens, json: true, maxTokens: 900, tarefa: 'mtmos-jarvis', prioridade: 'interativo', preferencia: 'qualidade' })
    let j: { ferramenta?: string; args?: unknown; resposta?: string } = {}
    try { j = JSON.parse(r.texto) } catch { j = { resposta: r.texto } }
    if (j.ferramenta && ferramentas.some((f) => f.name === j.ferramenta)) {
      return NextResponse.json({ ferramenta: j.ferramenta, args: j.args ?? {}, fornecedor: r.fornecedor })
    }
    return NextResponse.json({ texto: String(j.resposta ?? r.texto), fornecedor: r.fornecedor })
  } catch (err) {
    return NextResponse.json({ error: mensagemIndisponivel(err) }, { status: 503 })
  }
}
