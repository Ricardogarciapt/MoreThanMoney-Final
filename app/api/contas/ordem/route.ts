import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { normalizarOrdem } from '@/lib/webtrader/ordem-contas'
import { normalizarFiltro } from '@/lib/webtrader/filtro-contas'
import { normalizarOcultas } from '@/lib/webtrader/ocultar-contas'
import { tabelaDaEtiqueta } from '@/lib/contas/etiqueta'

export const dynamic = 'force-dynamic'

/**
 * A ORDEM DAS CONTAS NO SELETOR, e qual delas é a FAVORITA (pedido do dono, 23/09).
 *
 *   GET                                  →  { ordem, favorita, filtroContas, ocultas, umCliqueAceite, umClique }
 *   PATCH { ordem: string[] }            →  grava a ordem que a pessoa arrastou
 *   PATCH { ocultas: string[] }          →  as contas escondidas no modo organizar do seletor
 *   PATCH { favorita: ref | null }       →  marca (ou desmarca) a conta que abre primeiro
 *   PATCH { filtroContas: 'minhas' … }   →  «As minhas» / «Mestres» / «Todas» no seletor
 *   PATCH { filtroContasTorneio: … }     →  o mesmo filtro, mas o do painel do torneio
 *   PATCH { umCliqueAceite: true }       →  a pessoa leu e aceitou o aviso da negociação num clique
 *   PATCH { umClique: {conta, ligado} }  →  a negociação num clique, ligada ou desligada NAQUELA conta
 *
 * A ORDEM é uma lista de referências do seletor, guardada em `profiles.profile_data.webtrader`.
 * Fica na CONTA da pessoa e não no dispositivo: quem arruma as contas no computador encontra-as
 * arrumadas no telemóvel. Não se valida contra a base a que conta cada id pertence — é uma
 * preferência de apresentação, e um id que não exista é ignorado ao mostrar (ordem-contas.ts).
 *
 * A FAVORITA é UMA só, e é a referência do seletor — MTM Funded, TradeLocker ou MT5, todas podem
 * ser (o seletor ficaria torto se metade das linhas tivesse estrela e a outra metade não). Vive ao
 * lado da ordem, em `profile_data.webtrader.favorita`; nas MTM Funded escreve-se também na coluna
 * `favorita` (122), que é por onde o resto do sistema a lê. Como em toda a família destas rotas, o
 * UPDATE leva sempre `user_id = quem pede`: ninguém marca a conta de outra pessoa, e uma conta
 * ligada com a password investor (que é de outro dono) fica de fora.
 *
 * As OCULTAS (24/09) são a lista de contas que a pessoa escondeu no modo organizar do seletor.
 * Vivem ao lado da ordem (`profile_data.webtrader.contas_ocultas`) porque são a mesma natureza de
 * coisa: uma preferência de apresentação, uma lista de referências do seletor, que segue para o
 * telemóvel. ESCONDER NÃO É APAGAR e não tira acesso a nada — a conta continua lá, continua a
 * poder ser negociada, e volta ao ecrã pelo mesmo olho que a escondeu (lib/webtrader/ocultar-contas.ts).
 *
 * O FILTRO (24/09) é só isso: qual dos três botões do seletor está premido. Vive ao lado da ordem
 * (`profile_data.webtrader.filtro_contas`) para seguir para o telemóvel, e não decide acesso
 * nenhum — quem não tem contas mestre não ganha nenhuma por gravar «mestres» aqui.
 *
 * O painel do torneio tem o MESMO filtro e a MESMA regra (lib/webtrader/filtro-contas.ts), mas
 * chave PRÓPRIA (`filtro_contas_torneio`). As duas listas não são a mesma: o seletor do WebTrader
 * mostra também as contas da corretora e as sessões do separador, o painel do torneio mostra só
 * as contas MTM Funded da pessoa. Partilhar o valor queria dizer que pôr «Mestres» no WebTrader
 * para espreitar uma estratégia abria o painel do torneio só com as contas da casa — exactamente
 * o contrário do que o dono pediu para este ecrã.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ ordem: [], favorita: null, filtroContas: normalizarFiltro(null), filtroContasTorneio: normalizarFiltro(null), ocultas: [] }, { headers: { 'Cache-Control': 'no-store' } })
  const db = getSupabaseAdmin()
  const [{ data: perfil }, { data: fav }] = await Promise.all([
    db.from('profiles').select('profile_data').eq('id', userId).maybeSingle(),
    db.from('mtm_trading_accounts').select('id').eq('user_id', userId).eq('favorita', true).maybeSingle(),
  ])
  const dados = (perfil?.profile_data ?? {}) as Record<string, unknown>
  const wt = (dados.webtrader ?? {}) as Record<string, unknown>
  // A do perfil manda (serve as três famílias); a coluna é o que o resto do sistema lê e o que
  // sobra de uma conta marcada pelo admin — por isso é a alternativa, não a primeira escolha.
  const escolhida = typeof wt.favorita === 'string' && wt.favorita ? wt.favorita : (fav?.id ?? null)
  return NextResponse.json(
    {
      ordem: normalizarOrdem(wt.ordem_contas),
      favorita: escolhida,
      filtroContas: normalizarFiltro(wt.filtro_contas),
      filtroContasTorneio: normalizarFiltro(wt.filtro_contas_torneio),
      ocultas: normalizarOcultas(wt.contas_ocultas),
      // Negociação num clique: o aviso aceita-se UMA vez (fica na conta da pessoa, não no
      // dispositivo — aceitar no computador e voltar a ser interrogado no telemóvel era o que
      // fazia isto parecer partido) e o interruptor é por conta.
      umCliqueAceite: typeof wt.um_clique_aceite === 'string' ? wt.um_clique_aceite : null,
      umClique: (wt.um_clique ?? {}) as Record<string, boolean>,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function PATCH(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Entra com a tua conta MTM para arrumar as contas.' }, { status: 401 })
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()

  // ── a conta que abre primeiro ────────────────────────────────────────────
  if ('favorita' in corpo) {
    const ref = corpo.favorita == null ? null : String(corpo.favorita)
    const alvo = ref ? tabelaDaEtiqueta(ref) : null
    // Uma sessão TradeLocker deste separador não tem linha na base — e também não sobrevive ao
    // fim do separador, por isso não serve de favorita.
    if (ref && !alvo) return NextResponse.json({ error: 'Esta conta não pode ser a favorita — só as que estão ligadas à tua conta MTM.' }, { status: 400 })
    // O id que o seletor usa: as MTM Funded aparecem pelo uuid, as reais pela ref inteira.
    const idNoSeletor = alvo ? (alvo.tabela === 'mtm_trading_accounts' ? alvo.id : ref) : null

    // A coluna (122) segue o que for MTM Funded; é uma só por pessoa, por isso limpa-se a anterior.
    const limpar = await db.from('mtm_trading_accounts').update({ favorita: false }).eq('user_id', userId).eq('favorita', true)
    const semColuna = limpar.error?.code === '42703'
    if (limpar.error && !semColuna) return NextResponse.json({ error: 'Não foi possível gravar a favorita.' }, { status: 500 })
    if (alvo?.tabela === 'mtm_trading_accounts' && !semColuna) {
      const { data, error } = await db.from('mtm_trading_accounts').update({ favorita: true })
        .eq('id', alvo.id).eq('user_id', userId).select('id').maybeSingle()
      if (error) return NextResponse.json({ error: 'Não foi possível gravar a favorita.' }, { status: 500 })
      if (!data) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
    }
    // A conta de outra família confirma-se no sítio dela antes de entrar no perfil.
    if (alvo && alvo.tabela !== 'mtm_trading_accounts') {
      const { data } = await db.from(alvo.tabela).select('id').eq('id', alvo.id).eq('user_id', userId).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
    }

    const guardado = await guardarNoPerfil(db, userId, (wt) => ({ ...wt, favorita: idNoSeletor }))
    if (!guardado) return NextResponse.json({ error: 'Não foi possível gravar a favorita.' }, { status: 500 })
    return NextResponse.json({ ok: true, favorita: idNoSeletor }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── o filtro do seletor: as minhas / as mestres / todas ──────────────────
  if ('filtroContas' in corpo) {
    const filtro = normalizarFiltro(corpo.filtroContas)
    const ok = await guardarNoPerfil(db, userId, (wt) => ({ ...wt, filtro_contas: filtro }))
    if (!ok) return NextResponse.json({ error: 'Não foi possível gravar o filtro.' }, { status: 500 })
    return NextResponse.json({ ok: true, filtroContas: filtro }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── o mesmo filtro, no painel do torneio (chave própria: ver o cabeçalho) ─
  if ('filtroContasTorneio' in corpo) {
    const filtro = normalizarFiltro(corpo.filtroContasTorneio)
    const ok = await guardarNoPerfil(db, userId, (wt) => ({ ...wt, filtro_contas_torneio: filtro }))
    if (!ok) return NextResponse.json({ error: 'Não foi possível gravar o filtro.' }, { status: 500 })
    return NextResponse.json({ ok: true, filtroContasTorneio: filtro }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── as contas escondidas no modo organizar ───────────────────────────────
  if ('ocultas' in corpo) {
    if (!Array.isArray(corpo.ocultas)) return NextResponse.json({ error: 'Falta a lista das contas escondidas.' }, { status: 400 })
    // Não se valida contra a base a quem pertence cada id: esconder é uma preferência de vista, e
    // esconder a conta de outra pessoa na SUA lista não lhe faz nada a ela — nem lhe dá acesso.
    const ocultas = normalizarOcultas(corpo.ocultas)
    const ok = await guardarNoPerfil(db, userId, (wt) => ({ ...wt, contas_ocultas: ocultas }))
    if (!ok) return NextResponse.json({ error: 'Não foi possível gravar as contas escondidas.' }, { status: 500 })
    return NextResponse.json({ ok: true, ocultas }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── negociação num clique: o aviso aceite (uma vez por pessoa) ───────────
  if (corpo.umCliqueAceite === true) {
    const agora = new Date().toISOString()
    const ok = await guardarNoPerfil(db, userId, (wt) => ({ ...wt, um_clique_aceite: wt.um_clique_aceite ?? agora }))
    if (!ok) return NextResponse.json({ error: 'Não foi possível gravar.' }, { status: 500 })
    return NextResponse.json({ ok: true, umCliqueAceite: agora }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── negociação num clique: ligada/desligada numa conta ───────────────────
  if (corpo.umClique && typeof corpo.umClique === 'object') {
    const { conta, ligado } = corpo.umClique as { conta?: unknown; ligado?: unknown }
    const id = String(conta ?? '').trim()
    if (!id || id.length > 200) return NextResponse.json({ error: 'Falta a conta.' }, { status: 400 })
    const ok = await guardarNoPerfil(db, userId, (wt) => {
      const mapa = { ...((wt.um_clique ?? {}) as Record<string, boolean>) }
      if (ligado === true) mapa[id] = true
      else delete mapa[id]
      return { ...wt, um_clique: mapa }
    })
    if (!ok) return NextResponse.json({ error: 'Não foi possível gravar.' }, { status: 500 })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── a ordem arrastada ────────────────────────────────────────────────────
  if (!Array.isArray(corpo.ordem)) {
    return NextResponse.json({ error: 'Falta a ordem das contas.' }, { status: 400 })
  }
  const ordem = normalizarOrdem(corpo.ordem)
  const guardado = await guardarNoPerfil(db, userId, (wt) => ({ ...wt, ordem_contas: ordem }))
  if (!guardado) return NextResponse.json({ error: 'Não foi possível gravar a ordem.' }, { status: 500 })
  return NextResponse.json({ ok: true, ordem }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Escreve dentro de `profile_data.webtrader` sem levar o resto do `profile_data` à frente — ali
 * dentro vive também o estado de activação do membro, e um `update` cego apagava-o.
 */
async function guardarNoPerfil(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  mudar: (wt: Record<string, unknown>) => Record<string, unknown>,
): Promise<boolean> {
  const { data: perfil, error } = await db.from('profiles').select('profile_data').eq('id', userId).maybeSingle()
  if (error) return false
  const dados = (perfil?.profile_data ?? {}) as Record<string, unknown>
  const wt = mudar((dados.webtrader ?? {}) as Record<string, unknown>)
  const { error: eGravar } = await db.from('profiles').update({ profile_data: { ...dados, webtrader: wt } }).eq('id', userId)
  return !eGravar
}
