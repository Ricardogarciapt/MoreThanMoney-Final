/**
 * A GUARDA DA MARCAÇÃO DO CONTEÚDO.
 *
 *   npx tsx lib/agentes/marca-conteudo.check.ts
 *
 * Quatro casos maus. Nenhum deles dá erro; todos custam dinheiro:
 *
 *  1. **o link fica partido.** Um `?ag=` posto depois do ponto final da frase escreve
 *     `…/register.?ag=AG-SAAS` — um caminho que não existe. Numa publicação já no Instagram isto
 *     não se corrige: perde-se a visita E a medição;
 *  2. **o código volta com o ponto colado.** `ag=AG-SAAS.` não tem a forma, a atribuição
 *     desaparece em silêncio, e a regra de vida pára o agente por receita zero;
 *  3. **marca-se o que não é nosso.** Um parâmetro a mais num link de corretora ou de afiliação
 *     pode anular o rastreio de quem paga a comissão;
 *  4. **inventa-se um dono.** Um pilar sem agente a cair no CEO dá ao topo receita que ninguém
 *     ganhou — e a regra de vida salva-o com dinheiro que não é dele.
 *
 * As URL dos testes são as que estavam REALMENTE em `social_scheduled_posts.caption` a 01/10,
 * lidas com:
 *
 *   select distinct (regexp_matches(caption,'(https?://)?([a-z0-9.-]*morethanmoney\.pt[^\s)"]*)','gi'))[2]
 *     from social_scheduled_posts where caption ~* 'morethanmoney\.pt';
 */
import { codigoQueVale, normalizar, oQueGuardar, pareceCodigoDeAgente } from './atribuicao'
import {
  AGENTE_POR_PILAR,
  agenteDoPilar,
  marcarConteudo,
  marcarLegenda,
} from './marca-conteudo'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }
const AGORA = Date.parse('2026-10-01T16:00:00Z')

/** Tira de um texto marcado o endereço que lá ficou, como um auto-ligador o apanharia. */
function linkMarcado(texto: string): string {
  const m = texto.match(/(?:https?:\/\/)?[a-z0-9.-]*morethanmoney\.pt[^\s]*/i)
  return m ? m[0] : ''
}

// ── CASO MAU 1: o ponto final da frase a partir o link ──────────────────────
{
  /**
   * Estas três estão na base com o ponto encostado. São a razão de este módulo não ser um
   * `replace` de três linhas.
   */
  for (const [frase, esperado] of [
    ['Começa em morethanmoney.pt/register.', 'morethanmoney.pt/register?ag=AG-SAAS.'],
    ['Vê o desafio em morethanmoney.pt/mtmfunded.', 'morethanmoney.pt/mtmfunded?ag=AG-SAAS.'],
    ['Tudo em morethanmoney.pt.', 'morethanmoney.pt?ag=AG-SAAS.'],
  ] as const) {
    const { legenda, marcados } = marcarLegenda(frase, 'AG-SAAS')
    teste(`«${frase}» marca-se`, marcados === 1)
    teste(`«${frase}» não parte o caminho`, legenda.includes(esperado))
    // O que nunca pode sair: o parâmetro depois do ponto.
    teste(`«${frase}» não escreve «.?ag=»`, !legenda.includes('.?ag='))
    // A frase continua a ler-se igual.
    teste(`«${frase}» mantém o ponto final`, legenda.trimEnd().endsWith('.'))
  }

  // Sem ponto nenhum é o caso fácil, e também tem de passar.
  const simples = marcarLegenda('Entra em morethanmoney.pt/register hoje', 'AG-SAAS')
  teste('sem pontuação marca igual', simples.legenda.includes('morethanmoney.pt/register?ag=AG-SAAS hoje'))
}

// ── CASO MAU 2: o código a voltar com a pontuação colada ────────────────────
{
  /**
   * O ciclo inteiro: marca-se a legenda, o auto-ligador leva o ponto para dentro da ligação, o
   * browser abre, e `?ag=` chega com o ponto. Sem o corte em `normalizar`, a atribuição morre
   * aqui — e é o único sítio de toda a cadeia onde ninguém olha.
   */
  const { legenda } = marcarLegenda('Trial grátis em morethanmoney.pt/register.', 'AG-SAAS')
  const comoChega = linkMarcado(legenda) // inclui o ponto, como um auto-ligador faria
  const valor = comoChega.split('ag=')[1] ?? ''
  teste('o ponto chega mesmo colado ao código', valor === 'AG-SAAS.')
  teste('e o código ainda assim vale', normalizar(valor) === 'AG-SAAS')
  teste('e chega a guardar-se', oQueGuardar(valor, AGORA)?.codigo === 'AG-SAAS')
  teste(
    'e vale na compra',
    codigoQueVale(oQueGuardar(valor, AGORA), AGORA + 3 * 24 * 3600 * 1000) === 'AG-SAAS',
  )

  // Cortar a pontuação NÃO abriu a porta a um cupão de desconto.
  for (const cupao of ['BLACKFRIDAY50', 'BLACKFRIDAY50.', 'CREATOR60)', 'MTMCREATOR.']) {
    teste(`«${cupao}» continua a não entrar`, normalizar(cupao) === null)
    teste(`«${cupao}» continua sem forma`, !pareceCodigoDeAgente(cupao))
  }
  // E um código que é só pontuação não se transforma em nada.
  teste('«...» não é código', normalizar('...') === null)
  teste('«AG-.» não é código', normalizar('AG-.') === null)
}

