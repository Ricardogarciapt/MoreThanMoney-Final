/**
 * RESSINCRONIZAR AS ROTAS DE UMA ESTRATÉGIA — a mesma coisa que
 * `scripts/mestres/sincronizar-rotas.ts --aplicar --estrategia <slug>`, mas chamável de dentro do
 * site (o quadro da cadeia chama isto depois de mexer no DESEJO do cliente).
 *
 * Porque é que isto tem de existir: as rotas das mestres (`copia_rotas` com `mestres=true`) são
 * DERIVADAS do que o cliente escolheu — `strategy_lots` no site, `mtmauto_subscriptions` no MTM
 * Auto. Quem escrever uma rota à mão vê-a desaparecer na sincronização seguinte. Então quem mexe
 * no desejo tem de chamar o mesmo cálculo que o script chama, com as mesmas funções puras
 * (`planearRotasDaEstrategia` + `planoDeEscrita`), e NÃO uma segunda versão da regra.
 *
 * O que isto nunca faz:
 *  · não apaga rotas — uma rota que deixou de ser desejada fica activa e PAUSADA enquanto tiver
 *    posições abertas, para o motor as continuar a gerir até fecharem (planoDeEscrita.retirar);
 *  · não muda `copia_rotas.modo` — as rotas nascem sempre em `shadow`; o live decide-se em
 *    `mestres_estrategias` / `mestres_contas` (ver lib/copia-contas/cadeia.ts);
 *  · não toca na CopyFactory. O corte da CopyFactory é outro caminho, com a sua própria confirmação.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { direitoMtmAuto } from '@/lib/entitlements'
import { ligacaoSegueEstrategia, ligacaoSegueGrupoTelegram, planearRotasDaEstrategia, planoDeEscrita } from '../planear'
import { seguidoresExtra } from '../premium'
import { lerEstrategiaMestre } from '../tipos'

export interface ResultadoSincronizacao {
  slug: string
  /** false = não há linha em `mestres_estrategias` para este slug: não há rotas a calcular. */
  aplicavel: boolean
  criadas: number
  actualizadas: number
  retiradas: number
  ignorados: Array<{ ref: string; motivo: string }>
  erros: string[]
}

/** Quantas rotas uma estratégia pode ter em jogo numa só passagem — trava um cálculo doido. */
const MAX_ESCRITAS = 500

