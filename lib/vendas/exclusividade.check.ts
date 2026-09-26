/**
 * GUARDA da regra que impede o plano de sangrar: O MESMO EURO NÃO PAGA DUAS VEZES.
 *
 * Venda com equipa atribuída → paga a tabela de papéis, o MLM binário NÃO cria comissão.
 * Venda sem equipa → o binário paga, como sempre pagou (membros a trazer membros).
 *
 * Sem isto, o 1.º mês de um Premium de 65 € sairia a 35 % (equipa) + 50 % (binário) = 85 % antes de
 * Stripe, infra e entrega do serviço. E como as duas cadeias vivem em ficheiros diferentes, basta
 * alguém mexer num lado sem olhar para o outro para voltar a acontecer — por isso esta guarda
 * verifica também que as DUAS portas do MLM continuam a chamar a regra.
 *
 *   npx tsx lib/vendas/exclusividade.check.ts
 */
import { readFileSync } from 'node:fs'
import { equipaAtribuidaAoComprador, vendaPagaPelaEquipa } from './exclusividade'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

/**
 * Base falsa: devolve o negócio que lhe dermos (ou um erro), pela cadeia que a função usa.
 *
 * A cadeia é AGUARDÁVEL (`then`) e também responde a `maybeSingle`, porque a procura do negócio
 * passou a ser a de `lib/vendas/atribuicao-leitura.ts`: lista de candidatos (aguardada directamente)
 * mais uma leitura da linha escolhida. Um erro atirado é o que simula a base em baixo — e o que
 * prova que nesse caso continua a pagar o binário.
 */
function dbFalso(resposta: { data?: Record<string, unknown> | null; error?: unknown }) {
  const linhas = resposta.data ? [resposta.data] : []
  const cadeia: Record<string, unknown> = {}
  const devolve = () => cadeia
  const resolver = () => {
    if (resposta.error) throw resposta.error
    return { data: linhas, error: null }
  }
  Object.assign(cadeia, {
    select: devolve,
    update: devolve,
    eq: devolve,
    neq: devolve,
    is: devolve,
    ilike: devolve,
    order: devolve,
    limit: devolve,
    maybeSingle: async () => {
      if (resposta.error) throw resposta.error
      return { data: resposta.data ?? null, error: null }
    },
    then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(resolver()).then(ok)
      } catch (e) {
        return falha ? Promise.resolve(falha(e)) : Promise.reject(e)
      }
    },
  })
  return { from: () => cadeia } as never
}

/**
 * O negócio de teste traz `comprador_id` preenchido: é o caminho mais forte da atribuição, e o que
 * a exclusividade usava antes de existirem os outros dois (chave de origem e email).
 */
const negocio = (extra: Record<string, unknown>) => ({
  id: 'n-1',
  estado: 'qualificado',
  comprador_id: 'comprador',
  email: null,
  chave_origem: null,
  atualizado_em: '2026-09-26T00:00:00Z',
  prospector_id: null,
  setter_id: null,
  closer_id: null,
  team_leader_id: null,
  afiliado_id: null,
  ...extra,
})

async function correr() {
  // ── Com equipa: o binário cala-se. ──
  teste('um closer atribuído basta', await vendaPagaPelaEquipa(dbFalso({ data: negocio({ closer_id: 'u-c' }) }), 'comprador'))
  teste('um setter atribuído basta', await vendaPagaPelaEquipa(dbFalso({ data: negocio({ setter_id: 'u-s' }) }), 'comprador'))
  teste('um afiliado atribuído basta', await vendaPagaPelaEquipa(dbFalso({ data: negocio({ afiliado_id: 'u-a' }) }), 'comprador'))
  teste(
    'os papéis atribuídos saem identificados',
    (await equipaAtribuidaAoComprador(dbFalso({ data: negocio({ setter_id: 'u-s', closer_id: 'u-c' }) }), 'comprador')).papeis
      .sort()
      .join(',') === 'closer,setter',
  )

  // ── Sem equipa: o binário paga, como sempre pagou. ──
  teste('negócio sem ninguém atribuído não é venda de equipa', !(await vendaPagaPelaEquipa(dbFalso({ data: negocio({}) }), 'comprador')))
  teste('sem negócio nenhum, paga o binário', !(await vendaPagaPelaEquipa(dbFalso({ data: null }), 'comprador')))
  teste('sem comprador identificado, paga o binário', !(await vendaPagaPelaEquipa(dbFalso({ data: null }), null)))
  teste('coluna vazia (string vazia) não conta como atribuição', !(await vendaPagaPelaEquipa(dbFalso({ data: negocio({ closer_id: '', comprador_id: 'c' }) }), 'c')))

  // ── NA DÚVIDA, PAGA-SE O BINÁRIO. ──
  // Suprimir a comissão de alguém por causa de um erro de leitura nosso é tirar-lhe dinheiro por
  // uma falha que não é dele — e isso não se desfaz com um deploy.
  teste(
    'com a base em baixo, o binário continua a pagar',
    !(await vendaPagaPelaEquipa(dbFalso({ error: new Error('tabela não existe'), data: null }), 'comprador')),
  )

  // ── As DUAS portas do MLM têm de continuar a chamar a regra. ──
  for (const porta of ['lib/mlm-checkout-commission.ts', 'lib/mlm-renewal-commission.ts']) {
    const src = readFileSync(porta, 'utf8')
    const limpo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    teste(`${porta} consulta a regra da equipa`, /vendaPagaPelaEquipa\(/.test(limpo))
    teste(`${porta} desiste quando a venda é da equipa`, /if \(await vendaPagaPelaEquipa\([^)]*\)\) \{/.test(limpo))
  }

  // E a porta das renovações tem de o fazer ANTES de criar qualquer residual — o de patrocinador
  // directo e o de rank. Se a chamada escorregar para baixo das inserções, deixa de proteger nada.
  {
    const src = readFileSync('lib/mlm-renewal-commission.ts', 'utf8')
    const posRegra = src.indexOf('vendaPagaPelaEquipa(supabase')
    const posDirecto = src.indexOf('processDirectSponsorResidual(supabase')
    const posRank = src.indexOf('processRankMonthlyResiduals(supabase, params)')
    teste('a regra corre antes do residual directo', posRegra > 0 && posRegra < posDirecto)
    teste('a regra corre antes do residual de rank', posRegra > 0 && posRegra < posRank)
  }
}

void correr().then(() => {
  if (falhas.length) {
    console.error(`vendas/exclusividade: ${falhas.length} falha(s)`)
    for (const f of falhas) console.error('  · ' + f)
    process.exit(1)
  }
  console.log('vendas/exclusividade: com equipa paga a tabela de papéis, sem equipa paga o binário, e na dúvida preserva ✓')
})
