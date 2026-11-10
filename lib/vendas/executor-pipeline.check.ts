/**
 * Guarda do executor do pipeline, do opt-in de Telegram e da aprovação da DM do setter (10/11).
 * Corre com: npx tsx lib/vendas/executor-pipeline.check.ts
 */
import { emailDoToque, toqueDevido, MAX_TOQUES_EMAIL, assinaturaSaida, linkSaida } from './executor-pipeline'
import { decidirContacto, temSaida, identificaMtm, TECTOS_PADRAO } from '@/lib/agentes/contacto-inicial'
import { pedidoOptin, respostaDoBotao, TEXTO_OPTIN, linkOptin } from '@/lib/telegram-optin'
import { lerBotaoDm, mensagemDeAprovacao } from '@/lib/instagram/setter-aprovacao'
import { lerResposta } from '@/lib/captacao-consentimento-conversa'

let falhas = 0
const ok = (c: boolean, o: string) => { if (c) console.log(`  ok ${o}`); else { console.error(`  FALHA ${o}`); falhas++ } }

console.log('\nEmails de seguimento')
for (let t = 1; t <= MAX_TOQUES_EMAIL; t++) {
  const m = emailDoToque(t, 'Ana', 'ana@exemplo.pt')
  ok(temSaida(m.texto), `toque ${t} leva forma de sair`)
  ok(identificaMtm(m.texto), `toque ${t} identifica a MTM`)
  ok(/não constitui consultoria/i.test(m.texto), `toque ${t} leva o aviso educativo`)
  ok(!/garant(id|e)o|lucro certo|ganhar? \d/i.test(m.texto.replace(/não garantem/i, '')), `toque ${t} sem promessas`)
  const comCons = decidirContacto({ canal: 'email', destino: 'ana@exemplo.pt', texto: m.texto }, { consentimentoCanal: true }, { agenteHoje: 0, canalHoje: 0 }, TECTOS_PADRAO)
  ok(comCons.pode && comCons.base === 'consentimento', `toque ${t} sai com consentimento`)
  const semCons = decidirContacto({ canal: 'email', destino: 'ana@gmail.com', texto: m.texto }, {}, { agenteHoje: 0, canalHoje: 0 }, TECTOS_PADRAO)
  ok(!semCons.pode, `toque ${t} NÃO sai sem consentimento (particular)`)
  const excl = decidirContacto({ canal: 'email', destino: 'ana@exemplo.pt', texto: m.texto }, { consentimentoCanal: true, excluido: true }, { agenteHoje: 0, canalHoje: 0 }, TECTOS_PADRAO)
  ok(!excl.pode, `toque ${t} NÃO sai a quem está na exclusão global`)
}
ok(linkSaida('A@B.pt').includes(assinaturaSaida('a@b.pt')), 'link de saída assinado e normalizado')
ok(assinaturaSaida('a@b.pt') !== assinaturaSaida('c@b.pt'), 'assinatura muda com o email')

console.log('\nRitmo dos toques')
const agora = Date.parse('2026-11-10T12:00:00Z')
ok(toqueDevido(1, null, agora), '1.º toque logo')
ok(!toqueDevido(2, null, agora), '2.º sem o 1.º enviado não sai')
ok(!toqueDevido(2, '2026-11-09T12:00:00Z', agora), '2.º não sai ao fim de 1 dia')
ok(toqueDevido(2, '2026-11-07T11:00:00Z', agora), '2.º sai ao fim de 3 dias')
ok(!toqueDevido(4, '2026-01-01T00:00:00Z', agora), 'não há 4.º toque')

console.log('\nOpt-in Telegram')
const q = pedidoOptin('Rui')
ok(q.texto.includes(TEXTO_OPTIN), 'a pergunta mostra o texto que fica como prova')
ok(temSaida(TEXTO_OPTIN) && lerResposta('PARAR', false) === 'sair', 'o texto diz como sair e «PARAR» é lido como saída')
ok(respostaDoBotao('optin:sim') === 'sim' && respostaDoBotao('optin:nao') === 'nao' && respostaDoBotao('x') === null, 'botões lidos')
ok(linkOptin('bot').endsWith('?start=seguimento'), 'deep-link do opt-in')
const followup = 'Ei 👋 o próximo passo é... \n\nPara deixar de receber, escreve PARAR.'
ok(decidirContacto({ canal: 'telegram', destino: '123', texto: followup }, { conversaBotAberta: true, consentimentoCanal: true }, { agenteHoje: 0, canalHoje: 0 }, TECTOS_PADRAO).pode, 'follow-up de Telegram com opt-in sai')
ok(!decidirContacto({ canal: 'telegram', destino: '123', texto: followup }, { conversaBotAberta: true }, { agenteHoje: 0, canalHoje: 0 }, TECTOS_PADRAO).pode, 'follow-up de Telegram sem opt-in NÃO sai')

console.log('\nAprovação da DM do setter')
ok(JSON.stringify(lerBotaoDm('igdm:ok:17890000000000001')) === JSON.stringify({ acao: 'ok', commentId: '17890000000000001' }), 'botão Enviar lido')
ok(lerBotaoDm('igdm:no:17890000000000001')?.acao === 'no', 'botão Descartar lido')
ok(lerBotaoDm('igdm:ok:1;drop') === null && lerBotaoDm('optin:sim') === null, 'lixo recusado')
const m = mensagemDeAprovacao({ commentId: '17890000000000001', commenter: 'x<y', comentario: 'quero <b>', textoDm: 'Olá', horasDesdeComentario: 2 })
ok(!m.texto.includes('<b>quero') && m.texto.includes('&lt;'), 'HTML do comentário escapado')
const cb = (m.teclado as { inline_keyboard: Array<Array<{ callback_data: string }>> }).inline_keyboard[0]
ok(cb.every((b) => b.callback_data.length <= 64), 'callback_data cabe nos 64 bytes do Telegram')

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1) }
console.log('\nTudo certo.')
