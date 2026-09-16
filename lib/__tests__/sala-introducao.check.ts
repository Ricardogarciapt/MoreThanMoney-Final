/**
 * A sala «Introdução» e os vídeos «Aprende a usar …».
 *
 * O que fica trancado aqui é aquilo que, se partir, parte em silêncio:
 *  • uma sala de gravação nunca pode ser lida como «ao vivo» (nem na lista, nem numa linha solta);
 *  • um link colado à pressa não pode chegar ao aluno como um leitor preto;
 *  • a gravação da sala de introdução não pode cair na playlist do curso;
 *  • a lista de destinos é a navbar — se as duas divergirem, o botão aparece no sítio errado.
 */
import {
  DESTINOS_NAVEGACAO,
  construirNavbar,
  destinoPorCaminho,
  destinoPorId,
  destinosComVideoIntro,
  textoAprendeAUsar,
} from '../navegacao'
import { classificarUrlIntro, textoBotao } from '../videos-intro'
import {
  CAPA_SALA_INTRODUCAO,
  CHAVE_SALA_INTRODUCAO,
  PLAYLIST_YOUTUBE_INTRODUCAO,
  decidirEstadoDaSala,
  podeOperarSala,
  salasOperadasPor,
} from '../lms-sala-introducao'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}

// ── 1. VISIBILIDADE: uma sala de gravação nunca é «ao vivo» ─────────────────
// Réplica exata das duas defesas da rota pública (app/api/live-sessions/streams/route.ts): o
// filtro da lista de live e a coerção linha a linha.
type Linha = { id: string; is_live: boolean; nunca_ao_vivo?: boolean }
const listarAoVivo = (linhas: Linha[]) => linhas.filter((l) => l.is_live && !l.nunca_ao_vivo)
const coagir = (l: Linha) => ({ ...l, is_live: l.nunca_ao_vivo ? false : l.is_live })

const salas: Linha[] = [
  { id: 'sensei', is_live: true },
  { id: 'introducao', is_live: false, nunca_ao_vivo: true },
  // o caso mau: alguém pôs is_live=true à mão na consola
  { id: 'introducao-estragada', is_live: true, nunca_ao_vivo: true },
]

eq('lista ao vivo ignora salas de gravação', listarAoVivo(salas).map((s) => s.id).join(','), 'sensei')
eq('sala normal continua ao vivo', coagir(salas[0]).is_live, true)
eq('sala de gravação nunca acende', coagir(salas[1]).is_live, false)
eq('linha estragada é apagada na leitura', coagir(salas[2]).is_live, false)

// A notificação de direto: mesma condição da rota do admin e da presença.
const notifica = (l: Linha & { transicao: boolean }) => l.transicao && !l.nunca_ao_vivo
eq('sala normal notifica', notifica({ id: 'x', is_live: true, transicao: true }), true)
eq('sala de gravação não notifica', notifica({ id: 'i', is_live: true, nunca_ao_vivo: true, transicao: true }), false)

// ── 2. CONFIGURAÇÃO DOS DESTINOS: validação do link ────────────────────────
const tipoDe = (u: string) => {
  const r = classificarUrlIntro(u)
  return r.ok ? r.tipo : `erro`
}

eq('vídeo do YouTube', tipoDe('https://www.youtube.com/watch?v=hKAQ72MsAwU'), 'youtube')
eq('youtu.be', tipoDe('https://youtu.be/hKAQ72MsAwU'), 'youtube')
eq('shorts ainda é vídeo', tipoDe('https://www.youtube.com/shorts/abc123'), 'youtube')
eq('playlist do YouTube', tipoDe('https://www.youtube.com/playlist?list=PL6XU0y2YUMZK39WNX1ViMzxo6QSx7l-zu'), 'playlist')
eq('vídeo dentro de playlist conta como playlist', tipoDe('https://www.youtube.com/watch?v=abc&list=PL123'), 'playlist')
eq('HLS nosso', tipoDe('https://stream.morethanmoney.pt/live/mtm_intro.m3u8'), 'hls')
eq('HLS com query', tipoDe('https://stream.morethanmoney.pt/live/x.m3u8?token=1'), 'hls')
eq('vimeo recusado', tipoDe('https://vimeo.com/123456'), 'erro')
eq('drive recusado', tipoDe('https://drive.google.com/file/d/1/view'), 'erro')
eq('mp4 solto recusado', tipoDe('https://exemplo.pt/video.mp4'), 'erro')
eq('vazio recusado', tipoDe('   '), 'erro')

