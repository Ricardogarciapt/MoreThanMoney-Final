/**
 * A GUARDA DO QUE CORRE SOZINHO — cadeia de IA a falhar → NADA é escrito, publicado ou enviado.
 *
 *   npx tsx lib/__tests__/ia-cadeia-falha-sem-efeito.check.ts
 *
 * A 04/10/2026 a Anthropic e a OpenAI ficaram sem crédito e toda a IA passou a entrar por
 * `chamarIA` (lib/ia/chamar.ts). Nos ecrãs, uma falha mostra-se à pessoa. Nos crons e webhooks
 * ninguém está a olhar: `content-draft`, `content-repost`, `ig-curation`, o closer de DMs, o
 * engagement e as automações correm sozinhos. Aqui, se a cadeia INTEIRA falhar, o que tem de
 * acontecer é NADA: nenhuma linha em `social_scheduled_posts`, nenhum post no grupo de leads,
 * nenhuma DM com a mensagem de erro lá dentro. Um post vazio ou uma DM a dizer «a IA está
 * indisponível» a um lead é pior do que não publicar.
 *
 * Cada caso corre o código REAL com dependências falsas: uma base que regista o que lhe pedem,
 * um Instagram falso e uma cadeia de IA que falha como falha na vida real (`ErroIA`).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { ErroIA, type PedidoIA, type RespostaIA } from '@/lib/ia/chamar'
import { correrContentDraft, draftBatch, parseDrafts, type DepsContentDraft } from '@/lib/instagram/content-draft'
import { correrContentRepost, personalCaption, type DepsContentRepost } from '@/lib/instagram/content-repost'
import { correrCuracao, scoreWithLLM, type DepsCuracao } from '@/lib/instagram/curation'
import { generateDmReply } from '@/lib/instagram/dm-closer'
import { llmReply } from '@/lib/instagram/engage'
import { textoDaResposta, type Automacao } from '@/lib/automacoes'
import { lerDecisao, protocoloFerramentas } from '@/lib/dashboard-gestao/protocolo-ferramentas'

// ── A cadeia a falhar como na vida real ───────────────────────────────────────────────────────
const MOTIVO =
  'A IA está indisponível neste momento. Fornecedores tentados: groq (429 rate limit); openai (402 Your credit balance is too low).'
const cadeiaFalha = async (_p: PedidoIA): Promise<RespostaIA> => {
  throw new ErroIA(MOTIVO, [{ fornecedor: 'groq', erro: '429 rate limit' }, { fornecedor: 'openai', erro: '402 Your credit balance is too low' }], ['gemini (sem chave)'])
}
const cadeiaResponde = (texto: string) => async (_p: PedidoIA): Promise<RespostaIA> => ({
  texto, fornecedor: 'groq', modelo: 'falso', custoCents: 0, emReserva: false, tentativas: [],
})

// ── Uma base falsa que regista TUDO o que lhe pedem ───────────────────────────────────────────
type Chamada = { tabela: string; metodo: string; args: unknown[] }
type Responder = (tabela: string, cadeia: Chamada[]) => { data?: unknown; count?: number | null; error?: null }

function baseFalsa(responder: Responder) {
  const registo: Chamada[] = []
  const from = (tabela: string) => {
    const cadeia: Chamada[] = []
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            const r = responder(tabela, cadeia)
            return (res: (v: unknown) => void) => res({ data: r.data ?? null, count: r.count ?? null, error: r.error ?? null })
          }
          return (...args: unknown[]) => {
            const c = { tabela, metodo: String(prop), args }
            cadeia.push(c)
            registo.push(c)
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const escreveu = (tabela: string) => registo.filter((c) => c.tabela === tabela && ['insert', 'upsert', 'update', 'delete'].includes(c.metodo))
  return { supabase: () => ({ from }) as unknown as ReturnType<DepsContentDraft['supabase']>, registo, escreveu }
}

const pedidoCron = () => new NextRequest('http://local/api/cron', { headers: { 'x-vercel-cron': '1', authorization: 'Bearer segredo-da-guarda' } })

async function main() {
  process.env.CRON_SECRET = 'segredo-da-guarda'

  // ── 1. content-draft: cadeia falha → 500 e ZERO linhas em social_scheduled_posts ─────────────
  {
    const base = baseFalsa(() => ({ data: [], count: 0 }))
    let cartoes = 0
    let leuPips = 0
    const deps: DepsContentDraft = {
      supabase: base.supabase,
      chamar: cadeiaFalha,
      proofStats: (async () => ({ members: 10 })) as unknown as DepsContentDraft['proofStats'],
      pipsProof: (async () => { leuPips++; return null }) as unknown as DepsContentDraft['pipsProof'],
      highlights: async () => [],
      promos: async () => [],
      card: (async () => { cartoes++; return 'https://x/card.png' }) as unknown as DepsContentDraft['card'],
    }
    const res = await correrContentDraft(pedidoCron(), deps)
    const body = (await res.json()) as { ok: boolean; error?: string }
    assert.equal(res.status, 500, 'content-draft: a cadeia a falhar tem de dar 500')
    assert.equal(body.ok, false)
    assert.match(body.error ?? '', /indisponível/, 'content-draft: a resposta diz que a IA está indisponível')
    assert.match(body.error ?? '', /groq.*openai/, 'content-draft: nomeia quem falhou')
    assert.deepEqual(base.escreveu('social_scheduled_posts'), [], 'content-draft: NADA escrito em social_scheduled_posts')
    assert.equal(cartoes, 0, 'content-draft: não se gera cartão nenhum sem texto')
    assert.equal(leuPips, 0, 'content-draft: sai-se antes de ler a prova dos pips')
  }

  // ── 1b. content-draft: a IA responde prosa sem blocos → zero rascunhos → 500, zero linhas ────
  {
    const base = baseFalsa(() => ({ data: [], count: 0 }))
    const deps: DepsContentDraft = {
      supabase: base.supabase,
      chamar: cadeiaResponde('Aqui vão uns posts bonitos sobre trading, sem o formato pedido.'),
      proofStats: (async () => ({ members: 10 })) as unknown as DepsContentDraft['proofStats'],
      pipsProof: (async () => null) as unknown as DepsContentDraft['pipsProof'],
      highlights: async () => [],
      promos: async () => [],
      card: (async () => 'https://x/card.png') as unknown as DepsContentDraft['card'],
    }
    const res = await correrContentDraft(pedidoCron(), deps)
    assert.equal(res.status, 500, 'content-draft: prosa sem blocos não é lote')
    assert.deepEqual(base.escreveu('social_scheduled_posts'), [], 'content-draft: prosa sem blocos não escreve nada')
    assert.deepEqual(parseDrafts('nada'), [])
    assert.equal(parseDrafts('===POST===\nKEYWORD: APP\nHOOK: Olá\nVISUAL: x\nCAPTION:\nLegenda real\n===END===').length, 1)
    await assert.rejects(() => draftBatch(['APP'], 'prova', [], '', cadeiaFalha), ErroIA, 'draftBatch relança o ErroIA, não inventa lote')
  }

  // ── 2. content-repost: cadeia falha → ZERO linhas no Instagram pessoal ───────────────────────
  {
    process.env.REPOST_TO_PERSONAL = '1'
    const base = baseFalsa((tabela, cadeia) => {
      if (tabela === 'social_scheduled_posts' && cadeia.some((c) => c.metodo === 'eq' && c.args[1] === 'published')) {
        return { data: [{ id: 'post-1', caption: 'Legenda da marca', media_urls: ['https://x/img.png'], published_media_id: 'm1', created_at: '', agente_codigo: null }] }
      }
      return { data: [] }
    })
    const deps: DepsContentRepost = { supabase: base.supabase, chamar: cadeiaFalha }
    const res = await correrContentRepost(pedidoCron(), deps)
    const body = (await res.json()) as { ok: boolean; reposted: number; error?: string }
    assert.equal(res.status, 500, 'content-repost: a cadeia a falhar tem de dar 500')
    assert.equal(body.reposted, 0)
    assert.match(body.error ?? '', /indisponível/)
    assert.deepEqual(base.escreveu('social_scheduled_posts'), [], 'content-repost: NADA escrito em social_scheduled_posts')
    await assert.rejects(() => personalCaption('x', cadeiaFalha), ErroIA, 'personalCaption relança, não inventa legenda')
    delete process.env.REPOST_TO_PERSONAL
  }

  // ── 3. ig-curation: cadeia falha → nada publicado no grupo de leads, nada gravado ────────────
  {
    process.env.INSTAGRAM_TOKEN = 'token-falso'
    const base = baseFalsa((tabela) => {
      if (tabela === 'site_settings') return { data: { value: { chat_id: '-100' } } }
      return { data: null }
    })
    let publicou = 0
    const deps: DepsCuracao = {
      supabase: base.supabase as unknown as DepsCuracao['supabase'],
      chamar: cadeiaFalha,
      fetchEdge: (async (_id: string, edge: string) =>
        edge === 'media'
          ? [{ id: 'media-1', caption: 'Resultados do copytrading desta semana em pips', media_type: 'IMAGE', permalink: 'https://instagram.com/p/1' }]
          : []) as unknown as DepsCuracao['fetchEdge'],
      publish: (async () => { publicou++; return '1' }) as unknown as DepsCuracao['publish'],
      botToken: () => 'bot-falso',
    }
    const res = await correrCuracao(pedidoCron(), deps)
    const body = (await res.json()) as { ok: boolean; error?: string; published: number }
    assert.equal(res.status, 500, 'ig-curation: a cadeia a falhar tem de dar 500')
    assert.equal(publicou, 0, 'ig-curation: NADA publicado no grupo de leads')
    assert.equal(body.published, 0)
    assert.match(body.error ?? '', /indisponível/)
    assert.deepEqual(base.escreveu('ig_curation_log'), [], 'ig-curation: o item fica por gravar (volta no próximo ciclo), não se grava como visto')
    await assert.rejects(() => scoreWithLLM({ id: 'x', caption: 'copytrading' }, 'morethanmoney.pt', cadeiaFalha), ErroIA)
    // Resposta sem a forma esperada → null (não publica), e não rebenta.
    assert.equal(await scoreWithLLM({ id: 'x', caption: 'copytrading' }, 'morethanmoney.pt', cadeiaResponde('{"outra":"coisa"}')), null)
    delete process.env.INSTAGRAM_TOKEN
  }

  // ── 4. closer de DMs: cadeia falha → LANÇA; nunca devolve texto para enviar ──────────────────
  {
    await assert.rejects(() => generateDmReply('olá, quero saber dos sinais', {}, cadeiaFalha), ErroIA, 'dm-closer: sem IA não há DM — o webhook regista o erro e não envia')
    await assert.rejects(() => generateDmReply('olá', {}, cadeiaResponde('   ')), /vazio/, 'dm-closer: texto vazio também não é DM')
    assert.equal(await generateDmReply('olá', {}, cadeiaResponde('Olá! Conta-me o que procuras 🙂')), 'Olá! Conta-me o que procuras 🙂')
  }

  // ── 5. engagement: cadeia falha → o TEMPLATE da marca, nunca a mensagem de erro ──────────────
  {
    const r = await llmReply('Adorei este post!', 'legenda', 'c1', 'maria', cadeiaFalha)
    assert.ok(r.length > 0, 'engage: há sempre uma frase de apreço (o template é o modo por omissão do cron)')
    assert.doesNotMatch(r, /indisponível|groq|openai|credit/i, 'engage: a mensagem de erro da IA nunca vai para um comentário')
    assert.doesNotMatch(r, /https?:\/\//, 'engage: sem links')
  }

  // ── 6. automações: cadeia falha → o texto de RESERVA do dono, ou '' (e quem chama não envia) ──
  {
    const base: Automacao = {
      id: 'a1', nome: 'x', canal: 'telegram', gatilho: 'qualquer', valor: null, alvoMediaId: null,
      respostaTipo: 'ia', resposta: { instrucao: 'responde', texto: 'Olá! Já te respondo com calma.' },
      seguimento: null, funilId: null, noId: null, ativa: true, disparos: 0, ultimoDisparo: null,
    }
    assert.equal(await textoDaResposta(base, 'olá', cadeiaFalha), 'Olá! Já te respondo com calma.', 'automacoes: sem IA sai o texto de reserva do dono')
    assert.equal(await textoDaResposta({ ...base, resposta: { instrucao: 'responde' } }, 'olá', cadeiaFalha), '', 'automacoes: sem reserva sai vazio — bot-responder e webhook não enviam vazio')
    assert.equal(await textoDaResposta({ ...base, respostaTipo: 'texto', resposta: { texto: 'fixo' } }, 'olá', cadeiaFalha), 'fixo')
  }

  // ── 7. dashboard-gestão: a leitura da decisão em JSON ────────────────────────────────────────
  {
    assert.deepEqual(lerDecisao('{"ferramenta":"estado_do_negocio","argumentos":{}}'), { tipo: 'ferramenta', nome: 'estado_do_negocio', argumentos: {} })
    assert.deepEqual(lerDecisao('{"resposta":"Olá"}'), { tipo: 'resposta', texto: 'Olá' })
    assert.equal(lerDecisao('{"x":1}').tipo, 'invalida')
    assert.equal(lerDecisao('prosa').tipo, 'invalida')
    const proto = protocoloFerramentas([{ name: 'f1', description: 'd', input_schema: { type: 'object' } }])
    assert.match(proto, /"ferramenta"/)
    assert.match(proto, /"resposta"/)
  }

  // ── 8. Nenhum destes ficheiros volta a falar directamente com a Anthropic ou a OpenAI ────────
  {
    const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
    const FICHEIROS = [
      'lib/instagram/dm-closer.ts', 'lib/instagram/engage.ts', 'lib/automacoes.ts',
      'lib/instagram/content-draft.ts', 'lib/instagram/content-repost.ts', 'lib/instagram/curation.ts',
      'app/api/cron/content-draft/route.ts', 'app/api/cron/content-repost/route.ts', 'app/api/cron/ig-curation/route.ts',
      'app/api/dashboard-gestao/chat/route.ts', 'app/api/agent/v1/agents/route.ts', 'lib/agent-site-api.ts',
    ]
    const PROIBIDO = [/api\.anthropic\.com/, /api\.openai\.com/, /ANTHROPIC_API_KEY/, /OPENAI_API_KEY/, /@anthropic-ai\/sdk/, /process\.env\.(IG_CLOSER_MODEL|IG_CURATION_MODEL|CONTENT_DRAFT_MODEL|AI_CHAT_PROVIDER)/]
    for (const f of FICHEIROS) {
      const texto = readFileSync(join(RAIZ, f), 'utf-8')
      for (const re of PROIBIDO) assert.ok(!re.test(texto), `${f} voltou a falar directamente com um fornecedor (${re.source}) — a IA entra por chamarIA`)
      assert.ok(/chamarIA|correrContentDraft|correrContentRepost|correrCuracao/.test(texto), `${f} não passa por chamarIA`)
    }
  }

  console.log('ia-cadeia-falha-sem-efeito: OK — com a cadeia inteira a falhar, nada é escrito, publicado ou enviado')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