// ── CASO MAU 3: marcar links que não são nossos ─────────────────────────────
{
  /**
   * Links de corretora e de afiliação andam nas legendas. Um parâmetro a mais pode anular o
   * rastreio de quem paga a comissão — custa dinheiro a sério e não ganha medição nenhuma.
   */
  for (const alheio of [
    'https://www.puprime.com/?affid=12345',
    'https://t.me/mtmgold',
    'https://instagram.com/morethanmoney.pt',
    'https://nao-morethanmoney.pt/register',
    'https://morethanmoney.pt.evil.com/roubar',
  ]) {
    const { legenda, marcados } = marcarLegenda(`Abre conta em ${alheio} agora`, 'AG-SCANNER')
    teste(`«${alheio}» não se toca`, marcados === 0 && legenda.includes(alheio))
  }

  // Mas um subdomínio nosso é nosso.
  const sub = marcarLegenda('Vai a app.morethanmoney.pt/alertas', 'AG-SCANNER')
  teste('subdomínio nosso marca-se', sub.marcados === 1)
  teste('subdomínio nosso fica certo', sub.legenda.includes('app.morethanmoney.pt/alertas?ag=AG-SCANNER'))
}

// ── A IDEMPOTÊNCIA, porque o repost reescreve legendas já marcadas ──────────
{
  const uma = marcarLegenda('Entra em morethanmoney.pt/register hoje', 'AG-SAAS')
  const duas = marcarLegenda(uma.legenda, 'AG-SAAS')
  teste('marcar duas vezes não duplica', duas.marcados === 0 && duas.legenda === uma.legenda)
  teste('não sai «ag=» duas vezes', (uma.legenda.match(/ag=/g) || []).length === 1)

  /**
   * Um código JÁ ESCRITO não se sobrepõe. O repost de um post de um agente não rouba o crédito
   * ao agente que escreveu o original.
   */
  const doOutro = marcarLegenda('Vai a morethanmoney.pt/register?ag=AG-SCANNER', 'AG-SAAS')
  teste('não se sobrepõe a um código que já lá estava', doOutro.marcados === 0)
  teste('o código do outro fica intacto', doOutro.legenda.includes('ag=AG-SCANNER'))
}

// ── O QUE JÁ TEM PERGUNTA, E O FRAGMENTO ───────────────────────────────────
{
  const comQuery = marcarLegenda('Vê morethanmoney.pt/marketplace?cupao=X10', 'AG-FORMACAO')
  teste('com pergunta usa «&»', comQuery.legenda.includes('?cupao=X10&ag=AG-FORMACAO'))
  teste('não escreve duas perguntas', (comQuery.legenda.match(/\?/g) || []).length === 1)

  /**
   * Um `?ag=` posto depois do `#` não é um parâmetro — é texto dentro do fragmento, e o servidor
   * nunca o vê. A atribuição ia-se, sem erro.
   */
  const comFragmento = marcarLegenda('Vê morethanmoney.pt/mtmfunded#precos', 'AG-SAAS')
  teste('o parâmetro entra antes do fragmento', comFragmento.legenda.includes('/mtmfunded?ag=AG-SAAS#precos'))
  teste('o fragmento sobrevive', comFragmento.legenda.includes('#precos'))
}

