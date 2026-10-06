/**
 * A GUARDA DAS MENSAGENS QUE SAEM DOS AGENTES.
 *
 *   npx tsx lib/agentes/mensagem-saida.check.ts
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * Porque nenhum dos defeitos deste módulo dá erro. Um link mal marcado abre a página, a pessoa vê
 * o que veio ver, e a atribuição desaparece — e depois a regra das 48 h pára o agente por receita
 * zero, com um motivo que parece sólido a quem o ler. Um deep-link mal marcado é pior: a pessoa
 * carrega e o bot manda-a embora.
 *
 * Os casos aqui NÃO são inventados. Os textos são os que estão no código hoje: as respostas do
 * funil do Instagram (`lib/instagram/funnel.ts`), os três toques do follow-up
 * (`lib/telegram-lead-followup.ts`) e o botão de acolhimento do grupo
 * (`lib/telegram-grupo-entradas.ts`).
 *
 * ═══ OS DOIS QUE JÁ SE PAGARAM ═════════════════════════════════════════════════════════════
 *
 *  1. O HÍFEN DO CÓDIGO. O webhook lê o `start` com `[a-zA-Z0-9_]+`. Um `?start=lead_ag_AG-SAAS`
 *     não casa, e não casar não cai nas boas-vindas — cai no fim da cadeia de `else`, que responde
 *     «não conheço esse comando». O link que o agente emitiu leva a pessoa ao bot para ser mandada
 *     embora. Está provado abaixo contra o padrão REAL do webhook, copiado dele.
 *  2. O TOKEN DO FUNIL APAGADO. Se a carga do agente ocupasse o `start` sozinha, quem viesse de um
 *     link `?start=broker` deixava de cair nos passos da corretora e caía nas boas-vindas
 *     genéricas — a procurar outra vez o que já tinha pedido.
 */
import assert from 'node:assert/strict'
import {
  juntarCarga,
  separarCarga,
  marcarLinksDoBot,
  prepararMensagem,
  cargaUtilizavel,
  LIMITE_CARGA,
} from './mensagem-saida'

let casos = 0
function caso(nome: string, f: () => void) {
  casos++
  try {
    f()
  } catch (e) {
    console.error(`mensagem-saida: FALHOU — ${nome}`)
    console.error('  ' + (e instanceof Error ? e.message : String(e)))
    process.exit(1)
  }
}

/**
 * O PADRÃO DO WEBHOOK, COPIADO DE LÁ.
 *
 * `app/api/telegram/webhook/route.ts`: `text.match(/^\/start\s+([a-zA-Z0-9_]+)$/)`. Está aqui
 * duplicado de propósito, e é a única duplicação que este ficheiro aceita: se alguém o afrouxar
 * ou apertar lá, esta guarda continua a medir o que o webhook REALMENTE aceita no dia em que
 * correr, e a divergência aparece como uma falha em vez de aparecer como um lead perdido.
 */
const START_DO_WEBHOOK = /^\/start\s+([a-zA-Z0-9_]+)$/

// ── 1. A carga do deep-link ──────────────────────────────────────────────────────────────────────

caso('o hífen do código não mata o deep-link — o caso mau que manda o lead embora', () => {
  const carga = juntarCarga('lead', 'AG-SAAS')
  assert.ok(
    START_DO_WEBHOOK.test(`/start ${carga}`),
    `«/start ${carga}» não casa com o padrão do webhook — a pessoa carrega no link do Instagram e o ` +
      'bot responde «não conheço esse comando». Foi exactamente o que o hífen fazia.',
  )
  // E o ingénuo falha, para se ver que o perigo é real e não teórico.
  assert.equal(
    START_DO_WEBHOOK.test('/start lead_ag_AG-SAAS'),
    false,
    'o padrão do webhook passou a aceitar hífen — se foi de propósito, apaga esta linha; se não, ' +
      'alguém o alargou sem saber porque é que ele era assim',
  )
})

caso('o token do funil sobrevive à carga — o broker-gate não pode cair nas boas-vindas', () => {
  for (const token of ['lead', 'broker', 'corretora', 'mtmauto', 'auto', 'premium']) {
    const { token: devolta, codigo } = separarCarga(juntarCarga(token, 'AG-SCANNER'))
    assert.equal(devolta, token, `o token «${token}» não voltou intacto`)
    assert.equal(codigo, 'AG-SCANNER', `o código perdeu-se no token «${token}»`)
  }
})

