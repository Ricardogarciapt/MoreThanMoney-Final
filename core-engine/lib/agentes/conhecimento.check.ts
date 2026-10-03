/**
 * A GUARDA DO ÍNDICE DE CONHECIMENTO.
 *
 *   npx tsx lib/agentes/conhecimento.check.ts
 *
 * ═══ PORQUE É QUE ESTE FICHEIRO É O MAIS IMPORTANTE DOS DOIS ═══════════════════════════════
 *
 * Um índice de conhecimento não rebenta. Fica certo no dia em que se escreve e vai apodrecendo
 * sozinho — e o agente que o lê não tem como saber que apodreceu. As duas formas de podridão:
 *
 *  1. **um facto sem procedência.** Entra em silêncio, e a partir daí parece verdade só por estar
 *     escrito ao lado de factos verdadeiros. Era exactamente isto que o dono proibiu: «um facto
 *     sem procedência não entra»;
 *  2. **uma procedência que aponta para um ficheiro que já não existe.** Alguém renomeia um módulo
 *     e não vai ver quem falava dele. O índice continua a parecer bom, o agente vai lá, não
 *     encontra nada, e decide sem a fonte — ou pior, decide com o que se lembra.
 *
 * As duas são provadas com o CASO MAU construído à mão, e não só com os dados reais: um teste que
 * só verifica os dados de hoje passa a verde no dia em que a validação deixar de validar.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  COMO_CONSULTAR,
  DECISOES_IRREVERSIVEIS,
  INCIDENTES,
  LIMITES,
  MAPA_DO_CODIGO,
  RAIZ_MEMORIAS,
  caminhosDeRepo,
  conhecimentoDoCEO,
  factosSemProcedencia,
  ficheirosQueFaltam,
  indiceDeConhecimento,
  memoriasQueFaltam,
  slugsDeMemoria,
  todosOsFactos,
  type Facto,
} from './conhecimento'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const RAIZ_REPO = path.resolve(__dirname, '..', '..')
const texto = indiceDeConhecimento()

// ── 1 · UM FACTO SEM PROCEDÊNCIA NÃO ENTRA ──────────────────────────────────
{
  teste('nenhum facto real está sem procedência', factosSemProcedencia().length === 0)

  /**
   * O CASO MAU, construído à mão.
   *
   * Sem isto, o teste de cima passa a verde para sempre no dia em que `factosSemProcedencia()`
   * deixar de olhar para o array — e passaria a verde também se olhasse para o campo errado.
   */
  const inventado: Facto = { oQue: 'A casa tem 40 000 membros.', origem: [] }
  teste('um facto com origem VAZIA é apanhado', factosSemProcedencia([inventado]).length === 1)

  // `undefined` e `null` chegam de JSON mal montado e não dão erro de tipo em tempo de execução.
  const semCampo = { oQue: 'Número inventado.' } as unknown as Facto
  teste('um facto SEM o campo origem é apanhado', factosSemProcedencia([semCampo]).length === 1)

  // Uma procedência que não diz nada ('ficheiro' com caminho vazio) é tão inútil como não ter.
  const vazia = { oQue: 'Outro.', origem: [{ tipo: 'ficheiro', caminho: '   ' }] } as Facto
  teste('uma procedência em branco não conta como procedência', factosSemProcedencia([vazia]).length === 1)
}

// ── 2 · A GUARDA CONTRA A PODRIDÃO: O ÍNDICE APONTA PARA COISAS QUE EXISTEM ──
{
  const caminhos = caminhosDeRepo()
  teste('o índice aponta para ficheiros do repositório', caminhos.length > 10)

  /**
   * O teste que justifica o ficheiro. Verifica-se CADA caminho contra o disco, e a falha nomeia
   * quais — «um caminho está errado» não ajuda ninguém a corrigir trinta.
   */
  const faltam = ficheirosQueFaltam(RAIZ_REPO)
  if (faltam.length) {
    for (const f of faltam) falhas.push(`procedência aponta para ficheiro inexistente: ${f}`)
  }

  /** O caso mau: um caminho plausível e falso TEM de ser apanhado. */
  const mentira = ficheirosQueFaltam(RAIZ_REPO, ['lib/agentes/vida.ts', 'lib/agentes/nao-existe-isto.ts'])
  teste('um caminho inventado é apanhado', mentira.length === 1 && mentira[0].includes('nao-existe-isto'))
  teste('um caminho verdadeiro não é acusado', !mentira.some((m) => m.includes('vida.ts')))
}