// ── CASO MAU 4: inventar um dono ───────────────────────────────────────────
{
  /**
   * Nenhum destes tem agente declarado. O reflexo — cair no CEO — dava ao topo a receita que
   * ninguém ganhou. Fica por atribuir, com o motivo escrito.
   */
  for (const semDono of ['cta:desafio', 'cta:criar', 'resultados', 'prova', 'oferta', 'pessoal', 'contrarian', 'repost:699412c6-61b3-4530-802f-338995b9b51f']) {
    const m = marcarConteudo({ legenda: 'Vai a morethanmoney.pt/register.', pilar: semDono })
    teste(`«${semDono}» não ganha dono`, m.codigo === null)
    teste(`«${semDono}» diz porquê`, m.motivo === 'pilar_sem_agente')
    teste(`«${semDono}» não inventa o CEO`, !m.legenda.includes('CEO-'))
    teste(`«${semDono}» devolve a legenda intacta`, m.legenda === 'Vai a morethanmoney.pt/register.')
  }

  // Os que TÊM dono, têm o dono certo — e o mapa é o dos pilares que a base usa mesmo.
  teste('cta:sinais → scanner', agenteDoPilar('cta:sinais') === 'AG-SCANNER')
  teste('cta:app → saas', agenteDoPilar('cta:app') === 'AG-SAAS')
  teste('educacao → formação', agenteDoPilar('educacao') === 'AG-FORMACAO')
  teste('CTA:APP em maiúsculas é o mesmo pilar', agenteDoPilar('CTA:APP') === 'AG-SAAS')
  teste('pilar vazio não tem dono', agenteDoPilar('') === null && agenteDoPilar(null) === null)
  // Todo o mapa tem de ser composto por códigos com forma válida, senão marca-se com lixo.
  for (const [pilar, codigo] of Object.entries(AGENTE_POR_PILAR)) {
    teste(`o código de «${pilar}» tem forma`, pareceCodigoDeAgente(codigo))
  }
}

// ── O CÓDIGO EXPLÍCITO ─────────────────────────────────────────────────────
{
  const explicito = marcarConteudo({
    legenda: 'Vai a morethanmoney.pt/register.',
    pilar: 'cta:app', // diria AG-SAAS
    codigoExplicito: 'AG-SCANNER',
  })
  teste('o explícito ganha ao pilar', explicito.codigo === 'AG-SCANNER')
  teste('e é o explícito que vai no link', explicito.legenda.includes('ag=AG-SCANNER'))

  /**
   * Um explícito MAL FORMADO não cai em silêncio para o pilar: quem o passou acredita que está a
   * atribuir a esse agente, e o crédito ia para outro sem ninguém dar por nada.
   */
  const mau = marcarConteudo({ legenda: 'Vai a morethanmoney.pt/register.', pilar: 'cta:app', codigoExplicito: 'BLACKFRIDAY50' })
  teste('explícito inválido não cai no pilar', mau.codigo === null)
  teste('explícito inválido diz porquê', mau.motivo === 'codigo_invalido')

  // Vazio não é «inválido» — é «não foi passado», e aí manda o pilar.
  for (const vazio of ['', '   ', null, undefined]) {
    const m = marcarConteudo({ legenda: 'Vai a morethanmoney.pt/register.', pilar: 'cta:app', codigoExplicito: vazio })
    teste('explícito vazio deixa o pilar decidir', m.codigo === 'AG-SAAS')
  }
}

// ── UM POST COM DONO MAS SEM LINK NÃO MEDE NADA, E TEM DE SE SABER ─────────
{
  /**
   * É o caso da maioria dos 200 posts na base: têm pilar, não têm link. Dizer «AG-SAAS, 0 €» sem
   * mais nada parece um agente mau; dizer «AG-SAAS, sem link nosso onde medir» é a verdade.
   */
  const semLink = marcarConteudo({ legenda: 'Comenta APP que eu envio 👇 #trading', pilar: 'cta:app' })
  teste('sem link há dono', semLink.codigo === 'AG-SAAS')
  teste('sem link não há marcação', semLink.marcados === 0)
  teste('sem link diz porquê', semLink.motivo === 'sem_link_nosso')
  teste('sem link a legenda não muda', semLink.legenda === 'Comenta APP que eu envio 👇 #trading')
}

// ── NÃO REBENTA COM LIXO ───────────────────────────────────────────────────
{
  for (const lixo of [null, undefined, 0, {}, []]) {
    teste('legenda de lixo não rebenta', typeof marcarConteudo({ legenda: lixo, pilar: 'cta:app' }).legenda === 'string')
    teste('código de lixo não marca', marcarLegenda('morethanmoney.pt/register', lixo).marcados === 0)
  }
  // Uma legenda enorme com muitos links marca-os todos.
  const muitos = marcarLegenda(
    Array.from({ length: 50 }, (_, i) => `linha ${i}: morethanmoney.pt/p${i}.`).join('\n'),
    'AG-SITE',
  )
  teste('marca todos os links', muitos.marcados === 50)
  teste('e nenhum partido', !muitos.legenda.includes('.?ag='))
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log('✓ marca-conteudo: todos os casos passam')
