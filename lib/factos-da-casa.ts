/**
 * O QUE A CASA É HOJE — a visão do sistema que os bots levam para dentro do prompt.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * O bot do Telegram (@MoreThanMoney_aibot) falava da casa por três textos escritos à mão em três
 * ficheiros diferentes — o funil de leads, o follow-up e o agente de gestão do site. Nenhum deles
 * sabia dos outros, e nenhum foi actualizado quando a casa mudou: a 01/10/2026 o bot continuava a
 * conhecer «grupos de sinais e corretora» e mais nada. Nem os dois pilares públicos, nem as nove
 * áreas, nem a academia nova, nem os portefólios reconstruídos.
 *
 * Um bot que responde com factos velhos é PIOR do que um bot que diz que não sabe: quem lê não
 * consegue distinguir uma resposta desactualizada de uma verdadeira, e decide com base nela.
 *
 * ═══ A LIÇÃO JÁ APRENDIDA, APLICADA OUTRA VEZ ══════════════════════════════════════════════
 *
 * A 27/08 entrou no prompt «NUNCA cites lucro em euros» e no dia seguinte o bot disse «+7.060€».
 * Proibir sem substituir não chega — sem factos na mão o modelo vai buscar o que se lembra. Por
 * isso aqui estão os FACTOS, e as regras vêm a seguir, não em vez deles.
 *
 * ═══ O QUE NÃO ENTRA AQUI ══════════════════════════════════════════════════════════════════
 *
 *  · PREÇOS DA ESCADA — vivem em `lib/escada-precos.ts`, que é quem os anuncia, e o depósito da
 *    corretora em `lib/telegram-broker-gate.ts`, que é quem o valida. Repeti-los aqui era criar o
 *    sexto sítio onde o mesmo número divergiu uma vez já.
 *  · AS ÁREAS E OS PILARES — vêm de `lib/pilares.ts`, que é quem pinta as páginas públicas. Se o
 *    bot contasse uma história e a página outra, uma delas estaria a mentir.
 *  · DESEMPENHO DE SINAIS — vem medido de `site_settings.pips_proof` por `provaParaLead()`. Zero
 *    números de trading escritos à mão neste ficheiro, de propósito.
 *
 * Guarda: `npx tsx lib/factos-da-casa.check.ts`
 */
import { AREAS, PERCURSO_ORGANIZADO, PILARES, areasDoPilar } from '@/lib/pilares'
import { PARAMETRO as PARAMETRO_AGENTE } from '@/lib/agentes/atribuicao'
import { JANELA_HORAS as JANELA_AGENTES_HORAS } from '@/lib/agentes/vida'

// ── O BOOTCAMP ───────────────────────────────────────────────────────────────────────────────
//
// Origem: a avaliação em vigor (`assessments`, slug `bootcamp`) e `docs/cursos/bootcamp-descricao.md`.
// As 30 horas NÃO são negociáveis com o que está escrito no `lib/products-service.ts`: lá ficou um
// «mais de 50 horas» dos dados de arranque, que contradiz a avaliação e não se repete em lado nenhum.

export const BOOTCAMP_HORAS = 30
/**
 * O número ERRADO, nomeado de propósito.
 *
 * Vive em `lib/products-service.ts` desde os dados de arranque e é o que o modelo encontra quando
 * vai buscar o que se lembra. Dizer ao bot «são 30, não 50» corrige-o; dizer só «são 30» deixa as
 * duas versões a coexistir na cabeça dele.
 */
export const BOOTCAMP_HORAS_ERRADAS = 50
export const BOOTCAMP_PERGUNTAS = 38
export const BOOTCAMP_NOTA_MINIMA_PCT = 70
/** Preço de tabela no marketplace, em euros. */
export const BOOTCAMP_PRECO_EUR = 310
/** A campanha em vigor a 01/10/2026, em percentagem. */
export const BOOTCAMP_CAMPANHA_PCT = 15

/** Formata euros à portuguesa — vírgula decimal, e só as casas que o valor tem. */
function eur(valor: number): string {
  const redondo = Number.isInteger(valor)
  return `${(redondo ? String(valor) : valor.toFixed(2)).replace('.', ',')} €`
}