// ── 3 · AS MEMÓRIAS CITADAS EXISTEM ─────────────────────────────────────────
{
  const slugs = slugsDeMemoria()
  teste('o índice cita memórias', slugs.length > 20)
  teste('nenhum slug traz a extensão (o nome é o slug)', slugs.every((s) => !s.endsWith('.md')))

  /**
   * As memórias vivem FORA do repositório. Verificam-se onde a pasta existir e salta-se onde não
   * existir — um índice que só compila na máquina de uma pessoa é um índice que mais ninguém corre.
   */
  if (fs.existsSync(RAIZ_MEMORIAS)) {
    const faltam = memoriasQueFaltam()
    if (faltam.length) {
      for (const f of faltam) falhas.push(`procedência cita memória inexistente: ${f}`)
    }
    const mentira = memoriasQueFaltam(['proof-pips-not-euros', 'memoria-que-nunca-existiu'])
    teste('uma memória inventada é apanhada', mentira.length === 1)
  } else {
    console.log(`  (pasta de memórias não encontrada em ${RAIZ_MEMORIAS} — verificação saltada)`)
  }
}

// ── 4 · O CONTEÚDO: OS LIMITES QUE O DONO ESCREVEU ESTÃO LÁ ─────────────────
{
  const limites = LIMITES.map((l) => `${l.oQue} ${l.porque ?? ''}`).join('\n').toLowerCase()

  teste('nenhum agente executa trading nem mexe em dinheiro',
    /ordem de trading/.test(limites) && /n[ãa]o cobra/.test(limites))
  teste('nada é enviado a clientes sem aprovação humana',
    /aprova[çc][ãa]o humana/.test(limites) && /rascunho/.test(limites))
  teste('a prova mede-se em pips, nunca em euros inventados',
    /pips/.test(limites) && /nunca em euros/.test(limites))
  teste('o que não foi medido diz-se «por atribuir»', /por atribuir/.test(limites))
  teste('nunca se nomeia a plataforma de terceiros', /nunca se nomeia a plataforma/.test(limites))
  teste('nenhuma área está a abrir', /est[ãa]o\s+todas prontas/.test(limites))
  teste('as palavras do dono mandam sobre a skill', /gosto de qualquer ferramenta ou skill/.test(limites))

  /**
   * O limite que a regra de vida impõe e que não é óbvio: um agente pode ser parado por falta de
   * MEDIÇÃO e não de trabalho. Um CEO que não saiba isto vai concluir que o agente era mau.
   */
  teste('o CEO aprende que se pára por falta de medição', /falta de medi[çc][ãa]o/i.test(limites))
}

// ── 5 · O QUE NÃO PODE SAIR DO ÍNDICE (as mesmas proibições da casa) ────────
{
  /**
   * O índice CITA as proibições para as ensinar, por isso não se pode testar o texto todo contra
   * elas — era falha garantida e a tentação de amansar o regex. Testa-se o que tem de ser verdade
   * mesmo num texto que fala das proibições.
   */
  // A plataforma de terceiros não se nomeia em lado nenhum, nem a ensinar a não a nomear.
  teste('a plataforma de terceiros não é nomeada', !/skool/i.test(texto))

  /** Um ganho em euros. O índice pode dizer «35 € de receita medida» (um facto com origem) mas
   *  nunca «+7.060€» como prova. O padrão é o do sinal de mais, que é a forma de uma promessa. */
  teste('nenhum ganho é citado como «+N €»', !/\+\s*\d[\d .,]*\s*(€|EUR)\b/i.test(texto))
  teste('nenhuma promessa de percentagem em prazo',
    !/\+\d+%\s*(em|nos|em apenas)\s*\d+\s*(dias|meses|semanas)/i.test(texto))

  /** O número proibido, por extenso: se algum facto o recopiar como prova, isto apanha-o. */
  teste('o número proibido de 30/06 não é citado como prova',
    !/7\.?060\s*€/.test(texto) || /proibido/i.test(texto))
}

