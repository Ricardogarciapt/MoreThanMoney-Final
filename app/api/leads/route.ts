import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { contratoLead, parametrosLead, segredoValido } from '@/lib/crm/contrato'
import { linkAgendar } from '@/lib/agenda/link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const LIMITE = 32_768

export async function POST(request: Request) {
  if (!process.env.AUTOMATION_SECRET_KEY || process.env.AUTOMATION_SECRET_KEY.length < 32) {
    return NextResponse.json({ error: 'Integração não configurada.' }, { status: 503 })
  }
  if (!segredoValido(request.headers.get('x-mtm-secret'), process.env.AUTOMATION_SECRET_KEY)) {
    return NextResponse.json({ error: 'Acesso proibido.' }, { status: 403 })
  }
  const evento = request.headers.get('idempotency-key')
  if (!evento || !/^[\w:.-]{1,160}$/.test(evento)) {
    return NextResponse.json({ error: 'Envia Idempotency-Key (ID estável do evento, até 160 caracteres).' }, { status: 400 })
  }
  // Ler com tecto real, mesmo sem Content-Length (transferência em blocos).
  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Falta o corpo JSON.' }, { status: 400 })
  const partes: Uint8Array[] = []
  let tamanho = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      tamanho += value.byteLength
      if (tamanho > LIMITE) {
        await reader.cancel()
        return NextResponse.json({ error: 'Payload demasiado grande.' }, { status: 413 })
      }
      partes.push(value)
    }
    let corpo: unknown
    try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')) } catch {
      return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    }
    const validado = contratoLead.safeParse(corpo)
    if (!validado.success) {
      return NextResponse.json({ error: 'Contrato inválido.', campos: validado.error.issues.map(i => i.path.join('.')) }, { status: 400 })
    }
    const p = parametrosLead(validado.data)
    const hash = createHash('sha256').update(JSON.stringify(p)).digest('hex')
    const { data, error } = await getSupabaseAdmin().rpc('crm_ingerir_lead', { p_evento: evento, p_hash: hash, p_lead: p })
    if (error) {
      if (error.code === 'P0001') return NextResponse.json({ error: 'Evento reutilizado ou identidade ambígua. Requer revisão humana.' }, { status: 409 })
      // Sem contactos, payloads, chaves ou mensagens SQL nos logs/respostas.
      console.error('[crm] falha de ingestão', { code: error.code })
      return NextResponse.json({ error: 'Não foi possível guardar o lead.' }, { status: 503 })
    }
    return NextResponse.json({ success: true, ...data, scheduling_url: linkAgendar('apresentacao') }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Integração temporariamente indisponível.' }, { status: 503 })
  } finally {
    reader.releaseLock()
  }
}