// ── 3. O TEXTO DO BOTÃO usa a linguagem do destino ─────────────────────────
eq('scanner ao vivo', textoBotao('scanner-ao-vivo'), 'Aprende a usar o nosso scanner ao vivo')
eq('portefólios', textoBotao('portfolios'), 'Aprende a usar os portefólios')
eq('terminal', textoBotao('mtm-terminal'), 'Aprende a usar o Terminal MTM')
eq('rótulo do admin ganha', textoBotao('portfolios', 'os portefólios novos'), 'Aprende a usar os portefólios novos')
eq('rótulo em branco não ganha', textoBotao('mtm-terminal', '   '), 'Aprende a usar o Terminal MTM')
eq(
  'destino sem `comoUsar` cai no rótulo',
  textoAprendeAUsar({ id: 'x', href: '/x', rotuloPt: 'Coisa', grupo: 'topo' }),
  'Aprende a usar Coisa',
)

// ── 4. DESTINOS: a lista é a navbar, e os ids são únicos ───────────────────
const ids = DESTINOS_NAVEGACAO.map((d) => d.id)
eq('ids únicos', new Set(ids).size, ids.length)
eq('nenhum destino externo recebe vídeo', destinosComVideoIntro().some((d) => d.externo), false)
eq('o registo conhece o terminal', destinoPorId('mtm-terminal')?.href, '/mtm-terminal')
eq('id inventado não existe', destinoPorId('nao-existe'), null)

// O caminho → destino: é isto que faz o botão aparecer na página certa.
eq('caminho exato', destinoPorCaminho('/portfolios')?.id, 'portfolios')
eq('subcaminho pertence ao destino', destinoPorCaminho('/live-sessions/abc-123')?.id, 'live-sessions')
eq('barra final é indiferente', destinoPorCaminho('/mtm-terminal/')?.id, 'mtm-terminal')
eq('query é indiferente', destinoPorCaminho('/scanner?tab=x')?.id, 'scanners')
// O caso que um `startsWith` ingénuo estraga: /mtm não pode reclamar /mtm-terminal.
eq('/mtm não rouba /mtm-terminal', destinoPorCaminho('/mtm-terminal')?.id, 'mtm-terminal')
eq('/mtm não rouba /mtmauto', destinoPorCaminho('/mtmauto')?.id, 'mtmauto')
eq('/mtm não rouba /mtmfunded', destinoPorCaminho('/mtmfunded')?.id, 'mtmfunded')
eq('caminho desconhecido não inventa destino', destinoPorCaminho('/pagina-que-nao-existe'), null)
eq('caminho vazio', destinoPorCaminho(null), null)

// A navbar montada a partir do registo tem de manter a forma que tinha à mão.
const navbar = construirNavbar((c) => c) // tradutor que devolve a chave → cai no rótulo PT
eq('sete entradas de topo', navbar.length, 7)
eq('primeira é o início', navbar[0].href, '/new-landing')
eq('educação abre submenu', navbar.find((i) => i.id === 'educacao')?.submenu?.length, 4)
eq(
  'educação repete-se como primeiro item do próprio submenu',
  navbar.find((i) => i.id === 'educacao')?.submenu?.[0]?.name,
  'Educação MTM',
)
eq('trading tem as 11 entradas', navbar.find((i) => i.id === 'automacao')?.submenu?.length, 11)
eq('apps IA não se repete no submenu', navbar.find((i) => i.id === 'apps-ia')?.submenu?.[0]?.name, 'MTM Social')
eq('onboarding não tem submenu', navbar.find((i) => i.id === 'onboarding')?.submenu, undefined)
eq('links externos ficam marcados', navbar.find((i) => i.id === 'apps-ia')?.submenu?.[3]?.external, true)

