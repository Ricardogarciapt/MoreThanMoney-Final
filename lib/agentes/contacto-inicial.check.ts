/**
 * A GUARDA DO CONTACTO POR INICIATIVA (06/10).   ./node_modules/.bin/tsx lib/agentes/contacto-inicial.check.ts
 *
 * Os casos MAUS primeiro: particular sem consentimento recusado; quem saiu recusado em TODOS os
 * canais (até numa resposta); LinkedIn e WhatsApp sem template recusados; tecto respeitado. E os
 * bons que o dono autorizou: B2B e ex-cliente saem sozinhos, com a base legal escrita.
 */
import { decidirContacto, eWebmail, familiaDoPlano, temSaida, TECTOS_PADRAO, type Evidencia, type PedidoContacto } from './contacto-inicial'
import { podeSair } from '@/lib/envios-aprovacao'
import { detectar, validarReescrita, LIMITES } from './instrucoes-guarda'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }
const zero = { agenteHoje: 0, canalHoje: 0 }
const SAIDA = ' Se não quiseres receber mais, responde SAIR. — MoreThanMoney (morethanmoney.pt)'
const email = (destino: string, extra: Partial<PedidoContacto> = {}): PedidoContacto =>
  ({ canal: 'email', destino, texto: 'Olá, temos uma novidade da formação.' + SAIDA, ...extra })

// ── O CASO MAU Nº 1: particular sem consentimento ─────────────────────────────────────────────
{
  for (const canal of ['email', 'sms', 'whatsapp', 'chamada'] as const) {
    const d = decidirContacto({ canal, destino: canal === 'email' ? 'ana@gmail.com' : '+351910000000', texto: 'Olá' + SAIDA }, { templateAprovado: true }, zero)
    teste(`particular sem consentimento por ${canal}: recusado`, !d.pode && d.destino === 'bloqueado')
  }
  // webmail nunca é B2B, mesmo que alguém diga que é
  const fingido = decidirContacto(email('ze@gmail.com'), { emailProfissional: true }, zero)
  teste('gmail «profissional» não é B2B', !fingido.pode)
  teste('eWebmail apanha sapo.pt', eWebmail('x@sapo.pt'))
}

// ── O CASO MAU Nº 2: quem saiu, saiu de tudo ──────────────────────────────────────────────────
{
  const saiu: Evidencia = { excluido: true, consentimentoCanal: true, familiasCompradas: ['formacao'], emailProfissional: true, iniciou: true, conversaBotAberta: true, templateAprovado: true }
  for (const canal of ['email', 'sms', 'whatsapp', 'telegram', 'instagram', 'chamada'] as const) {
    const d = decidirContacto({ canal, destino: 'x@empresa.pt', texto: 'Olá MTM' + SAIDA, familiaOferta: 'formacao', tipoResposta: 'resposta_a_mensagem' }, saiu, zero)
    teste(`excluído por ${canal}: recusado mesmo com consentimento, compra, B2B e resposta`, !d.pode && d.destino === 'bloqueado')
  }
}

// ── Termos de plataforma ──────────────────────────────────────────────────────────────────────
{
  teste('LinkedIn: sempre recusado', !decidirContacto({ canal: 'linkedin', destino: 'x', texto: 'Olá' + SAIDA }, { consentimentoCanal: true }, zero).pode)
  const wa = { canal: 'whatsapp', destino: '+351910000000', texto: 'Olá' + SAIDA }
  teste('WhatsApp com opt-in mas sem template: recusado', !decidirContacto(wa, { consentimentoCanal: true }, zero).pode)
  teste('WhatsApp com template mas sem opt-in: recusado', !decidirContacto(wa, { templateAprovado: true, familiasCompradas: ['sinais'] }, zero).pode)
  const okWa = decidirContacto(wa, { templateAprovado: true, consentimentoCanal: true }, zero)
  teste('WhatsApp template + opt-in: sai, base consentimento', okWa.pode && okWa.base === 'consentimento')
  teste('Instagram por iniciativa: recusado', !decidirContacto({ canal: 'instagram', destino: 'h', texto: 'Olá' + SAIDA }, { consentimentoCanal: true }, zero).pode)
  teste('Telegram a quem nunca abriu o bot: recusado', !decidirContacto({ canal: 'telegram', destino: '1', texto: 'Olá' + SAIDA }, { consentimentoCanal: true }, zero).pode)
}

