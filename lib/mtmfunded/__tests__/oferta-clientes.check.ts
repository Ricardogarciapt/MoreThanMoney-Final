/**
 * Oferta de gratidão 2026-09 — o que não pode partir sem ninguém dar por isso.
 *
 *   npx tsx lib/mtmfunded/__tests__/oferta-clientes.check.ts
 */
import assert from 'node:assert/strict'
import {
  MARCA_OFERTA, PROGRAMA_OFERTA, colunasDaContaOferta, destinoDaOferta, idiomaDoCliente, jaTemOferta, motivoExclusao,
  type PerfilOferta, VALIDADE_LINK_OFERTA_MS, desafiosQueBloqueiam, mesmaCadeia,
} from '../oferta-clientes'
import { abrirLink, emitirLink, lerToken, VALIDADE_LINK_MS, type LinhaLink, type RepoLinks } from '../credenciais-link'
import { montarEmailOferta, type DadosEmailOferta } from '../email-oferta-clientes'
import { gerarPassword } from '../simulado/credenciais'

let ok = 0
function t(nome: string, f: () => void) {
  try { f(); ok++ } catch (e) { console.error(`✗ ${nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
const perfil = (x: Partial<PerfilOferta>): PerfilOferta => ({ id: 'u1', email: 'cliente@gmail.com', user_type: 'member', is_active: true, ...x })

// ── exclusões ──────────────────────────────────────────────────────────────
t('dono, Fábio e Alcy ficam fora', () => {
  for (const e of ['ricardogarciapt@proton.me', 'UBUNTU2295@gmail.com', 'lbeliteclean@gmail.com']) {
    assert.equal(motivoExclusao(perfil({ email: e })), 'excluído pelo dono')
  }
})
t('emails morethanmoney ficam fora', () => {
  assert.equal(motivoExclusao(perfil({ email: 'sistema@morethanmoney.pt' })), 'email morethanmoney')
  assert.equal(motivoExclusao(perfil({ email: 'morethanmoneypt@gmail.com' })), 'email morethanmoney')
})
t('appreview e admins ficam fora', () => {
  assert.equal(motivoExclusao(perfil({ email: 'appreview2@gmail.com' })), 'conta appreview')
  assert.equal(motivoExclusao(perfil({ email: 'x@gmail.com', user_type: 'admin' })), 'admin')
})
t('sem email / domínio de teste ficam fora', () => {
  assert.equal(motivoExclusao(perfil({ email: null })), 'sem email')
  assert.equal(motivoExclusao(perfil({ email: 'a@test.com' })), 'email de teste')
})
t('cliente normal — activo OU inactivo — entra', () => {
  assert.equal(motivoExclusao(perfil({})), null)
  assert.equal(motivoExclusao(perfil({ is_active: false, user_type: 'inactive' })), null)
})

// ── língua ─────────────────────────────────────────────────────────────────
t('pt por língua ou país lusófono', () => {
  assert.equal(idiomaDoCliente(perfil({ preferred_language: 'pt-BR' })), 'pt')
  assert.equal(idiomaDoCliente(perfil({ detected_language: 'pt' , preferred_language: 'en' })), 'pt')
  for (const c of ['PT', 'BR', 'AO', 'MZ', 'CV']) assert.equal(idiomaDoCliente(perfil({ country: c, preferred_language: 'fr' })), 'pt')
})
t('en para estrangeiros com dados', () => {
  assert.equal(idiomaDoCliente(perfil({ preferred_language: 'fr', country: 'FR' })), 'en')
  assert.equal(idiomaDoCliente(perfil({ preferred_language: 'sr', country: 'RS' })), 'en')
  assert.equal(idiomaDoCliente(perfil({ country: 'CA' })), 'en')
})
t('sem dados: desempate por telefone/fuso, senão pt; estrito dá en', () => {
  assert.equal(idiomaDoCliente(perfil({ phone: '+41791234567' })), 'en')
  assert.equal(idiomaDoCliente(perfil({ phone: '+351912345678' })), 'pt')
  assert.equal(idiomaDoCliente(perfil({ timezone: 'Europe/Berlin' })), 'en')
  assert.equal(idiomaDoCliente(perfil({})), 'pt')
  assert.equal(idiomaDoCliente(perfil({}), { estrito: true }), 'en')
})

// ── idempotência e forma da conta ──────────────────────────────────────────
t('marca de idempotência', () => {
  assert.equal(MARCA_OFERTA, 'gratificacao-2026-09')
  assert.equal(jaTemOferta([{ metricas: { oferta: MARCA_OFERTA } }]), true)
  assert.equal(jaTemOferta([{ metricas: { oferta: 'outra' } }, { metricas: null }]), false)
  assert.equal(jaTemOferta([]), false)
})
t('conta: desafio F1 do 10k-2f, motor sim, regras reais, sem T2T nem casa', () => {
  assert.equal(PROGRAMA_OFERTA, '10k-2f')
  const c = colunasDaContaOferta('u1', { id: 'p1', saldo: 10000 }, '2026-09-15T00:00:00Z')
  assert.equal(c.tipo, 'desafio'); assert.equal(c.motor, 'sim'); assert.equal(c.program_id, 'p1')
  assert.equal(c.aceita_t2t, false); assert.equal(c.conta_casa, false); assert.equal(c.sem_regras, false)
  const m = c.metricas as Record<string, unknown>
  assert.equal(m.fase, 1); assert.equal(m.analise, false); assert.equal(m.oferta, MARCA_OFERTA)
  assert.equal(jaTemOferta([c as { metricas: Record<string, unknown> }]), true)
})

// ── excepção do login: só WebTrader e credenciais ──────────────────────────
t('destinos da oferta', () => {
  assert.equal(destinoDaOferta('/webtrader'), '/webtrader')
  assert.equal(destinoDaOferta('/webtrader?symbol=XAUUSD'), '/webtrader?symbol=XAUUSD')
  assert.equal(destinoDaOferta('/mtmfunded/credenciais'), '/mtmfunded/credenciais')
  for (const mau of ['/app-mobile', '/member-area', '/admin', '//evil.com/webtrader', '/webtrader/../admin', '/\\evil.com', 'https://evil.com/webtrader', null, '']) {
    assert.equal(destinoDaOferta(mau as string), null, String(mau))
  }
})

// ── o email nunca leva password ────────────────────────────────────────────
const base = (idioma: 'pt' | 'en'): DadosEmailOferta => ({
  idioma, nome: 'Joana', login: '77123456', servidor: 'MTM Funded', saldo: 10000, programa: '10K · 2 fases',
  regras: { objetivo_pct: 8, objetivo_fase2_pct: 5, perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 5, risco_max_pct: 1.5 },
  urlLink: 'https://www.morethanmoney.pt/mtmfunded/credenciais#t=abc', expiraEm: '2026-09-16T12:00:00Z',
  siteUrl: 'https://www.morethanmoney.pt', premios: ['5× Desafio'],
  sorteios: [{ slug: 'lancamento-porta-larga', palavra: 'FUNDED', entrada: 'comentario', bilhetesEntrada: 1, extras: [{ tipo: 'seguir', bilhetes: 1, maximo: 1 }], permalink: 'https://www.instagram.com/p/X/', acabaEm: '2026-10-15T22:59:59Z' }],
})
t('template sem password (pt e en), mesmo metida à força', () => {
  for (const idioma of ['pt', 'en'] as const) {
    const pw = gerarPassword()
    const inv = gerarPassword()
    const e = montarEmailOferta({ ...base(idioma), password: pw, investor: inv } as DadosEmailOferta)
    for (const s of [e.html, e.texto, e.assunto]) {
      assert.ok(!s.includes(pw) && !s.includes(inv), 'password no email')
      assert.ok(!/password\s*[:=]/i.test(s), 'rótulo de password com valor')
    }
    assert.ok(e.html.includes('77123456') && e.texto.includes('77123456'))
    assert.ok(e.html.includes('#t=abc'))
    assert.ok(e.html.includes('https://www.instagram.com/p/X/'))
    assert.ok(!/€|\beur\b|\beuros?\b/i.test(e.html + e.texto), 'valores em euros')
    assert.ok(/simulad|simulated/i.test(e.texto))
  }
})
t('assuntos e regras reais', () => {
  assert.equal(montarEmailOferta(base('pt')).assunto, 'Um presente para ti: a tua conta MTM Funded de 10K')
  assert.equal(montarEmailOferta(base('en')).assunto, 'A gift for you: your 10K MTM Funded account')
  const en = montarEmailOferta(base('en')).texto
  assert.ok(en.includes('8% in phase 1') && en.includes('5% in phase 2') && en.includes('Maximum overall loss: 10%'))
})

// ── a oferta não bloqueia a renovação nem compras (e vice-versa) ───────────
t('um de cada vez ignora as contas oferecidas', () => {
  const oferta = { id: 'g', metricas: { oferta: MARCA_OFERTA, fase: 1 } }
  const comprada = { id: 'c', metricas: { fase: 1 } }
  const antiga = { id: 'a', metricas: null }
  assert.deepEqual(desafiosQueBloqueiam([oferta]), [])
  assert.deepEqual(desafiosQueBloqueiam([oferta, comprada]).map((c) => c.id), ['c'])
  assert.deepEqual(desafiosQueBloqueiam([antiga]).map((c) => c.id), ['a'])
})
t('fases: cadeia da oferta e cadeia comprada são separadas', () => {
  const f2Oferta = { metricas: { oferta: MARCA_OFERTA, fase: 2 } }
  const f2Comprada = { metricas: { fase: 2 } }
  assert.equal(mesmaCadeia(f2Comprada, { metricas: { oferta: MARCA_OFERTA, fase: 1 } }), false)
  assert.equal(mesmaCadeia(f2Oferta, { metricas: { oferta: MARCA_OFERTA, fase: 1 } }), true)
  assert.equal(mesmaCadeia(f2Comprada, { metricas: { fase: 1 } }), true)
})

// ── link de 14 dias só nesta campanha ──────────────────────────────────────
const CHAVE = 'k'.repeat(40)
function repoMem(): RepoLinks {
  const m = new Map<string, LinhaLink>()
  return {
    async inserir(l) { m.set(l.id, { ...l }) },
    async ler(id) { return m.get(id) ?? null },
    async gastar(id, userId, agora) { const l = m.get(id); if (!l || l.user_id !== userId || l.usado_em) return false; l.usado_em = agora; return true },
  }
}
async function linkTests() {
  const agora = Date.parse('2026-09-16T10:00:00Z')
  assert.equal(VALIDADE_LINK_OFERTA_MS, 14 * 24 * 3600_000)
  const repo = repoMem()
  const def = await emitirLink({ accountId: 'a1', userId: 'u1', motivo: 'criacao' }, repo, { agoraMs: agora, chave: CHAVE })
  assert.equal(Date.parse(def.expiraEm) - agora, VALIDADE_LINK_MS, 'omissão continua 24 h')
  const of = await emitirLink({ accountId: 'a1', userId: 'u1', motivo: 'criacao' }, repo, { agoraMs: agora, chave: CHAVE, validadeMs: VALIDADE_LINK_OFERTA_MS })
  assert.equal(Date.parse(of.expiraEm) - agora, VALIDADE_LINK_OFERTA_MS)
  const dia13 = agora + 13 * 24 * 3600_000
  assert.equal(lerToken(def.token, dia13, CHAVE).ok, false, '24 h expirou')
  assert.equal((await abrirLink(of.token, 'u2', repo, { agoraMs: dia13, chave: CHAVE })).ok, false, 'outro dono')
  assert.equal((await abrirLink(of.token, 'u1', repo, { agoraMs: dia13, chave: CHAVE })).ok, true, 'dono no dia 13')
  assert.equal((await abrirLink(of.token, 'u1', repo, { agoraMs: dia13, chave: CHAVE })).ok, false, 'uso único')
  const of2 = await emitirLink({ accountId: 'a1', userId: 'u1', motivo: 'criacao' }, repo, { agoraMs: agora, chave: CHAVE, validadeMs: VALIDADE_LINK_OFERTA_MS })
  assert.equal((await abrirLink(of2.token, 'u1', repo, { agoraMs: agora + 15 * 24 * 3600_000, chave: CHAVE })).ok, false, 'dia 15 expirou')
  ok++
}

linkTests().catch((e) => { console.error(`✗ link 14 dias\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }).finally(() =>
console.log(`oferta-clientes: ${ok} verificações ok${process.exitCode ? ' — COM FALHAS' : ''}`))
