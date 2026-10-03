/**
 * AS GUARDAS DO ENVIO POR WHATSAPP.
 *
 * Isto decide A QUEM SE ESCREVE e COMO. Se estiver errado em silêncio não se corrige com um deploy:
 * as mensagens já saíram, as pessoas já denunciaram, e um número de WhatsApp Business marcado como
 * spam pela Meta não se recupera a pedir com jeitinho. É o mesmo raciocínio das guardas do
 * consentimento por email — a forma destes testes é «tenta passar e falha», não «confirma que
 * funciona».
 *
 * Nenhum destes testes toca na rede nem na base. Tudo o que aqui está é função pura, de propósito:
 * é isso que permite provar a regra sem existirem credenciais, e sem sair uma única mensagem real.
 *
 *   npx tsx lib/whatsapp-envio.check.ts
 */
import assert from 'node:assert/strict'
import { PONTOS_DE_CAPTURA } from './captacao-consentimento'
import {
  JANELA_MS,
  ORIGEM_POR_CONVERSA_VALE_MS,
  corpoParaCloudApi,
  decidirEnvio,
  estadoDaJanela,
  mesmoNumero,
  normalizarE164,
  variantesDoNumero,
  type EstadoDoContacto,
  type Finalidade,
  type Pedido,
} from './whatsapp-envio'

const AGORA = Date.parse('2026-09-27T12:00:00Z')
const hHoras = (n: number) => new Date(AGORA - n * 3_600_000).toISOString()
const hDias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

function estado(e: Partial<EstadoDoContacto> = {}): EstadoDoContacto {
  return { baseLegal: null, retirou: false, canal: null, ultimaEntradaIso: hHoras(1), ...e }
}
function pedido(p: Partial<Pedido> = {}): Pedido {
  return { para: '+351912345678', tipo: 'texto', finalidade: 'resposta', ...p }
}

// ── 1. NÚMEROS: o mesmo humano escrito de seis maneiras ──────────────────────────────────────────

/**
 * Este bloco é o que impede a mesma pessoa de existir duas vezes. Duas linhas para o mesmo número
 * têm duas consequências concretas: ela recebe a mesma mensagem duas vezes (o caminho mais curto
 * para ser denunciada), e o consentimento que deu numa escrita não é encontrado quando se procura
 * pela outra — logo é tratada como quem nunca deu nada.
 */
const MESMA_PESSOA = ['+351912345678', '351912345678', '912345678', '00351912345678', '+351 912 345 678', '(351) 912-345-678']
for (const forma of MESMA_PESSOA) {
  const { e164, porque } = normalizarE164(forma)
  assert.equal(e164, '+351912345678', `"${forma}" tinha de dar +351912345678 (deu ${e164} — ${porque})`)
}
for (const a of MESMA_PESSOA) {
  for (const b of MESMA_PESSOA) {
    assert.ok(mesmoNumero(a, b), `"${a}" e "${b}" são a mesma pessoa`)
  }
}

// O formato que a Meta manda no webhook (internacional, sem `+`) é o caso mais importante de todos:
// é por aqui que entram todas as conversas reais.
assert.equal(normalizarE164('351912345678').e164, '+351912345678')

// Números de outros países não são «corrigidos» para Portugal. O indicativo por omissão só se aplica
// a um nacional de 9 dígitos; inventar um país para o resto era criar contactos que não existem.
assert.equal(normalizarE164('+34600123456').e164, '+34600123456', 'espanhol fica espanhol')
assert.equal(normalizarE164('+5511987654321').e164, '+5511987654321', 'brasileiro fica brasileiro')
assert.ok(!mesmoNumero('+351912345678', '+34912345678'), 'mesmo dígito a dígito, países diferentes = pessoas diferentes')

// O que NÃO passa. Um número inventado é pior do que um número em falta: um está errado em silêncio,
// o outro salta à vista.
for (const lixo of ['', '   ', 'não tem', '12345', '+3519123456789012345', '0912345678']) {
  const r = normalizarE164(lixo)
  assert.equal(r.e164, null, `"${lixo}" não é um número (deu ${r.e164})`)
  assert.ok(r.porque.length > 5, `a recusa de "${lixo}" tem de dizer porquê`)
}