/**
 * Milhares com espaço, SEMPRE.
 *
 * Não se usa `toLocaleString('pt-PT')` porque ele não agrupa os quatro dígitos: dava «7230 $» ao
 * lado de «10 743 $», no mesmo parágrafo. Dois formatos na mesma frase fazem o número parecer
 * copiado de dois sítios — e neste ficheiro a credibilidade do número é metade do trabalho.
 */
function milhares(valor: number): string {
  return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/**
 * O que a pessoa PAGA hoje pelo Bootcamp. Calculado, não escrito à mão.
 *
 * Um preço com desconto escrito à mão é um preço que sobrevive à campanha: quando os 15% saírem,
 * o bot continuaria a anunciar os 263,50 € e a casa cobrava 310 €. A conta fica aqui para que
 * mudar a campanha num sítio mude o que o bot diz.
 */
export function bootcampPrecoComCampanha(): number {
  return Math.round(BOOTCAMP_PRECO_EUR * (1 - BOOTCAMP_CAMPANHA_PCT / 100) * 100) / 100
}

// ── A ACADEMIA QUE ENTROU ────────────────────────────────────────────────────────────────────

export const FACELESS = {
  area: 'Faceless Marketing',
  educadora: 'Maria Mafalda Costa',
  /** A marca sob a qual os produtos dela se vendem. */
  academia: 'She Is Faceless',
  cursoPrecoEur: 127,
} as const

// ── OS PORTEFÓLIOS ───────────────────────────────────────────────────────────────────────────
//
// Origem declarada: reconstrução de 01/10/2026, a PREÇOS REAIS desde 01/03/2024. Não é estimativa
// nem projecção — e é por isso que o cripto aparece NEGATIVO. Um portefólio que só mostra o que
// correu bem é a mesma mentira que a conta-espelho que publicava 100% por ler só vencedoras.

export interface Portefolio {
  nome: string
  posicoes: number
  inicialUsd: number
  atualUsd: number
  variacaoPct: number
}

export const PORTEFOLIOS: Portefolio[] = [
  { nome: 'Cripto', posicoes: 11, inicialUsd: 7230, atualUsd: 4598, variacaoPct: -36.4 },
  { nome: 'ETF', posicoes: 9, inicialUsd: 7700, atualUsd: 10743, variacaoPct: 39.5 },
]

export const PORTEFOLIOS_INICIO = '01/03/2024'
export const PORTEFOLIOS_DCA = 'reforço semanal (DCA) às sextas'

// ── A EQUIPA DE AGENTES ──────────────────────────────────────────────────────────────────────
//
// Os nomes espelham `supabase/migrations/166_semear_equipa_agentes.sql`, que é quem os semeia. A
// janela e o parâmetro do link vêm importados de `lib/agentes/*` — são a mesma decisão, lida, não
// recopiada.

export const AGENTES_POR_PILAR: Record<string, string[]> = {
  Trading: ['Trader Papel', 'Analista de Scanners'],
  Educação: ['Conteúdo LMS', 'Vendas de Formação'],
  Desenvolvimento: ['Produto SaaS', 'Manutenção do Site'],
}

/** Quantos sub-agentes a equipa tem, contados — não escritos. */
export function totalSubAgentes(): number {
  return Object.values(AGENTES_POR_PILAR).reduce((t, l) => t + l.length, 0)
}

// ── A APP ────────────────────────────────────────────────────────────────────────────────────

/** O separador mudou de nome a 01/10/2026: era «Ao vivo». Quem o procurar pelo nome antigo não o encontra. */
export const SEPARADOR_AULAS = 'Aulas'

// ── AS REGRAS QUE O BOT NÃO PODE VIOLAR ──────────────────────────────────────────────────────

/**
 * As regras, escritas uma vez e colocadas em TODOS os prompts dos bots.
 *
 * Estão deliberadamente depois dos factos em `factosDaCasa()`: uma proibição é a última coisa que
 * um modelo lê e a primeira que ignora quando não tem com que a substituir.
 */
export const REGRAS_DA_CASA = [
  'Português de Portugal, sempre.',
  `NUNCA nomeies a plataforma de terceiros onde vivem os cursos das áreas sem sala ao vivo. A fórmula é «${PERCURSO_ORGANIZADO}».`,
  'NUNCA digas «a abrir», «em breve», «em preparação» nem «sem aulas próprias» sobre uma área: estão TODAS prontas.',
  'PROVA: desempenho de trading fala-se em PIPS e PERCENTAGEM, com a origem declarada. NUNCA em euros, nunca estimado. Valor em dinheiro só como exemplo por lote (0,01 · 0,1 · 1,0), bruto, e com a ressalva de que o passado não garante o futuro.',
  'Não inventes números. Se não souberes, diz que não sabes — é melhor resposta do que um número aproximado.',
].join('\n- ')

// ── O TEXTO QUE VAI PARA O PROMPT ────────────────────────────────────────────────────────────

/**
 * A visão da casa, em texto, pronta a colar num `system`.
 *
 * Montada e não escrita à mão para que uma área nova em `lib/pilares.ts` apareça no bot sem
 * ninguém se lembrar de o ir actualizar — que é exactamente o que não aconteceu até aqui.
 */
export function factosDaCasa(): string {
  const areasPorPilar = (['markets', 'content'] as const)
    .map((id) => {
      const p = PILARES[id]
      const titulos = areasDoPilar(id).map((a) => a.titulo).join(', ')
      return `  · ${p.nome} (${p.href}) — ${p.definicao}\n    Áreas: ${titulos}.\n    Também lá: ${p.mais.join(', ')}.`
    })
    .join('\n')

  const carteiras = PORTEFOLIOS.map(
    (p) =>
      `${p.nome}: ${p.variacaoPct > 0 ? '+' : ''}${String(p.variacaoPct).replace('.', ',')}% ` +
      `(${milhares(p.inicialUsd)} $ → ${milhares(p.atualUsd)} $, ${p.posicoes} posições a somar 100%)`,
  ).join(' · ')

  const equipa = Object.entries(AGENTES_POR_PILAR)
    .map(([pilar, nomes]) => `${pilar} (${nomes.join(', ')})`)
    .join(' · ')

  return `═══ O QUE A MORETHANMONEY É HOJE (01/10/2026) ═══
Educação financeira, trading e negócio. Comunidade portuguesa. Dois pilares públicos, cada um com página própria:
${areasPorPilar}
As ${AREAS.length} áreas estão TODAS prontas. As que têm sala ao vivo mostram quem a dá; as outras acompanham-se por «${PERCURSO_ORGANIZADO}».

FORMAÇÃO NO MARKETPLACE:
  · Bootcamp MoreThanMoney — ${BOOTCAMP_HORAS} horas (e não as ${BOOTCAMP_HORAS_ERRADAS} que ficaram nos dados de arranque), ${eur(BOOTCAMP_PRECO_EUR)} com ${BOOTCAMP_CAMPANHA_PCT}% de campanha → paga-se ${eur(bootcampPrecoComCampanha())}. Termina com validação de ${BOOTCAMP_PERGUNTAS} perguntas; acima de ${BOOTCAMP_NOTA_MINIMA_PCT}% dá certificado com nota final e código verificável no site.
  · ${FACELESS.area} — academia nova, com ${FACELESS.educadora} e o canal «${FACELESS.academia}». Curso no marketplace por ${eur(FACELESS.cursoPrecoEur)}.

PORTEFÓLIOS (reconstruídos a 01/10/2026 com preços reais desde ${PORTEFOLIOS_INICIO}; ${PORTEFOLIOS_DCA}):
  ${carteiras}
  O cripto está NEGATIVO e diz-se tal como está — a casa mostra o que mediu, não o que convém.

EQUIPA DE AGENTES (interna, não é produto): um CEO e ${totalSubAgentes()} sub-agentes em três pilares — ${equipa}.
  Cada um vive por uma regra: receita menos gasto na janela de ${JANELA_AGENTES_HORAS} horas. Quem não paga o que gasta, pára. A receita só conta quando a compra traz o código do agente, que viaja num link \`?${PARAMETRO_AGENTE}=AG-…\`.

APP: o separador que se chamava «Ao vivo» chama-se agora «${SEPARADOR_AULAS}».`
}

/** Factos + regras, na ordem certa: primeiro o que é verdade, depois o que não se diz. */
export function contextoDaCasa(): string {
  return `${factosDaCasa()}\n\n═══ REGRAS QUE NÃO SE VIOLAM ═══\n- ${REGRAS_DA_CASA}`
}
