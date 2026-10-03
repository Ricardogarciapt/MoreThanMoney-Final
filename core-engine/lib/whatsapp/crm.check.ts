/**
 * A GUARDA DO CRM DE WHATSAPP.
 *
 *   npx tsx lib/whatsapp/crm.check.ts
 *
 * O que aqui se prova é o que erra em silêncio: a janela contada do lado errado, a lista pela
 * ordem errada, e um botão que convida a escrever o que a Meta vai recusar. Metade dos testes é
 * sobre o caso mau.
 */
import {
  AVISO_MS, JANELA_MS, janelaDe, oQuePodeEscrever, ordenarConversas, podeMudarPara, prioridade,
  ROTULO_ESTADO, type Conversa, type EstadoConversa,
} from './crm'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGORA = new Date('2026-09-30T12:00:00Z')
const haMs = (ms: number) => new Date(AGORA.getTime() - ms).toISOString()
function conversa(p: Partial<Conversa>): Conversa {
  return { telefone: '+351900000000', estado: 'a_falar', ...p }
}

// ── A janela ────────────────────────────────────────────────────────────────
{
  const nova = janelaDe(conversa({ ultima_entrada: haMs(60 * 60_000) }), AGORA)
  teste('escreveu há 1 h → aberta', nova.aberta)
  teste('e faltam 23 h', nova.texto === 'faltam 23 h')
  teste('não está a fechar', !nova.aFechar)

  const quase = janelaDe(conversa({ ultima_entrada: haMs(JANELA_MS - 60 * 60_000) }), AGORA)
  teste('a uma hora do fim → ainda aberta', quase.aberta)
  teste('e marcada como a fechar', quase.aFechar)

  const fechada = janelaDe(conversa({ ultima_entrada: haMs(JANELA_MS + 2 * 60 * 60_000) }), AGORA)
  teste('passadas 26 h → fechada', !fechada.aberta)
  teste('e diz há quanto tempo', fechada.texto.startsWith('fechada há'))

  teste('quem nunca escreveu não tem janela', janelaDe(conversa({}), AGORA).texto === 'nunca escreveu')
  teste('data inválida não rebenta', !janelaDe(conversa({ ultima_entrada: 'ontem' }), AGORA).aberta)

  /**
   * O ERRO QUE ISTO EXISTE PARA APANHAR: contar a janela a partir da NOSSA saída. Responder não
   * estica a janela. Uma conversa em que ela escreveu há 30 h e nós respondemos há 1 h está
   * FECHADA — e um CRM que conte pela saída diria que está aberta, e a mensagem seria recusada.
   */
  const respondemosAgora = janelaDe(conversa({ ultima_entrada: haMs(30 * 60 * 60_000), ultima_saida: haMs(60_000) }), AGORA)
  teste('responder NÃO reabre a janela', !respondemosAgora.aberta)
}

