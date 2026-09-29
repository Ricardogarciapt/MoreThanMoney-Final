/**
 * A ESCRITA DO DESFECHO CHEGA MESMO À BASE.
 *
 * O teste que já existia (`desfecho-unico.check.ts`) prende a escada em memória, e passava —
 * enquanto em produção NENHUMA escrita acontecia. A condição estava num filtro do PostgREST,
 * `\`.or('outcome->>origem.is.null,…')\``, que é aceite num GET mas rejeitado num PATCH com
 * «42703 · column chat_messages.outcome does not exist». O erro era tratado com um warn e um
 * `return false`, por isso a reconstrução respondia «355 discordavam, 0 corrigidas» três vezes
 * seguidas com ar de sucesso, e o desfecho de 86 sinais fechados em 48 h nunca foi gravado.
 *
 * Um teste que passa enquanto nada é escrito é pior do que não haver teste. Este fala com a
 * base a sério. Não escreve nada: usa um id que não existe, por isso afecta zero linhas — o que
 * se verifica é que a chamada é ACEITE, que é exactamente o que falhava.
 *
 *   npx tsx lib/mtmcopy/__tests__/desfecho-escrita.check.ts
 *
 * Precisa de `.env.local` com SUPABASE_SERVICE_ROLE_KEY. Sem credenciais FALHA de propósito:
 * saltar em silêncio é como o defeito passou despercebido.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(url && chave, 'sem credenciais em .env.local — este teste não pode ser saltado em silêncio')
const db = createClient(url, chave)

/** Id que não existe: garante zero linhas afectadas, em qualquer das verificações abaixo. */
const NINGUEM = '00000000-0000-0000-0000-000000000000'
const DESFECHO = { label: 'verificação', pips: 1, pct: 0.01 }

let ok = 0
const caso = async (nome: string, f: () => Promise<void>) => { await f(); ok++; console.log(`  ok  ${nome}`) }

async function corre() {
  // ── O defeito de 30/09, em uma linha ──────────────────────────────────────────────────────
  await caso('a gravação é ACEITE pela base (era aqui que rebentava, calada)', async () => {
    const { error } = await db.rpc('gravar_desfecho_unico', {
      p_chat_message_id: NINGUEM, p_origem: 'tracker', p_desfecho: DESFECHO,
    })
    assert.equal(
      error?.message ?? null, null,
      'a escrita do desfecho foi recusada pela base — falta correr a migração 152?',
    )
  })

  await caso('linha inexistente devolve false, não erro — false é «não escreveu», não «rebentou»', async () => {
    const { data, error } = await db.rpc('gravar_desfecho_unico', {
      p_chat_message_id: NINGUEM, p_origem: 'texto', p_desfecho: DESFECHO,
    })
    assert.equal(error, null)
    assert.equal(data, false)
  })

  await caso('as três origens da escada são aceites', async () => {
    for (const origem of ['mestre', 'tracker', 'texto']) {
      const { error } = await db.rpc('gravar_desfecho_unico', {
        p_chat_message_id: NINGUEM, p_origem: origem, p_desfecho: DESFECHO,
      })
      assert.equal(error?.message ?? null, null, `origem ${origem} recusada`)
    }
  })

  await caso('uma origem fora da escada é RECUSADA — ninguém entra sem degrau declarado', async () => {
    const { error } = await db.rpc('gravar_desfecho_unico', {
      p_chat_message_id: NINGUEM, p_origem: 'seja-o-que-for', p_desfecho: DESFECHO,
    })
    assert.ok(error, 'uma origem desconhecida devia levantar erro')
  })

  await caso('a escada existe em SQL e tem os graus certos', async () => {
    for (const [origem, grau] of [['mestre', 3], ['tracker', 2], ['texto', 1], [null, 0]] as const) {
      const { data, error } = await db.rpc('grau_desfecho', { p_origem: origem })
      assert.equal(error?.message ?? null, null)
      assert.equal(data, grau, `grau de ${origem}`)
    }
  })

  // ── E que ninguém volta a pôr a condição num filtro do PostgREST ──────────────────────────
  await caso('a condição NÃO volta para um filtro de JSON num update', async () => {
    const src = readFileSync('lib/mtmcopy/desfecho-unico.ts', 'utf8')
    assert.ok(
      !/\.or\([^)]*outcome->>/.test(src),
      'outcome->> dentro de .or() é aceite num GET e rejeitado num PATCH — foi este o defeito',
    )
    assert.match(src, /rpc\('gravar_desfecho_unico'/)
  })

  await caso('a reconstrução pagina — o PostgREST só devolve mil de cada vez', async () => {
    const src = readFileSync('lib/mtmcopy/desfecho-unico.ts', 'utf8')
    assert.match(src, /\.range\(/, 'sem paginação a reconstrução nunca passa das mil linhas')
  })

  console.log(`\n${ok} passaram`)
}

corre().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1) })
