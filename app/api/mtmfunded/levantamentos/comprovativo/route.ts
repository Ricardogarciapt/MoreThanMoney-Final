import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'mtmfunded-comprovativos'
const MAX_BYTES = 6 * 1024 * 1024
const TIPOS = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Os prints do menu de depósito: endereço de cripto e valor, tal como a corretora os mostra.
 *
 * O bucket é PRIVADO. Um print destes mostra o UID da conta e o endereço de depósito de uma
 * pessoa concreta — num balde público, bastava adivinhar o caminho. Guarda-se o caminho na
 * base de dados e serve-se depois por URL assinado, com validade curta, a quem tem direito.
 *
 * Só imagens, e até 6 MB. Aceitar PDFs ou ficheiros arbitrários num balde que o admin vai
 * abrir é abrir uma porta que não precisa de existir.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: userData } = await db.auth.getUser(auth)
  const user = userData?.user
  if (!user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const ficheiro = form?.get('ficheiro')
  if (!(ficheiro instanceof File)) {
    return NextResponse.json({ error: 'Ficheiro em falta' }, { status: 400 })
  }
  if (!TIPOS.has(ficheiro.type)) {
    return NextResponse.json({ error: 'Só imagens PNG, JPG ou WEBP' }, { status: 400 })
  }
  if (ficheiro.size > MAX_BYTES) {
    return NextResponse.json({ error: 'A imagem não pode passar dos 6 MB' }, { status: 400 })
  }

  // O caminho começa pelo id do utilizador: fica óbvio de quem é cada ficheiro, e uma
  // política de storage por prefixo passa a ser possível sem mexer em nada disto.
  const ext = ficheiro.type.split('/')[1].replace('jpeg', 'jpg')
  const caminho = `${user.id}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const buf = Buffer.from(await ficheiro.arrayBuffer())

  let { error } = await db.storage.from(BUCKET).upload(caminho, buf, {
    contentType: ficheiro.type,
    upsert: false,
  })

  // Bucket ainda não criado: cria-se PRIVADO à primeira utilização, em vez de falhar e
  // obrigar a uma migração manual que ninguém se lembra de correr.
  if (error && /not found|does not exist/i.test(error.message ?? '')) {
    await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES })
    ;({ error } = await db.storage.from(BUCKET).upload(caminho, buf, {
      contentType: ficheiro.type,
      upsert: false,
    }))
  }

  if (error) {
    console.error('[mtmfunded comprovativo]', error)
    return NextResponse.json({ error: 'Não foi possível guardar a imagem' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, caminho })
}
