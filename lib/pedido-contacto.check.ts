import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assinaturaMetaValida,
  canaisConsentidos,
  eventosLeadgen,
  excedeLimite,
  linkLigar,
  normalizarTelefone,
  pedidoDoLeadMeta,
  validarPedido,
  TEXTO_CAIXA,
  type EntradaFormulario,
} from './pedido-contacto'
import { decidirContacto } from './agentes/contacto-inicial'

/**
 * Guardas do «Quero que me liguem» e do Meta Lead Ads (06/10). Cada caso prova o caso MAU.
 * Correr: npx tsx lib/pedido-contacto.check.ts
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

const base: EntradaFormulario = {
  nome: 'Marta Figueiredo',
  indicativo: '+351',
  telefone: '912 345 678',
  email: 'marta.figueiredo@gmail.com',
  interesse: 'formacao',
  melhorHora: 'tarde',
  origem: 'pagina:/ligar',
  ag: 'AG-SOCIAL',
}

caso('MAU: sem caixa marcada não há consentimento (nem linhas, nem pedido válido)', () => {
  for (const c of [undefined, null, {}, { chamada: false, whatsapp: false, email: false }]) {
    const v = validarPedido({ ...base, consentimentos: c as EntradaFormulario['consentimentos'] })
    assert.equal(v.ok, false, `passou com consentimentos=${JSON.stringify(c)}`)
    if (!v.ok && !v.descartar) assert.ok(v.erros.consentimentos)
  }
})

caso("MAU: 'on', 'true', 1 e objectos NÃO são consentimento — só true", () => {
  for (const x of ['on', 'true', 1, 'sim', {}, [], 'yes']) {
    assert.deepEqual(canaisConsentidos({ chamada: x, whatsapp: x, email: x }), [], `aceitou ${JSON.stringify(x)}`)
  }
})

caso('MAU: só o canal marcado é autorizado (chamada não dá WhatsApp nem email)', () => {
  const v = validarPedido({ ...base, consentimentos: { chamada: true } })
  assert.equal(v.ok, true)
  if (!v.ok) return
  assert.deepEqual(v.pedido.canais, ['chamada'])
  assert.equal(v.linhas.length, 1)
  assert.equal(v.linhas[0].canal, 'chamada')
  assert.equal(v.linhas[0].email, null, 'a linha da chamada não pode levar email (a vista das campanhas leria «sim a email»)')
  assert.ok(v.linhas[0].prova.startsWith(TEXTO_CAIXA.chamada), 'a prova tem de ser o texto da caixa')
  assert.equal(v.linhas[0].ag, 'AG-SOCIAL')
  assert.equal(v.linhas[0].origem, 'pagina:/ligar')

  const w = validarPedido({ ...base, consentimentos: { whatsapp: true, email: true } })
  assert.equal(w.ok, true)
  if (w.ok) {
    assert.deepEqual(w.linhas.map((l) => l.canal).sort(), ['email', 'whatsapp'])
    assert.equal(w.linhas.find((l) => l.canal === 'whatsapp')?.email, null)
    assert.equal(w.linhas.find((l) => l.canal === 'email')?.telefone, null)
  }
})

caso('MAU: aceitar email sem escrever email não passa', () => {
  const v = validarPedido({ ...base, email: '', consentimentos: { email: true } })
  assert.equal(v.ok, false)
})

caso('MAU: na regra do motor, consentimento de chamada não abre o WhatsApp nem o email', () => {
  const v = validarPedido({ ...base, consentimentos: { chamada: true } })
  assert.ok(v.ok)
  const ev = { consentimentoCanal: false, excluido: false }
  const usados = { agenteHoje: 0, canalHoje: 0 }
  const txt = 'Olá, aqui é a MoreThanMoney. Responde SAIR para não receber mais.'
  assert.equal(decidirContacto({ canal: 'whatsapp', destino: '+351912345678', texto: txt }, { ...ev, templateAprovado: true }, usados).destino, 'bloqueado')
  assert.equal(decidirContacto({ canal: 'email', destino: 'marta.figueiredo@gmail.com', texto: txt }, ev, usados).destino, 'bloqueado')
  // Sem consentimento para chamada, a chamada nunca sai — e com ele, sai só se o motor lhe der tecto.
  assert.equal(decidirContacto({ canal: 'chamada', destino: '+351912345678', texto: txt }, { consentimentoCanal: false }, usados).destino, 'bloqueado')
  // O caso bom do mesmo motor: consentimento gravado PARA EMAIL abre o email (com saída no texto).
  assert.equal(decidirContacto({ canal: 'email', destino: 'marta.figueiredo@gmail.com', texto: txt }, { consentimentoCanal: true }, usados).destino, 'sai')
})

caso('MAU: honeypot preenchido é descartado (sem erro visível, sem gravar)', () => {
  const v = validarPedido({ ...base, consentimentos: { chamada: true }, site: 'https://spam.example' })
  assert.equal(v.ok, false)
  assert.equal(!v.ok && v.descartar, true)
  // e a rota devolve 200 sem chamar o registo
  const rota = readFileSync(join(__dirname, '..', 'app', 'api', 'pedido-contacto', 'route.ts'), 'utf8')
  const i = rota.indexOf('if (v.descartar)')
  assert.ok(i > 0 && i < rota.indexOf('registarPedidoDeContacto({'), 'a rota tem de descartar antes de gravar')
})

caso('MAU: telefone sem indicativo nem formato E.164 é recusado', () => {
  assert.equal(normalizarTelefone('', '912345678'), null)
  assert.equal(normalizarTelefone('+351', '12'), null)
  assert.equal(normalizarTelefone('+351', '912 345 678'), '+351912345678')
  assert.equal(normalizarTelefone(null, '0055 11 91234 5678'), '+5511912345678')
})

caso('MAU: limite por IP e por telefone trava a partir do tecto', () => {
  assert.equal(excedeLimite({ ipUltimaHora: 4, telefoneUltimoDia: 0 }), false)
  assert.equal(excedeLimite({ ipUltimaHora: 5, telefoneUltimoDia: 0 }), true)
  assert.equal(excedeLimite({ ipUltimaHora: 0, telefoneUltimoDia: 3 }), true)
})

const segredo = 'segredo-de-teste'
const corpo = JSON.stringify({ object: 'page', entry: [{ id: '123', changes: [{ field: 'leadgen', value: { leadgen_id: '9988776655', page_id: '123', form_id: '555' } }] }] })
const assinar = (b: string, s = segredo) => `sha256=${createHmac('sha256', s).update(b).digest('hex')}`

caso('MAU: webhook com assinatura inválida é recusado', () => {
  assert.equal(assinaturaMetaValida(corpo, assinar(corpo), segredo), true, 'a válida tem de passar')
  assert.equal(assinaturaMetaValida(corpo, assinar(corpo, 'outro-segredo'), segredo), false, 'segredo errado')
  assert.equal(assinaturaMetaValida(corpo + ' ', assinar(corpo), segredo), false, 'corpo adulterado')
  assert.equal(assinaturaMetaValida(corpo, null, segredo), false, 'sem cabeçalho')
  assert.equal(assinaturaMetaValida(corpo, assinar(corpo), ''), false, 'sem segredo configurado')
  assert.equal(assinaturaMetaValida(corpo, 'sha256=zz', segredo), false, 'lixo')
  assert.equal(assinaturaMetaValida(corpo, assinar(corpo).replace('sha256=', 'sha1='), segredo), false, 'algoritmo errado')
  // e a rota verifica ANTES de ler o JSON
  const rota = readFileSync(join(__dirname, '..', 'app', 'api', 'webhooks', 'meta-leadgen', 'route.ts'), 'utf8')
  assert.ok(rota.indexOf('assinaturaMetaValida(') < rota.indexOf('JSON.parse(cru)'), 'a assinatura tem de ser verificada antes de ler o corpo')
  assert.ok(/status: 401/.test(rota), 'assinatura inválida → 401')
})

caso('Meta: eventos leadgen extraídos; outros objectos ignorados', () => {
  assert.deepEqual(eventosLeadgen(JSON.parse(corpo)).map((e) => e.leadgenId), ['9988776655'])
  assert.deepEqual(eventosLeadgen({ object: 'instagram', entry: [] }), [])
})

caso('MAU (Meta): caixa não marcada ou pré-marcada não é consentimento; só a marcada conta', () => {
  const caixas = [
    { key: 'consent_chamada', text: 'Aceito que a MoreThanMoney me ligue.' },
    { key: 'consent_whatsapp', text: 'Aceito mensagens por WhatsApp da MoreThanMoney.' },
    { key: 'consent_email', text: 'Aceito emails da MoreThanMoney.', preMarcada: true },
  ]
  const lead = {
    field_data: [
      { name: 'full_name', values: ['Rui Sardinha'] },
      { name: 'phone_number', values: ['+351 913 222 111'] },
      { name: 'email', values: ['rui.sardinha@gmail.com'] },
    ],
    custom_disclaimer_responses: [
      { checkbox_key: 'consent_chamada', is_checked: '1' },
      { checkbox_key: 'consent_whatsapp', is_checked: '0' },
      { checkbox_key: 'consent_email', is_checked: '1' },
    ],
  }
  const r = pedidoDoLeadMeta(lead, caixas, { origem: 'meta_lead_ads:555', ag: 'AG-SOCIAL' })
  assert.deepEqual(r.pedido?.canais, ['chamada'])
  assert.equal(r.linhas.length, 1)
  assert.ok(r.linhas[0].prova.includes('Aceito que a MoreThanMoney me ligue.'))
  const nada = pedidoDoLeadMeta({ ...lead, custom_disclaimer_responses: [] }, caixas, { origem: null, ag: null })
  assert.deepEqual(nada.pedido?.canais, [])
  assert.equal(nada.linhas.length, 0)
})

caso('MAU: o link /ligar leva SEMPRE ?ag=', () => {
  const raiz = 'https://www.morethanmoney.pt'
  for (const l of [linkLigar(raiz), linkLigar(raiz, 'AG-SOCIAL', 'ig:post-123'), linkLigar(raiz, 'lixo-que-nao-e-codigo')]) {
    const u = new URL(l)
    assert.equal(u.pathname, '/ligar')
    assert.ok(u.searchParams.get('ag')?.startsWith('AG-'), `sem ag: ${l}`)
  }
  assert.equal(new URL(linkLigar(raiz)).searchParams.get('ag'), 'AG-SOCIAL')
  // e o bot do Telegram usa o mesmo gerador
  const bot = readFileSync(join(__dirname, '..', 'app', 'api', 'telegram', 'webhook', 'route.ts'), 'utf8')
  assert.ok(bot.includes('linkLigar('), 'o comando /ligar do bot tem de usar linkLigar')
})

caso('As caixas do formulário nascem DESMARCADAS e separadas', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'captacao', 'quero-que-me-liguem.tsx'), 'utf8')
  assert.ok(src.includes('{ chamada: false, whatsapp: false, email: false }'), 'estado inicial tem de ser tudo false')
  assert.ok(!/defaultChecked/.test(src), 'nenhuma caixa pode nascer marcada')
  assert.ok(src.includes('TEXTO_CAIXA[c]'), 'o ecrã tem de mostrar o mesmo texto que é gravado como prova')
})

console.log(`pedido-contacto: ${n} casos — sem caixa não há consentimento; só o canal marcado; assinatura inválida recusada; honeypot descartado; /ligar com ?ag= ✓`)
