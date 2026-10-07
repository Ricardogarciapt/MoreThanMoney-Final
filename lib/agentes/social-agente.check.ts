/**
 * GUARDA DOS POSTS DOS AGENTES (07/10).   npx tsx lib/agentes/social-agente.check.ts
 *
 * Os casos MAUS primeiro: um post fora da marca NÃO fica aprovado (paleta creme/terracota, promessa
 * de lucro, euros ganhos, «+340%», pips sem origem, @ errado, sem ?ag=, conta pessoal, outro agente),
 * e o tecto diário (2 posts + 1 história por conta) é respeitado. Depois o bom: entra aprovado.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { marcarConteudo } from './marca-conteudo'
import {
  AUTO_PADRAO, CONTA_MARCA, PALETA_CARTAO_CASA, corDaCasa, decidirEntrada, guardaDaMarca, lerAutoPublicar,
  type PostDoAgente,
} from './social-agente'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }
const ligado = { ...AUTO_PADRAO, ligado: true }
const zero = { posts: 0, historias: 0 }

const legendaBoa = marcarConteudo({
  legenda: 'Disciplina antes do gráfico. Começa pelo plano de 3 passos em morethanmoney.pt/register — @morethanmoney.pt',
  codigoExplicito: 'AG-SOCIAL',
}).legenda
const bom: PostDoAgente = { ig_account_id: CONTA_MARCA, media_type: 'IMAGE', caption: legendaBoa, paleta: PALETA_CARTAO_CASA, agente_codigo: 'AG-SOCIAL' }
const com = (extra: Partial<PostDoAgente>): PostDoAgente => ({ ...bom, ...extra })
const naoAprova = (n: string, p: PostDoAgente) => {
  const d = decidirEntrada(p, ligado, zero)
  teste(`${n}: não fica aprovado`, d.status === 'draft')
  teste(`${n}: fica com motivo escrito`, d.motivo.startsWith('Guarda da marca:'))
}

// ── MAUS: fora da marca nunca é aprovado ─────────────────────────────────────────────────────
naoAprova('creme', com({ paleta: ['#D2A63C', '#F5F2EA'] }))
naoAprova('terracota', com({ paleta: ['#C65D3B', '#141414'] }))
naoAprova('azul ciano', com({ paleta: ['#0097B2'] }))
naoAprova('paleta não declarada', com({ paleta: [] }))
naoAprova('promessa de lucro', com({ caption: legendaBoa + '\nLucro garantido todos os meses.' }))
naoAprova('sem risco', com({ caption: legendaBoa + '\nSem risco nenhum.' }))
naoAprova('euros ganhos', com({ caption: legendaBoa + '\nO João fez +2.400€ este mês.' }))
naoAprova('ganhou X euros', com({ caption: legendaBoa + '\nGanhou 500 euros numa semana.' }))
naoAprova('+340%', com({ caption: legendaBoa + '\n+340% em 90 dias.' }))
naoAprova('win rate', com({ caption: legendaBoa + '\nWin rate de 63%.' }))
naoAprova('pips sem origem', com({ caption: legendaBoa + '\n+1.200 pips no ouro.' }))
naoAprova('handle sem ponto', com({ caption: legendaBoa.replace('@morethanmoney.pt', '@morethanmoneypt') }))
naoAprova('handle antigo', com({ caption: legendaBoa + ' @morethanmoney_mtm' }))
naoAprova('sem ?ag=', com({ caption: 'Disciplina antes do gráfico. morethanmoney.pt/register' }))
naoAprova('?ag= de outro agente', com({ caption: marcarConteudo({ legenda: 'Vê em morethanmoney.pt/register', codigoExplicito: 'AG-SAAS' }).legenda }))
naoAprova('conta pessoal', com({ ig_account_id: '17841405656956716' }))
naoAprova('agente que não é o Social', com({ agente_codigo: 'AG-SAAS' }))
naoAprova('reel não é dos agentes', com({ media_type: 'REELS' }))

// ── O tecto diário ──────────────────────────────────────────────────────────────────────────
teste('3.º post do dia fica rascunho', decidirEntrada(bom, ligado, { posts: 2, historias: 0 }).status === 'draft')
teste('2.º post do dia passa', decidirEntrada(bom, ligado, { posts: 1, historias: 0 }).status === 'approved')
teste('2.ª história do dia fica rascunho', decidirEntrada(com({ media_type: 'STORIES' }), ligado, { posts: 0, historias: 1 }).status === 'draft')
teste('1.ª história passa mesmo com 2 posts', decidirEntrada(com({ media_type: 'STORIES' }), ligado, { posts: 2, historias: 0 }).status === 'approved')
teste('contagem ilegível não aprova', decidirEntrada(bom, ligado, null).status === 'draft')
teste('tecto nunca sobe acima de 2/1', (() => { const c = lerAutoPublicar({ ligado: true, posts_dia_conta: 50, historias_dia_conta: 9 }); return c.posts_dia_conta === 2 && c.historias_dia_conta === 1 })())
teste('setting ilegível = desligado', lerAutoPublicar('lixo').ligado === false)

// ── Pausa do dono: botão desligado → nada aprova ─────────────────────────────────────────────
teste('desligado: post bom fica rascunho', decidirEntrada(bom, { ...ligado, ligado: false }, zero).status === 'draft')

// ── BONS ─────────────────────────────────────────────────────────────────────────────────────
teste('post da marca entra aprovado', decidirEntrada(bom, ligado, zero).status === 'approved')
teste('filho do Social também publica', guardaDaMarca(com({ agente_codigo: 'AG-SOCIAL-1', caption: marcarConteudo({ legenda: 'Vê em morethanmoney.pt/register', codigoExplicito: 'AG-SOCIAL-1' }).legenda })).ok)
teste('pips com origem passa', guardaDaMarca(com({ caption: legendaBoa + '\n+120 pips no EURUSD esta semana. Fonte: conta-espelho MTM, 01–07/10.' })).ok)
teste('preço da oferta não é resultado', guardaDaMarca(com({ caption: legendaBoa + '\nMembro por 35€/mês.' })).ok)
for (const c of ['#D2A63C', '#E9C46A', '#141414', '#0B0D12', '#FFFFFF']) teste(`cor da casa ${c}`, corDaCasa(c))
for (const c of ['#F5F2EA', '#C65D3B', '#0097B2', '#E07A5F']) teste(`cor fora ${c}`, !corDaCasa(c))

// ── A rota e o cron usam a guarda ────────────────────────────────────────────────────────────
{
  const raiz = join(__dirname, '..', '..')
  const rota = readFileSync(join(raiz, 'app/api/admin/agentes/social/route.ts'), 'utf8')
  teste('rota decide com decidirEntrada', rota.includes('decidirEntrada('))
  teste('rota marca a legenda com o código do agente', rota.includes('marcarConteudo('))
  teste('rota grava created_by agente:', rota.includes('`agente:${'))
  const cron = readFileSync(join(raiz, 'app/api/cron/ig-publish/route.ts'), 'utf8')
  teste('cron respeita a pausa dos posts dos agentes', cron.includes('CHAVE_AUTO_PUBLICAR'))
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n - ` + falhas.join('\n - '))
  process.exit(1)
}
console.log('✓ guarda social: fora da marca fica rascunho (paleta, promessas, números, @, ?ag=), tecto 2 posts + 1 história por conta/dia, pausa do dono respeitada')