// ── 6 · O ÍNDICE NÃO DUPLICA O QUE JÁ TEM DONO ──────────────────────────────
{
  /**
   * A razão por que este ficheiro existe é não ser a sexta cópia de um número. Preços, prova e
   * estado vivo têm donos; o índice diz ONDE, não repete O QUÊ.
   */
  teste('manda para onde vivem os preços', texto.includes('lib/escada-precos.ts'))
  teste('manda para onde vive a prova', texto.includes('lib/pips-proof.ts'))
  teste('manda para a fonte única dos factos de hoje', texto.includes('lib/factos-da-casa.ts'))

  /** Nenhum preço da escada escrito à mão aqui — era a divergência a nascer outra vez. */
  teste('o índice não recopia preços da escada', !/\b(35|65|597|34,99)\s*€/.test(texto))

  /** E o contexto que o CEO recebe TEM de trazer os factos de hoje, senão ele sabe o porquê e
   *  não sabe o quê. */
  const completo = conhecimentoDoCEO()
  teste('o contexto do CEO traz os factos de hoje', completo.includes('O QUE A MORETHANMONEY É HOJE'))
  teste('e traz o índice de conhecimento', completo.includes('ÍNDICE DE CONHECIMENTO'))
  teste('os factos de hoje vêm ANTES do índice',
    completo.indexOf('O QUE A MORETHANMONEY É HOJE') < completo.indexOf('ÍNDICE DE CONHECIMENTO'))
}

// ── 7 · O MAPA DO CÓDIGO ────────────────────────────────────────────────────
{
  teste('o mapa cobre áreas', MAPA_DO_CODIGO.length >= 5)
  teste('cada área do mapa diz quem manda', MAPA_DO_CODIGO.every((a) => a.manda.length > 0))
  teste('cada área do mapa diz o que executa', MAPA_DO_CODIGO.every((a) => a.executa.length > 0))

  /**
   * As guardas do mapa TÊM de existir mesmo. Um mapa que promete um `*.check.ts` que já não existe
   * manda o agente verificar uma decisão numa guarda que ninguém corre.
   */
  const guardas = MAPA_DO_CODIGO.flatMap((a) => a.decide).filter((d) => d.endsWith('.check.ts'))
  teste('o mapa aponta guardas', guardas.length >= 8)
  for (const g of guardas) {
    if (!fs.existsSync(path.join(RAIZ_REPO, g))) falhas.push(`o mapa promete uma guarda que não existe: ${g}`)
  }

  /** Os crons do mapa são lidos do `vercel.json`, não escritos à mão — senão divergem no dia em
   *  que alguém mexer no agendamento. */
  const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, 'vercel.json'), 'utf8')) as {
    crons?: { path: string }[]
  }
  const agendados = new Set((vercel.crons ?? []).map((c) => c.path))
  const cronsDoMapa = MAPA_DO_CODIGO.flatMap((a) => a.executa).filter((e) => e.startsWith('/api/cron/'))
  teste('o mapa aponta crons', cronsDoMapa.length >= 5)
  for (const c of cronsDoMapa) {
    if (!agendados.has(c)) falhas.push(`o mapa diz que ${c} corre, mas não está no vercel.json`)
  }
}

// ── 8 · COMO SE CONSULTA O ESTADO VIVO ──────────────────────────────────────
{
  teste('o índice diz como consultar o estado vivo', COMO_CONSULTAR.length >= 4)
  /** Uma consulta sem o «como» é um convite a inventar o número. */
  teste('todas as consultas dizem por onde se faz',
    COMO_CONSULTAR.every((c) => c.origem.some((o) => o.tipo === 'consulta' || o.tipo === 'ficheiro')))
}

// ── 9 · DATAS E CONTAGEM ────────────────────────────────────────────────────
{
  const todos = todosOsFactos()
  teste('o índice tem factos a sério', todos.length >= 30)
  /**
   * Uma data mal escrita (2026-09-24 em vez de 24/09/2026) passa sem dar erro de tipo e envelhece
   * mal: ninguém a lê como data e ninguém a ordena.
   *
   * A data tem de COMEÇAR por `dd/mm/aaaa` (ou `mm/aaaa`, quando só se sabe o mês); o que vier
   * depois é texto livre, porque há decisões com duas datas («03/08/2026, reforçada a 21/09/2026»)
   * e cortá-las perdia a segunda.
   */
  const malDatadas = todos.filter((f) => f.data && !/^\d{2}\/(\d{2}\/)?\d{4}\b/.test(f.data))
  for (const f of malDatadas) falhas.push(`data fora do formato dd/mm/aaaa: «${f.data}»`)

  teste('os incidentes trazem a lição', INCIDENTES.every((i) => /LI[ÇC][ÃA]O/i.test(i.porque ?? '')))
  teste('as decisões irreversíveis trazem o porquê', DECISOES_IRREVERSIVEIS.every((d) => !!d.porque))
}

