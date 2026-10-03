/**
 * Guarda do setter do Instagram. Corre com `npx tsx lib/instagram/setter-persona.check.ts`.
 *
 * O que esta guarda protege, por ordem de quanto custa se falhar:
 *
 * 1. NÃO insistir com quem disse não. É o único erro aqui que se paga com a conta da marca.
 * 2. NÃO prometer em público uma DM que a janela da Meta não deixa sair.
 * 3. NÃO voltar a escrever em brasileiro — o texto entregue vinha assim, e uma edição distraída
 *    traz isso de volta sem ninguém dar por isso.
 * 4. NÃO inventar números: os preços dos guiões têm de vir da escada, não de dentro do texto.
 *
 * Nada aqui toca na rede nem na base. Se um dia tocar, deixou de ser uma guarda.
 */

import {
  LIMITES,
  podeMandarDm,
  janelaAberta,
  termosBrasileiros,
  TERMOS_BRASILEIROS,
  classificar,
  mostraDesinteresse,
  passoSeguinte,
  ESCADA_DE_QUALIFICACAO,
  DESCRICAO_DO_PASSO,
  guiaoFase1,
  guiaoFase2,
  clienteIdeal,
  propostaValor,
  FONTES_DOS_CAMPOS,
  LINKS,
  RESERVA_FASE1_COM_DM,
  RESERVA_FASE1_SEM_DM,
  RESERVA_FASE2,
  RESERVA_ENCERRAR,
  type PassoDeQualificacao,
} from './setter-persona'
import { MEMBRO_MENSAL_EUR, MIN_DEPOSIT } from '@/lib/escada-precos'

let falhas = 0
function ok(condicao: boolean, o_que: string) {
  if (condicao) console.log(`  ok   ${o_que}`)
  else {
    console.error(`  FALHA ${o_que}`)
    falhas++
  }
}
function titulo(t: string) {
  console.log(`\n${t}`)
}

// ── 1. Os limites da plataforma ───────────────────────────────────────────────────────────────
titulo('Limites da Meta')
ok(LIMITES.PRIVATE_REPLY_DIAS === 7, 'a janela do private reply é de 7 dias')
ok(LIMITES.PRIVATE_REPLIES_POR_COMENTARIO === 1, 'uma private reply por comentário, e só uma')
ok(LIMITES.JANELA_RESPOSTA_HORAS === 24, 'a janela de resposta é de 24 horas')
ok(
  LIMITES.NOSSO_TECTO_POR_CORRIDA < LIMITES.PRIVATE_REPLIES_POR_HORA,
  'o nosso tecto por corrida fica abaixo do tecto da Meta',
)

const contaEscreve = { jaRespondidoEmPrivado: false, contaPodeEscreverSozinha: true }
ok(podeMandarDm({ ...contaEscreve, horasDesdeComentario: 1 }).pode, 'comentário de há 1 hora: a DM sai')
ok(
  podeMandarDm({ ...contaEscreve, horasDesdeComentario: 7 * 24 }).pode,
  'comentário com exactamente 7 dias: ainda dentro',
)
ok(
  podeMandarDm({ ...contaEscreve, horasDesdeComentario: 7 * 24 + 1 }).motivo === 'fora_dos_7_dias',
  'uma hora depois dos 7 dias: fora de prazo, e diz porquê',
)
ok(
  podeMandarDm({ ...contaEscreve, horasDesdeComentario: null }).motivo === 'data_desconhecida',
  'sem data do comentário trata-se como fora de prazo — nunca se arrisca a favor do envio',
)
ok(
  podeMandarDm({ ...contaEscreve, jaRespondidoEmPrivado: true, horasDesdeComentario: 1 }).motivo ===
    'ja_gastou_a_unica',
  'comentário já respondido em privado: não há segunda',
)
ok(
  podeMandarDm({ ...contaEscreve, contaPodeEscreverSozinha: false, horasDesdeComentario: 1 }).motivo ===
    'conta_nao_escreve_sozinha',
  'conta que não escreve sozinha (a pessoal do Ricardo): não sai nada',
)

ok(janelaAberta(23) && janelaAberta(24), 'janela aberta dentro das 24h')
ok(!janelaAberta(25) && !janelaAberta(null), 'janela fechada depois das 24h, e fechada sem data')

