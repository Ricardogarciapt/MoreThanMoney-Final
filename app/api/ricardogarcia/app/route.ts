import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import {
  PATENTES, INSIGNIAS, db, hoje, diasEntre, membroDaSessao, clienteSessao, carteira, somarMoedas,
  economia, missoesDoDia, ligarAoCrm, podeResgatar,
} from '@/lib/ricardogarcia/app'
import { awardXp } from '@/lib/xp-service'

export const dynamic = 'force-dynamic'

const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)
const erro = (m: string, s = 400) => NextResponse.json({ ok: false, erro: m }, { status: s })
const primeiroNome = (n: string) => String(n || '').trim().split(/\s+/)[0].slice(0, 20)


// Os 10 com mais XP entre quem usa a app (XP de toda a MTM, porque é um só).
async function esquadrao() {
  const { data: ids } = await db().from('rg_app_membros').select('id').eq('estado', 'ativo').limit(2000)
  const lista = (ids || []).map(x => x.id)
  if (!lista.length) return { data: [] as any[] }
  const { data: xp } = await db().from('user_xp').select('user_id, total_xp').in('user_id', lista).order('total_xp', { ascending: false }).limit(10)
  const { data: nomes } = await db().from('profiles').select('id, full_name, email').in('id', (xp || []).map(x => x.user_id))
  const nome = new Map((nomes || []).map(n => [n.id, n.full_name || String(n.email || '').split('@')[0]]))
  return { data: (xp || []).map(x => ({ id: x.user_id, nome: nome.get(x.user_id) || 'Recruta', xp: x.total_xp || 0, patente: patenteIdx(x.total_xp || 0) })) }
}
const patenteIdx = (xp: number) => { let i = 0; PATENTES.forEach((p, k) => { if (xp >= p.xp) i = k }); return i }

async function estado(m: any) {
  const dia = hoje()
  const desde = new Date(Date.parse(dia) - 41 * 86_400_000).toISOString().slice(0, 10)
  const [missoes, regs, conq, recs, resg, top, hist, eco] = await Promise.all([
    missoesDoDia(dia),
    db().from('rg_app_registos').select('missao_id, iniciado, concluido, xp').eq('membro_id', m.id).eq('dia', dia),
    db().from('rg_app_conquistas').select('insignia, criado').eq('membro_id', m.id),
    db().from('rg_app_recompensas').select('*').eq('activo', true).order('ordem'),
    db().from('rg_app_resgates').select('id, recompensa_id, custo, estado, criado').eq('membro_id', m.id).order('criado', { ascending: false }).limit(20),
    esquadrao(),
    db().from('rg_app_registos').select('missao_id, dia, xp, concluido, resposta').eq('membro_id', m.id).gte('dia', desde).not('concluido', 'is', null).order('dia', { ascending: false }).limit(200),
    economia(),
  ])
  // Calendário das últimas 6 semanas (XP e missões por dia) e Diário de campo (as tuas respostas).
  const porDia = new Map<string, { xp: number; feitas: number }>()
  for (const r of hist.data || []) { const d = porDia.get(r.dia) || { xp: 0, feitas: 0 }; d.xp += r.xp || 0; d.feitas++; porDia.set(r.dia, d) }
  const historico = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.parse(dia) - (41 - i) * 86_400_000).toISOString().slice(0, 10)
    return { dia: d, ...(porDia.get(d) || { xp: 0, feitas: 0 }) }
  })
  const ids = Array.from(new Set((hist.data || []).filter(r => r.resposta).map(r => r.missao_id)))
  const { data: tit } = ids.length ? await db().from('rg_app_missoes').select('id, titulo, tipo').in('id', ids) : { data: [] as any[] }
  const tMap = new Map((tit || []).map(x => [x.id, x]))
  const diario = (hist.data || []).filter(r => r.resposta).slice(0, 40).map(r => ({ dia: r.dia, titulo: tMap.get(r.missao_id)?.titulo || 'Missão', tipo: tMap.get(r.missao_id)?.tipo || 'mindset', texto: r.resposta }))
  const porMissao = new Map((regs.data || []).map(r => [r.missao_id, r]))
  const recompensas = await Promise.all((recs.data || []).map(async r => ({
    id: r.id, titulo: r.titulo, descricao: r.descricao, custo: r.custo, min_dias_conta: r.min_dias_conta,
    min_dias_ativos: r.min_dias_ativos, min_patente: r.min_patente, bloqueio: await podeResgatar(m, r),
  })))
  const p = m.patente, prox = PATENTES[p + 1]
  return {
    ok: true,
    membro: {
      nome: m.nome, primeiro: primeiroNome(m.nome), xp: m.xp, moedas: m.moedas, dias_ativos: m.dias_ativos,
      sequencia: m.sequencia, melhor_sequencia: m.melhor_sequencia, dias_conta: diasEntre(String(m.criado).slice(0, 10), dia),
      patente: p, patente_nome: PATENTES[p].nome, prox_nome: prox?.nome || null, prox_xp: prox?.xp || null, base_xp: PATENTES[p].xp,
    },
    patentes: PATENTES,
    hoje: { dia, xp: porDia.get(dia)?.xp || 0, max: eco.xp_dia_max + eco.bonus_dia_completo },
    historico,
    diario,
    missoes: missoes.map(x => {
      const r: any = porMissao.get(x.id)
      return { id: x.id, desafio: !!x.desafio, tipo: x.tipo, titulo: x.titulo, resumo: x.resumo, conteudo: x.conteudo, xp: x.xp, min_seg: x.min_seg,
        estado: r?.concluido ? 'feita' : r ? 'em_curso' : 'por_fazer', iniciado: r?.iniciado || null, xp_ganho: r?.xp || 0 }
    }),
    insignias: INSIGNIAS.map(i => ({ id: i.id, nome: i.nome, desc: i.desc, tem: (conq.data || []).some(c => c.insignia === i.id) })),
    recompensas,
    resgates: resg.data || [],
    esquadrao: (top.data || []).map(x => ({ nome: primeiroNome(x.nome), xp: x.xp, patente: PATENTES[x.patente]?.nome, eu: x.id === m.id })),
  }
}