// As variantes servem para procurar no livro, onde a coluna `telefone` é texto livre: procurar só
// pelo E.164 era declarar «não deu consentimento» a quem deu.
const v = variantesDoNumero('+351912345678')
for (const esperada of ['+351912345678', '351912345678', '912345678', '00351912345678']) {
  assert.ok(v.includes(esperada), `faltava a variante ${esperada} na procura no livro`)
}

// ── 2. A JANELA: mede-se pela mensagem DELA ──────────────────────────────────────────────────────

assert.equal(JANELA_MS, 24 * 60 * 60 * 1000, 'a janela da Meta é de 24 horas e não é nossa para mudar')

assert.ok(estadoDaJanela(hHoras(1), AGORA).aberta, 'escreveu há 1h → aberta')
assert.ok(estadoDaJanela(hHoras(23.9), AGORA).aberta, 'escreveu há 23h54 → ainda aberta')
assert.ok(!estadoDaJanela(hHoras(24.1), AGORA).aberta, 'escreveu há mais de 24h → fechada')
assert.ok(!estadoDaJanela(null, AGORA).aberta, 'nunca escreveu → não há janela para abrir')

/**
 * Uma data ilegível trata-se como janela FECHADA. O erro conservador manda um template aprovado; o
 * erro optimista manda texto livre que a Meta recusa. Entre os dois não há dúvida sobre qual escolher.
 */
assert.ok(!estadoDaJanela('não é uma data', AGORA).aberta, 'data ilegível → tratar como fechada')

// Toda a recusa diz porquê. Uma janela fechada sem explicação é um silêncio que ninguém consegue
// depurar no dia seguinte.
assert.ok(estadoDaJanela(null, AGORA).porque.length > 10)
assert.ok(estadoDaJanela(hHoras(30), AGORA).porque.includes('30h'), 'dizer há quanto tempo foi, não só que fechou')

// ── 3. TEXTO LIVRE FORA DA JANELA: a recusa que mais vale ────────────────────────────────────────

/**
 * Este é o teste que justifica todo o ficheiro. O envio antigo mandava SEMPRE `type: 'text'` e
 * engolia o erro num `.catch(() => {})`. Fora da janela a Meta recusa texto livre — logo, cada
 * tentativa era um pedido falhado invisível, a acumular no mesmo número.
 */
const foraDaJanela = estado({ ultimaEntradaIso: hHoras(30), baseLegal: 'consentimento', canal: 'whatsapp' })
const dTexto = decidirEnvio(pedido({ finalidade: 'servico' }), foraDaJanela, AGORA)
assert.equal(dTexto.pode, false, 'texto livre fora da janela NÃO pode ser tentado')
assert.equal(dTexto.codigo, 'fora_da_janela_exige_template')
assert.ok(/template/i.test(dTexto.porque), 'a recusa tem de dizer o que fazer em vez: template')
assert.equal(dTexto.exigeTemplate, true, 'quem chama usa isto para escolher o corpo')

// O mesmo caso, com template, passa — é para isso que os templates existem.
const dTemplate = decidirEnvio(
  pedido({ tipo: 'template', templateNome: 'mtm_aviso_sessao', finalidade: 'servico' }),
  foraDaJanela,
  AGORA,
)
assert.equal(dTemplate.pode, true, 'template fora da janela é o caminho aprovado')

// Template sem nome não existe do lado da Meta.
assert.equal(
  decidirEnvio(pedido({ tipo: 'template', templateNome: '  ', finalidade: 'servico' }), foraDaJanela, AGORA).codigo,
  'template_sem_nome',
)

// Dentro da janela, texto livre passa. Se este teste falhar, o funil fica mudo a responder a quem
// acabou de escrever — que é a falha oposta, e também custa leads.
assert.equal(decidirEnvio(pedido(), estado({ ultimaEntradaIso: hHoras(2) }), AGORA).pode, true)

// ── 4. CONSENTIMENTO: o silêncio é não ───────────────────────────────────────────────────────────

/**
 * Um número sem origem conhecida não se usa. «Está na base» é de onde veio o número, não é permissão
 * para o usar — e é esta a distinção que separa uma lista de um problema.
 */
