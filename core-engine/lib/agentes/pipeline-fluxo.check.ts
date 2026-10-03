/**
 * A GUARDA DA PROPAGAÇÃO DO PIPELINE.
 *
 *   npx tsx lib/agentes/pipeline-fluxo.check.ts
 *
 * ═══ O CASO MAU NÃO É O CONGELAMENTO — É A CURA ═══════════════════════════════════════════
 *
 * O defeito que se veio corrigir (a ponte insere e nunca actualiza) é visível: vê-se um lead no
 * estado errado. A CURA é que é perigosa, e é dela que este ficheiro trata: um `update` automático
 * que escreve tudo resolve o congelamento e passa a apagar o trabalho de uma pessoa.
 *
 * Nenhum destes erros rebenta. Recuar o estado de um negócio, reabrir um negócio ganho, ou
 * substituir um email que alguém corrigiu ao telefone são todos `update`s que a base aceita com
 * gosto — e o que se perde é o trabalho de quem vende.
 */
import {
  COLUNAS_PREENCHIVEIS,
  NUNCA_SE_ESCREVE,
  SELECT_PARA_PROPAGAR,
  estaVazio,
  mudancasSeguras,
  planearPropagacao,
  type NegocioNoPipeline,
  type OQueAFonteSabe,
} from './pipeline-fluxo'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const negocio = (p: Partial<NegocioNoPipeline> = {}): NegocioNoPipeline => ({
  id: 'n1',
  chave_origem: 'telegram:123',
  estado: 'lead',
  valores: {},
  ...p,
})

const fonte = (p: Partial<OQueAFonteSabe> = {}): OQueAFonteSabe => ({
  chave_origem: 'telegram:123',
  estado: 'qualificado',
  valores: {},
  ...p,
})

const plano = (n: NegocioNoPipeline[], f: OQueAFonteSabe[]) => planearPropagacao({ negocios: n, fontes: f })

