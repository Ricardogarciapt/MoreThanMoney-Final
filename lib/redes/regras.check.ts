/** npx tsx lib/redes/regras.check.ts */
import { adaptarLegenda, assinarState, escaparLinkedin, lerState, partesTiktok, tituloShort } from './regras'
let f = 0
const certo = (c: boolean, o: string) => { if (!c) { f++; console.error('  ✗ ' + o) } }

const ig = 'Num negócio pequeno, as horas fogem.\n\nComenta AUTOMATIZAR e marcamos uma conversa.\n\n#automacao —INTERNO— nota para a equipa'
const tk = adaptarLegenda(ig, 'tiktok')
certo(!/comenta/i.test(tk), 'TikTok: a palavra-chave do IG sai')
certo(tk.includes('Link na bio'), 'TikTok: link na bio (links não clicam lá)')
certo(!tk.includes('INTERNO') && !tk.includes('nota para a equipa'), 'bloco interno nunca sai')
const li = adaptarLegenda(ig, 'linkedin')
certo(li.includes('https://www.morethanmoney.pt/?ag=AG-SOCIAL&utm_source=linkedin'), 'LinkedIn: link com ?ag= e origem')
const sem = adaptarLegenda('Só texto.', 'youtube')
certo(sem.endsWith('utm_source=youtube'), 'sem linha «Comenta» junta o link no fim')

certo(tituloShort('Primeira linha\n\nresto') === 'Primeira linha #Shorts', 'título do Short = 1.ª linha + #Shorts')
certo(tituloShort('x'.repeat(200)).length <= 97, 'título do Short cabe nos 100 do YouTube')

certo(escaparLinkedin('a (b) #c') === 'a \\(b\\) \\#c', 'LinkedIn escapa parênteses e cardinais')

const seg = 'segredo-de-teste'
const st = assinarState('tiktok', 'morethanmoney', seg, 1_000_000)
certo(JSON.stringify(lerState(st, seg, 1_000_000 + 60_000)) === '{"rede":"tiktok","marca":"morethanmoney"}', 'state válido lê-se')
certo(lerState(st, 'outro', 1_000_000) === null, 'state com outro segredo é recusado')
certo(lerState(st, seg, 1_000_000 + 16 * 60_000) === null, 'state com mais de 15 min é recusado')
certo(lerState(st.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), seg, 1_000_000) === null, 'state mexido é recusado')

certo(partesTiktok(20 * 1024 * 1024).total === 1, 'TikTok: 20 MB vai numa parte')
const g = partesTiktok(150 * 1024 * 1024)
certo(g.total === 15 && g.chunk === 10 * 1024 * 1024, 'TikTok: 150 MB em 15 partes de 10 MB')

if (f) { console.error(`redes: ${f} falha(s)`); process.exit(1) }
console.log('redes: legendas adaptadas por rede, state assinado e partes do TikTok ✓')