caso('um código mal formado nunca custa a entrada a quem clicou', () => {
  // `BLACKFRIDAY50` é um cupão de desconto a passar por código de agente — o erro que
  // `pareceCodigoDeAgente` existe para travar. Aqui a consequência de o aceitar seria dupla:
  // creditar a receita a quem não a fez E ainda assim deixar o link a funcionar.
  assert.equal(juntarCarga('lead', 'BLACKFRIDAY50'), 'lead')
  assert.equal(juntarCarga('lead', ''), 'lead')
  assert.equal(juntarCarga('lead', null), 'lead')
  assert.equal(separarCarga('lead').codigo, null)
})

caso('uma carga que não é nossa devolve o payload INTEIRO como token', () => {
  // Um token de mentor que por acaso contenha `_ag_` não se corta. Cortá-lo transformava um token
  // válido num que não existe em `mentor_profiles`, e a pessoa ficava sem a ligação do mentor.
  const estranho = 'tok_ag_xyz'
  const r = separarCarga(estranho)
  assert.equal(r.token, estranho, 'cortou um token que não era nosso')
  assert.equal(r.codigo, null)
})

caso('uma carga longa demais perde a medição e NÃO o funil', () => {
  const tokenLongo = 'b'.repeat(LIMITE_CARGA - 2)
  const carga = juntarCarga(tokenLongo, 'AG-SAAS')
  assert.equal(carga, tokenLongo, 'cortou o token para caber o código — o link deixava de funcionar')
  assert.ok(carga.length <= LIMITE_CARGA)
  assert.equal(cargaUtilizavel(tokenLongo, 'AG-SAAS'), false, 'disse que cabia e não cabe')
  assert.equal(cargaUtilizavel('lead', 'AG-SAAS'), true)
})

// ── 2. Marcar os links do bot num texto real ─────────────────────────────────────────────────────

caso('a resposta pública do funil do Instagram passa a medir — texto real de funnel.ts', () => {
  // Copiado de `lib/instagram/funnel.ts`, intenção `copytrading`, variante pública.
  const real = 'Boa! 🔥 Sinais + copytrading é aqui no nosso Telegram 👉 https://t.me/MoreThanMoney_aibot?start=lead (abre conta e tens acesso). 🚀'
  const r = marcarLinksDoBot(real, 'AG-SCANNER')
  assert.equal(r.marcados, 1)
  assert.ok(r.texto.includes('?start=lead_ag_AG_SCANNER'), r.texto)
  // E o que vem a seguir ao link não se mexeu: um parêntese comido muda a frase que a pessoa lê.
  assert.ok(r.texto.includes(' (abre conta e tens acesso). 🚀'), r.texto)
  assert.equal(separarCarga('lead_ag_AG_SCANNER').token, 'lead')
})

caso('o botão de acolhimento do grupo leva código — é o caminho para o grupo crescer medido', () => {
  // `lib/telegram-grupo-entradas.ts`: o botão é a única porta entre o grupo e a conversa.
  const r = marcarLinksDoBot('https://t.me/MoreThanMoney_aibot?start=lead', 'AG-SAAS')
  assert.equal(r.marcados, 1)
  assert.ok(START_DO_WEBHOOK.test(`/start ${separarCarga(r.texto.split('start=')[1]).token}_ag_AG_SAAS`))
})

caso('um link do bot sem ?start recebe carga e continua a abrir as boas-vindas', () => {
  const r = marcarLinksDoBot('fala comigo em t.me/MoreThanMoney_aibot', 'AG-SAAS')
  assert.equal(r.marcados, 1)
  assert.ok(r.texto.includes('t.me/MoreThanMoney_aibot?start=ag_ag_AG_SAAS'), r.texto)
  // `ag` não está no RESERVED_START e não é token de mentor: `separarCarga` devolve `ag`, a
  // procura falha, e o webhook cai nas boas-vindas — que é o que já acontecia sem código nenhum.
  assert.equal(separarCarga('ag_ag_AG_SAAS').token, 'ag')
  assert.equal(separarCarga('ag_ag_AG_SAAS').codigo, 'AG-SAAS')
})

