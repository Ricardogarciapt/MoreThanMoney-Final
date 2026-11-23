/**
 *   npx tsx lib/whatsapp/seguimento-site.check.ts
 */
import { codigoDoLink, lerCodigo, seguirLinks, urlDeDestino, SITE } from './link-seguido'
import { proximoToque, TEXTOS_SEGUIMENTO, type EstadoSeguimento } from './seguimento-site'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

// ── Links com rasto ─────────────────────────────────────────────────────────
const S = 'segredo-de-teste'
const c = codigoDoLink('+351912666699', 'e', S)
teste('lê o próprio código', lerCodigo(c, S)?.e164 === '+351912666699' && lerCodigo(c, S)?.destino === 'e')
teste('assinatura errada recusada', lerCodigo(c.slice(0, -1) + (c.endsWith('A') ? 'B' : 'A'), S) === null)
teste('destino trocado recusado', lerCodigo(c.replace(/e(.{7})$/, 'c$1'), S) === null)
teste('lixo recusado', lerCodigo('../../etc', S) === null && lerCodigo('', S) === null)
teste('código curto', c.length <= 20)
const t = seguirLinks(`Vê por dentro: ${SITE}/f/educacao\n\n🌐 ${SITE}\n\nAgenda: https://www.morethanmoney.pt/agendar?t=apresentacao&ag=AG-SETTER`, '+351912666699', 'https://www.morethanmoney.pt/agendar?t=apresentacao&ag=AG-SETTER', S)
teste('educação trocada', !t.includes('/f/educacao') && t.includes(`${SITE}/w/`))
teste('agenda trocada', !t.includes('/agendar'))
teste('três links com rasto', (t.match(/\/w\//g) ?? []).length === 3)
teste('outros links intactos', seguirLinks('https://youtube.com/x', '+351912666699', undefined, S) === 'https://youtube.com/x')
const u = new URL(urlDeDestino('e', c))
teste('utm whatsapp', u.pathname === '/f/educacao' && u.searchParams.get('utm_source') === 'whatsapp' && u.searchParams.get('utm_content') === c)

// ── Escada do seguimento ────────────────────────────────────────────────────
const H = 3_600_000
const agora = Date.parse('2026-11-23T12:00:00Z')
const iso = (msAtras: number) => new Date(agora - msAtras).toISOString()
const base: EstadoSeguimento = {
  stage: 'wa_rota_educacao', followupCount: 0, ultimaAtividadeIso: iso(H), ultimaEntradaIso: iso(H), ultimoToqueIso: null,
  clicouEmIso: null, lingua: 'pt', convertido: false, saiu: false, horaLisboa: 12, agora,
}
teste('calado 1 h sem clique → lembrete', proximoToque(base) === 'lembrete')
teste('clicou há 40 min → «vi que espreitaste»', proximoToque({ ...base, clicouEmIso: iso(40 * 60_000) }) === 'clique')
teste('clicou há 10 min → espera', proximoToque({ ...base, clicouEmIso: iso(10 * 60_000) }) === null)
teste('ativo há 20 min → espera', proximoToque({ ...base, ultimaAtividadeIso: iso(20 * 60_000) }) === null)
teste('de noite não', proximoToque({ ...base, horaLisboa: 22 }) === null)
teste('marcou → pára', proximoToque({ ...base, convertido: true }) === null)
teste('SAIR → pára', proximoToque({ ...base, saiu: true }) === null)
teste('pediu pessoa → pára', proximoToque({ ...base, stage: 'wa_humano' }) === null)
teste('ainda sem «Sim» → nada', proximoToque({ ...base, stage: 'wa_reencontro' }) === null)
teste('fora da janela no 1.º → nada (seria abordagem)', proximoToque({ ...base, ultimaEntradaIso: iso(30 * H) }) === null)
teste('toque 2 às 21 h da janela', proximoToque({ ...base, followupCount: 1, ultimaEntradaIso: iso(21 * H), ultimoToqueIso: iso(20 * H) }) === 'ultima_janela')
teste('toque 2 cedo demais', proximoToque({ ...base, followupCount: 1, ultimaEntradaIso: iso(10 * H), ultimoToqueIso: iso(9 * H) }) === null)
teste('janela fechada + 2 dias → template PT', proximoToque({ ...base, followupCount: 2, ultimaEntradaIso: iso(60 * H), ultimoToqueIso: iso(45 * H) }) === 'template')
teste('janela fechada estrangeiro → setter', proximoToque({ ...base, lingua: 'fr', followupCount: 2, ultimaEntradaIso: iso(60 * H), ultimoToqueIso: iso(45 * H) }) === 'setter')
teste('depois do template 3 dias → setter', proximoToque({ ...base, followupCount: 3, ultimaEntradaIso: iso(130 * H), ultimoToqueIso: iso(73 * H) }) === 'setter')
teste('4 toques → acabou', proximoToque({ ...base, followupCount: 4 }) === null)

for (const [l, tx] of Object.entries(TEXTOS_SEGUIMENTO)) {
  teste(`${l}: botões ≤ 20`, [tx.botaoDuvida, tx.botaoAgendar, tx.botaoPessoa].every((b) => b.length <= 20))
  teste(`${l}: corpo ≤ 1024`, tx.lembrete('Ana', 'x'.repeat(60)).length <= 1024 && tx.ultima('Ana', 'x'.repeat(60)).length <= 1024)
}

if (falhas.length) {
  console.error('seguimento-site: FALHOU\n - ' + falhas.join('\n - '))
  process.exit(1)
}
console.log('seguimento-site: OK')
