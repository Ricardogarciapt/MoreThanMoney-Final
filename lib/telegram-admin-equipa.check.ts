/**
 * GUARDA da equipa, dos papéis e das comissões no bot.
 *
 * O QUE ESTE TESTE TRAVA — e porque é que cada coisa está aqui:
 *
 *  1. UM CHAT NÃO-ADMIN NÃO CHEGA A NADA. É o buraco que já se tapou uma vez: até 24/09, quem
 *     escrevesse `/admin` ao bot ficava gravado como aprovador e via o painel todo. Este teste
 *     prova três coisas de uma vez — que `ehChatDeAdmin` só aceita `TELEGRAM_ADMIN_CHAT_ID`, que o
 *     que está gravado em `site_settings` NÃO dá acesso, e que `handleAdminAction` verifica a porta
 *     ANTES de olhar para o botão. E prova, lendo o ficheiro, que nenhuma escrita da equipa aceita
 *     um `chatId`: todas exigem uma `Porta`, que só se obtém do outro lado de `abrirPorta`.
 *
 *  2. NADA PAGA SOZINHO. O bot decide entre `aprovada` e `cancelada` e mais nada. Se alguém
 *     acrescentar `paga` a `ESTADOS_QUE_O_BOT_DECIDE`, ou escrever `paga_em`/`paga_por` no módulo
 *     de acções, isto falha — um extracto que diz «pago» sobre dinheiro que nunca saiu é a pior
 *     mentira que este sistema pode contar.
 *
 *  3. O SEGUNDO TOQUE DIZ O VALOR E O NOME. Regra do dono, por palavras dele. Uma confirmação que
 *     diga só «confirmas?» é tão má como não ter confirmação nenhuma.
 *
 *  4. OS BOTÕES CABEM NO TELEGRAM. O `callback_data` tem um limite de 64 bytes, e um botão que o
 *     passa é um botão que o Telegram cala sem erro nenhum — o toque não faz nada e ninguém
 *     percebe porquê. Foi por isso que os papéis e os planos passaram a códigos de uma letra.
 *
 *  5. TODAS AS ESCRITAS SÃO AUDITADAS. Uma função de escrita que não passe por `comRegisto` é uma
 *     decisão sobre dinheiro sem autor nem data.
 *
 *   npx tsx lib/telegram-admin-equipa.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAPEIS, type Papel } from './backoffice-papeis'
import {
  ESTADOS_QUE_O_BOT_DECIDE,
  PAPEL_CODIGO,
  PLANO_CODIGO,
  confirmacaoComissao,
  confirmacaoPapel,
  confirmacaoPlano,
  eur,
  papelDoCodigo,
  planoDoCodigo,
  tecladoComissao,
  tecladoEquipa,
  tecladoPessoa,
  textoComissoesResumo,
  textoEquipa,
  textoMlm,
  textoPipeline,
  type ComissaoPendente,
  type PessoaDaEquipa,
} from './telegram-admin-equipa'

const RAIZ = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const ACOES = ler('lib/telegram-admin-equipa-acoes.ts')
const LEITURAS = ler('lib/telegram-admin-equipa.ts')
const MENU = ler('lib/telegram-admin-menu.ts')

/**
 * O CÓDIGO sem os comentários.
 *
 * Os dois módulos EXPLICAM, em português, que nunca mostram passwords nem tokens — e era
 * precisamente essa frase que fazia o teste das credenciais falhar. Um teste que obrigue a apagar a
 * explicação para passar está a proibir a coisa errada: o que não pode existir é a LEITURA de uma
 * credencial, não a promessa de não a ler.
 */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const COMISSAO: ComissaoPendente = {
  id: '11111111-2222-3333-4444-555555555555',
  beneficiarioId: '66666666-7777-8888-9999-aaaaaaaaaaaa',
  quem: 'Joana Exemplo',
  papel: 'closer',
  valorCents: 12_345,
  moeda: 'EUR',
  pct: 20,
  pack: 'premium',
  referencia: 'cs_test_123',
  criadoIso: new Date(Date.now() - 3 * 86_400_000).toISOString(),
}

const PESSOA: PessoaDaEquipa = {
  userId: '66666666-7777-8888-9999-aaaaaaaaaaaa',
  nome: 'Joana Exemplo',
  email: 'joana@exemplo.pt',
  papeis: ['closer'],
  plano: 'padrao',
  desdeIso: new Date(Date.now() - 40 * 86_400_000).toISOString(),
}