caso('os links de CONVITE de grupo não se tocam', () => {
  // `t.me/+cVcMbCRt2rlmNzg0` e `t.me/joinchat/...` são os convites que o broker-gate liberta
  // (`lib/telegram-broker-gate.ts`). Não passam pelo bot, logo não há `start` onde pôr código —
  // e enfiar-lhe um `?start=` transformava um convite válido num link que não entra em nada.
  for (const convite of [
    'https://t.me/+cVcMbCRt2rlmNzg0',
    'https://t.me/joinchat/AbCdEfGh',
    't.me/+ue9JuMRwMv0zMGQ0',
  ]) {
    const r = marcarLinksDoBot(`entra aqui 👉 ${convite}`, 'AG-SAAS')
    assert.equal(r.marcados, 0, `marcou um convite: ${convite}`)
    assert.ok(r.texto.includes(convite), `mexeu no convite: ${convite}`)
  }
})

caso('marcar duas vezes não duplica — o repost e a reescrita passam aqui', () => {
  const uma = marcarLinksDoBot('t.me/MoreThanMoney_aibot?start=lead', 'AG-SAAS')
  const duas = marcarLinksDoBot(uma.texto, 'AG-SAAS')
  assert.equal(duas.marcados, 0, 'marcou outra vez')
  assert.equal(duas.texto, uma.texto)
  // E não se rouba o crédito a um código que já lá estava, mesmo sendo de outro agente.
  const outro = marcarLinksDoBot(uma.texto, 'AG-SCANNER')
  assert.equal(outro.marcados, 0)
  assert.ok(outro.texto.includes('AG_SAAS'), 'sobrepôs-se ao código de outro agente')
})

caso('um t.me de outra pessoa não é o nosso bot e não se confunde com um caminho', () => {
  // `instagram.com/t.me/...` e um nome que ACABA no do bot são os dois erros que o padrão do
  // conteúdo já tinha apanhado, pela porta do lado.
  const r = marcarLinksDoBot('vê em exemplo.com/t.me/MoreThanMoney_aibot', 'AG-SAAS')
  assert.equal(r.marcados, 0, 't.me dentro do caminho de outro site foi marcado')
})

// ── 3. A decisão completa ────────────────────────────────────────────────────────────────────────

caso('o follow-up do Telegram passa a medir — e é do AG-FORMACAO desde 06/10 (F4)', () => {
  // O link no FIM da frase, que é o caso em que a pontuação se cola ao código.
  const real = 'Ana, se quiseres avançar, o pack Membro está aqui 👉 https://www.morethanmoney.pt/register'
  const r = prepararMensagem({ canal: 'telegram', texto: real, funil: 'telegram:followup' })
  assert.equal(r.codigo, 'AG-FORMACAO', 'o dono do funil do follow-up não foi aplicado')
  assert.equal(r.marcados, 1)
  assert.ok(r.texto.includes('/register?ag=AG-FORMACAO'), r.texto)
})

caso('o ponto final da frase não come a atribuição', () => {
  // O caso que `lib/agentes/atribuicao.ts` documenta: o endereço acaba a frase, quem auto-liga o
  // texto leva o ponto para dentro da ligação, `ag` chega como `AG-SAAS.`, a forma falha e a
  // atribuição desaparece sem erro.
  const r = prepararMensagem({
    canal: 'telegram',
    texto: 'Começas aqui: www.morethanmoney.pt/register.',
    funil: 'telegram:followup',
  })
  assert.ok(r.texto.includes('/register?ag=AG-FORMACAO.'), r.texto)
  assert.ok(!r.texto.includes('/register.?ag='), 'pôs o código depois do ponto — 404 para quem clica')
})

caso('um funil sem dono NÃO cai no CEO', () => {
  // Desde 06/10 o setter tem dono de reserva (AG-SOCIAL); o caso sem dono passa a ser um funil
  // que ninguém declarou — esse continua a não ganhar dono por omissão.
  const r = prepararMensagem({ canal: 'instagram', texto: 'morethanmoney.pt/register', funil: 'instagram:novo-sem-dono' })
  assert.equal(r.codigo, null, 'inventou um dono para um funil que não o tem')
  assert.equal(r.motivo, 'funil_sem_agente')
  assert.ok(!r.texto.includes('?ag='), 'marcou com um código que não existe')
})

caso('06/10: o setter sem post com dono sai assinado pelo AG-SOCIAL (nenhum link sem ?ag=)', () => {
  const r = prepararMensagem({
    canal: 'instagram',
    texto: 'morethanmoney.pt/register',
    funil: 'instagram:setter',
    codigoExplicito: null,
    herancaFalhou: true,
  })
  assert.equal(r.codigo, 'AG-SOCIAL')
  assert.ok(r.texto.includes('?ag=AG-SOCIAL'), r.texto)
})

