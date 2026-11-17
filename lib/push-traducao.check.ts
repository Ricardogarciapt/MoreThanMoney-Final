import assert from 'node:assert/strict'
import { agruparPorIdioma, traduzirPush } from './push-traducao'

// Supabase de faz-de-conta: perfis com idiomas e uma cache vazia.
const perfis = [
  { id: 'a', preferred_language: 'pt' },
  { id: 'b', preferred_language: 'de-DE' },
  { id: 'c', preferred_language: null },
]
const gravadas: unknown[] = []
const sb = {
  from: (t: string) => ({
    select: () => ({
      in: async (_c: string, ids: string[]) => ({ data: perfis.filter((p) => ids.includes(p.id)), error: null }),
      eq: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
    upsert: async (linhas: unknown[]) => { gravadas.push(...linhas); return { error: null } },
    _t: t,
  }),
} as any

const main = async () => {
  const g = await agruparPorIdioma(sb, ['a', 'b', 'c', 'd'])
  assert.deepEqual(g.get('pt'), ['a', 'c', 'd']) // sem idioma ou sem perfil → PT
  assert.deepEqual(g.get('de'), ['b'])

  // Google simulado: devolve o texto em maiúsculas.
  globalThis.fetch = (async (url: string) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('q') || '')
    return { ok: true, json: async () => [[[q.toUpperCase()]], null, 'pt'] }
  }) as any
  const r = await traduzirPush(sb, { title: 'Sessão ao vivo', body: 'XAUUSD 2350' }, 'de')
  assert.equal(r.title, 'SESSÃO AO VIVO')
  assert.equal(r.body, 'XAUUSD 2350'.toUpperCase())
  // PT nunca traduz
  assert.deepEqual(await traduzirPush(sb, { title: 'Olá', body: 'x' }, 'pt'), { title: 'Olá', body: 'x' })

  // Google lento/em baixo → fica o original, sem rebentar.
  globalThis.fetch = (async () => { throw new Error('timeout') }) as any
  assert.deepEqual(await traduzirPush(sb, { title: 'Novo sinal', body: 'Entrada' }, 'fr'), { title: 'Novo sinal', body: 'Entrada' })
  console.log('push-traducao.check: ok')
}
main()