// ── 5. DVR: para onde vai a gravação no YouTube ────────────────────────────
// Réplica da escolha feita em app/api/live-sessions/dvr/worker/route.ts.
const idDaUrl = (u: string | null) => {
  if (!u) return null
  try { return new URL(u).searchParams.get('list') } catch { return null }
}
function alvoPlaylist(s: {
  title: string
  academia: string
  playlist_url?: string | null
  playlist_title?: string | null
  dvr_playlist_title?: string | null
  dvr_playlist_url?: string | null
  jaResolvido?: string | null
}) {
  const proprio = (s.dvr_playlist_title || '').trim()
  const idProprio = idDaUrl(s.dvr_playlist_url || null)
  const idSala = idDaUrl(s.playlist_url || null)
  return {
    id: s.jaResolvido || (proprio ? idProprio : idProprio || idSala) || null,
    titulo: proprio || (s.playlist_title || '').trim() || `${s.title} · Gravações (${s.academia})`,
  }
}

// Sala normal: nada muda — continua a alimentar a playlist do curso.
const normal = alvoPlaylist({
  title: 'Império Cripto', academia: 'Cripto',
  playlist_url: 'https://www.youtube.com/playlist?list=PLCURSO',
  playlist_title: 'Império Cripto MTM',
})
eq('sala normal: playlist do curso', normal.id, 'PLCURSO')
eq('sala normal: nome do educador ganha', normal.titulo, 'Império Cripto MTM')

const semNada = alvoPlaylist({ title: 'Mindset', academia: 'MoreThanMoney' })
eq('sem playlist: título gerado', semNada.titulo, 'Mindset · Gravações (MoreThanMoney)')
eq('sem playlist: sem id', semNada.id, null)

// Sala de introdução: alvo próprio — e o curso NÃO é tocado.
const intro = alvoPlaylist({
  title: 'Introdução', academia: 'MoreThanMoney',
  playlist_url: 'https://www.youtube.com/playlist?list=PLCURSOINTRO',
  playlist_title: 'Como usar a MoreThanMoney',
  dvr_playlist_title: PLAYLIST_YOUTUBE_INTRODUCAO,
})
eq('introdução: título da playlist das gravações', intro.titulo, 'MTM Introdução')
eq('introdução: NÃO usa a playlist do curso', intro.id, null)

const intro2 = alvoPlaylist({
  title: 'Introdução', academia: 'MoreThanMoney',
  playlist_url: 'https://www.youtube.com/playlist?list=PLCURSOINTRO',
  dvr_playlist_title: PLAYLIST_YOUTUBE_INTRODUCAO,
  dvr_playlist_url: 'https://www.youtube.com/playlist?list=PLINTRODVR',
})
eq('introdução: a 2ª gravação volta à mesma lista', intro2.id, 'PLINTRODVR')