caso('06/10: o funil por palavra-chave acha o dono pelo prefixo', () => {
  const r = prepararMensagem({ canal: 'instagram', texto: 'morethanmoney.pt/register', funil: 'instagram:funil:copytrading' })
  assert.equal(r.codigo, 'AG-SOCIAL')
})

caso('06/10: o bot do Telegram assina com AG-FORMACAO', () => {
  const r = prepararMensagem({ canal: 'telegram', texto: 'Começa em t.me/MoreThanMoney_aibot?start=lead', funil: 'telegram:closer' })
  assert.equal(r.codigo, 'AG-FORMACAO')
  assert.ok(r.texto.includes('start=lead_ag_AG_FORMACAO'), r.texto)
})

caso('herdar de um post sem dono diz-se por outro nome', () => {
  // A diferença entre «este post é anterior à medição» e «este funil não tem dono» é a diferença
  // entre esperar e decidir. Um motivo só para as duas obrigava a ir ver o caso à mão.
  const r = prepararMensagem({ canal: 'instagram', texto: 'morethanmoney.pt/register', herancaFalhou: true })
  assert.equal(r.codigo, null)
  assert.equal(r.motivo, 'post_sem_dono')
})

caso('um código explícito mal formado não cai em silêncio para o funil', () => {
  const r = prepararMensagem({
    canal: 'telegram',
    texto: 'morethanmoney.pt/register',
    funil: 'telegram:followup',
    codigoExplicito: 'BLACKFRIDAY50',
  })
  assert.equal(r.codigo, null, 'um cupão de desconto passou por código de agente')
  assert.equal(r.motivo, 'codigo_invalido')
  // E não caiu no AG-FORMACAO do funil: quem passou o código acredita que atribuiu a esse agente,
  // e o crédito ia para outro sem ninguém dar por nada.
  assert.ok(!r.texto.includes('?ag='))
})

caso('o código explícito GANHA ao funil — é como o post comentado se herda', () => {
  const r = prepararMensagem({
    canal: 'telegram',
    texto: 'morethanmoney.pt/register',
    funil: 'telegram:followup',
    codigoExplicito: 'AG-SCANNER',
  })
  assert.equal(r.codigo, 'AG-SCANNER')
  assert.ok(r.texto.includes('?ag=AG-SCANNER'))
})

caso('uma mensagem com dono e SEM link nosso declara-se, não se cala', () => {
  // `lib/instagram/setter-persona.ts`: `RESERVA_FASE1_SEM_DM`. Tem dono e não mede nada — e é
  // isso que tem de ficar escrito. «AG-SAAS, 0 €» parece um agente mau; «AG-SAAS, sem link nosso
  // onde medir» é a verdade.
  const r = prepararMensagem({
    canal: 'instagram',
    texto: 'Boa pergunta! Escreve-me por privado que explico com calma. 🙌',
    codigoExplicito: 'AG-SAAS',
  })
  assert.equal(r.codigo, 'AG-SAAS')
  assert.equal(r.marcados, 0)
  assert.equal(r.motivo, 'sem_link_nosso')
})

caso('uma mensagem com os DOIS tipos de link marca os dois', () => {
  const r = prepararMensagem({
    canal: 'instagram',
    texto: 'Tens duas portas: morethanmoney.pt/register ou fala com o assistente em t.me/MoreThanMoney_aibot?start=lead',
    codigoExplicito: 'AG-SCANNER',
  })
  assert.equal(r.marcados, 2, r.texto)
  assert.ok(r.texto.includes('/register?ag=AG-SCANNER'))
  assert.ok(r.texto.includes('?start=lead_ag_AG_SCANNER'))
})

caso('links de terceiros não se tocam — podem custar comissão', () => {
  // A PU Prime é o link que paga a comissão da casa. Um parâmetro a mais pode anular o rastreio
  // de quem a paga: não se ganha medição nenhuma e pode custar dinheiro a sério.
  const real = 'Abre aqui 👉 https://www.puprime.com/campaign?cs=morethanmoney'
  const r = prepararMensagem({ canal: 'telegram', texto: real, funil: 'telegram:followup' })
  assert.equal(r.texto, real, 'mexeu no link da corretora')
  assert.equal(r.marcados, 0)
  assert.equal(r.motivo, 'sem_link_nosso')
})

console.log(`mensagem-saida: ${casos} casos, todos maus, todos travados ✓`)