// ════════════════ 1. SÓ O ADMIN CHEGA AQUI ════════════════
//
// A prova de quem manda é lida no código, não no ambiente: um teste que exportasse
// TELEGRAM_ADMIN_CHAT_ID para se testar a si mesmo provava o contrário do que interessa.
{
  const menuFonte = ler('lib/telegram-admin-menu.ts')
  // `ehChatDeAdmin` compara com o AMBIENTE e mais nada. Se voltar a aceitar `site_settings`, o
  // buraco de 24/09 reabre — qualquer chat gravado passava a ter o painel.
  const corpo = menuFonte.match(/export async function ehChatDeAdmin[\s\S]*?\n}/)?.[0] ?? ''
  sim('ehChatDeAdmin existe', corpo.length > 0)
  sim('ehChatDeAdmin compara com o ambiente', /chatDeAdminDoAmbiente\(\)/.test(corpo))
  sim('ehChatDeAdmin NÃO lê o chat gravado em site_settings', !/chatDeAdminGravado/.test(corpo))
  sim('ehChatDeAdmin recusa chat vazio', /chatId == null\) return false/.test(corpo))

  // O painel verifica a porta ANTES de olhar para o botão. A ordem importa: se um `if` de um botão
  // corresse primeiro, esse botão respondia a qualquer pessoa.
  const handler = menuFonte.indexOf('export async function handleAdminAction')
  const guarda = menuFonte.indexOf('if (!(await ehChatDeAdmin(supabase, chatId)))', handler)
  const primeiroEq = menuFonte.indexOf("action.startsWith('cm?')", handler)
  sim('handleAdminAction verifica a porta', guarda > handler)
  sim('a porta é verificada ANTES dos botões da equipa', guarda > 0 && primeiroEq > guarda)

  // As acções da equipa vivem todas DEPOIS dessa guarda, no mesmo corpo de função.
  for (const marca of ["startsWith('cm?')", "startsWith('pp?')", "startsWith('pl?')", "startsWith('eq_p:')"]) {
    sim(`o botão ${marca} vive depois da guarda`, menuFonte.indexOf(marca, guarda) > guarda)
  }
}

// Nenhuma escrita aceita um chat. Todas exigem uma `Porta` — o tipo que só sai de `abrirPorta`.
{
  const assinaturas = [...ACOES.matchAll(/export async function (\w+)\(([^)]*)\)/g)]
  sim('há escritas exportadas para testar', assinaturas.length >= 3)
  for (const [, nome, args] of assinaturas) {
    sim(`${nome} recebe uma Porta como 1.º argumento`, /^\s*porta:\s*Porta\b/.test(args))
    sim(`${nome} não aceita um chatId`, !/chatId/i.test(args))
  }
  // E o `!` (o toque que faz) nunca corre sem abrir a porta primeiro.
  for (const acto of ['cm!', 'pp!', 'pl!']) {
    const bloco = MENU.slice(MENU.indexOf(`action.startsWith('${acto}')`))
    const abre = bloco.indexOf('await abrirPorta(supabase, chatId)')
    const escreve = bloco.search(/decidirComissao|mexerPapel|mudarPlano/)
    sim(`${acto} abre a porta antes de escrever`, abre > 0 && escreve > abre)
  }
}

// ════════════════ 2. NADA PAGA SOZINHO ════════════════
{
  sim('o bot só decide aprovada/cancelada', [...ESTADOS_QUE_O_BOT_DECIDE].join(',') === 'aprovada,cancelada')
  sim('«paga» não é uma decisão do bot', !(ESTADOS_QUE_O_BOT_DECIDE as readonly string[]).includes('paga'))
  // O caminho de escrita não toca nas colunas do pagamento. Escrevê-las era declarar pago o que
  // não saiu de conta nenhuma.
  sim('as acções não escrevem paga_em', !/paga_em\s*:/.test(ACOES))
  sim('as acções não escrevem paga_por', !/paga_por\s*:/.test(ACOES))
  sim('as acções não escrevem pagamento_ref', !/pagamento_ref\s*:/.test(ACOES))
  sim("as acções não gravam estado 'paga'", !/estado:\s*'paga'/.test(ACOES))
  // E diz-se em voz alta a quem aprova, para ninguém ficar à espera de uma transferência que o bot
  // não fez.
  const q = confirmacaoComissao({ decisao: 'aprovada', c: COMISSAO })
  sim('a aprovação avisa que não paga', /NÃO paga nada/.test(q.texto))
  sim('o resumo avisa que aprovar não paga', /Aprovar NÃO paga/.test(textoComissoesResumo({ quantas: 2, totalCents: 500 })))
}