// ── A ordem do dia ──────────────────────────────────────────────────────────
{
  const aFecharComEspera = conversa({ telefone: '+1', ultima_entrada: haMs(JANELA_MS - 60 * 60_000), por_responder: 2 })
  const comEspera = conversa({ telefone: '+2', ultima_entrada: haMs(2 * 60 * 60_000), por_responder: 5 })
  const soAberta = conversa({ telefone: '+3', ultima_entrada: haMs(60 * 60_000), por_responder: 0 })
  const fechada = conversa({ telefone: '+4', ultima_entrada: haMs(5 * 86_400_000), por_responder: 0 })
  const ganha = conversa({ telefone: '+5', estado: 'ganho', ultima_entrada: haMs(60_000), por_responder: 9 })
  const silenciada = conversa({ telefone: '+6', estado: 'silenciado', ultima_entrada: haMs(60_000), por_responder: 9 })

  const ordem = ordenarConversas([fechada, soAberta, ganha, aFecharComEspera, silenciada, comEspera], AGORA)
    .map((c) => c.telefone)

  teste('primeiro: quem espera E a janela a fechar', ordem[0] === '+1')
  teste('depois: quem espera', ordem[1] === '+2')
  teste('depois: janela aberta sem ninguém à espera', ordem[2] === '+3')
  teste('a seguir: janela fechada', ordem[3] === '+4')
  teste('ganhas e silenciadas vão para o fim', ordem.slice(4).includes('+5') && ordem.slice(4).includes('+6'))

  // Uma conversa ganha com nove por responder NÃO pode subir. Já não é trabalho de captação, e o
  // contador alto é precisamente o que a faria saltar para o topo numa ordenação ingénua.
  teste('uma ganha não salta à frente por ter muitas por responder', prioridade(ganha, AGORA) < prioridade(soAberta, AGORA))

  // Entre duas iguais, manda a mais recente.
  const a = conversa({ telefone: '+a', ultima_entrada: haMs(3 * 60 * 60_000), por_responder: 1 })
  const b = conversa({ telefone: '+b', ultima_entrada: haMs(1 * 60 * 60_000), por_responder: 1 })
  teste('empate desfaz-se pela mais recente', ordenarConversas([a, b], AGORA)[0].telefone === '+b')

  teste('ordenar não mexe na lista original', (() => {
    const orig = [fechada, soAberta]
    ordenarConversas(orig, AGORA)
    return orig[0].telefone === '+4'
  })())
}

// ── O que se pode escrever ──────────────────────────────────────────────────
{
  const aberta = oQuePodeEscrever(conversa({ ultima_entrada: haMs(60 * 60_000) }), AGORA)
  teste('janela aberta → texto livre', aberta.textoLivre && aberta.template)
  teste('e diz quanto tempo falta', aberta.porque.includes('faltam'))

  const fora = oQuePodeEscrever(conversa({ ultima_entrada: haMs(30 * 60 * 60_000) }), AGORA)
  teste('fora da janela → só template', !fora.textoLivre && fora.template)

  const nunca = oQuePodeEscrever(conversa({}), AGORA)
  teste('quem nunca escreveu → só template', !nunca.textoLivre && nunca.template)
  teste('e lembra o consentimento', nunca.porque.includes('consentimento'))

  const muda = oQuePodeEscrever(conversa({ estado: 'silenciado', ultima_entrada: haMs(60_000) }), AGORA)
  teste('silenciada não recebe nada, nem com janela aberta', !muda.textoLivre && !muda.template)

  teste('há sempre um motivo escrito', [aberta, fora, nunca, muda].every((r) => r.porque.length > 15))
}

// ── As transições ───────────────────────────────────────────────────────────
{
  teste('novo → a falar', podeMudarPara('novo', 'a_falar'))
  teste('a falar → ganho', podeMudarPara('a_falar', 'ganho'))
  teste('perdido → a falar (reabre)', podeMudarPara('perdido', 'a_falar'))
  teste('perdido NÃO salta para ganho', !podeMudarPara('perdido', 'ganho'))
  teste('novo NÃO salta para ganho', !podeMudarPara('novo', 'ganho'))
  teste('silenciado não vai direto a ganho', !podeMudarPara('silenciado', 'ganho'))
  teste('ficar no mesmo estado é sempre válido', podeMudarPara('ganho', 'ganho'))

  const estados: EstadoConversa[] = ['novo', 'a_falar', 'a_aguardar', 'ganho', 'perdido', 'silenciado']
  teste('todos os estados têm rótulo', estados.every((e) => (ROTULO_ESTADO[e] ?? '').length > 2))
  teste('de qualquer estado há saída', estados.every((e) => estados.some((o) => o !== e && podeMudarPara(e, o))))
}

// ── As constantes são as da Meta ────────────────────────────────────────────
teste('a janela são 24 horas', JANELA_MS === 24 * 60 * 60 * 1000)
teste('o aviso é antes do fim', AVISO_MS > 0 && AVISO_MS < JANELA_MS)

if (falhas.length) {
  console.error(`whatsapp/crm: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('whatsapp/crm: janela pela entrada, ordem do dia, o que se pode escrever e transições ✓')