const semOrigem = estado({ ultimaEntradaIso: null, baseLegal: null })
for (const finalidade of ['resposta', 'servico', 'campanha'] as Finalidade[]) {
  const d = decidirEnvio(pedido({ tipo: 'template', templateNome: 'mtm_boas_vindas', finalidade }), semOrigem, AGORA)
  assert.equal(d.pode, false, `${finalidade}: sem origem conhecida não se envia`)
  assert.equal(d.codigo, 'sem_origem', `${finalidade}: a recusa tem de ser "sem_origem"`)
}
assert.match(
  decidirEnvio(pedido({ tipo: 'template', templateNome: 'x', finalidade: 'servico' }), semOrigem, AGORA).porque,
  /silêncio é não/i,
  'a recusa por falta de consentimento diz a regra, para quem a lê no registo não a discutir',
)

// `base_legal: 'sem_base'` é uma linha no livro a dizer exactamente que a pessoa nunca pediu nada.
// Contá-la como origem era transformar o registo da ausência de permissão em permissão.
assert.equal(
  decidirEnvio(
    pedido({ tipo: 'template', templateNome: 'x', finalidade: 'servico' }),
    estado({ ultimaEntradaIso: null, baseLegal: 'sem_base' }),
    AGORA,
  ).codigo,
  'sem_origem',
  '"sem_base" é o registo de que ela nunca pediu nada — não é origem',
)

/**
 * RETIRAR GANHA A TUDO, E É O PRIMEIRO TESTE DE TODOS.
 *
 * Mandar outra vez a quem pediu para não receber mais é a única falha desta lista que não se corrige
 * com um pedido de desculpa. Ganha à janela aberta, ao consentimento anterior, a ser cliente, e ganha
 * mesmo quando o número está mal escrito — porque a ordem dos testes também é contrato.
 */
for (const e of [
  estado({ retirou: true }),
  estado({ retirou: true, baseLegal: 'consentimento', ultimaEntradaIso: hHoras(1) }),
  estado({ retirou: true, baseLegal: 'relacao_contratual' }),
]) {
  for (const finalidade of ['resposta', 'servico', 'campanha'] as Finalidade[]) {
    const d = decidirEnvio(pedido({ finalidade }), e, AGORA)
    assert.equal(d.pode, false, `retirou + ${finalidade} → não se envia`)
    assert.equal(d.codigo, 'retirou', 'o "retirou" vem antes de tudo o resto')
  }
}
assert.equal(decidirEnvio(pedido({ para: 'lixo' }), estado({ retirou: true }), AGORA).codigo, 'retirou')

// Número inválido, com origem legítima: recusa por número e não por consentimento. A razão certa
// importa — é ela que diz se se corrige o número ou se se pede permissão.
assert.equal(decidirEnvio(pedido({ para: '12345' }), estado(), AGORA).codigo, 'numero_invalido')

// ── 5. CAMPANHA: a janela aberta não é licença para vender ───────────────────────────────────────

/**
 * A tentação, daqui a um mês, vai ser esta: «ela está a falar comigo agora, aproveito e mando a
 * promoção». A janela aberta é permissão da META para responder; não é permissão DA PESSOA para
 * receber campanhas. Ela escreveu uma dúvida, não se inscreveu numa lista.
 */
const janelaAbertaSemConsentimento = estado({ ultimaEntradaIso: hHoras(1), baseLegal: null })
const dCampanha = decidirEnvio(pedido({ finalidade: 'campanha' }), janelaAbertaSemConsentimento, AGORA)
assert.equal(dCampanha.pode, false, 'campanha com janela aberta mas sem consentimento → não')
assert.equal(dCampanha.codigo, 'campanha_sem_consentimento')

// Ser cliente não é ter pedido campanhas. É a mesma fronteira de `podeReceber` nos emails.
const dCliente = decidirEnvio(
  pedido({ finalidade: 'campanha' }),
  estado({ baseLegal: 'relacao_contratual', ultimaEntradaIso: hHoras(1) }),
  AGORA,
)
assert.equal(dCliente.pode, false, 'cliente ≠ consentiu campanhas')
assert.match(dCliente.porque, /ser cliente não é/i)

// Com consentimento registado, passa.
assert.equal(
  decidirEnvio(
    pedido({ tipo: 'template', templateNome: 'mtm_novidade', finalidade: 'campanha' }),
    estado({ baseLegal: 'consentimento', canal: 'whatsapp', ultimaEntradaIso: hDias(2) }),
    AGORA,
  ).pode,
  true,
)