// ════════════════ 3. DOIS TOQUES, COM VALOR E NOME ════════════════
{
  const botoes = tecladoComissao(COMISSAO, [{ text: '⬅️', callback_data: 'admin:menu' }])
  const primeiros = botoes.inline_keyboard[0].map((b) => String(b.callback_data))
  sim('o primeiro toque só PERGUNTA', primeiros.every((d) => d.includes('cm?')))
  sim('o primeiro toque nunca é um !', primeiros.every((d) => !d.includes('cm!')))

  for (const decisao of ESTADOS_QUE_O_BOT_DECIDE) {
    const c = confirmacaoComissao({ decisao, c: COMISSAO })
    sim(`${decisao}: a pergunta diz o VALOR`, c.texto.includes('123,45') || c.texto.includes('123.45'))
    sim(`${decisao}: a pergunta diz o NOME de quem recebe`, c.texto.includes('Joana Exemplo'))
    sim(`${decisao}: o sim leva a um !`, String(c.teclado.inline_keyboard[0][0].callback_data).includes('cm!'))
    sim(`${decisao}: o sim nunca é um ?`, !String(c.teclado.inline_keyboard[0][0].callback_data).includes('?'))
    sim(`${decisao}: o não volta atrás`, c.teclado.inline_keyboard[1][0].callback_data === 'admin:eq_com')
    sim(`${decisao}: há dois botões e não mais`, c.teclado.inline_keyboard.flat().length === 2)
  }

  // Papéis e planos são a porta do backoffice e o rendimento de alguém: mesma regra.
  for (const papel of PAPEIS) {
    for (const dar of [true, false]) {
      const c = confirmacaoPapel({ dar, papel, quem: 'Joana Exemplo', userId: PESSOA.userId })
      sim(`papel ${papel}/${dar ? 'dar' : 'retirar'}: diz o nome`, c.texto.includes('Joana Exemplo'))
      sim(`papel ${papel}/${dar ? 'dar' : 'retirar'}: o sim é um !`, String(c.teclado.inline_keyboard[0][0].callback_data).includes('pp!'))
    }
  }
  const cp = confirmacaoPlano({ plano: 'afiliado_legado_50', quem: 'Joana Exemplo', userId: PESSOA.userId, planoActual: 'padrao' })
  sim('plano: diz o nome', cp.texto.includes('Joana Exemplo'))
  sim('plano: diz de onde e para onde', cp.texto.includes('padrao') && cp.texto.includes('afiliado_legado_50'))
  sim('plano: o sim é um !', String(cp.teclado.inline_keyboard[0][0].callback_data).includes('pl!'))
  sim('plano: avisa que não recalcula o passado', /não recalcula/i.test(cp.texto))
}

// ════════════════ 4. OS BOTÕES CABEM NOS 64 BYTES ════════════════
{
  const medir = (d: string) => Buffer.byteLength(`admin:${d}`, 'utf8')
  const todos: string[] = []
  const recolher = (t: { inline_keyboard: Array<Array<{ callback_data?: string }>> }) => {
    for (const linha of t.inline_keyboard) for (const b of linha) if (b.callback_data) todos.push(b.callback_data)
  }
  recolher(tecladoEquipa([{ text: '⬅️', callback_data: 'admin:menu' }]))
  recolher(tecladoComissao(COMISSAO, [{ text: '⬅️', callback_data: 'admin:menu' }]))
  recolher(tecladoPessoa({ ...PESSOA, papeis: [...PAPEIS] }, [{ text: '⬅️', callback_data: 'admin:menu' }]))
  for (const papel of PAPEIS) {
    for (const dar of [true, false]) {
      recolher(confirmacaoPapel({ dar, papel, quem: 'x', userId: PESSOA.userId }).teclado)
    }
  }
  for (const plano of Object.values(PLANO_CODIGO)) {
    recolher(confirmacaoPlano({ plano, quem: 'x', userId: PESSOA.userId, planoActual: 'padrao' }).teclado)
  }
  recolher(confirmacaoComissao({ decisao: 'aprovada', c: COMISSAO }).teclado)
  const grandes = todos.filter((d) => medir(d) > 64 || (d.startsWith('admin:') && Buffer.byteLength(d, 'utf8') > 64))
  sim(`nenhum callback_data passa os 64 bytes (${todos.length} testados)`, grandes.length === 0)
  if (grandes.length) falhas.push(`grandes: ${grandes.join(', ')}`)

  // Os códigos de uma letra têm de ser reversíveis, senão um botão manda no papel errado.
  sim('cada papel tem um código único', new Set(Object.values(PAPEL_CODIGO)).size === PAPEIS.length)
  for (const papel of PAPEIS) sim(`o código de ${papel} volta a ${papel}`, papelDoCodigo(PAPEL_CODIGO[papel]) === papel)
  sim('um código desconhecido não dá papel', papelDoCodigo('z') === null)
  sim('um código desconhecido não dá plano', planoDoCodigo('z') === null)
  sim('o plano legado tem código', planoDoCodigo('l') === 'afiliado_legado_50')
  sim('o plano padrão tem código', planoDoCodigo('p') === 'padrao')

  // E o painel tem de saber ler exactamente os códigos que os teclados escrevem.
  for (const codigo of Object.values(PAPEL_CODIGO)) {
    sim(`o painel aceita o código de papel «${codigo}»`, /\[ascrt\]/.test(MENU) && 'ascrt'.includes(codigo))
  }
  sim('o painel aceita os dois códigos de plano', /\[lp\]/.test(MENU))
}

