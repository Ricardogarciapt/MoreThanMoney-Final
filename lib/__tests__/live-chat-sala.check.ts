/**
 * CHAT DA SESSÃO AO VIVO — guarda das decisões que erravam em silêncio.
 *
 * Correr: npx tsx lib/__tests__/live-chat-sala.check.ts
 *
 * Cada bloco prova o CASO MAU, o que estava a acontecer antes:
 *
 *   1. O chat de uma sala Premium era lido por quem não tem Premium (e por quem não tem conta),
 *      porque a rota lia sempre com a chave de serviço e nunca perguntava quem pedia.
 *   2. Um visitante anónimo escrevia numa sala `free` com o nome que quisesse.
 *   3. Uma mensagem com 401/500/sem-rede era tratada como enviada: a caixa limpava-se e a
 *      mensagem desaparecia sem erro. Também 2xx sem linha gravada.
 *   4. A sondagem incremental duplicava ou perdia mensagens quando as respostas chegavam fora
 *      de ordem ou repetidas.
 *   5. O ecrã não fazia scroll nenhum (novas mensagens invisíveis) — e colar sempre no fundo
 *      arrancaria o histórico a quem está a ler para trás.
 *   6. As rotas e o ecrã da sala usam de facto estas funções (sem isto, o módulo prova-se a si
 *      mesmo e o produto continua errado).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PerfilUi } from '@/lib/perfil-ui'
import {
  classificarEnvio,
  cursorDaProximaSondagem,
  deveColarNoFundo,
  etiquetaDeAutor,
  juntarMensagens,
  motivoDeRecusaDoChat,
  podeEscreverNoChatDaSala,
  podeLerChatDaSala,
  podeLimparCaixa,
  tierParaGravar,
  type MensagemDoChat,
} from '@/lib/live-chat-sala'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8')

const anonimo = { perfil: null, equipa: false }
const equipa = { perfil: null, equipa: true }
const membro = { perfil: { is_active: true, user_type: 'member', member_category: 'standard', subscription_plan: 'app_member' } as PerfilUi, equipa: false }
const premium = { perfil: { is_active: true, user_type: 'member', member_category: 'premium' } as PerfilUi, equipa: false }
const vip = { perfil: { is_active: true, user_type: 'vip' } as PerfilUi, equipa: false }
const emPausa = { perfil: { is_active: false, user_type: 'member', member_category: 'premium' } as PerfilUi, equipa: false }

// ── 1. CASO MAU: o chat da sala paga era lido por quem não paga ───────────────────────────────
assert.equal(podeLerChatDaSala(anonimo, 'premium'), false, 'sem conta não lê o chat de uma sala Premium')
assert.equal(podeLerChatDaSala(membro, 'premium'), false, 'Membro (35 €) não lê o chat de uma sala Premium')
assert.equal(podeLerChatDaSala(membro, 'vip'), false, 'Membro não lê o chat de uma sala VIP')
assert.equal(podeLerChatDaSala(premium, 'vip'), false, 'Premium não lê o chat de uma sala VIP')
assert.equal(podeLerChatDaSala(emPausa, 'premium'), false, 'conta em pausa por pagamento não lê')

// Quem tem direito continua a ler — fechar demais seria o defeito simétrico.
assert.equal(podeLerChatDaSala(premium, 'premium'), true)
assert.equal(podeLerChatDaSala(vip, 'premium'), true, 'o VIP entra em tudo')
assert.equal(podeLerChatDaSala(vip, 'vip'), true)
assert.equal(podeLerChatDaSala(membro, 'app_member'), true)
assert.equal(podeLerChatDaSala(equipa, 'vip'), true, 'o educador a transmitir vê sempre o seu chat')
assert.equal(podeLerChatDaSala(anonimo, 'free'), true, 'a Sessão Gratuita é pública para LER')
assert.equal(podeLerChatDaSala(anonimo, 'FREE'), true, 'o tier não é sensível a maiúsculas')

// A recusa tem de ter texto: uma lista vazia é indistinguível de "ainda sem mensagens".
assert.match(motivoDeRecusaDoChat(anonimo, 'premium'), /sess[ãa]o/i)
assert.match(motivoDeRecusaDoChat(membro, 'premium'), /acesso/i)
assert.match(
  motivoDeRecusaDoChat(emPausa, 'free'),
  /inativa|subscri/i,
  'a quem já pagou e está em pausa não se diz "nível acima do teu" — manda-a para o upgrade errado',
)

// ── 2. CASO MAU: o anónimo escrevia na Sessão Gratuita ────────────────────────────────────────
assert.equal(
  podeEscreverNoChatDaSala(anonimo, 'free'),
  false,
  'a sala free é pública para VER, nunca para ESCREVER sem conta identificada',
)
assert.equal(podeEscreverNoChatDaSala(anonimo, 'all'), false)
assert.equal(podeEscreverNoChatDaSala(membro, 'premium'), false, 'ler e escrever pedem o mesmo direito')
assert.equal(podeEscreverNoChatDaSala(emPausa, 'free'), false, 'conta em pausa não escreve')
assert.equal(podeEscreverNoChatDaSala(membro, 'free'), true)
assert.equal(podeEscreverNoChatDaSala(premium, 'premium'), true)
assert.equal(podeEscreverNoChatDaSala(equipa, 'premium'), true)

// ── 3. CASO MAU: a mensagem que desaparecia em silêncio ──────────────────────────────────────
const maus = [
  { status: null as number | null, corpo: null },
  { status: 401, corpo: { error: 'Não autenticado' } },
  { status: 403, corpo: { error: 'Sem acesso' } },
  { status: 400, corpo: { error: 'Mensagem obrigatória' } },
  { status: 429, corpo: null },
  { status: 500, corpo: { error: 'Erro interno' } },
  { status: 502, corpo: null },
  // O mais traiçoeiro: 200 com corpo sem linha gravada. Um `res.ok` cego dava isto por enviado.
  { status: 200, corpo: { success: true } },
  { status: 200, corpo: { success: false, error: 'não gravou' } },
]
for (const mau of maus) {
  const r = classificarEnvio(mau)
  assert.equal(r.saiu, false, `status ${mau.status} não pode contar como enviado`)
  assert.equal(podeLimparCaixa(r), false, `status ${mau.status}: a caixa não se limpa, o texto não se perde`)
  assert.ok(!r.saiu && r.motivo.trim().length > 0, `status ${mau.status} tem de dar um motivo visível`)
}

// Recuperável = vale tentar outra vez. 401/403/400 não valem: tentar não resolve nada.
assert.equal((classificarEnvio({ status: null, corpo: null }) as any).recuperavel, true)
assert.equal((classificarEnvio({ status: 500, corpo: null }) as any).recuperavel, true)
assert.equal((classificarEnvio({ status: 429, corpo: null }) as any).recuperavel, true)
assert.equal((classificarEnvio({ status: 401, corpo: null }) as any).recuperavel, false)
assert.equal((classificarEnvio({ status: 403, corpo: null }) as any).recuperavel, false)
assert.equal((classificarEnvio({ status: 400, corpo: null }) as any).recuperavel, false)

// E o caso bom: gravada mesmo.
const bom = classificarEnvio({ status: 200, corpo: { success: true, data: { id: 'a' } } })
assert.equal(bom.saiu, true)
assert.equal(podeLimparCaixa(bom), true, 'só aqui é que a caixa se limpa')

// ── 4. CASO MAU: a sondagem incremental a duplicar ou a perder ────────────────────────────────
const m = (id: string, iso: string): MensagemDoChat => ({
  id,
  sender_name: 'x',
  sender_type: 'student',
  message: id,
  created_at: iso,
})
const base = [m('a', '2026-10-01T10:00:00.000Z'), m('b', '2026-10-01T10:00:05.000Z')]

// A mesma resposta a chegar duas vezes (sondagem repetida, pedido retentado).
assert.deepEqual(
  juntarMensagens(base, base).map((x) => x.id),
  ['a', 'b'],
  'a mesma mensagem nunca aparece duas vezes',
)

// Respostas fora de ordem: a nova mais antiga entra no lugar certo, não no fim.
assert.deepEqual(
  juntarMensagens([...base, m('d', '2026-10-01T10:00:20.000Z')], [m('c', '2026-10-01T10:00:10.000Z')]).map((x) => x.id),
  ['a', 'b', 'c', 'd'],
  'uma resposta atrasada não fica fora de ordem',
)

// Nada se perde quando a resposta nova não tem o que já tínhamos.
assert.deepEqual(
  juntarMensagens(base, [m('c', '2026-10-01T10:00:10.000Z')]).map((x) => x.id),
  ['a', 'b', 'c'],
)

// Empate de tempo (duas pessoas a enviar no mesmo instante): ordem estável, sem perder nenhuma.
const empate = juntarMensagens([], [m('z', '2026-10-01T10:00:00.000Z'), m('y', '2026-10-01T10:00:00.000Z')])
assert.deepEqual(empate.map((x) => x.id), ['y', 'z'])
assert.deepEqual(
  juntarMensagens([], [m('y', '2026-10-01T10:00:00.000Z'), m('z', '2026-10-01T10:00:00.000Z')]).map((x) => x.id),
  ['y', 'z'],
  'a ordem não depende da ordem de chegada',
)

// Teto de memória: fica a cauda (o recente), nunca a cabeça.
const muitas = Array.from({ length: 10 }, (_, i) => m(`id${i}`, new Date(1_760_000_000_000 + i * 1000).toISOString()))
const cortadas = juntarMensagens([], muitas, 4)
assert.equal(cortadas.length, 4)
assert.deepEqual(cortadas.map((x) => x.id), ['id6', 'id7', 'id8', 'id9'], 'corta-se o histórico, não o que acabou de chegar')

// O cursor é o instante EXACTO da última: mexer nele repete ou salta mensagens.
assert.equal(cursorDaProximaSondagem(base), '2026-10-01T10:00:05.000Z')
assert.equal(cursorDaProximaSondagem([]), null, 'sem mensagens não há cursor — a 1ª sondagem traz o histórico')
assert.equal(
  cursorDaProximaSondagem([m('b', '2026-10-01T10:00:05.000Z'), m('a', '2026-10-01T10:00:00.000Z')]),
  '2026-10-01T10:00:05.000Z',
  'o cursor é o MAIOR instante, não o último do array',
)
assert.equal(cursorDaProximaSondagem([m('x', 'lixo')]), null, 'uma data corrompida não vira cursor')

// ── 5. CASO MAU: o scroll ─────────────────────────────────────────────────────────────────────
// Quem acabou de entrar (ou estava no fundo) acompanha.
assert.equal(deveColarNoFundo({ scrollTop: 680, scrollHeight: 1000, clientHeight: 320 }), true)
assert.equal(deveColarNoFundo({ scrollTop: 0, scrollHeight: 320, clientHeight: 320 }), true, 'chat curto está sempre no fundo')
// Quem está a ler para trás NÃO é arrastado.
assert.equal(deveColarNoFundo({ scrollTop: 0, scrollHeight: 1000, clientHeight: 320 }), false)
assert.equal(deveColarNoFundo({ scrollTop: 400, scrollHeight: 1000, clientHeight: 320 }), false)
// A margem absorve o arredondamento sub-pixel do browser (senão desencola sozinho).
assert.equal(deveColarNoFundo({ scrollTop: 679.6, scrollHeight: 1000.2, clientHeight: 320 }), true)

// ── 6. Quem é quem ────────────────────────────────────────────────────────────────────────────
assert.deepEqual(etiquetaDeAutor('educator', null), { texto: 'Educador', cor: '#D2A63C' }, 'o ouro é do educador')
assert.equal(etiquetaDeAutor('student', 'vip')?.texto, 'VIP')
assert.equal(etiquetaDeAutor('student', 'premium')?.texto, 'Premium')
assert.equal(etiquetaDeAutor('student', 'iq')?.texto, 'Premium', 'o registo IQ é o Premium com outro nome')
assert.equal(etiquetaDeAutor('student', 'admin')?.texto, 'Equipa MTM')
assert.equal(etiquetaDeAutor('student', 'trial')?.texto, 'Experiência', 'ao trial diz-se que é trial')
assert.equal(etiquetaDeAutor('student', 'membro'), null, 'o membro comum não leva galão')
assert.equal(
  etiquetaDeAutor('student', null),
  null,
  'mensagem antiga sem tier gravado não leva etiqueta inventada',
)
// O educador é educador mesmo que o tier venha preenchido por acidente.
assert.equal(etiquetaDeAutor('educator', 'membro')?.texto, 'Educador')

// O tier que se grava sai de chavePerfilUi — uma pessoa é uma coisa só em todo o site.
assert.equal(tierParaGravar(premium.perfil), 'premium')
assert.equal(tierParaGravar(vip.perfil), 'vip')
assert.equal(tierParaGravar(membro.perfil), 'membro')
assert.equal(tierParaGravar(emPausa.perfil), 'inativo')
assert.equal(tierParaGravar(null), 'inativo')

// ── 7. O produto usa isto ─────────────────────────────────────────────────────────────────────
const rota = ler('app/api/live-sessions/streams/[id]/messages/route.ts')
for (const nome of ['podeLerChatDaSala', 'podeEscreverNoChatDaSala', 'motivoDeRecusaDoChat', 'tierParaGravar']) {
  assert.ok(rota.includes(nome), `a rota do chat tem de usar ${nome} — senão o cadeado fica no módulo`)
}
assert.ok(
  rota.includes('criarLeitorDeEspectador'),
  'a rota tem de LER quem pede (token ou cookie) — ler só o cookie deixava a app nativa de fora',
)
assert.ok(rota.includes('status: 403'), 'sem direito responde-se 403 com motivo, nunca uma lista vazia')
assert.ok(/desde/.test(rota), 'a rota tem de aceitar o cursor incremental `desde`')

const sala = ler('components/live/live-stream-room.tsx')
for (const nome of ['classificarEnvio', 'podeLimparCaixa', 'juntarMensagens', 'cursorDaProximaSondagem', 'deveColarNoFundo', 'etiquetaDeAutor']) {
  assert.ok(sala.includes(nome), `a sala tem de usar ${nome}`)
}
assert.ok(
  !/setText\(""\)\s*\n\s*load\(\)/.test(sala),
  'a sala não pode voltar a limpar a caixa antes de saber se a mensagem saiu',
)

console.log('✅ chat da sessão ao vivo: direito de ler/escrever, envio que nunca falha calado, sondagem sem duplicados, scroll e etiquetas — tudo provado.')