// ── 2. Desinteresse: o erro que não se pode cometer ───────────────────────────────────────────
titulo('Desinteresse — encerrar à primeira')
for (const t of [
  'não obrigado',
  'nao, obrigado',
  'não tenho interesse',
  'agora não',
  'deixa estar',
  'pára de me mandar isso',
  'isto é um golpe',
  'não me mandes mais nada',
  'não',
  'Não.',
]) {
  ok(mostraDesinteresse(t), `«${t}» é lido como desinteresse`)
}
for (const t of ['não sei se percebi', 'como é que isso funciona?', 'quanto custa o premium?']) {
  ok(!mostraDesinteresse(t), `«${t}» NÃO é desinteresse — é uma pergunta`)
}

/**
 * O caso que dá nome a esta guarda: uma recusa que contém uma palavra de venda lá dentro.
 *
 * Se o interesse fosse testado antes do desinteresse, quem escrevesse isto recebia uma DM de
 * vendas por ter dito que não queria uma.
 */
ok(
  classificar({ texto: 'não quero saber de sinais, obrigado', ehNossa: false }) === 'encerrar',
  'uma recusa com a palavra «sinais» dentro encerra — não vende',
)
ok(
  passoSeguinte('encerrar') === 'encerrar',
  'depois do encerrar não há passo seguinte: o encerrar é terminal',
)

// ── 3. Classificar comentários ────────────────────────────────────────────────────────────────
titulo('Classificação dos comentários')
ok(classificar({ texto: 'como é que entro?', ehNossa: false }) === 'setter', 'uma pergunta vai para o setter')
ok(
  classificar({ texto: 'quanto custa a mensalidade', ehNossa: false }) === 'setter',
  'interesse sem sinal de pergunta também vai',
)
ok(classificar({ texto: '🔥🔥🔥', ehNossa: false }) === 'ignorar', 'emojis sozinhos: ignora (o engage agradece)')
ok(classificar({ texto: 'top', ehNossa: false }) === 'ignorar', 'elogio curto: ignora')
ok(classificar({ texto: '', ehNossa: false }) === 'ignorar', 'comentário vazio (GIF/sticker): ignora')
ok(
  classificar({ texto: 'como é que entro?', ehNossa: true }) === 'ignorar',
  'um comentário de uma conta nossa nunca é um lead',
)

// ── 4. A escada, um degrau de cada vez ────────────────────────────────────────────────────────
titulo('Escada de qualificação')
ok(ESCADA_DE_QUALIFICACAO[0] === 'entrega', 'a escada começa por ENTREGAR, não por perguntar')
ok(
  ESCADA_DE_QUALIFICACAO[ESCADA_DE_QUALIFICACAO.length - 1] === 'fecho',
  'a escada acaba no fecho',
)
let passo: PassoDeQualificacao = 'entrega'
const percorrido: PassoDeQualificacao[] = [passo]
for (let i = 0; i < 10 && passo !== 'fecho'; i++) {
  passo = passoSeguinte(passo)
  percorrido.push(passo)
}
ok(passo === 'fecho', 'percorrer a escada chega ao fecho sem ciclos')
ok(
  percorrido.length === ESCADA_DE_QUALIFICACAO.length,
  `a escada não salta degraus (${percorrido.join(' → ')})`,
)
ok(passoSeguinte('fecho') === 'fecho', 'o fecho não avança para lado nenhum sozinho')

/** Uma pergunta por mensagem: nenhuma descrição de passo pode pedir duas coisas. */
for (const [p, d] of Object.entries(DESCRICAO_DO_PASSO)) {
  const perguntas = (d.match(/\?/g) ?? []).length
  ok(perguntas <= 1, `o passo «${p}» pede no máximo uma pergunta (tem ${perguntas})`)
}
ok(
  DESCRICAO_DO_PASSO.conta_corretora.toLowerCase().includes('não perguntes quanto'),
  'o passo da corretora proíbe explicitamente perguntar quanto dinheiro a pessoa tem',
)

// ── 5. Português de Portugal ──────────────────────────────────────────────────────────────────
titulo('Português de Portugal')
ok(termosBrasileiros('que massa, vê no celular').length === 2, 'o detector apanha os termos brasileiros')
ok(termosBrasileiros('dá uma olhada lá').length === 1, 'apanha também as expressões de duas palavras')
ok(termosBrasileiros('boa! vê no telemóvel').length === 0, 'o texto certo passa limpo')