export async function GET(req: NextRequest) {
  const m = await membroDaSessao(req)
  if (!m) return NextResponse.json({ ok: true, membro: null })
  db().from('rg_app_membros').update({ visto: new Date().toISOString() }).eq('id', m.id).then(() => {}, () => {})
  return NextResponse.json(await estado(m))
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  let b: any = {}
  try { b = await req.json() } catch {}
  const accao = String(b?.accao || '')

  if (accao === 'registar') {
    if (!checkRateLimit('rg-app-reg:' + ip, 5, 60 * 60_000).allowed) return erro('Muitas contas a partir daqui. Tenta mais tarde.', 429)
    if (b?.empresa) return NextResponse.json({ ok: true })
    const nome = t(b?.nome, 80), email = t(b?.email, 160).toLowerCase(), telefone = t(b?.telefone, 30), pass = String(b?.pass || '')
    if (nome.length < 2) return erro('Diz-me o teu nome.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('O email não parece válido.')
    if (pass.length < 8) return erro('A palavra-passe precisa de pelo menos 8 caracteres.')
    if (!b?.consentimento) return erro('Precisamos do teu consentimento para criar a conta.')
    // Conta MoreThanMoney a sério: a mesma que abre a app-mobile.
    const { data: criado, error } = await db().auth.admin.createUser({
      email, password: pass, email_confirm: true, user_metadata: { full_name: nome, origem: 'app-ricardo' },
    })
    if (error || !criado?.user) {
      // Não se diz se o email existe (evita usar o formulário para descobrir contas).
      const ja = /already|exists|registered|duplicate/i.test(error?.message || '')
      return erro(ja ? 'Não foi possível criar a conta com este email. Se já tens conta MoreThanMoney, entra com ela.' : 'Não consegui criar a conta. Tenta outra vez.', ja ? 409 : 500)
    }
    const id = criado.user.id
    const { data: perfil } = await db().from('profiles').select('id').eq('id', id).maybeSingle()
    if (!perfil) await db().from('profiles').insert({ id, email, full_name: nome, phone: telefone || null, user_type: 'lead', member_category: 'standard', is_active: true })
    await carteira(id, t(b?.origem, 60) || 'app')
    await ligarAoCrm({ id, nome, email, telefone })
    const sb = await clienteSessao()
    await sb.auth.signInWithPassword({ email, password: pass })
    try { await avisarAdmin(db(), `🎖️ Novo recruta na app do Ricardo\n${nome} · ${email}${telefone ? ' · ' + telefone : ''}\nConta MTM criada e já no pipeline (origem app-ricardo).`) } catch {}
    return NextResponse.json({ ok: true })
  }

  if (accao === 'entrar') {
    if (!checkRateLimit('rg-app-in:' + ip, 10, 15 * 60_000).allowed) return erro('Muitas tentativas. Espera uns minutos.', 429)
    const sb = await clienteSessao()
    const { data, error } = await sb.auth.signInWithPassword({ email: t(b?.email, 160).toLowerCase(), password: String(b?.pass || '') })
    if (error || !data?.user) return erro('Email ou palavra-passe errados.', 401)
    const c = await carteira(data.user.id)
    if (c?.estado !== 'ativo') { await sb.auth.signOut(); return erro('Esta conta está suspensa na app. Fala com o Ricardo.', 403) }
    return NextResponse.json({ ok: true })
  }

  // Regresso do Google/Apple: garante perfil gratuito (lead), carteira e CRM para quem é novo.
  if (accao === 'oauth') {
    const sb = await clienteSessao()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return erro('Sessão terminada. Entra outra vez.', 401)
    const email = String(user.email || '').toLowerCase()
    const nome = t((user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || email.split('@')[0], 80)
    const { data: perfil } = await db().from('profiles').select('id').eq('id', user.id).maybeSingle()
    const { data: ja } = await db().from('rg_app_membros').select('id').eq('id', user.id).maybeSingle()
    if (!perfil) await db().from('profiles').insert({ id: user.id, email, full_name: nome, user_type: 'lead', member_category: 'standard', is_active: true })
    if (!ja) {
      await carteira(user.id, perfil ? 'mtm' : 'app-oauth')
      if (!perfil) {
        await ligarAoCrm({ id: user.id, nome, email })
        try { await avisarAdmin(db(), `🎖️ Novo recruta na app do Ricardo (Google/Apple)\n${nome} · ${email}\nConta MTM criada e já no pipeline.`) } catch {}
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (accao === 'sair') {
    const sb = await clienteSessao()
    await sb.auth.signOut()
    return NextResponse.json({ ok: true })
  }

  const m = await membroDaSessao(req)
  if (!m) return erro('Sessão terminada. Entra outra vez.', 401)
  if (!checkRateLimit('rg-app:' + m.id, 60, 60_000).allowed) return erro('Calma, recruta. Tenta daqui a um minuto.', 429)
  const dia = hoje()

  if (accao === 'iniciar' || accao === 'concluir') {
    const missoes = await missoesDoDia(dia)
    const mi = missoes.find(x => x.id === b?.missao)
    if (!mi) return erro('Esta missão não é de hoje.')
    if (accao === 'iniciar') {
      await db().from('rg_app_registos').upsert({ membro_id: m.id, missao_id: mi.id, dia }, { onConflict: 'membro_id,missao_id,dia', ignoreDuplicates: true })
      return NextResponse.json(await estado(m))
    }
    const { data: reg } = await db().from('rg_app_registos').select('*').eq('membro_id', m.id).eq('missao_id', mi.id).eq('dia', dia).maybeSingle()
    if (!reg) return erro('Começa a missão primeiro.')
    if (reg.concluido) return erro('Esta missão já está feita hoje.')
    const eco = await economia()
    const passou = (Date.now() - Date.parse(reg.iniciado)) / 1000
    if (mi.min_seg && passou < mi.min_seg - 5) return erro(`O treino ainda não acabou. Faltam ${Math.ceil(mi.min_seg - passou)} s.`)
    const resposta = t(b?.resposta, 1500)
    if (mi.tipo !== 'treino' && resposta.length < eco.min_resposta) return erro(`Escreve pelo menos ${eco.min_resposta} caracteres. É aqui que a missão conta.`)

    const { data: hojeRegs } = await db().from('rg_app_registos').select('missao_id, xp, concluido').eq('membro_id', m.id).eq('dia', dia)
    const ganhoHoje = (hojeRegs || []).reduce((s, r) => s + (r.xp || 0), 0)
    const feitasAntes = (hojeRegs || []).filter(r => r.concluido).length
    let xp = Math.max(0, Math.min(mi.xp, eco.xp_dia_max - ganhoHoje))
    await db().from('rg_app_registos').update({ concluido: new Date().toISOString(), xp, resposta: resposta || null }).eq('id', reg.id)

    const up: any = {}
    let moedas = 0, bonus = 0
    if (feitasAntes === 0) {
      const ontem = new Date(Date.parse(dia) - 86_400_000).toISOString().slice(0, 10)
      const seq = m.ultimo_dia === ontem ? m.sequencia + 1 : m.ultimo_dia === dia ? m.sequencia : 1
      up.sequencia = seq; up.melhor_sequencia = Math.max(m.melhor_sequencia, seq); up.ultimo_dia = dia; up.dias_ativos = m.dias_ativos + 1
      if (seq > 0 && seq % 7 === 0 && m.ultimo_dia !== dia) moedas += eco.moedas_semana
    }
    // O dia fica completo com as 3 missões diárias; o desafio da semana é um extra.
    const diarias = missoes.filter(x => !x.desafio).map(x => x.id)
    const completo = !mi.desafio && diarias.every(id => id === mi.id || (hojeRegs || []).some(r => r.missao_id === id && r.concluido))
    if (completo) {
      bonus = Math.max(0, Math.min(eco.bonus_dia_completo, eco.xp_dia_max - ganhoHoje - xp))
      if (bonus) await db().from('rg_app_registos').update({ xp: xp + bonus }).eq('id', reg.id)
      moedas += eco.moedas_dia_completo
    }
    // O XP entra no registo único da MTM (o mesmo do chat, feed e lives). As moedas da subida de
    // patente são dadas lá dentro, para valerem também quando o XP vem da app-mobile.
    let xpTotal = m.xp, pat = m.patente
    if (xp) { const r = await awardXp(db(), m.id, 'missao_concluida', { amount: xp, actionDescription: `Missão: ${mi.titulo}` }); xpTotal = r.total_xp; pat = r.level - 1 }
    if (bonus) { const r = await awardXp(db(), m.id, 'missao_dia_completo', { amount: bonus, actionDescription: `Dia completo ${dia}` }); xpTotal = r.total_xp; pat = r.level - 1 }
    const novo = { ...m, ...up, xp: xpTotal, patente: pat, _completo: completo }
    const { data: tem } = await db().from('rg_app_conquistas').select('insignia').eq('membro_id', m.id)
    const novas = INSIGNIAS.filter(i => !(tem || []).some(c => c.insignia === i.id) && i.teste(novo))
    if (novas.length) {
      await db().from('rg_app_conquistas').insert(novas.map(i => ({ membro_id: m.id, insignia: i.id })))
      moedas += eco.moedas_insignia * novas.length
    }
    if (Object.keys(up).length) await db().from('rg_app_membros').update(up).eq('id', m.id)
    await somarMoedas(m.id, moedas)
    const subiu = pat > m.patente
    if (subiu) moedas += eco.moedas_patente * (pat - m.patente)
    const atual = (await membroDaSessao()) || { ...m, ...up, xp: xpTotal, patente: pat }
    return NextResponse.json({ ...(await estado(atual)), ganho: { xp: xp + bonus, moedas, subiu, insignias: novas.map(i => i.nome), completo } })
  }

  if (accao === 'resgatar') {
    const { data: r } = await db().from('rg_app_recompensas').select('*').eq('id', String(b?.recompensa || '')).maybeSingle()
    if (!r) return erro('Recompensa não encontrada.', 404)
    const motivo = await podeResgatar(m, r)
    if (motivo) return erro(motivo)
    // desconto atómico: só passa se o saldo ainda for o que lemos
    const { data: ok } = await db().from('rg_app_membros').update({ moedas: m.moedas - r.custo }).eq('id', m.id).eq('moedas', m.moedas).select('id').maybeSingle()
    if (!ok) return erro('O saldo mudou entretanto. Tenta outra vez.', 409)
    await db().from('rg_app_resgates').insert({ membro_id: m.id, recompensa_id: r.id, custo: r.custo })
    try { await avisarAdmin(db(), `🎁 Pedido de recompensa na app Missão\n${m.nome} (${m.email}) pediu «${r.titulo}» por ${r.custo} moedas.\nAprova ou recusa em morethanmoney.pt/ricardogarcia/painel`) } catch {}
    return NextResponse.json({ ...(await estado({ ...m, moedas: m.moedas - r.custo })), pedido: r.titulo })
  }

  return erro('Acção desconhecida.')
}
