/**
 * PERFIL DE LEAD — o que este teste trava.
 *
 * A distinção que o perfil todo existe para manter: «não tem» e «não sabemos» NÃO são a mesma
 * coisa. Dizer a alguém que não tem conta na corretora quando o que se passa é que ninguém
 * importou a lista da corretora este mês é a forma mais rápida de perder um lead que estava
 * pronto — e é exactamente o que acontece hoje em produção, onde 59 clientes da corretora e 17
 * perfis com UID dão UMA única correspondência, porque os números não são do mesmo tipo.
 *
 *   npx tsx lib/__tests__/perfil-lead.check.ts
 */
import assert from 'node:assert/strict'
import { montarPerfil, textoPerfil, type FontesDoPerfil, type LinhaLead } from '../prospecao/perfil-lead'

const AGORA = Date.parse('2026-09-24T12:00:00Z')
const hDias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

function lead(m: Partial<LinhaLead>): LinhaLead {
  return { chat_id: '2139490282', first_name: 'MJ', stage: 'new', created_at: hDias(20), updated_at: hDias(2), ...m }
}

function fontes(m: Partial<FontesDoPerfil>): FontesDoPerfil {
  return { lead: lead({}), corretora: null, perfil: null, cupao: null, contaACopiar: null, agoraMs: AGORA, ...m }
}

// ── 1. «Não sabemos» é dito em voz alta, e nunca se disfarça de «não tem» ──
{
  const p = montarPerfil(fontes({}))
  assert.ok(p.lacunas.length > 0)
  assert.ok(
    p.lacunas.some((l) => /ponte MTM Auto/i.test(l)),
    'a ponte MTM Auto ↔ Telegram está vazia em produção — o perfil tem de o dizer em vez de inventar um "não tem"',
  )
  assert.ok(p.lacunas.some((l) => /nunca deu UID/i.test(l)))
}

// ── 2. Um UID que não casa com a lista da corretora é uma LACUNA, não uma confirmação ──
{
  const p = montarPerfil(fontes({ lead: lead({ broker_uid: '18599' }), corretora: null }))
  assert.equal(p.corretora.confirmado, false)
  assert.ok(p.lacunas.some((l) => /não aparece na lista/i.test(l)))
  assert.match(p.prontidao.proximoPasso, /não bate certo/i)
}

// ── 3. Com a corretora a confirmar, o perfil muda de tom e de próximo passo ──
{
  const p = montarPerfil(
    fontes({
      lead: lead({ broker_uid: '100041585', interesse: 'ecossistema', stage: 'granted', granted_at: hDias(5) }),
      corretora: { uid: '100041585', first_name: 'Maria', last_name: 'Jesus', deposits_usd: 500, balance_usd: 460 },
    }),
  )
  assert.equal(p.corretora.confirmado, true)
  assert.equal(p.corretora.nome, 'Maria Jesus')
  assert.equal(p.corretora.depositoUsd, 500)
  assert.match(p.prontidao.proximoPasso, /conta no site|registo/i)
  assert.ok(p.prontidao.pontos > 50)
}

// ── 4. A ligação ao site faz-se pelo CUPÃO, e um cupão por resgatar é uma promessa por cumprir ──
// Não é por chat_id nem por email: `telegram_leads.coupon_code` → `profiles.coupon_code`.
{
  const p = montarPerfil(
    fontes({
      lead: lead({ coupon_code: 'MTM-BROKER-165879-ZGHOGG', broker_uid: '1', stage: 'granted' }),
      cupao: { code: 'MTM-BROKER-165879-ZGHOGG', plan_override: 'premium', grant_days: 30, used_count: 0 },
      perfil: null,
    }),
  )
  assert.match(p.prometido ?? '', /premium/i)
  assert.match(p.prometido ?? '', /30 dias/)
  assert.match(p.prometido ?? '', /por resgatar/)
  assert.ok(p.lacunas.some((l) => /ninguém o resgatou/i.test(l)))
  assert.equal(p.conta.tem, false)
}

// ── 5. Um chat_id do WhatsApp não é alguém a quem o bot do Telegram possa escrever ──
// O mesmo cérebro serve os dois canais e grava na mesma tabela; o `wa:` é o que os distingue.
{
  const tg = montarPerfil(fontes({ lead: lead({ chat_id: '2139490282' }) }))
  const wa = montarPerfil(fontes({ lead: lead({ chat_id: 'wa:351912345678' }) }))
  assert.equal(tg.prontidao.acionavelPeloSistema, true)
  assert.equal(wa.prontidao.acionavelPeloSistema, false)
}

// ── 6. O percurso só regista passos com prova ──
{
  const p = montarPerfil(
    fontes({
      lead: lead({
        message_count: 5,
        interesse: 'mtmauto',
        broker_uid: '100041585',
        proof_file_id: 'AgAC',
        granted_at: hDias(3),
        mtmauto_passo: 'validado',
        followup_count: 2,
      }),
      corretora: { uid: '100041585', deposits_usd: 400 },
    }),
  )
  const textos = p.passos.map((x) => x.o_que).join(' | ')
  assert.match(textos, /Primeiro contacto/)
  assert.match(textos, /5 mensagem/)
  assert.match(textos, /UID 100041585 \(confirmado/)
  assert.match(textos, /print/i)
  assert.match(textos, /Acesso libertado/)
  assert.ok(p.passos.every((x) => x.o_que.length > 3))
}

// ── 7. O texto para o telemóvel escapa HTML e traz sempre o próximo passo ──
// Um `<` num nome de utilizador rebentava a mensagem toda do Telegram (parse_mode HTML).
{
  const p = montarPerfil(fontes({ lead: lead({ first_name: 'Ana <script>', username: 'a&b' }) }))
  const t = textoPerfil(p)
  assert.ok(!t.includes('<script>'), 'o nome tem de vir escapado')
  assert.ok(t.includes('&lt;script&gt;'))
  assert.ok(t.includes('&amp;b'))
  assert.match(t, /Próximo passo/)
  assert.match(t, /Prontidão: \d+\/100/)
}

console.log('✅ perfil-lead: separa «não tem» de «não sabemos» e junta lead + corretora + conta + promessa')