// A associação automática de volta à sala: o curso não pode ser substituído.
function patchDeVolta(s: { playlist_url?: string | null; playlist_title?: string | null; dvr_playlist_title?: string | null; dvr_playlist_url?: string | null; title: string }, novaUrl: string) {
  const patch: Record<string, string> = {}
  if ((s.dvr_playlist_title || '').trim()) {
    if (!s.dvr_playlist_url) patch.dvr_playlist_url = novaUrl
    if (!s.playlist_url) patch.playlist_url = novaUrl
  } else {
    if (!s.playlist_url) patch.playlist_url = novaUrl
    if (!s.playlist_title) patch.playlist_title = `${s.title} · Rever aulas`
  }
  return patch
}
eq(
  'introdução: grava no campo próprio',
  JSON.stringify(patchDeVolta({ title: 'Introdução', playlist_url: 'https://y/?list=PLCURSO', dvr_playlist_title: 'MTM Introdução' }, 'https://y/?list=PLNOVA')),
  JSON.stringify({ dvr_playlist_url: 'https://y/?list=PLNOVA' }),
)
eq(
  'introdução: o curso fica intacto',
  patchDeVolta({ title: 'Introdução', playlist_url: 'https://y/?list=PLCURSO', dvr_playlist_title: 'MTM Introdução' }, 'https://y/?list=PLNOVA').playlist_url,
  undefined,
)
// Decisão do dono (16/09): sem curso colado, o curso da Introdução É a playlist do DVR.
eq(
  'introdução sem curso: o curso passa a ser a playlist do DVR',
  JSON.stringify(patchDeVolta({ title: 'Introdução', dvr_playlist_title: 'MTM Introdução' }, 'https://y/?list=PLNOVA')),
  JSON.stringify({ dvr_playlist_url: 'https://y/?list=PLNOVA', playlist_url: 'https://y/?list=PLNOVA' }),
)
const rotaWorker = readFileSync(join(process.cwd(), 'app/api/live-sessions/dvr/worker/route.ts'), 'utf-8')
eq('o worker liga o curso à playlist do DVR quando está vazio', /dvr_playlist_url = playlistUrl[\s\S]{0,600}if \(!st\?\.playlist_url\) patch\.playlist_url = playlistUrl/.test(rotaWorker), true)
eq(
  'sala normal: continua a receber a playlist',
  patchDeVolta({ title: 'Sensei' }, 'https://y/?list=PLNOVA').playlist_url,
  'https://y/?list=PLNOVA',
)
eq(
  'sala normal: curadoria à mão ganha',
  patchDeVolta({ title: 'Sensei', playlist_url: 'https://y/?list=PLMAO', playlist_title: 'Aulas' }, 'https://y/?list=PLNOVA').playlist_url,
  undefined,
)

// ── 6. AUTENTICAÇÃO: quem pode mexer nisto ─────────────────────────────────
// A rota que configura os vídeos corre com a service-role. Uma rota assim sem guarda não é «menos
// protegida», não tem protecção nenhuma — já aconteceu neste repositório (ver o cabeçalho de
// app/api/admin/content-config/route.ts). Isto lê o ficheiro e confirma que cada método começa
// pela guarda, que é a única forma de o apanhar sem levantar um servidor.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rotaAdmin = readFileSync(join(process.cwd(), 'app/api/admin/videos-intro/route.ts'), 'utf-8')
const corpoDe = (metodo: string) => {
  const i = rotaAdmin.indexOf(`export async function ${metodo}(`)
  if (i < 0) return ''
  const fim = rotaAdmin.indexOf('\n}', i)
  return rotaAdmin.slice(i, fim > 0 ? fim : undefined)
}
for (const metodo of ['GET', 'PUT']) {
  const corpo = corpoDe(metodo)
  eq(`${metodo} existe`, corpo.length > 0, true)
  eq(`${metodo} pede requireAdmin`, corpo.includes('await requireAdmin(request)'), true)
  // A guarda tem de ser a PRIMEIRA coisa: verificar depois de escrever não serve de nada.
  eq(`${metodo} devolve a guarda antes de tudo`, /^[\s\S]{0,200}if \(guarda\) return guarda/.test(corpo), true)
}
// A rota pública é só de leitura: se algum dia ganhar escrita, isto cai.
const rotaPublica = readFileSync(join(process.cwd(), 'app/api/videos-intro/route.ts'), 'utf-8')
eq('rota pública não escreve', /export async function (POST|PUT|PATCH|DELETE)/.test(rotaPublica), false)

// ── 7. QUEM OPERA A SALA (sem ser o educador dela) ─────────────────────────
// A sala «Introdução» não tem educador de propósito. Quem a liga é o `operador_educator_id`.
// O que não pode acontecer é a porta abrir para mais alguém — em especial por comparação de
// nulos, que é como uma sala sem dono se torna uma sala de toda a gente.
const DONO = 'c6e156d5-842d-4aee-855e-d52c63e764c6'
const OUTRO = '00000000-0000-4000-8000-000000000001'

