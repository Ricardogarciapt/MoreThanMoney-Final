/**
 * Link seguro das credenciais (091) e o email que o leva — sem base de dados.
 *
 *   npx tsx lib/mtmfunded/__tests__/credenciais-link.check.ts
 */
import assert from 'node:assert/strict'
import {
  VALIDADE_LINK_MS, abrirLink, concessaoValida, emitirConcessao, emitirLink, hashDoToken, lerToken, urlDoLink,
  type LinhaLink, type RepoLinks,
} from '../credenciais-link'
import { montarEmailCredenciais, type DadosEmailCredenciais } from '../email-credenciais'
import { gerarPassword } from '../simulado/credenciais'

let n = 0
const caso = async (nome: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`  ok  ${nome}`) }

const CHAVE = 'k'.repeat(40)
const DONO = '11111111-1111-4111-8111-111111111111'
const OUTRO = '22222222-2222-4222-8222-222222222222'
const CONTA = '33333333-3333-4333-8333-333333333333'
const T0 = Date.parse('2026-09-15T10:00:00Z')

/** Repositório em memória com a MESMA semântica do UPDATE … WHERE usado_em IS NULL AND user_id = … */
function memoria(): RepoLinks & { linhas: Map<string, LinhaLink> } {
  const linhas = new Map<string, LinhaLink>()
  return {
    linhas,
    async inserir(l) { linhas.set(l.id, { ...l }) },
    async ler(id) { const l = linhas.get(id); return l ? { ...l } : null },
    async gastar(id, userId, agora) {
      const l = linhas.get(id)
      if (!l || l.usado_em || l.user_id !== userId) return false
      l.usado_em = agora
      return true
    },
  }
}