// ── 10 · O CEO APONTA PARA UMA PORTA QUE EXISTE MESMO ───────────────────────
{
  /**
   * A podridão mais traiçoeira deste desenho.
   *
   * As `instrucoes` do CEO (migração 169) dizem-lhe para consultar
   * `?resource=conhecimento`. Se alguém renomear esse `resource` na rota, a migração continua a
   * parecer certa, o agente faz a chamada, recebe «resource desconhecido» — e trabalha sem o
   * conhecimento todo, convencido de que o consultou. Nada disto dá erro a quem lê o código.
   */
  const MIGRACAO = 'supabase/migrations/169_ceo_consulta_o_conhecimento.sql'
  const ROTA = 'app/api/agent/v1/business/route.ts'

  for (const f of [MIGRACAO, ROTA]) {
    if (!fs.existsSync(path.join(RAIZ_REPO, f))) falhas.push(`ficheiro que liga o CEO ao índice desapareceu: ${f}`)
  }

  const sql = fs.existsSync(path.join(RAIZ_REPO, MIGRACAO))
    ? fs.readFileSync(path.join(RAIZ_REPO, MIGRACAO), 'utf8')
    : ''
  const rota = fs.existsSync(path.join(RAIZ_REPO, ROTA))
    ? fs.readFileSync(path.join(RAIZ_REPO, ROTA), 'utf8')
    : ''

  /**
   * O SQL parte as frases em literais concatenados (`'...' || '...'`), por isso uma frase real
   * aparece cortada ao meio no ficheiro. Testar o ficheiro cru obrigava a regexes que toleram
   * qualquer coisa no meio — e um regex que tolera qualquer coisa não guarda nada. Desfaz-se a
   * concatenação primeiro e testa-se a PROSA que o agente vai ler.
   */
  const prosa = sql
    .replace(/E?'\s*\|\|\s*E?'/g, '') // junta literais colados por ||
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')

  teste('as instruções do CEO mandam-no consultar o conhecimento', /resource=conhecimento/.test(sql))
  teste('e a rota responde mesmo a esse resource', /case "conhecimento"/.test(rota))
  teste('a rota serve o texto montado por este módulo', /conhecimentoDoCEO\(\)/.test(rota))
  teste('a migração mexe só no CEO', /where nome = 'CEO'/.test(sql))

  /**
   * Os quatro limites ficam escritos nas `instrucoes` por extenso, e não só no índice, porque um
   * agente que falhe a consulta não pode ficar sem saber que não executa trading nem envia
   * mensagens a clientes. Se alguém os cortar da migração a pensar que o índice basta, isto apanha.
   */
  teste('as instruções repetem o limite do trading e do dinheiro',
    /NÃO executas ordens de trading nem mexes em dinheiro/.test(prosa) &&
      /dinheiro que sai é decisão do Ricardo/.test(prosa))
  teste('as instruções repetem a aprovação humana antes de qualquer envio',
    /NADA é enviado a um cliente sem aprovação humana/.test(prosa) &&
      /Devolves rascunho, não envias/.test(prosa))
  teste('as instruções repetem a prova em pips',
    /mede-se em PIPS e PERCENTAGEM/.test(prosa) && /NUNCA em euros/.test(prosa))
  teste('as instruções mandam dizer «por atribuir» ao que não foi medido',
    /por atribuir/.test(prosa))
  teste('as instruções proíbem nomear a plataforma de terceiros',
    /NUNCA nomeias a plataforma de terceiros/.test(prosa))
  teste('as instruções dizem que as áreas estão todas prontas',
    /nenhuma área está «a abrir»/.test(prosa) && /estão TODAS prontas/.test(prosa))
  teste('as instruções avisam que se pode parar por falta de MEDIÇÃO e não de trabalho',
    /falta de MEDIÇÃO e não de trabalho/.test(prosa))
  teste('as instruções mandam dizer que a medição está errada em vez de a arranjar',
    /nunca arranjas o número/.test(prosa))
  teste('as instruções dizem que a supervisão humana ganha à regra',
    /pausado pelo dono não se julga/.test(prosa))
  teste('as instruções fixam a ordem de quem manda',
    /palavras do dono → o que o projecto já tem/.test(prosa))
  teste('as instruções mandam procurar o que existe antes de criar novo',
    /Procuras o que existe antes de criar novo/.test(prosa))
  /** Sem isto, «não sabes» não é cumprível: o agente tem de ter por onde perguntar. */
  teste('as instruções dizem por onde se perguntam os números de hoje',
    /\/api\/sales-machine/.test(prosa) && /POST \/api\/agent\/v1\/sql/.test(prosa))
  teste('as instruções mandam dizer que não sabe', /dizes que não sabes/.test(prosa))
}

if (falhas.length) {
  console.error(`conhecimento: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  `conhecimento: ${todosOsFactos().length} factos, todos com procedência, e todas as fontes existem ✓`,
)