const TODOS_OS_TEXTOS: [string, string][] = [
  ['guião fase 1 (com DM)', guiaoFase1(true)],
  ['guião fase 1 (sem DM)', guiaoFase1(false)],
  ...ESCADA_DE_QUALIFICACAO.map((p): [string, string] => [`guião fase 2 (${p})`, guiaoFase2(p)]),
  ['cliente ideal', clienteIdeal()],
  ['proposta de valor', propostaValor()],
  ['reserva fase 1 com DM', RESERVA_FASE1_COM_DM],
  ['reserva fase 1 sem DM', RESERVA_FASE1_SEM_DM],
  ['reserva fase 2', RESERVA_FASE2],
  ['reserva encerrar', RESERVA_ENCERRAR],
]
for (const [nome, texto] of TODOS_OS_TEXTOS) {
  const achados = termosBrasileiros(texto)
  ok(achados.length === 0, `${nome}: zero brasileirismos${achados.length ? ` (${achados.join(', ')})` : ''}`)
}
ok(TERMOS_BRASILEIROS.length >= 10, 'a lista de termos cobre mais do que os quatro do texto entregue')

// ── 6. Nada de promessas nem de números inventados ────────────────────────────────────────────
titulo('Promessas e números')
/**
 * Os guiões e os textos de reserva medem-se de maneiras OPOSTAS, e a primeira versão desta guarda
 * media-os da mesma — falhava nos oito guiões por eles conterem a palavra «garantido» dentro da
 * própria proibição. O erro estava na asserção, não no texto.
 *
 * · Um GUIÃO é uma instrução para um modelo: TEM de falar de lucro garantido, para o proibir.
 * · Uma RESERVA é o que sai para a pessoa: não pode ter a palavra em lado nenhum.
 */
const TEXTOS_QUE_SAEM: [string, string][] = [
  ['reserva fase 1 com DM', RESERVA_FASE1_COM_DM],
  ['reserva fase 1 sem DM', RESERVA_FASE1_SEM_DM],
  ['reserva fase 2', RESERVA_FASE2],
  ['reserva encerrar', RESERVA_ENCERRAR],
  ['cliente ideal', clienteIdeal()],
  ['proposta de valor', propostaValor()],
]
for (const [nome, texto] of TEXTOS_QUE_SAEM) {
  const t = texto.toLowerCase()
  ok(!/garantid|lucro|rentabilidade/.test(t), `${nome}: não fala de lucro nem de garantias`)
  ok(!/\d+\s*(%|€|\$)/.test(texto), `${nome}: não traz um único número de dinheiro`)
}
const GUIOES: [string, string][] = [
  ['guião fase 1 (com DM)', guiaoFase1(true)],
  ['guião fase 1 (sem DM)', guiaoFase1(false)],
  ...ESCADA_DE_QUALIFICACAO.map((p): [string, string] => [`guião fase 2 (${p})`, guiaoFase2(p)]),
]
for (const [nome, texto] of GUIOES) {
  ok(/NUNCA prometas lucro/.test(texto), `${nome}: carrega a proibição de prometer lucro`)
  ok(/NUNCA inventes/.test(texto), `${nome}: carrega a proibição de inventar números`)
  ok(
    /PRIMEIRA demonstração de desinteresse/.test(texto),
    `${nome}: carrega a regra de encerrar à primeira recusa`,
  )
}
ok(
  guiaoFase1(true).toLowerCase().includes('proibido em público') &&
    /preços/i.test(guiaoFase1(true)),
  'o guião público proíbe preços em público',
)
/**
 * Os preços do guião de fecho têm de VIR da escada, não estar escritos dentro do texto.
 *
 * É o incidente dos 300$/350$ outra vez: cinco guiões com o número escrito à mão e um deles a
 * anunciar o antigo meses depois. Esta asserção quebra se alguém colar aqui um número.
 */
ok(
  DESCRICAO_DO_PASSO.fecho.includes(`${MEMBRO_MENSAL_EUR}`) &&
    DESCRICAO_DO_PASSO.fecho.includes(`${MIN_DEPOSIT}`),
  'o guião de fecho traz os números da escada de preços (não os tem escritos à mão)',
)

// ── 7. Os campos que estavam por preencher ────────────────────────────────────────────────────
titulo('Campos preenchidos, com fonte')
for (const [campo, fonte] of Object.entries(FONTES_DOS_CAMPOS)) {
  ok(fonte.includes('lib/'), `o campo «${campo}» aponta para o ficheiro de onde veio`)
}
for (const [nome, url] of Object.entries(LINKS)) {
  ok(/^https:\/\/(www\.morethanmoney\.pt|t\.me)\//.test(url), `o link «${nome}» é nosso e é o que o funil já usa`)
}

// ── Resultado ─────────────────────────────────────────────────────────────────────────────────
console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`)
process.exit(falhas === 0 ? 0 : 1)
