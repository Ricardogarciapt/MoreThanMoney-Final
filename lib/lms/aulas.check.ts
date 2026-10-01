/**
 * A GUARDA DAS AULAS ARRUMADAS.
 *
 *   npx tsx lib/lms/aulas.check.ts
 *
 * Três coisas que falham caladas: uma sala desaparecer, uma sala fechada ser escondida (e deixar
 * de se vender), e gravações pagas ficarem com cadeado porque alguém juntou os dois níveis.
 */
import { SEM_ACADEMIA, oQuePodeFazer, ordenarSalas, porAcademia, temGravacoes, type SalaDeAula } from './aulas'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const sala = (p: Partial<SalaDeAula> & { id: string }): SalaDeAula => ({ title: p.id, ...p })
const FOREX = { name: 'Forex', slug: 'forex' }
const CRIPTO = { name: 'Criptomoedas', slug: 'criptomoedas' }

// ── NENHUMA SALA SE PERDE ───────────────────────────────────────────────────
{
  const todas: SalaDeAula[] = [
    sala({ id: 'a', academy: FOREX, access_tier: 'free' }),
    sala({ id: 'b', academy: FOREX, access_tier: 'vip' }),
    sala({ id: 'c', academy: CRIPTO, access_tier: 'all' }),
    // Esta não tem academia. É o caso que um `if (s.academy)` apagava sem ninguém ver.
    sala({ id: 'orfa', academy: null, access_tier: 'free' }),
  ]
  const grupos = porAcademia(todas)
  const contadas = grupos.reduce((n, g) => n + g.salas.length, 0)
  teste('nenhuma sala se perde no agrupamento', contadas === todas.length)
  teste('a sala sem academia tem grupo próprio',
    grupos.some((g) => g.nome === SEM_ACADEMIA && g.salas.some((s) => s.id === 'orfa')))
  teste('e esse grupo vai para o fim', grupos[grupos.length - 1].nome === SEM_ACADEMIA)

  // Sem id não é sala nenhuma.
  teste('entradas sem id não entram', porAcademia([sala({ id: '' })]).length === 0)
  teste('lista vazia dá lista vazia', porAcademia([]).length === 0)
}

// ── A ORDEM ─────────────────────────────────────────────────────────────────
{
  const grupos = porAcademia([
    sala({ id: 'x', academy: CRIPTO, access_tier: 'all' }),
    sala({ id: 'y', academy: FOREX, access_tier: 'free', is_live: true }),
    sala({ id: 'z', academy: FOREX, access_tier: 'vip' }),
  ])
  teste('a academia com algo ao vivo vem primeiro', grupos[0].nome === 'Forex')
  teste('e diz quantas estão ao vivo', grupos[0].aoVivo === 1)

  /**
   * Dentro da academia, a mais ABERTA à frente. Abrir a lista pela «Mentoria VIP» dava um cadeado
   * na primeira linha a quem ainda está a decidir se isto é para ele.
   */
  const ordenadas = ordenarSalas([
    sala({ id: 'vip', title: 'Mentoria VIP', access_tier: 'vip' }),
    sala({ id: 'livre', title: 'Live Trading', access_tier: 'free' }),
    sala({ id: 'membro', title: 'Basics', access_tier: 'app_member' }),
  ])
  teste('a mais aberta vem primeiro', ordenadas[0].id === 'livre')
  teste('e a VIP fica no fim', ordenadas[2].id === 'vip')

  // Ao vivo ganha a tudo: uma aula a decorrer agora é o que a pessoa veio ver.
  const comLive = ordenarSalas([
    sala({ id: 'livre', access_tier: 'free' }),
    sala({ id: 'vip-live', access_tier: 'vip', is_live: true }),
  ])
  teste('ao vivo passa à frente mesmo sendo VIP', comLive[0].id === 'vip-live')

  // Estável: a mesma lista ao contrário dá a mesma ordem.
  const a = ordenarSalas([sala({ id: '1', title: 'Alfa', access_tier: 'free' }), sala({ id: '2', title: 'Beta', access_tier: 'free' })])
  const b = ordenarSalas([sala({ id: '2', title: 'Beta', access_tier: 'free' }), sala({ id: '1', title: 'Alfa', access_tier: 'free' })])
  teste('a ordem é estável', a[0].id === b[0].id)
  teste('ordenar não mexe na lista original', (() => {
    const orig = [sala({ id: 'vip', access_tier: 'vip' }), sala({ id: 'livre', access_tier: 'free' })]
    ordenarSalas(orig)
    return orig[0].id === 'vip'
  })())
}

// ── AS SALAS FECHADAS MOSTRAM-SE ────────────────────────────────────────────
{
  /**
   * Esconder o que a pessoa não pode ver parece respeitar o nível. O que faz é tirar da montra o
   * que ainda está por vender: quem nunca vê a sala VIP nunca sabe que ela existe. `porAcademia`
   * não filtra por nível nenhum — a decisão de abrir é de quem desenha o cadeado.
   */
  const visitante = () => false
  const grupos = porAcademia([sala({ id: 'vip', academy: FOREX, access_tier: 'vip' })])
  teste('uma sala fechada continua na lista', grupos[0].salas.length === 1)
  teste('mas sem direito a entrar',
    !oQuePodeFazer(grupos[0].salas[0], visitante).podeEntrar)
}

// ── GRAVAÇÕES E EMISSÃO SÃO NÍVEIS SEPARADOS ────────────────────────────────
{
  /**
   * O CASO MAU. Há salas cuja emissão é VIP e cujas gravações abrem a membros. Juntar os dois
   * níveis fechava gravações que estão pagas — e não dá erro: a pessoa só vê um cadeado onde
   * devia ter aula.
   */
  const soMembro = (tier: string | null | undefined) => tier !== 'vip'
  const s = sala({
    id: 'mentoria', access_tier: 'vip',
    playlist_url: 'https://youtube.com/playlist?list=abc', playlist_access_tier: 'app_member',
  })
  const r = oQuePodeFazer(s, soMembro)
  teste('não entra na emissão VIP', !r.podeEntrar)
  teste('MAS pode rever as gravações de membro', r.podeRever)

  // Sem nível próprio, a gravação segue o da sala — que é o que a base faz hoje.
  const semNivelProprio = sala({ id: 'x', access_tier: 'vip', playlist_url: 'https://y/p' })
  teste('sem nível próprio, a gravação segue a sala', !oQuePodeFazer(semNivelProprio, soMembro).podeRever)

  // Sem playlist não há nada a rever, mesmo com direito a tudo.
  const semPlaylist = sala({ id: 'z', access_tier: 'free' })
  teste('sem playlist não há gravações', !temGravacoes(semPlaylist))
  teste('e não se promete rever o que não existe', !oQuePodeFazer(semPlaylist, () => true).podeRever)
  teste('playlist em branco não conta', !temGravacoes(sala({ id: 'w', playlist_url: '   ' })))
}

if (falhas.length) {
  console.error(`lms/aulas: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('lms/aulas: nenhuma sala se perde, as fechadas vêem-se, e as gravações têm nível próprio ✓')