eq('educador da sala opera a sala', podeOperarSala({ educator_id: DONO }, DONO), true)
eq('operador opera sala sem educador', podeOperarSala({ educator_id: null, operador_educator_id: DONO }, DONO), true)
eq('estranho não opera', podeOperarSala({ educator_id: null, operador_educator_id: DONO }, OUTRO), false)
eq('educador de outra sala não opera esta', podeOperarSala({ educator_id: OUTRO }, DONO), false)
eq('sala órfã não é de ninguém', podeOperarSala({ educator_id: null, operador_educator_id: null }, DONO), false)
// Os dois nulos a encontrarem-se: sem identidade não há autorização.
eq('nulo não casa com nulo', podeOperarSala({ educator_id: null, operador_educator_id: null }, null), false)
eq('indefinido não casa com indefinido', podeOperarSala({}, undefined), false)
eq('sala inexistente', podeOperarSala(null, DONO), false)

// ── 7b. A INVARIANTE: a sala de gravação nunca acende ──────────────────────
// `decidirEstadoDaSala` é a única coisa que decide `is_live` na rota da presença — incluindo pelo
// caminho novo, o do operador. Se um dia alguém lhe acrescentar um `is_live: true` para as salas
// de gravação, é aqui que parte.
const iniciaGravacao = decidirEstadoDaSala({ nuncaAoVivo: true, querIniciar: true, querParar: false, agora: 'AGORA' })
eq('gravação: iniciar NÃO acende', iniciaGravacao.campos.is_live, false)
eq('gravação: iniciar marca a gravação', iniciaGravacao.campos.gravacao_iniciada_em, 'AGORA')
eq('gravação: não toca no live_started_at', 'live_started_at' in iniciaGravacao.campos, false)
eq('gravação: não notifica ninguém', iniciaGravacao.notificar, false)

const paraGravacao = decidirEstadoDaSala({ nuncaAoVivo: true, querIniciar: false, querParar: true, agora: 'AGORA' })
eq('gravação: terminar limpa a marca', paraGravacao.campos.gravacao_iniciada_em, null)
eq('gravação: terminar deixa is_live falso', paraGravacao.campos.is_live, false)

const iniciaNormal = decidirEstadoDaSala({ nuncaAoVivo: false, querIniciar: true, querParar: false, agora: 'AGORA' })
eq('sala normal: iniciar acende', iniciaNormal.campos.is_live, true)
eq('sala normal: iniciar notifica', iniciaNormal.notificar, true)
const paraNormal = decidirEstadoDaSala({ nuncaAoVivo: false, querIniciar: false, querParar: true, agora: 'AGORA' })
eq('sala normal: parar apaga', paraNormal.campos.is_live, false)
eq('sala normal: parar não notifica', paraNormal.notificar, false)

// Todas as combinações possíveis de pedido: numa sala de gravação nenhuma produz `true`.
let acendeuAlguma = false
for (const querIniciar of [true, false]) {
  for (const querParar of [true, false]) {
    const r = decidirEstadoDaSala({ nuncaAoVivo: true, querIniciar, querParar })
    if (r.campos.is_live === true || r.notificar) acendeuAlguma = true
  }
}
eq('gravação: nenhum pedido a põe em direto', acendeuAlguma, false)

