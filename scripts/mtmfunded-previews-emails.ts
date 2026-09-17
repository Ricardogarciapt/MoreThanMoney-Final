/**
 * PRÉ-VISUALIZAÇÕES dos emails de entrega MTM Funded — um ficheiro HTML por caso, PT e EN, sem base
 * de dados e sem enviar nada.
 *
 *   npx tsx scripts/mtmfunded-previews-emails.ts   → tmp/previews-emails/index.html
 *
 * Casos: desafio 1 fase, desafio 2 fases (fase 1 e fase 2), Funded, torneio, oferta (a de gratidão e
 * a da renovação), conta de análise — pelo email das credenciais (contas simuladas) e pelo email das
 * contas da corretora (MT5). As regras são as do programa real tal como estão na base (17/09).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { montarEmailCredenciais } from '../lib/mtmfunded/email-credenciais'
import { montarEmailDaConta } from '../lib/mtmfunded/email-conta'
import { montarEmailOferta } from '../lib/mtmfunded/email-oferta-clientes'
import type { ContaEntrega, Idioma } from '../lib/mtmfunded/email-tipo-conta'
import type { MotivoLink } from '../lib/mtmfunded/credenciais-link'

const DIR = join(__dirname, '..', 'tmp', 'previews-emails')
const SITE = 'https://www.morethanmoney.pt'
const LOGO = `${SITE}/icon-512x512.png`
const EXPIRA = '2026-09-18T12:00:00Z'

const REGRAS_1F = { objetivo_pct: 10, perda_diaria_pct: 4, perda_maxima_pct: 8, dias_minimos: 7, consistencia_pct: 30, risco_max_pct: 1.5 }
const REGRAS_2F = { objetivo_pct: 8, objetivo_fase2_pct: 5, perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 5, consistencia_pct: 40, risco_max_pct: 1.5 }

interface Caso { id: string; titulo: string; conta: ContaEntrega; motivo: MotivoLink; regras?: Record<string, number> | null }
const CASOS: Caso[] = [
  { id: 'desafio-1-fase', titulo: 'Desafio 1 fase (5K) — criação', conta: { tipo: 'desafio', saldoInicial: 5000, fases: 1, programaNome: '5K · 1 fase' }, motivo: 'criacao', regras: REGRAS_1F },
  { id: 'desafio-2-fases-f1', titulo: 'Desafio 2 fases (10K) — fase 1, criação', conta: { tipo: 'desafio', saldoInicial: 10000, fase: 1, fases: 2, programaNome: '10K · 2 fases' }, motivo: 'criacao', regras: REGRAS_2F },
  { id: 'desafio-2-fases-f2', titulo: 'Desafio 2 fases (10K) — passagem à fase 2', conta: { tipo: 'desafio', saldoInicial: 10000, fase: 2, fases: 2, programaNome: '10K · 2 fases' }, motivo: 'fase', regras: REGRAS_2F },
  { id: 'funded', titulo: 'Conta Funded (3K) — emissão após aprovação', conta: { tipo: 'financiada', saldoInicial: 3000, fases: 1, programaNome: '3K · 1 fase' }, motivo: 'criacao' },
  { id: 'funded-reenvio', titulo: 'Conta Funded (3K) — reenvio dos dados (o caso do backfill de 15/09)', conta: { tipo: 'financiada', saldoInicial: 3000, fases: 1, programaNome: '3K · 1 fase' }, motivo: 'backfill' },
  { id: 'analise', titulo: 'Conta de análise (1K, financiada sem regras)', conta: { tipo: 'financiada', saldoInicial: 1000, fases: 1, programaNome: '1K · 1 fase', analise: true }, motivo: 'backfill' },
  { id: 'torneio', titulo: 'Torneio (10K)', conta: { tipo: 'torneio', saldoInicial: 10000, torneioNome: 'Trading Tournament Q3 2026' }, motivo: 'criacao', regras: { perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 5 } },
  { id: 'oferta-renovacao', titulo: 'Oferta da renovação (desafio 10K 1 fase)', conta: { tipo: 'desafio', saldoInicial: 10000, fases: 1, programaNome: '10K · 1 fase', ofertaRenovacao: true }, motivo: 'criacao', regras: REGRAS_1F },
]

function main() {
  mkdirSync(DIR, { recursive: true })
  const linhas: string[] = []
  const escrever = (nome: string, html: string, assunto: string, titulo: string) => {
    writeFileSync(join(DIR, nome), html.replaceAll('cid:mtm-logo', LOGO))
    linhas.push(`<tr><td>${titulo}</td><td><a href="${nome}">${nome}</a></td><td>${assunto.replace(/</g, '&lt;')}</td></tr>`)
  }

  for (const idioma of ['pt', 'en'] as Idioma[]) {
    const nome = idioma === 'pt' ? 'Joana' : 'Alex'
    for (const c of CASOS) {
      // Contas simuladas — o email das credenciais (link seguro).
      const e = montarEmailCredenciais({
        nome, login: '77123456', servidor: 'MTM Funded', conta: c.conta, idioma, motivo: c.motivo,
        urlLink: `${SITE}/mtmfunded/credenciais#t=EXEMPLO`, expiraEm: EXPIRA, urlWebtrader: `${SITE}/webtrader`, siteUrl: SITE,
      })
      escrever(`credenciais-${c.id}-${idioma}.html`, e.html, e.assunto, `[simulada · ${idioma}] ${c.titulo}`)
      writeFileSync(join(DIR, `credenciais-${c.id}-${idioma}.txt`), `Assunto: ${e.assunto}\n\n${e.texto}`)

      // Contas da corretora (MT5) — o email do agente.
      const m = montarEmailDaConta({
        para: 'exemplo@exemplo.pt', nome, conta: c.conta, idioma, motivo: c.motivo === 'backfill' ? 'reenvio' : c.motivo,
        login: '5012345', servidor: 'TheTradingMaster-Live', alavancagem: 100, urlPainel: `${SITE}/mtmfunded/tradingtournament/dashboard`,
        regras: c.regras ?? null,
      }, { site: SITE, logo: LOGO, temQr: false, qrDoMetaTrader: false })
      escrever(`mt5-${c.id}-${idioma}.html`, `<!doctype html><meta charset="utf-8"><title>${m.assunto}</title>${m.html}`, m.assunto, `[MT5 · ${idioma}] ${c.titulo}`)
    }

    // A oferta de gratidão (email próprio, envio em massa de 15/09).
    const o = montarEmailOferta({
      idioma, nome, login: '77123456', servidor: 'MTM Funded', saldo: 10000, programa: '10K · 2 fases', fases: 2, fase: 1,
      regras: REGRAS_2F, urlLink: `${SITE}/mtmfunded/credenciais#t=EXEMPLO`, expiraEm: EXPIRA, siteUrl: SITE,
      sorteios: [], premios: ['5× Desafio MTM Funded · 5K · 1 fase'], logoSrc: LOGO,
    })
    escrever(`oferta-gratidao-${idioma}.html`, o.html, o.assunto, `[oferta · ${idioma}] Oferta de gratidão (10K 2 fases)`)
  }

  writeFileSync(join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Pré-visualizações MTM Funded</title>
<style>body{font-family:system-ui;margin:24px}td{padding:4px 10px;border-bottom:1px solid #ddd;font-size:14px}</style>
<h1>Emails de entrega MTM Funded</h1><p>Gerado por scripts/mtmfunded-previews-emails.ts — nada foi enviado.</p>
<table><tr><th>Caso</th><th>Ficheiro</th><th>Assunto</th></tr>${linhas.join('\n')}</table>`)
  console.log(`${linhas.length} pré-visualizações em ${join(DIR, 'index.html')}`)
}

main()