// ── O QUE SE VEIO CORRIGIR: O LEAD DESCONGELA ───────────────────────────────
// Sem isto, o lead que passou a `pending_review` no Telegram ficava `lead` no pipeline para sempre.
{
  const p = plano([negocio({ estado: 'lead' })], [fonte({ estado: 'qualificado', valores: { broker_uid: 'PU-99' } })])
  teste('o estado avança', p.propagar[0]?.mudancas.estado === 'qualificado')
  teste('e o broker_uid, que é o sinal mais quente da casa, entra', p.propagar[0]?.mudancas.broker_uid === 'PU-99')
  teste('e o relatório diz o que mudou e porquê', p.propagar[0]!.porque.some((x) => /só se anda para a frente/.test(x)))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CASO MAU 1 — O ESTADO A RECUAR.
//
// A pessoa marcou reunião por telefone; no bot continua `qualifying`. Um upsert que escreve tudo
// punha o negócio de `marcado` para `contactado`, e a reunião desaparecia do ecrã de quem a ia
// fazer. Não dá erro: dá uma reunião perdida.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const p = plano([negocio({ estado: 'marcado' })], [fonte({ estado: 'contactado' })])
  teste('O ESTADO NÃO RECUA', p.propagar.length === 0)
  teste('e o motivo explica que o bot pode estar atrasado', p.deixar.some((d) => /ATRÁS/.test(d.porque)))

  // E não recua em nenhum par da ordem — um teste de um caso não prova uma regra.
  for (const [actual, daFonte] of [
    ['apresentado', 'lead'],
    ['no_show', 'contactado'],
    ['qualificado', 'qualificado'],
  ] as const) {
    teste(
      `${actual} não vira ${daFonte}`,
      plano([negocio({ estado: actual })], [fonte({ estado: daFonte })]).propagar.length === 0,
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CASO MAU 2 — REABRIR UM NEGÓCIO FECHADO.
//
// O pior dos quatro, porque mexe no relatório de alguém: o negócio foi GANHO, e o bot ainda tem o
// lead a meio porque a pessoa nunca mais respondeu no Telegram (comprou por outro caminho).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  for (const fechado of ['ganho', 'perdido'] as const) {
    const p = plano(
      [negocio({ estado: fechado, valores: { email: null } })],
      [fonte({ estado: 'qualificado', valores: { email: 'a@b.pt', broker_uid: 'X' } })],
    )
    teste(`UM NEGÓCIO «${fechado}» NÃO SE TOCA, nem nas colunas vazias`, p.propagar.length === 0)
    teste('e o motivo diz que é a decisão de uma pessoa', p.deixar.some((d) => /decisão de uma pessoa/.test(d.porque)))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CASO MAU 3 — ESCREVER POR CIMA DO QUE ALGUÉM CORRIGIU.
//
// O closer falou com a pessoa e corrigiu o email ao telefone. A fonte continua com o antigo. Um
// upsert que escreve tudo repõe o errado, e a próxima campanha vai para o endereço que não existe.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const p = plano(
    [negocio({ estado: 'lead', valores: { email: 'certo@cliente.pt', telefone: null } })],
    [fonte({ estado: null, valores: { email: 'errado@antigo.pt', telefone: '+351900000000' } })],
  )
  teste('O EMAIL CORRIGIDO À MÃO MANTÉM-SE', p.propagar[0]?.mudancas.email === undefined)
  teste('e o telefone que estava vazio é preenchido', p.propagar[0]?.mudancas.telefone === '+351900000000')
  teste(
    'e o relatório diz que o preenchido se manteve',
    p.propagar[0]!.porque.some((x) => /email mantido/.test(x)),
  )

  // O vazio tem mais do que uma forma, e a string com espaços é a que engana.
  teste('string com espaços conta como vazia', estaVazio('   '))
  teste('array vazio conta como vazio', estaVazio([]))
  teste('zero NÃO é vazio', !estaVazio(0))
  teste('false NÃO é vazio', !estaVazio(false))

  // E nunca se escreve vazio por cima de vazio: era um update que não muda nada e mexe no
  // `atualizado_em`, o que faz um negócio parado parecer trabalhado.
  const nada = plano([negocio({ valores: { email: null } })], [fonte({ estado: null, valores: { email: '  ' } })])
  teste('vazio da fonte não produz update', nada.propagar.length === 0)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CASO MAU 4 — A NOTA.
//
// É o único campo de prosa livre, é onde o closer escreve o que ouviu, e não há forma de o
// completar sem arriscar apagá-lo. Dois travões, de propósito: não está na lista de colunas, e
// `mudancasSeguras` filtra-o outra vez à porta do `update`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  teste('a nota não é uma coluna preenchível', !(COLUNAS_PREENCHIVEIS as readonly string[]).includes('nota'))
  for (const col of NUNCA_SE_ESCREVE) {
    teste(`«${col}» nunca está nas colunas preenchíveis`, !(COLUNAS_PREENCHIVEIS as readonly string[]).includes(col))
  }

  // O caso mau a sério: alguém acrescenta a nota ao plano, à mão ou por descuido de um merge.
  const filtrado = mudancasSeguras({
    estado: 'qualificado',
    email: 'a@b.pt',
    nota: 'Veio do Telegram. Interesse: copytrading.',
    closer_id: 'alguem',
    motivo_perda: 'desapareceu',
  })
  teste('mudancasSeguras deixa passar o estado', filtrado.estado === 'qualificado')
  teste('e o email', filtrado.email === 'a@b.pt')
  teste('E CORTA A NOTA, mesmo que o plano a tenha trazido', !('nota' in filtrado))
  teste('e corta o closer_id', !('closer_id' in filtrado))
  teste('e corta o motivo da perda', !('motivo_perda' in filtrado))
}

// ── AS DUAS LISTAS DIZEM O MESMO ────────────────────────────────────────────
// O `select` tem de ser um literal (o supabase-js tipa pela string), logo há uma lista de nomes a
// par de `COLUNAS_PREENCHIVEIS`. O caso mau: acrescentar uma coluna à lista e esquecê-la no select.
// A propagação passava a decidir sobre um campo que leu como `undefined`, ou seja, dava-o por VAZIO
// — e escrevia por cima do que uma pessoa lá tinha posto. Sem erro nenhum.
{
  const noSelect = SELECT_PARA_PROPAGAR.split(',').map((c) => c.trim())
  for (const col of COLUNAS_PREENCHIVEIS) {
    teste(`«${col}» está no select da ingestão`, noSelect.includes(col))
  }
  for (const obrigatoria of ['id', 'chave_origem', 'estado']) {
    teste(`o select traz «${obrigatoria}»`, noSelect.includes(obrigatoria))
  }
  // E o inverso: nada que nunca se escreve deve ser lido para aqui, para não haver tentação.
  for (const col of NUNCA_SE_ESCREVE) teste(`«${col}» não é lido para a propagação`, !noSelect.includes(col))
}

// ── ESTADOS QUE NÃO SE RECONHECEM NÃO SE CORRIGEM ───────────────────────────
// A mesma regra do motor para campos ilegíveis: corrige-se a linha, não se adivinha por ela.
{
  const p = plano([negocio({ estado: 'inventado' })], [fonte({ estado: 'qualificado' })])
  teste('um negócio num estado desconhecido não tem o estado mexido', p.propagar.length === 0)
  teste('e diz-se porquê', p.deixar.some((d) => /não é um estado conhecido/.test(d.porque)))

  const q = plano([negocio({ estado: 'lead' })], [{ chave_origem: 'telegram:123', estado: 'zzz' as never, valores: {} }])
  teste('um estado inventado pela fonte é ignorado, não escrito', q.propagar.length === 0)
}

// ── QUEM NÃO ESTÁ NO PIPELINE É DA INGESTÃO, NÃO DESTA PROPAGAÇÃO ───────────
// Dizê-lo evita que alguém «conserte» isto com um insert e a casa passe a ter duas portas de
// entrada no pipeline, cada uma com o seu tecto diário e a sua ideia de deduplicação.
{
  const p = plano([], [fonte({})])
  teste('não se insere aqui', p.propagar.length === 0)
  teste('e diz-se de quem é o trabalho', p.deixar.some((d) => /é da ingestão/.test(d.porque)))
}

// ── O RESUMO DISTINGUE «NÃO HAVIA NADA» DE «NÃO CORREU» ─────────────────────
{
  teste('resumo de dia vazio diz que olhou', /nada a actualizar/.test(plano([negocio({})], [fonte({ estado: null })]).resumo))
  teste('resumo com trabalho conta os avanços', /1 com avanço de estado/.test(plano([negocio({})], [fonte({})]).resumo))
}

if (falhas.length) {
  console.error(`agentes/pipeline-fluxo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('agentes/pipeline-fluxo: o lead descongela e o trabalho do closer não se apaga ✓')