async function main() {
  await caso('emite: guarda só o hash, não o token', async () => {
    const repo = memoria()
    const { token, linkId, expiraEm } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const l = repo.linhas.get(linkId)!
    assert.equal(l.token_hash, hashDoToken(token))
    assert.ok(!JSON.stringify(l).includes(token.split('.')[4]))
    assert.equal(Date.parse(expiraEm) - T0, VALIDADE_LINK_MS)
  })

  await caso('dono abre uma vez; a segunda dá 410 (uso único)', async () => {
    const repo = memoria()
    const { token } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const a = await abrirLink(token, DONO, repo, { agoraMs: T0 + 60_000, chave: CHAVE })
    assert.deepEqual(a, { ok: true, accountId: CONTA, motivo: 'criacao' })
    const b = await abrirLink(token, DONO, repo, { agoraMs: T0 + 120_000, chave: CHAVE })
    assert.equal(b.ok, false); assert.equal((b as { status: number }).status, 410)
  })

  await caso('corrida: dois pedidos ao mesmo tempo — só um ganha', async () => {
    const repo = memoria()
    const { token } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'pedido' }, repo, { agoraMs: T0, chave: CHAVE })
    const rs = await Promise.all([1, 2, 3].map(() => abrirLink(token, DONO, repo, { agoraMs: T0 + 1000, chave: CHAVE })))
    assert.equal(rs.filter((r) => r.ok).length, 1)
  })

  await caso('outra pessoa: 404 e o link NÃO se gasta (o dono ainda o abre)', async () => {
    const repo = memoria()
    const { token } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const intruso = await abrirLink(token, OUTRO, repo, { agoraMs: T0 + 1000, chave: CHAVE })
    assert.equal(intruso.ok, false); assert.equal((intruso as { status: number }).status, 404)
    const semSessao = await abrirLink(token, null, repo, { agoraMs: T0 + 1000, chave: CHAVE })
    assert.equal((semSessao as { status: number }).status, 401)
    assert.equal((await abrirLink(token, DONO, repo, { agoraMs: T0 + 2000, chave: CHAVE })).ok, true)
  })

  await caso('expira às 24 h (no token e na linha)', async () => {
    const repo = memoria()
    const { token, linkId } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const r = await abrirLink(token, DONO, repo, { agoraMs: T0 + VALIDADE_LINK_MS + 1, chave: CHAVE })
    assert.equal((r as { status: number }).status, 410)
    assert.equal(repo.linhas.get(linkId)!.usado_em, null, 'um link expirado não se marca usado')
    assert.equal(lerToken(token, T0 + VALIDADE_LINK_MS - 1, CHAVE).ok, true)
    // Linha encurtada na base (p. ex. revogação à mão) manda mais do que o token.
    repo.linhas.get(linkId)!.expira_em = new Date(T0 + 1000).toISOString()
    assert.equal((await abrirLink(token, DONO, repo, { agoraMs: T0 + 5000, chave: CHAVE }) as { status: number }).status, 410)
  })

  await caso('assinatura: token adulterado, de outra chave ou mal formado é recusado sem ir à base', async () => {
    const repo = memoria()
    let leituras = 0
    const espiao: RepoLinks = { ...repo, ler: async (id) => { leituras++; return repo.ler(id) } }
    const { token } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const partes = token.split('.')
    const maisTempo = [partes[0], partes[1], String(Number(partes[2]) + VALIDADE_LINK_MS), partes[3], partes[4]].join('.')
    for (const mau of [maisTempo, token.slice(0, -2) + 'xx', 'v1.nada', '', 42, null]) {
      const r = await abrirLink(mau, DONO, espiao, { agoraMs: T0 + 1000, chave: CHAVE })
      assert.equal(r.ok, false)
      assert.equal((r as { status: number }).status, 400)
    }
    assert.equal((await abrirLink(token, DONO, espiao, { agoraMs: T0 + 1000, chave: 'z'.repeat(40) }) as { status: number }).status, 400)
    assert.equal(leituras, 0)
  })

  await caso('token de uma linha substituído por outro token válido da mesma conta não abre a linha errada', async () => {
    const repo = memoria()
    const a = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const b = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'pedido' }, repo, { agoraMs: T0, chave: CHAVE })
    // Hash de b gravado na linha de a: o token de a já não bate.
    repo.linhas.get(a.linkId)!.token_hash = repo.linhas.get(b.linkId)!.token_hash
    assert.equal((await abrirLink(a.token, DONO, repo, { agoraMs: T0 + 1, chave: CHAVE }) as { status: number }).status, 404)
  })

  await caso('concessão de 10 min: presa à conta e ao dono', () => {
    const c = emitirConcessao(CONTA, DONO, T0, CHAVE)
    assert.equal(concessaoValida(c, CONTA, DONO, T0 + 60_000, CHAVE), true)
    assert.equal(concessaoValida(c, CONTA, OUTRO, T0 + 60_000, CHAVE), false)
    assert.equal(concessaoValida(c, OUTRO, DONO, T0 + 60_000, CHAVE), false)
    assert.equal(concessaoValida(c, CONTA, DONO, T0 + 11 * 60_000, CHAVE), false)
  })

  await caso('o URL leva o token no fragmento (#t=), nunca na query', () => {
    const u = urlDoLink('https://www.morethanmoney.pt/', 'v1.a.b.c.d')
    assert.equal(u, 'https://www.morethanmoney.pt/mtmfunded/credenciais#t=v1.a.b.c.d')
    assert.ok(!u.includes('?'))
  })

  await caso('email: login, servidor e botão — e nenhuma password, mesmo metida à força', async () => {
    const repo = memoria()
    const { token, expiraEm } = await emitirLink({ accountId: CONTA, userId: DONO, motivo: 'criacao' }, repo, { agoraMs: T0, chave: CHAVE })
    const master = gerarPassword()
    const investor = gerarPassword()
    const dados = {
      nome: 'Rui Silva', login: '77123456', servidor: 'MTM Funded', etiqueta: 'F1', programa: 'Desafio 10K · 2 fases',
      motivo: 'criacao', urlLink: urlDoLink('https://www.morethanmoney.pt', token), expiraEm,
      urlWebtrader: 'https://www.morethanmoney.pt/webtrader', siteUrl: 'https://www.morethanmoney.pt',
      // Campos que o tipo NÃO tem — um dia alguém passa a linha da conta inteira:
      password: master, investor, mt5_password_cifrada: 'v1.segredo', mt5_investor_cifrada: 'v1.outro',
    } as unknown as DadosEmailCredenciais
    for (const motivo of ['criacao', 'fase', 'regeneracao', 'reenvio', 'backfill', 'pedido'] as const) {
      const e = montarEmailCredenciais({ ...dados, motivo })
      for (const corpo of [e.html, e.texto, e.assunto]) {
        assert.ok(!corpo.includes(master), `password master no email (${motivo})`)
        assert.ok(!corpo.includes(investor), `password investor no email (${motivo})`)
        assert.ok(!corpo.includes('v1.segredo') && !corpo.includes('v1.outro'))
        assert.ok(!/password\s*[:=]\s*\S/i.test(corpo.replace(/<[^>]+>/g, ' ')), `algo com ar de password (${motivo})`)
      }
      assert.ok(e.html.includes('77123456') && e.html.includes('MTM Funded'))
      assert.ok(e.html.includes('Ver credenciais') && e.html.includes('/mtmfunded/credenciais#t='))
      assert.ok(e.texto.includes('77123456'))
      assert.ok(!/€|euros?\b/i.test(e.html), 'sem euros')
    }
    // O tipo de dados não tem sítio para a password (verificação de compilação por negação).
    const chaves: Array<keyof DadosEmailCredenciais> = ['nome', 'login', 'servidor', 'etiqueta', 'programa', 'motivo', 'urlLink', 'expiraEm', 'urlWebtrader', 'siteUrl']
    assert.ok(!chaves.some((k) => /pass/i.test(k)))
  })

  await caso('email: nome com HTML é escapado', () => {
    const e = montarEmailCredenciais({
      nome: '<script>x</script>', login: '77000001', servidor: 'MTM Funded', etiqueta: 'Funded', programa: null,
      motivo: 'reenvio', urlLink: 'https://x/mtmfunded/credenciais#t=a', expiraEm: new Date(T0).toISOString(), urlWebtrader: 'https://x/webtrader',
    })
    assert.ok(!e.html.includes('<script>x</script>'))
  })

  console.log(`\n${n} casos ok`)
}

main().catch((e) => { console.error(e); process.exit(1) })