// ════════════════ 5. TODAS AS ESCRITAS SÃO AUDITADAS ════════════════
{
  const nomes = [...ACOES.matchAll(/export async function (\w+)\(/g)].map((m) => m[1])
  sim('as três escritas existem', ['decidirComissao', 'mexerPapel', 'mudarPlano'].every((n) => nomes.includes(n)))
  for (const nome of nomes) {
    const inicio = ACOES.indexOf(`export async function ${nome}(`)
    const fim = ACOES.indexOf('\nexport async function ', inicio + 1)
    const corpo = ACOES.slice(inicio, fim === -1 ? undefined : fim)
    sim(`${nome} passa por comRegisto`, /comRegisto\(/.test(corpo))
    sim(`${nome} assina com a identidade da porta`, /porta\.admin(Id|Email)/.test(corpo))
  }
  // O envelope tem de vir da porta e não de uma cópia local: é ele que recusa agir sem registo.
  sim('comRegisto vem da porta', /from '@\/lib\/telegram-admin-porta'/.test(ACOES))
  // Retirar um papel não apaga a linha — o histórico é a prova do que foi prometido a alguém.
  sim('retirar papel marca retirado_at', /retirado_at:\s*new Date\(\)/.test(ACOES))
  sim('nada faz delete na equipa', !/\.delete\(\)/.test(ACOES))
}

// ════════════════ 6. NADA DE CREDENCIAIS NAS MENSAGENS ════════════════
{
  // Estas leituras só pedem colunas de pessoas, papéis e dinheiro. Um `select('*')` era a forma
  // mais fácil de um dia arrastar para uma mensagem uma coluna que não devia sair da base.
  sim('as leituras não fazem select(*)', !/\.select\('\*'\)/.test(LEITURAS))
  sim('as acções não fazem select(*)', !/\.select\('\*'\)/.test(ACOES))
  const leiturasCodigo = semComentarios(LEITURAS)
  const acoesCodigo = semComentarios(ACOES)
  for (const proibido of ['password', 'token', 'secret', 'api_key', 'investor_pass']) {
    sim(`as leituras não tocam em ${proibido}`, !new RegExp(proibido, 'i').test(leiturasCodigo))
    sim(`as acções não tocam em ${proibido}`, !new RegExp(proibido, 'i').test(acoesCodigo))
  }
}

// ════════════════ 7. OS TEXTOS AGUENTAM O VAZIO ════════════════
//
// A primeira vez que ele abrir isto não há equipa, não há negócios e não há comissões. Um texto
// que rebente com listas vazias transforma o primeiro uso do painel num erro.
{
  sim('equipa vazia responde', textoEquipa([]).includes('Ninguém'))
  sim('pipeline vazio responde', textoPipeline({ porEstado: {}, total: 0, parados: [] }).includes('Ainda não há'))
  sim('comissões vazias responde', textoComissoesResumo({ quantas: 0, totalCents: 0 }).includes('Nada por aprovar'))
  sim('MLM vazio responde', textoMlm({ nos: 0, porRank: [], porPlano: {}, comissoesPorEstado: {}, pendentesCents: 0 }).includes('0 nó'))
  // E um nome com `<` não parte a mensagem toda (o Telegram fala HTML).
  sim(
    'um nome com HTML é escapado',
    textoEquipa([{ ...PESSOA, nome: '<b>mau</b>' }]).includes('&lt;b&gt;mau&lt;/b&gt;'),
  )
  sim('cêntimos mostram-se como euros', eur(12_345).includes('123,45'))
}

// ════════════════ 8. O PAINEL EXPÕE ISTO ════════════════
{
  sim('o painel tem o botão da equipa', /callback_data: 'admin:eq'/.test(MENU))
  for (const caso of ['eq_equipa', 'eq_pipe', 'eq_com', 'eq_mlm', 'eq_papeis']) {
    sim(`o painel trata «${caso}»`, new RegExp(`case '${caso}'`).test(MENU))
  }
}

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) da equipa no bot partida(s)`)
console.log(`✅ equipa/MLM no bot: ${ok} verificações passaram`)