// O canal 'whatsapp' tem de existir no livro, senão uma permissão dada por WhatsApp não tem onde
// aterrar — e sem linha no livro só se pode falar com a pessoa dentro das 24h em que ela escreveu.
assert.ok(
  PONTOS_DE_CAPTURA.some((p) => p.canal === 'whatsapp'),
  'sem canal "whatsapp" no livro, fala-se com a pessoa uma vez e nunca mais',
)

// ── 6. «RESPOSTA» E «SERVIÇO» FORA DA JANELA ─────────────────────────────────────────────────────

// Responder 30 horas depois não é responder, é abordar. Quem o quiser fazer tem de o dizer com o
// nome certo e apresentar a base que esse nome exige.
assert.equal(
  decidirEnvio(
    pedido({ tipo: 'template', templateNome: 'x', finalidade: 'resposta' }),
    estado({ ultimaEntradaIso: hHoras(30), baseLegal: 'consentimento' }),
    AGORA,
  ).codigo,
  'resposta_fora_da_janela',
)

// Um «serviço» fora da janela a quem não tem relação registada é abordagem a frio com o nome trocado.
assert.equal(
  decidirEnvio(
    pedido({ tipo: 'template', templateNome: 'x', finalidade: 'servico' }),
    estado({ ultimaEntradaIso: hDias(3), baseLegal: null }),
    AGORA,
  ).codigo,
  'servico_sem_relacao',
)

// ── 7. UMA CONVERSA ANTIGA NÃO É LICENÇA PERMANENTE ─────────────────────────────────────────────

/**
 * Sem este limite, «ela já falou comigo uma vez» tornava-se licença eterna — e é exactamente o
 * raciocínio com que se constroem listas que ninguém pediu.
 */
const diasDoLimite = ORIGEM_POR_CONVERSA_VALE_MS / 86_400_000
assert.ok(diasDoLimite >= 30 && diasDoLimite <= 180, 'a validade da origem por conversa tem de ser um prazo, não infinita')
assert.equal(
  decidirEnvio(
    pedido({ tipo: 'template', templateNome: 'x', finalidade: 'servico' }),
    estado({ ultimaEntradaIso: hDias(diasDoLimite + 1), baseLegal: null }),
    AGORA,
  ).codigo,
  'sem_origem',
  'uma mensagem dela de há muitos meses não é origem para lhe escrever hoje',
)

// ── 8. O CORPO PARA A CLOUD API ──────────────────────────────────────────────────────────────────

/**
 * A forma do template é a parte que ninguém consegue ler de cabeça e todos escrevem mal à primeira.
 * Fica presa aqui para que o erro apareça neste ficheiro e não num pedido recusado pela Meta.
 */
const cTexto = corpoParaCloudApi('+351912345678', { tipo: 'texto', texto: 'Olá' }) as Record<string, any>
assert.equal(cTexto.messaging_product, 'whatsapp')
assert.equal(cTexto.to, '351912345678', 'a Meta quer o número SEM o "+" no campo `to`')
assert.equal(cTexto.type, 'text')
assert.equal(cTexto.text.body, 'Olá')
assert.equal(cTexto.text.preview_url, false, 'pré-visualização de link faz a 1.ª resposta parecer publicidade')

const cTpl = corpoParaCloudApi('+351912345678', {
  tipo: 'template',
  template: { nome: 'mtm_aviso_sessao', idioma: 'pt_PT', parametros: ['Ricardo', '21h'] },
}) as Record<string, any>
assert.equal(cTpl.type, 'template')
assert.equal(cTpl.template.name, 'mtm_aviso_sessao')
assert.equal(cTpl.template.language.code, 'pt_PT')
assert.deepEqual(cTpl.template.components[0].parameters, [
  { type: 'text', text: 'Ricardo' },
  { type: 'text', text: '21h' },
])

// Template sem parâmetros não leva `components` vazio: a Meta recusa um `components` que não bata
// com o template aprovado, e um array vazio é uma forma de não bater.
const cTplSemParams = corpoParaCloudApi('+351912345678', {
  tipo: 'template',
  template: { nome: 'mtm_simples', idioma: 'pt_PT' },
}) as Record<string, any>
assert.equal('components' in cTplSemParams.template, false)

console.log('whatsapp-envio.check: ok')