export async function sincronizarRotasDaEstrategia(slug: string): Promise<ResultadoSincronizacao> {
  const out: ResultadoSincronizacao = { slug, aplicavel: false, criadas: 0, actualizadas: 0, retiradas: 0, ignorados: [], erros: [] }
  const db = getSupabaseAdmin()

  const { data: linha, error } = await db.from('mestres_estrategias').select('*').ilike('slug', slug).maybeSingle()
  if (error) { out.erros.push(`mestres_estrategias: ${error.message}`); return out }
  if (!linha) return out
  out.aplicavel = true
  const e = lerEstrategiaMestre(linha)

  const [site, subs, contasAuto, prov, forcados] = await Promise.all([
    db.from('mtmcopy_connections').select('*').neq('mt5_status', 'disconnected'),
    db.from('mtmauto_subscriptions').select('*').eq('provider_id', e.providerId),
    db.from('mtmauto_accounts').select('*'),
    db.from('mtmauto_providers').select('id, nome').eq('id', e.providerId).maybeSingle(),
    db.from('mestres_contas').select('conta_chave, lote_fixo_forcado').not('lote_fixo_forcado', 'is', null),
  ])
  const lotesForcados = Object.fromEntries((forcados.data ?? []).map((f) => [String(f.conta_chave), Number(f.lote_fixo_forcado)]))
  const extra = seguidoresExtra(e.slug)

  // O DIREITO verifica-se a TODOS os candidatos — quem entra pela escolha da estratégia, pelo grupo
  // de Telegram ou por subscrição. Um erro de rede a ler o direito NÃO corta ninguém (assume-se que
  // tem): cortar por engano é pior do que deixar uma passagem a mais até à sincronização seguinte.
  const candidatos = new Set<string>()
  for (const l of (site.data ?? []) as Array<Record<string, unknown>>) {
    if (ligacaoSegueGrupoTelegram(l as never, extra.gruposTelegram) || ligacaoSegueEstrategia(l as never, [...e.copyfactoryIds, ...extra.picks], e.slug)) {
      candidatos.add(String(l.user_id))
    }
  }
  for (const s of (subs.data ?? []) as Array<Record<string, unknown>>) if (s.ativo !== false) candidatos.add(String(s.user_id))
  const semDireito = new Set<string>()
  await Promise.all([...candidatos].map(async (u) => {
    const tem = await direitoMtmAuto(u).then((d) => d.tem).catch(() => true)
    if (!tem) semDireito.add(u)
  }))

  const plano = planearRotasDaEstrategia({
    estrategia: {
      providerId: e.providerId, slug: e.slug, nome: String(prov.data?.nome ?? e.slug), contaMestreId: e.contaMestreId,
      copyfactoryIds: e.copyfactoryIds, incluirMtmauto: e.incluirMtmauto, picksExtra: extra.picks, gruposTelegram: extra.gruposTelegram,
    },
    site: (site.data ?? []) as never,
    subsAuto: (subs.data ?? []) as never,
    contasAuto: (contasAuto.data ?? []) as never,
    lotesForcados,
    semDireito,
  })
  out.ignorados = plano.ignorados

  const { data: existentes } = await db.from('copia_rotas').select('*').eq('mestres', true).eq('tipo_rota', 'estrategia').ilike('estrategia_slug', e.slug).neq('estado', 'recusada')
  const ids = (existentes ?? []).map((r) => String(r.id))
  // Uma consulta para as abertas de TODAS as rotas (o script faz uma por rota; aqui corre num pedido web).
  const { data: abertasLinhas } = ids.length
    ? await db.from('copia_posicoes').select('rota_id').in('rota_id', ids).in('estado', ['sombra', 'enviando', 'aberta']).limit(5000)
    : { data: [] as Array<{ rota_id: string }> }
  const abertas = new Map<string, number>()
  for (const p of abertasLinhas ?? []) abertas.set(String(p.rota_id), (abertas.get(String(p.rota_id)) ?? 0) + 1)

  const escrita = planoDeEscrita(plano.rotas, (existentes ?? []).map((r) => ({ ...r, abertas: abertas.get(String(r.id)) ?? 0 })) as never)
  const total = escrita.criar.length + escrita.actualizar.length + escrita.retirar.length
  if (total > MAX_ESCRITAS) {
    out.erros.push(`o plano pedia ${total} escritas (máximo ${MAX_ESCRITAS}) — nada foi escrito. Corre o script à mão e vê porquê.`)
    return out
  }

  const agora = new Date().toISOString()
  for (const r of escrita.criar) {
    const { error: eIns } = await db.from('copia_rotas').insert({ ...r, ativa: true, estado: 'aprovada', modo: 'shadow', aprovada_em: agora, pedido_pelo_cliente: false })
    if (eIns) out.erros.push(`criar ${r.destino_ref}: ${eIns.message}`)
    else out.criadas++
  }
  for (const u of escrita.actualizar) {
    const { error: eUp } = await db.from('copia_rotas').update(u.patch).eq('id', u.id)
    if (eUp) out.erros.push(`actualizar ${u.id.slice(0, 8)}: ${eUp.message}`)
    else out.actualizadas++
  }
  for (const u of escrita.retirar) {
    const { error: eUp } = await db.from('copia_rotas').update(u.patch).eq('id', u.id)
    if (eUp) out.erros.push(`retirar ${u.id.slice(0, 8)}: ${eUp.message}`)
    else out.retiradas++
  }
  return out
}