// ── OS BONS: B2B e ex-cliente saem sozinhos ───────────────────────────────────────────────────
{
  const b2b = decidirContacto(email('compras@empresa.pt'), { emailProfissional: true }, zero)
  teste('B2B: sai', b2b.pode && b2b.base === 'b2b' && b2b.destino === 'sai')
  teste('B2B sem identificar a MTM: recusado', !decidirContacto(email('c@empresa.pt', { texto: 'Olá. Responde SAIR para sair.' }), { emailProfissional: true }, zero).pode)
  teste('B2B sem saída: recusado', !decidirContacto(email('c@empresa.pt', { texto: 'Olá da MoreThanMoney.' }), { emailProfissional: true }, zero).pode)

  const ex = decidirContacto(email('ana@gmail.com', { familiaOferta: 'formacao' }), { familiasCompradas: ['formacao'] }, zero)
  teste('ex-cliente, produto semelhante, com saída: sai', ex.pode && ex.base === 'soft_opt_in')
  teste('ex-cliente, produto DIFERENTE: não sai sozinho (fila)',
    decidirContacto(email('ana@gmail.com', { familiaOferta: 'funded' }), { familiasCompradas: ['formacao'] }, zero).destino === 'fila')
  teste('ex-cliente sem dizer o produto: fila',
    decidirContacto(email('ana@gmail.com'), { familiasCompradas: ['formacao'] }, zero).destino === 'fila')
  teste('ex-cliente sem saída na mensagem: recusado',
    !decidirContacto(email('ana@gmail.com', { familiaOferta: 'formacao', texto: 'Olá!' }), { familiasCompradas: ['formacao'] }, zero).pode)
  const tg = decidirContacto({ canal: 'telegram', destino: '1', texto: 'Novo módulo' + SAIDA, familiaOferta: 'sinais' }, { conversaBotAberta: true, familiasCompradas: ['sinais'] }, zero)
  teste('cliente no Telegram (bot aberto), mesma família: sai', tg.pode && tg.base === 'soft_opt_in')
  const cons = decidirContacto(email('ana@gmail.com'), { consentimentoCanal: true }, zero)
  teste('consentimento de email gravado: sai', cons.pode && cons.base === 'consentimento')
  const resp = decidirContacto({ canal: 'telegram', destino: '1', texto: 'Claro!', tipoResposta: 'resposta_a_mensagem' }, { iniciou: true, conversaBotAberta: true }, zero)
  teste('resposta a quem escreveu: sai, base resposta', resp.pode && resp.base === 'resposta')
}

// ── TECTOS ────────────────────────────────────────────────────────────────────────────────────
{
  const p = email('compras@empresa.pt')
  const ev: Evidencia = { emailProfissional: true }
  teste('tecto do agente respeitado', !decidirContacto(p, ev, { agenteHoje: TECTOS_PADRAO.porAgenteDia, canalHoje: 0 }).pode)
  teste('tecto do canal respeitado', !decidirContacto(p, ev, { agenteHoje: 0, canalHoje: TECTOS_PADRAO.porCanalDia.email! }).pode)
  teste('abaixo dos tectos sai', decidirContacto(p, ev, { agenteHoje: 3, canalHoje: 3 }).pode)
  teste('canal sem tecto escrito não sai por iniciativa',
    !decidirContacto(p, ev, zero, { porAgenteDia: 10, porCanalDia: {} }).pode)
}

// ── Peças ─────────────────────────────────────────────────────────────────────────────────────
{
  teste('«responde SAIR» é saída', temSaida('responde SAIR'))
  teste('texto sem saída não é saída', !temSaida('Olá, compra já'))
  teste('premium_monthly é sinais', familiaDoPlano('premium_monthly') === 'sinais')
  teste('app_member é formação', familiaDoPlano('app_member') === 'formacao')
  teste('plano desconhecido não dá família', familiaDoPlano('xpto') === null)
}

// ── COORDENAÇÃO COM lib/envios-aprovacao.ts: a regra do site continua igual ───────────────────
{
  teste('o seguimento do bot continua a pedir aprovação no site', podeSair({ tipo: 'followup_bot' }).pode === false)
  teste('a resposta a mensagem continua a sair no site', podeSair({ tipo: 'resposta_a_mensagem' }).pode === true)
}

// ── AS INSTRUÇÕES NOVAS NÃO PERDEM O LIMITE ───────────────────────────────────────────────────
{
  const l = LIMITES.find((x) => x.id === 'aprovacao_humana')!
  teste('o texto canónico novo ainda é reconhecido como o limite', detectar(l.canonico).presentes.includes('aprovacao_humana'))
  teste('o canónico novo nomeia as três bases', /soft opt-in/i.test(l.canonico) && /consentimento/i.test(l.canonico) && /B2B/.test(l.canonico))
  const antigo = 'NADA DO QUE ESCREVES CHEGA A UM CLIENTE SEM APROVAÇÃO HUMANA. Redige, deixa em rascunho, e espera que uma pessoa aprove. Não envias por iniciativa própria, nem por o texto te parecer bom, nem por ser urgente.'
  const base = 'Vendes formação com o código AG-FORMACAO em cada link, a quem já levantou a mão.\n\n'
  const v = validarReescrita({ antes: base + antigo, depois: base + l.canonico })
  teste('trocar o limite antigo pelo novo passa na guarda', v.aceita)
  const solto = validarReescrita({ antes: base + l.canonico, depois: base + 'Podes enviar directamente o que quiseres a quem quiseres.' })
  teste('e apagar o limite novo continua a ser recusado', !solto.aceita)
}

if (falhas.length) {
  console.error(`agentes/contacto-inicial: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('agentes/contacto-inicial: particular sem consentimento recusado, quem saiu recusado em tudo, B2B e ex-cliente saem com base legal, tectos respeitados ✓')