// ── 7c. A ROTA DA PRESENÇA: onde a autorização é feita ─────────────────────
// A escrita passou a ser filtrada só por `id` (a sala não tem educador para casar com o filtro
// antigo). Isso só é seguro enquanto a autorização acontecer ANTES — e é isso que se lê aqui.
const rotaPresenca = readFileSync(
  join(process.cwd(), 'app/api/live-sessions/educator-auth/presence/route.ts'),
  'utf-8',
)
const iAutoriza = rotaPresenca.indexOf('podeOperarSala(')
const iEscreve = rotaPresenca.indexOf('.update(updates)')
eq('a presença pergunta quem pode operar', iAutoriza > 0, true)
eq('a presença escreve', iEscreve > 0, true)
eq('autoriza ANTES de escrever', iAutoriza < iEscreve, true)
// Um `.eq("educator_id", …)` agarrado ao update voltaria a excluir a sala sem educador; um
// `.or(…)` no update meteria a identidade de quem age dentro de uma string de filtro.
eq('o update não filtra por educador', /\.update\(updates\)[\s\S]{0,200}educator_id/.test(rotaPresenca), false)
eq('o update não usa .or()', /\.update\(updates\)[\s\S]{0,200}\.or\(/.test(rotaPresenca), false)
// E o estado ao vivo não se escreve à mão em lado nenhum da rota.
eq('a rota não acende salas à mão', /is_live\s*=\s*true/.test(rotaPresenca), false)

// A listagem: a sala operada só aparece a quem está autenticado como o operador. Na página
// pública do educador continua a não ser dele — operar não é aparecer.
const rotaLista = readFileSync(join(process.cwd(), 'app/api/live-sessions/streams/route.ts'), 'utf-8')
eq('a lista só junta as salas operadas na vista autenticada', /canSeeSecrets\s*\n?\s*\?\s*query\.or\(/.test(rotaLista), true)
eq('o operador entra no filtro', rotaLista.includes('operador_educator_id.eq.'), true)
eq('a vista pública continua só com o educador', /:\s*query\.eq\("educator_id", educatorId\)/.test(rotaLista), true)

// ── 7d. O QUE ELE VÊ NO STUDIO ─────────────────────────────────────────────
// O botão existe e o estado que o acompanha diz «gravação», não «direto». Esta é a diferença
// entre ele carregar à vontade e ele ter medo de carregar.
const studio = readFileSync(join(process.cwd(), 'components/live/educator-studio.tsx'), 'utf-8')
eq('há botão de iniciar transmissão', studio.includes('Iniciar transmissão'), true)
eq('há botão de terminar transmissão', studio.includes('Terminar transmissão'), true)
eq('o aviso está lá, à letra', studio.includes('A gravar para o DVR — esta sala não vai para o ar'), true)
eq('o estado é gravação, não direto', studio.includes('"A GRAVAR"'), true)
// A sala de gravação não se mistura com as normais: nada nela se chama «LIVE».
eq('o cartão de gravação lê a marca de gravação', studio.includes('sala.gravacao_iniciada_em'), true)

// ── 7e. A CHAVE PARTILHADA E O DESEMPATE DO DVR ────────────────────────────
// Decisão do dono (16/09): a sala de gravação usa a chave fixa do educador, para ele não ter de
// a trocar no OBS. A chave fixa é partilhada por VÁRIAS salas dele, por isso o `on_dvr` tem de
// saber a quem pertence o ficheiro — e a sala de gravação nunca está ao vivo, logo nunca ganha
// pelo critério antigo. Sem a ordenação por `gravacao_iniciada_em`, a gravação da introdução vai
// parar à playlist do curso de outra sala. Estes três testes são a rede por baixo disso.
const rotaDvr = readFileSync(join(process.cwd(), 'app/api/live-sessions/dvr/on-dvr/route.ts'), 'utf-8')
eq('o on-dvr lê a marca de gravação', rotaDvr.includes('gravacao_iniciada_em'), true)
eq('o on-dvr desempata pela sala a gravar', /\.order\("gravacao_iniciada_em"/.test(rotaDvr), true)
eq('ao vivo continua a ganhar a quem grava', rotaDvr.indexOf('.order("is_live"') < rotaDvr.indexOf('.order("gravacao_iniciada_em"'), true)
// E a presença deixa de impor chave própria à sala de gravação: usa a fixa como as outras.
eq('a sala de gravação usa a chave fixa do educador', /updates\.stream_key = shouldUseRestream \? restreamKey : fixedKey/.test(rotaPresenca), true)
// O Restream continua fora: o ficheiro tem de cair no NOSSO SRS ou não há gravação nenhuma.
eq('sala de gravação nunca vai por Restream', /!nuncaAoVivo && ingestProvider === "restream"/.test(rotaPresenca), true)

// ── 7f. O PAINEL DE GRAVAÇÕES: segue a SALA, não o educador ────────────────
// O painel do studio filtrava por `lms_dvr_jobs.educator_id`, que numa sala de gravação é null.
// Ele gravava, o vídeo subia ao YouTube, e o painel ficava vazio. Agora a pergunta é «que salas é
// que esta pessoa opera?» e os jobs procuram-se por `stream_id`.
const SALAS = [
  { id: 'live-trading', educator_id: DONO, operador_educator_id: null },
  { id: 'introducao', educator_id: null, operador_educator_id: DONO },
  { id: 'sala-de-outro', educator_id: OUTRO, operador_educator_id: null },
  { id: 'orfa', educator_id: null, operador_educator_id: null },
]
eq('a sala de gravação entra na lista dele', salasOperadasPor(SALAS, DONO).join(','), 'live-trading,introducao')
eq('as salas normais não desaparecem', salasOperadasPor(SALAS, DONO).includes('live-trading'), true)
eq('a sala de outro fica de fora', salasOperadasPor(SALAS, DONO).includes('sala-de-outro'), false)
// O caso que dá o painel de toda a gente a toda a gente: uma sala sem dono nenhum.
eq('a sala órfã não é de ninguém', salasOperadasPor(SALAS, DONO).includes('orfa'), false)
eq('sem identidade, nenhuma sala', salasOperadasPor(SALAS, null).length, 0)
eq('sem salas, lista vazia', salasOperadasPor([], DONO).length, 0)
eq('sem dados, lista vazia', salasOperadasPor(null, DONO).length, 0)
// A decisão é a MESMA de `podeOperarSala`: se as duas divergirem, uma delas está a mentir.
for (const sala of SALAS) {
  eq(`${sala.id}: a lista concorda com podeOperarSala`, salasOperadasPor([sala], DONO).length === 1, podeOperarSala(sala, DONO))
}

// A rota das gravações: o que se lê aqui é que ela deixou de perguntar pelo educador.
const rotaGravacoes = readFileSync(join(process.cwd(), 'app/api/live-sessions/dvr/route.ts'), 'utf-8')
eq('o painel pergunta que salas ele opera', rotaGravacoes.includes('idsDasSalasQueOpera'), true)
eq('o painel procura os jobs pela sala', /\.in\("stream_id"/.test(rotaGravacoes), true)
// Isto é a regressão a sério: um `.eq("educator_id", …)` de volta e a sala volta a ficar invisível.
eq('o painel não filtra gravações por educador', /\.eq\("educator_id"/.test(rotaGravacoes), false)
// E as ACÇÕES (preparar / YouTube / apagar) autorizam antes de escrever, como a presença.
const iAutorizaDvr = rotaGravacoes.indexOf('podeOperarSala(')
const iEscreveDvr = rotaGravacoes.indexOf('.update(')
eq('as acções perguntam quem pode operar', iAutorizaDvr > 0, true)
eq('as acções escrevem', iEscreveDvr > 0, true)
eq('as acções autorizam ANTES de escrever', iAutorizaDvr < iEscreveDvr, true)

// O `on_dvr` continua a copiar o educador da SALA — e não o operador. É isto que mantém o dono
// fora da lista de formadores no /admin, que agrupa as gravações por educador.
eq('o on-dvr copia o educador da sala', rotaDvr.includes('educator_id: st.educator_id'), true)
eq('o on-dvr não põe lá o operador', rotaDvr.includes('operador_educator_id'), false)

// No /admin, quem operou aparece — mas escrito como operador, nunca como formador.
const rotaAdminDvr = readFileSync(join(process.cwd(), 'app/api/admin/live-sessions/dvr/route.ts'), 'utf-8')
eq('o /admin mostra quem operou', rotaAdminDvr.includes('(operador)'), true)
eq('o formador continua a ganhar quando existe', /educatorName:\s*\n?\s*j\.educator\?\.display_name \|\|/.test(rotaAdminDvr), true)

// ── 8. constantes da sala ──────────────────────────────────────────────────
eq('chave de sistema estável', CHAVE_SALA_INTRODUCAO, 'introducao')
eq('capa aponta para um sítio só', CAPA_SALA_INTRODUCAO.includes('introducao-capa.png'), true)
eq('playlist das gravações tem nome próprio', PLAYLIST_YOUTUBE_INTRODUCAO, 'MTM Introdução')

console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
process.exit(mau === 0 ? 0 : 1)
