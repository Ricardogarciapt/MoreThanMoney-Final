/**
 * Emails de entrega MTM Funded: o TIPO da conta decide assunto e texto, o TAMANHO vem da conta.
 * E o aviso fixo do WebTrader decide-se pela fase real da conta.
 *
 *   npx tsx lib/mtmfunded/__tests__/email-tipo-conta.check.ts
 */
import assert from 'node:assert/strict'
import {
  tamanhoCurto, tamanhoDaConta, tamanhoLongo, textosDaEntrega, tipoDeEntrega, type ContaEntrega,
} from '../email-tipo-conta'
import { montarEmailCredenciais } from '../email-credenciais'
import { montarEmailDaConta } from '../email-conta'
import { contaEntregaDaLinha } from '../entrega-conta-dados'
import { avisoDaConta, chaveDoAviso } from '../aviso-conta'
import { translate } from '../../i18n/translate'
import { I18N_LANGS } from '../../i18n/config'
import { montarSeletor } from '../../webtrader/seletor'

let ok = 0
function t(nome: string, f: () => void) {
  try { f(); ok++ } catch (e) { console.error(`✗ ${nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}

const desafio1f: ContaEntrega = { tipo: 'desafio', saldoInicial: 5000, fase: null, fases: 1, programaNome: '5K · 1 fase' }
const desafio2fF1: ContaEntrega = { tipo: 'desafio', saldoInicial: '10000', fase: 1, fases: 2, programaNome: '10K · 2 fases' }
const desafio2fF2: ContaEntrega = { ...desafio2fF1, fase: 2 }
// Como as financiadas do envio de 15/09: tipo financiada com um programa de desafio associado.
const fundedComPrograma: ContaEntrega = { tipo: 'financiada', saldoInicial: 3000, fases: 1, programaNome: '3K · 1 fase' }
const analise: ContaEntrega = { tipo: 'financiada', saldoInicial: 1000, fases: 1, programaNome: '1K · 1 fase', analise: true }
const torneio: ContaEntrega = { tipo: 'torneio', saldoInicial: 10000, torneioNome: 'Trading Tournament Q3 2026' }
const oferta: ContaEntrega = { ...desafio2fF1, ofertaMarca: 'gratificacao-2026-09' }

// ── tipo ─────────────────────────────────────────────────────────────────────
t('tipo vem da conta', () => {
  assert.equal(tipoDeEntrega(desafio1f), 'desafio')
  assert.equal(tipoDeEntrega(desafio2fF2), 'desafio')
  assert.equal(tipoDeEntrega(fundedComPrograma), 'funded')
  assert.equal(tipoDeEntrega({ tipo: 'funded', saldoInicial: 1 }), 'funded')
  assert.equal(tipoDeEntrega(analise), 'analise')
  assert.equal(tipoDeEntrega(torneio), 'torneio')
  assert.equal(tipoDeEntrega(oferta), 'oferta')
  assert.equal(tipoDeEntrega({ ...desafio2fF1, ofertaRenovacao: true }), 'oferta')
  // A F2 de uma oferta já é o desafio a correr.
  assert.equal(tipoDeEntrega({ ...oferta, fase: 2 }), 'desafio')
  assert.equal(tipoDeEntrega({ tipo: 'provider', saldoInicial: 10000 }), 'mestre')
})

// ── assunto e texto por tipo ────────────────────────────────────────────────
t('desafio 1 fase', () => {
  const e = textosDaEntrega(desafio1f, 'criacao', 'pt')
  assert.equal(e.assunto, 'O teu Desafio MTM Funded 5K · 1 fase está activo')
  assert.match(e.frase, /uma só fase/)
  assert.deepEqual(e.linhas, [['Tipo de conta', 'F1 · Fase única'], ['Tamanho da conta', '5 000 USD'], ['Programa', 'Desafio MTM Funded 5K · 1 fase']])
  assert.equal(e.real, false)
  assert.match(e.aviso, /simulada/)
})
t('desafio 2 fases, fase 1', () => {
  const e = textosDaEntrega(desafio2fF1, 'criacao', 'pt')
  assert.equal(e.assunto, 'O teu Desafio MTM Funded 10K · 2 fases está activo — Fase 1')
  assert.match(e.frase, /Fase 1 de 2/)
  assert.equal(e.linhas[0][1], 'F1 · Fase 1 de 2')
  const en = textosDaEntrega(desafio2fF1, 'criacao', 'en')
  assert.equal(en.assunto, 'Your MTM Funded 10K Challenge · 2 phases is active — Phase 1')
  assert.deepEqual(en.linhas[1], ['Account size', '10,000 USD'])
})
t('desafio 2 fases, fase 2', () => {
  const e = textosDaEntrega(desafio2fF2, 'fase', 'pt')
  assert.equal(e.assunto, 'Passaste à Fase 2: a tua nova conta do Desafio MTM Funded 10K · 2 fases')
  assert.match(e.frase, /a última/)
  assert.match(e.frase, /conta Funded/)
  assert.equal(e.linhas[0][1], 'F2 · Fase 2 de 2')
  assert.equal(textosDaEntrega(desafio2fF2, 'fase', 'en').assunto, 'You reached Phase 2: your new MTM Funded 10K Challenge · 2 phases account')
})
t('Funded: nunca como desafio nem como fase', () => {
  for (const motivo of ['criacao', 'fase'] as const) {
    const e = textosDaEntrega(fundedComPrograma, motivo, 'pt')
    assert.equal(e.assunto, 'A tua conta Funded MTM de 3K está activa')
    assert.ok(!/fase seguinte|desafio|Passaste/i.test(e.assunto + e.frase), `soa a desafio (${motivo})`)
    assert.match(e.frase, /capital patrocinado MTM/)
    assert.ok(!e.linhas.some(([k]) => k === 'Programa'), 'o nome do programa (de desafio) não entra numa Funded')
    assert.deepEqual(e.linhas, [['Tipo de conta', 'Funded'], ['Tamanho da conta', '3 000 USD']])
    assert.equal(e.real, true)
    assert.match(e.aviso, /contém negociação real/)
  }
  assert.equal(textosDaEntrega(fundedComPrograma, 'criacao', 'en').assunto, 'Your 3K MTM Funded account is active')
  assert.equal(textosDaEntrega(fundedComPrograma, 'backfill', 'pt').assunto, 'Os dados de acesso — A tua conta Funded MTM 3K')
})
t('conta de análise: simulada, sem «Funded real»', () => {
  const e = textosDaEntrega(analise, 'backfill', 'pt')
  assert.equal(e.real, false)
  assert.ok(!/negociação real de capital/.test(e.aviso))
  assert.deepEqual(e.linhas, [['Tipo de conta', 'Conta de análise'], ['Tamanho da conta', '1 000 USD']])
  assert.equal(textosDaEntrega(analise, 'criacao', 'pt').assunto, 'A tua conta de análise MTM Funded (1K) está pronta')
})
t('torneio', () => {
  const e = textosDaEntrega(torneio, 'criacao', 'pt')
  assert.equal(e.assunto, 'A tua conta do Trading Tournament Q3 2026 está pronta (10K)')
  assert.ok(e.linhas.some(([k, v]) => k === 'Torneio' && v === 'Trading Tournament Q3 2026'))
  assert.ok(!/desafio/i.test(e.assunto + e.frase))
  assert.equal(textosDaEntrega(torneio, 'criacao', 'en').assunto, 'Your Trading Tournament Q3 2026 account is ready (10K)')
})
t('oferta', () => {
  const e = textosDaEntrega(oferta, 'criacao', 'pt')
  assert.equal(e.assunto, 'Oferta: o teu Desafio MTM Funded 10K · 2 fases está activo')
  assert.match(e.frase, /sem custo/)
  assert.equal(textosDaEntrega(oferta, 'criacao', 'en').assunto, 'Gift: your MTM Funded 10K Challenge · 2 phases is active')
})

// ── tamanho ──────────────────────────────────────────────────────────────────
t('tamanho vem da conta, com o programa só como recurso, e nunca inventado', () => {
  assert.equal(tamanhoDaConta({ saldoInicial: 25000, programaSaldo: 10000 }), 25000)
  assert.equal(tamanhoDaConta({ saldoInicial: null, programaSaldo: '5000' }), 5000)
  assert.equal(tamanhoDaConta({ saldoInicial: 0, programaSaldo: null }), null)
  assert.equal(tamanhoDaConta({ saldoInicial: undefined }), null)
  assert.equal(tamanhoCurto(10000), '10K')
  assert.equal(tamanhoCurto(2500), '2.5K')
  assert.equal(tamanhoCurto(1_000_000), '1M')
  assert.equal(tamanhoLongo(10000, 'pt'), '10 000 USD')
  assert.equal(tamanhoLongo(10000, 'en'), '10,000 USD')
  assert.equal(tamanhoLongo(100000, 'pt'), '100 000 USD')
  assert.equal(tamanhoLongo(999, 'pt'), '999 USD')
  // Sem tamanho: nem linha, nem «0 USD», nem «10K» por defeito.
  const e = textosDaEntrega({ tipo: 'financiada', saldoInicial: null }, 'criacao', 'pt')
  assert.ok(!e.linhas.some(([k]) => k === 'Tamanho da conta'))
  assert.ok(!/0 USD|10K/.test(e.assunto + e.frase))
  assert.equal(e.assunto, 'A tua conta Funded MTM está activa')
  // O tamanho do email é o da conta, não o do nome do programa.
  const r = textosDaEntrega({ tipo: 'financiada', saldoInicial: 10000, programaNome: '1K · 1 fase', programaSaldo: 1000 }, 'criacao', 'pt')
  assert.ok(r.assunto.includes('10K') && !r.assunto.includes('1K'))
})
t('linha da base → conta do email', () => {
  const c = contaEntregaDaLinha(
    { tipo: 'financiada', estado: 'ativa', saldo_inicial: '1000', metricas: { analise: true } },
    { nome: '1K · 1 fase', fases: 1, saldo: 1000 }, null, false,
  )
  assert.equal(tipoDeEntrega(c), 'analise')
  const d = contaEntregaDaLinha({ tipo: 'desafio', saldo_inicial: 10000, metricas: { fase: 2, oferta: 'gratificacao-2026-09' } }, { fases: 2 }, null, false)
  assert.equal(d.fase, 2)
  assert.equal(tipoDeEntrega(d), 'desafio')
})

// ── os emails completos ──────────────────────────────────────────────────────
const base = {
  nome: 'Rui', login: '77123456', servidor: 'MTM Funded', urlLink: 'https://x/mtmfunded/credenciais#t=a',
  expiraEm: '2026-09-18T10:00:00Z', urlWebtrader: 'https://x/webtrader', siteUrl: 'https://x',
}
t('email das credenciais: Funded sem «fase seguinte», com tamanho; EN traduz o invólucro', () => {
  const e = montarEmailCredenciais({ ...base, conta: fundedComPrograma, motivo: 'fase' })
  assert.ok(!/fase seguinte|Nova fase/i.test(e.html + e.assunto))
  assert.ok(e.html.includes('3 000 USD') && e.texto.includes('Tamanho da conta: 3 000 USD'))
  assert.ok(!e.texto.includes('Programa:'))
  const en = montarEmailCredenciais({ ...base, conta: desafio2fF1, motivo: 'criacao', idioma: 'en' })
  assert.ok(en.html.includes('lang="en"') && en.html.includes('All rights reserved.'))
  assert.ok(en.html.includes('View credentials') && en.texto.includes('Account size: 10,000 USD'))
  assert.ok(!/Olá|Ver credenciais|Servidor/.test(en.texto))
})
t('email MT5: tamanho da conta, nunca «0 USD»; tipo no assunto', () => {
  const opts = { site: 'https://x', logo: 'https://x/logo.png', temQr: false, qrDoMetaTrader: false }
  const semSaldo = montarEmailDaConta({ para: 'a@b.pt', nome: 'Rui', conta: { tipo: 'torneio', saldoInicial: null, torneioNome: 'T' }, login: '1', servidor: 's', alavancagem: 100, urlPainel: 'https://x' }, opts)
  assert.ok(!semSaldo.html.includes('0 USD'))
  const d = montarEmailDaConta({ para: 'a@b.pt', nome: 'Rui', conta: desafio2fF2, motivo: 'fase', login: '1', servidor: 's', alavancagem: 100, urlPainel: 'https://x', regras: { objetivo_pct: 8, objetivo_fase2_pct: 5 } }, opts)
  assert.ok(d.assunto.startsWith('Passaste à Fase 2') && d.html.includes('10 000 USD') && d.html.includes('F2 · Fase 2 de 2'))
  assert.ok(!d.html.includes('Trading Tournament'), 'o nome do torneio não serve de nome a um desafio')
  const f = montarEmailDaConta({ para: 'a@b.pt', nome: 'Rui', conta: fundedComPrograma, idioma: 'en', login: '1', servidor: 's', alavancagem: 100, urlPainel: 'https://x' }, opts)
  assert.equal(f.assunto, 'Your 3K MTM Funded account is active')
  assert.ok(f.html.includes('MTM-sponsored capital') && !/Olá|palavra-passe/.test(f.html))
})

// ── o aviso do WebTrader ─────────────────────────────────────────────────────
t('aviso do WebTrader pela fase real', () => {
  assert.equal(avisoDaConta({ tipo: 'desafio', estado: 'ativa', metricas: { fase: 2 } }), 'avaliacao')
  assert.equal(avisoDaConta({ tipo: 'desafio', estado: 'ativa', pausadaEm: '2026-09-17' }), 'avaliacao')
  assert.equal(avisoDaConta({ tipo: 'desafio', estado: 'pedida' }), 'avaliacao')
  assert.equal(avisoDaConta({ tipo: 'desafio', estado: 'aprovada' }), 'avaliacao_concluida')
  assert.equal(avisoDaConta({ tipo: 'desafio', estado: 'quebrada' }), 'avaliacao_terminada')
  assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'ativa', metricas: {} }), 'funded')
  assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'expirada', metricas: { pausadaEm: 'x' } }), 'funded')
  assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'quebrada' }), 'funded_encerrada')
  assert.equal(avisoDaConta({ tipo: 'financiada', estado: 'ativa', metricas: { analise: true } }), 'analise')
  assert.equal(avisoDaConta({ tipo: 'torneio', estado: 'ativa' }), 'torneio')
  assert.equal(avisoDaConta({ tipo: 'provider', estado: 'ativa' }), 'mestre')
  assert.equal(avisoDaConta(null), 'geral')
  assert.equal(avisoDaConta({ tipo: 'outra' }), 'geral')
  assert.equal(chaveDoAviso('lixo'), 'mtmfunded.aviso.geral')
  assert.equal(translate(chaveDoAviso('avaliacao'), 'pt'), 'Conta simulada educativa · MTM Funded · Encontras-te em Avaliação')
  assert.equal(translate(chaveDoAviso('funded'), 'pt'), 'Conta · MTM Funded · contém negociação real')
  assert.equal(translate(chaveDoAviso('funded'), 'en'), 'Account · MTM Funded · contains real trading')
})
t('aviso do WebTrader traduzido nos 21 idiomas (sem cair para PT)', () => {
  const tipos = ['avaliacao', 'avaliacao_concluida', 'avaliacao_terminada', 'funded', 'auditoria', 'funded_encerrada', 'analise', 'torneio', 'mestre', 'geral']
  for (const lang of I18N_LANGS) {
    for (const a of tipos) {
      for (const curto of [false, true]) {
        const k = chaveDoAviso(a, curto)
        const v = translate(k, lang)
        assert.notEqual(v, k, `${lang} ${k} em falta`)
        if (lang !== 'pt' && !(lang === 'bs' || lang === 'hr' || lang === 'sr')) {
          assert.notEqual(v, translate(k, 'pt'), `${lang} ${k} igual ao PT`)
        }
      }
    }
    assert.ok(translate(chaveDoAviso('funded'), lang).includes('MTM Funded'))
    assert.ok(translate(chaveDoAviso('auditoria'), lang).includes('MTM Funded'))
    assert.ok(translate(chaveDoAviso('auditoria', true), lang).includes('MTM Funded'))
  }
})
t('o aviso chega ao seletor (contas próprias e sessões por credenciais)', () => {
  const e = montarSeletor({
    funded: [{ id: 'a', mt5_login: '1', etiqueta: 'Funded', estadoCurto: 'Active', sim_saldo: 1, sim_equity: 1, aviso: 'funded' }],
    sessoesFunded: { b: { accountId: 'b', login: '2', modo: 'investor', aviso: 'avaliacao' }, c: { accountId: 'c', login: '3', modo: 'master' } },
  })
  assert.deepEqual(e.map((x) => x.aviso), ['funded', 'avaliacao', null])
  assert.equal(chaveDoAviso(e[2].aviso), 'mtmfunded.aviso.geral')
})

console.log(`email-tipo-conta: ${ok} verificações ${process.exitCode ? 'com FALHAS' : 'ok'}`)
