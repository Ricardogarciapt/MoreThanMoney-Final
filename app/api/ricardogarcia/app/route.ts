import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import {
  PATENTES, INSIGNIAS, db, hoje, diasEntre, membroDaSessao, clienteSessao, carteira, somarMoedas,
  economia, ligarAoCrm, podeResgatar,
} from '@/lib/ricardogarcia/app'
import { awardXp } from '@/lib/xp-service'
import {
  XP_DIA, SUGESTOES_HABITOS, AREAS_ROTA, curiosidadeDoDia, quizDoDia, dicaPara, pontosPerto, pontosDoRicardo, distanciaM, guardarProva,
} from '@/lib/ricardogarcia/diario'
import { FUNDOS, MOLDURAS, ROSTOS, guardarAvatar } from '@/lib/ricardogarcia/avatar'
import { ligacoes, novoTokenAtalho, registarMovimento, sincronizarStrava } from '@/lib/ricardogarcia/saude'
import { configPush, guardarToken, tirarToken } from '@/lib/ricardogarcia/push'
import { missoesDoMembro, FASES } from '@/lib/ricardogarcia/plano39'
import { falarComMentor, historico as historicoMentor } from '@/lib/ricardogarcia/mentor'
import { DIAS_DESAFIO, desafiosDoMembro, diarioLivre, textoLivre } from '@/lib/ricardogarcia/diario-desafios'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)
const XP_DIA_DIARIO = 3
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

// O resto do dia: curiosidade, quiz, presença, hábitos, movimento, rotas e o que o Ricardo publicou.
async function extras(m: any, dia: string) {
  const [cur, quiz, diarios, habs, feitos, evs, meus, livre, desafiosM] = await Promise.all([
    curiosidadeDoDia(dia), quizDoDia(dia),
    db().from('rg_app_diarios').select('item, ref, xp, dados, prova_path').eq('membro_id', m.id).eq('dia', dia),
    db().from('rg_app_habitos').select('id, nome, icone, ordem').eq('membro_id', m.id).eq('activo', true).order('ordem').order('criado'),
    db().from('rg_app_habitos_feitos').select('habito_id').eq('membro_id', m.id).eq('dia', dia),
    db().from('rg_app_eventos').select('*').eq('activo', true).order('ordem').order('quando', { ascending: true, nullsFirst: false }).limit(30),
    db().from('rg_app_eventos_membros').select('evento_id, estado').eq('membro_id', m.id),
    diarioLivre(m.id), desafiosDoMembro(m.id, dia),
  ])
  const it = new Map((diarios.data || []).map(d => [d.item, d]))
  const q: any = quiz, qr: any = it.get('quiz')
  const feitosSet = new Set((feitos.data || []).map(f => f.habito_id))
  const meu = new Map((meus.data || []).map(x => [x.evento_id, x.estado]))
  const agora = Date.now()
  const rotas = (diarios.data || []).filter(d => d.item.startsWith('rota:'))
  return {
    diario_livre: livre, desafios_m: desafiosM, desafios_dias: DIAS_DESAFIO,
    diario_hoje: it.has('diario'),
    curiosidade: cur ? { id: cur.id, titulo: cur.titulo, texto: cur.texto, ano: cur.ano, categoria: cur.categoria, feita: it.has('curiosidade'), xp: XP_DIA.curiosidade } : null,
    quiz: q ? { id: q.id, pergunta: q.pergunta, opcoes: q.opcoes, categoria: q.categoria, xp: XP_DIA.quiz_certo,
      feito: !!qr, escolha: qr?.dados?.escolha ?? null, correta: qr ? q.correta : null, explicacao: qr ? q.explicacao : null } : null,
    presenca: { feita: it.has('presenca'), prova: !!it.get('presenca')?.prova_path, xp: it.get('presenca')?.xp || 0, xp_prova: XP_DIA.presenca_prova, xp_sem: XP_DIA.presenca_sem },
    habitos: (habs.data || []).map(h => ({ id: h.id, nome: h.nome, icone: h.icone, feito: feitosSet.has(h.id) })),
    habitos_xp: XP_DIA.habito, habitos_max: XP_DIA.habitos_max, sugestoes: SUGESTOES_HABITOS,
    saude: { ...(it.get('saude')?.dados || {}), xp: it.get('saude')?.xp || 0, ligacoes: await ligacoes(m.id) },
    rotas: { areas: AREAS_ROTA, hoje: rotas.length, max: XP_DIA.rota_max_dia, xp: XP_DIA.rota_ponto,
      visitados: rotas.map(r => ({ ponto: r.item.slice(5), nome: r.dados?.nome, dica: r.dados?.dica })), ricardo: await pontosDoRicardo() },
    eventos: (evs.data || []).filter(e => e.tipo === 'desafio' || !e.quando || Date.parse(e.quando) > agora - 6 * 3600_000).map(e => ({
      id: e.id, tipo: e.tipo, titulo: e.titulo, descricao: e.descricao, quando: e.quando, local: e.local, imagem_url: e.imagem_url,
      preco_eur: e.preco_eur, preco_antes_eur: e.preco_antes_eur, link_compra: e.link_compra, vagas: e.vagas, xp: e.xp, meu: meu.get(e.id) || null,
    })),
  }
}

async function estado(m: any) {
  const dia = hoje()
  const desde = new Date(Date.parse(dia) - 41 * 86_400_000).toISOString().slice(0, 10)
  const [doDia, regs, conq, recs, resg, top, hist, eco, extra] = await Promise.all([
    missoesDoMembro(m, dia),
    db().from('rg_app_registos').select('missao_id, iniciado, concluido, xp').eq('membro_id', m.id).eq('dia', dia),
    db().from('rg_app_conquistas').select('insignia, criado').eq('membro_id', m.id),
    db().from('rg_app_recompensas').select('*').eq('activo', true).order('ordem'),
    db().from('rg_app_resgates').select('id, recompensa_id, custo, estado, criado').eq('membro_id', m.id).order('criado', { ascending: false }).limit(20),
    esquadrao(),
    db().from('rg_app_registos').select('missao_id, dia, xp, concluido, resposta').eq('membro_id', m.id).gte('dia', desde).not('concluido', 'is', null).order('dia', { ascending: false }).limit(200),
    economia(),
    extras(m, dia),
  ])
  // Calendário das últimas 6 semanas (XP e missões por dia) e Diário de campo (as tuas respostas).
  const missoes = doDia.missoes
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
      avatar_url: m.avatar_url || null, avatar: m.avatar || null,
    },
    avatar_opcoes: { rostos: ROSTOS, fundos: Object.keys(FUNDOS), molduras: Object.keys(MOLDURAS) },
    push: configPush(), push_prefs: { missao: true, chat: true, serie: true, ...(m.push_prefs || {}) },
    patentes: PATENTES,
    hoje: { dia, xp: porDia.get(dia)?.xp || 0, max: eco.xp_dia_max + eco.bonus_dia_completo },
    historico,
    diario,
    plano: { ...doDia.plano, fases: FASES },
    missoes: missoes.map(x => {
      const r: any = porMissao.get(x.id)
      return { id: x.id, desafio: !!x.desafio, tipo: x.tipo, titulo: x.titulo, resumo: x.resumo, conteudo: x.conteudo, xp: x.xp, min_seg: x.min_seg,
        estado: r?.concluido ? 'feita' : r ? 'em_curso' : 'por_fazer', iniciado: r?.iniciado || null, xp_ganho: r?.xp || 0 }
    }),
    insignias: INSIGNIAS.map(i => ({ id: i.id, nome: i.nome, desc: i.desc, tem: (conq.data || []).some(c => c.insignia === i.id) })),
    recompensas,
    resgates: resg.data || [],
    extra,
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
    if (typeof b?.push_token === 'string' && b.push_token) await db().from('rg_app_push').delete().eq('token', b.push_token)
    const sb = await clienteSessao()
    await sb.auth.signOut()
    return NextResponse.json({ ok: true })
  }

  const m = await membroDaSessao(req)
  if (!m) return erro('Sessão terminada. Entra outra vez.', 401)
  if (!checkRateLimit('rg-app:' + m.id, 60, 60_000).allowed) return erro('Calma, recruta. Tenta daqui a um minuto.', 429)
  const dia = hoje()

  if (accao === 'iniciar' || accao === 'concluir') {
    const { missoes } = await missoesDoMembro(m, dia)
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

  // XP fora das missões: entra no registo único com o tecto de cada tipo (xp-config).
  const darXp = async (tipo: string, n: number, desc: string) => {
    if (n <= 0) return { xp: 0, subiu: false }
    const r = await awardXp(db(), m.id, tipo, { amount: n, actionDescription: desc })
    return { xp: r.awarded ? r.xp_gained : 0, subiu: r.awarded && r.level - 1 > m.patente }
  }
  const responder = async (g: { xp: number; subiu?: boolean }, extra: object = {}) => {
    const atual = (await membroDaSessao()) || m
    return NextResponse.json({ ...(await estado(atual)), ganho: { xp: g.xp, moedas: 0, subiu: !!g.subiu, insignias: [], completo: false }, ...extra })
  }
  const registarDia = async (item: string, xp: number, extra: Record<string, unknown> = {}) => {
    const { error } = await db().from('rg_app_diarios').insert({ membro_id: m.id, dia, item, xp, ...extra })
    return !error
  }

  if (accao === 'curiosidade') {
    const c: any = await curiosidadeDoDia(dia)
    if (!c) return erro('Sem curiosidade hoje.')
    if (!(await registarDia('curiosidade', XP_DIA.curiosidade, { ref: String(c.id) }))) return erro('Já leste a curiosidade de hoje.')
    return responder(await darXp('app_curiosidade', XP_DIA.curiosidade, `Curiosidade: ${c.titulo}`))
  }

  if (accao === 'quiz') {
    const q: any = await quizDoDia(dia)
    const escolha = Number(b?.escolha)
    if (!q) return erro('Sem quiz hoje.')
    if (!Number.isInteger(escolha) || escolha < 0 || escolha >= (q.opcoes || []).length) return erro('Escolhe uma resposta.')
    const certo = escolha === q.correta, xp = certo ? XP_DIA.quiz_certo : XP_DIA.quiz_errado
    if (!(await registarDia('quiz', xp, { ref: String(q.id), dados: { escolha, certo } }))) return erro('Já respondeste ao quiz de hoje.')
    return responder(await darXp('app_quiz', xp, `Quiz ${dia}: ${certo ? 'certo' : 'errado'}`), { quiz_certo: certo })
  }

  if (accao === 'presenca') {
    const tipoAula = ['plataforma', 'sessao'].includes(b?.tipo) ? b.tipo : 'plataforma'
    const nota = t(b?.nota, 300)
    let prova: string | null = null
    if (b?.imagem) { const g = await guardarProva(m.id, dia, String(b.imagem)); if (g.erro) return erro(g.erro); prova = g.caminho! }
    const { data: ja } = await db().from('rg_app_diarios').select('id, xp, prova_path').eq('membro_id', m.id).eq('dia', dia).eq('item', 'presenca').maybeSingle()
    if (ja) {
      // Quem marcou sem prova pode juntar o print mais tarde e recebe o resto do XP.
      if (ja.prova_path || !prova) return erro('A presença de hoje já está registada.')
      const falta = XP_DIA.presenca_prova - (ja.xp || 0)
      await db().from('rg_app_diarios').update({ prova_path: prova, xp: XP_DIA.presenca_prova }).eq('id', ja.id)
      return responder(await darXp('app_presenca', falta, `Presença ${dia}: comprovativo`))
    }
    const xp = prova ? XP_DIA.presenca_prova : XP_DIA.presenca_sem
    if (!(await registarDia('presenca', xp, { ref: tipoAula, prova_path: prova, dados: { tipo: tipoAula, nota } }))) return erro('A presença de hoje já está registada.')
    return responder(await darXp('app_presenca', xp, `Presença ${dia}: ${tipoAula}${prova ? ' com comprovativo' : ''}`))
  }

  if (accao === 'habito_novo') {
    const nome = t(b?.nome, 60), icone = t(b?.icone, 4) || '✓'
    if (nome.length < 2) return erro('Dá um nome ao hábito.')
    const { count } = await db().from('rg_app_habitos').select('id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('activo', true)
    if ((count || 0) >= 12) return erro('Já tens 12 hábitos. Tira um antes de juntar outro.')
    await db().from('rg_app_habitos').insert({ membro_id: m.id, nome, icone, ordem: (count || 0) + 1 })
    return NextResponse.json(await estado(m))
  }

  if (accao === 'habito_tirar') {
    await db().from('rg_app_habitos').update({ activo: false }).eq('id', t(b?.id, 40)).eq('membro_id', m.id)
    return NextResponse.json(await estado(m))
  }

  if (accao === 'habito') {
    const { data: h } = await db().from('rg_app_habitos').select('id, nome').eq('id', t(b?.id, 40)).eq('membro_id', m.id).eq('activo', true).maybeSingle()
    if (!h) return erro('Hábito não encontrado.', 404)
    const { count } = await db().from('rg_app_habitos_feitos').select('habito_id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('dia', dia)
    const xp = (count || 0) < XP_DIA.habitos_max ? XP_DIA.habito : 0
    const { error } = await db().from('rg_app_habitos_feitos').insert({ habito_id: h.id, membro_id: m.id, dia, xp })
    if (error) return erro('Este hábito já está marcado hoje.')
    return responder(await darXp('app_habito', xp, `Hábito: ${h.nome}`))
  }

  if (accao === 'saude') {
    const fonte = ['apple', 'google', 'manual'].includes(b?.fonte) ? b.fonte : 'manual'
    const r = await registarMovimento(m.id, Number(b?.passos) || 0, Number(b?.minutos) || 0, fonte, dia)
    return responder(await darXp('app_saude', r.xp, `Movimento ${dia}: ${r.dados.passos} passos, ${r.dados.minutos} min`))
  }

  // Notificações push (tokens FCM próprios da app) e o que cada um quer receber.
  if (accao === 'push_token') {
    if (!checkRateLimit('rg-push:' + m.id, 20, 60 * 60_000).allowed) return erro('Muitos pedidos seguidos.', 429)
    return (await guardarToken(m.id, String(b?.token || ''))) ? NextResponse.json({ ok: true }) : erro('Token inválido.')
  }
  if (accao === 'push_off') { await tirarToken(m.id, typeof b?.token === 'string' ? b.token : undefined); return NextResponse.json({ ok: true }) }
  if (accao === 'push_prefs') {
    const p = b?.prefs || {}
    const prefs = { missao: p.missao !== false, chat: p.chat !== false, serie: p.serie !== false }
    await db().from('rg_app_membros').update({ push_prefs: prefs }).eq('id', m.id)
    return NextResponse.json({ ok: true, push_prefs: prefs })
  }

  // Mentor IA da app (acompanhamento no plano; a pessoa ainda não é membro).
  if (accao === 'mentor_hist') return NextResponse.json({ ok: true, mensagens: await historicoMentor(m.id) })
  if (accao === 'mentor') {
    const texto = t(b?.texto, 1200)
    if (texto.length < 2) return erro('Escreve a tua mensagem.')
    if (!checkRateLimit('rg-mentor:' + m.id, 8, 60_000).allowed) return erro('Mais devagar. Espera um minuto.', 429)
    const { count } = await db().from('rg_app_mentor').select('id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('papel', 'user').gte('criado', dia + 'T00:00:00Z')
    if ((count || 0) >= 40) return erro('Por hoje já falámos muito. Amanhã continuamos. Entretanto, faz a missão do dia. 💪', 429)
    const resposta = await falarComMentor(m, texto)
    return NextResponse.json({ ok: true, resposta })
  }

  if (accao === 'avatar') {
    if (!checkRateLimit('rg-avatar:' + m.id, 20, 60 * 60_000).allowed) return erro('Muitas mudanças seguidas. Tenta daqui a pouco.', 429)
    const g = await guardarAvatar(m.id, b)
    if (g.erro) return erro(g.erro)
    return NextResponse.json(await estado({ ...m, avatar_url: g.url, avatar: b?.tipo === 'foto' ? m.avatar : { rosto: b?.rosto, fundo: b?.fundo, moldura: b?.moldura } }))
  }
  // Ligações de saúde: Atalho do iPhone (link pessoal) e Strava.
  if (accao === 'saude_atalho') {
    const token = await novoTokenAtalho(m.id)
    return NextResponse.json({ ok: true, url: `${req.nextUrl.origin}/api/ricardogarcia/app/saude/atalho?t=${token}` })
  }
  if (accao === 'saude_desligar') {
    await db().from('rg_app_saude_ligacoes').delete().eq('membro_id', m.id).eq('fonte', b?.fonte === 'strava' ? 'strava' : 'atalho')
    return NextResponse.json(await estado(m))
  }
  if (accao === 'saude_sync') {
    if (!checkRateLimit('rg-strava:' + m.id, 12, 60 * 60_000).allowed) return erro('Já sincronizaste há pouco. Tenta daqui a uns minutos.', 429)
    const r = await sincronizarStrava(m.id)
    if (!r) return erro('Não consegui falar com o Strava. Liga outra vez a conta.')
    return responder(await darXp('app_saude', r.xp, `Movimento (Strava) ${dia}: ${r.dados.minutos} min`), { strava: { actividades: r.actividades, minutos: r.dados.minutos } })
  }

  if (accao === 'rota_pontos') {
    const lat = Number(b?.lat), lon = Number(b?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return erro('Localização inválida.')
    if (!checkRateLimit('rg-app-rota:' + m.id, 10, 60 * 60_000).allowed) return erro('Já procuraste muitas vezes. Tenta daqui a pouco.', 429)
    const r = await pontosPerto(lat, lon)
    return NextResponse.json({ ok: true, ...r })
  }

  if (accao === 'rota_chegar') {
    const lat = Number(b?.lat), lon = Number(b?.lon), prec = Number(b?.precisao) || 999
    const { data: p } = await db().from('rg_app_pontos').select('*').eq('id', t(b?.ponto, 80)).maybeSingle()
    if (!p) return erro('Ponto desconhecido. Procura os pontos outra vez.', 404)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return erro('Sem localização.')
    const dist = distanciaM({ lat, lon }, p)
    // Parques e praças são grandes: conta chegar a 80 m do centro (os pontos do Ricardo têm o raio dele), mais a margem do GPS até 50 m.
    const raio = p.origem === 'ricardo' ? Math.max(30, Math.min(300, p.raio_m || 80)) : 80
    if (dist > raio + Math.min(50, prec)) return erro(`Ainda estás a ${Math.round(dist)} m de ${p.nome}.`)
    const { count } = await db().from('rg_app_diarios').select('id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('dia', dia).like('item', 'rota:%')
    // O tipo do sítio pode ter uma área fixa (escolhida no painel); senão vale a da pessoa.
    const area = p.area || t(b?.area, 20)
    // Num ponto do Ricardo a dica é a lição dele; o XP extra só conta na primeira visita de sempre.
    const licao = p.origem === 'ricardo' && p.licao_texto ? { titulo: p.licao_titulo || p.nome, texto: p.licao_texto, video: p.video_url || null } : null
    const dica: any = licao || await dicaPara(area, m.id)
    let xp = (count || 0) < XP_DIA.rota_max_dia ? XP_DIA.rota_ponto : 0
    if (p.origem === 'ricardo' && p.xp_extra) {
      const { count: antes } = await db().from('rg_app_diarios').select('id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('item', 'rota:' + p.id)
      if (!antes) xp += Math.min(100, p.xp_extra)
    }
    if (!(await registarDia('rota:' + p.id, xp, { ref: area, dados: { nome: p.nome, tipo: p.tipo, ricardo: p.origem === 'ricardo', dica: dica ? { titulo: dica.titulo, texto: dica.texto, video: dica.video || null } : null } }))) return erro(`Já passaste por ${p.nome} hoje.`)
    return responder(await darXp('app_rota_ponto', xp, `Rota: ${p.nome}`), { dica: dica ? { titulo: dica.titulo, texto: dica.texto, video: dica.video || null, ponto: p.nome, ricardo: p.origem === 'ricardo' } : null })
  }

  if (accao === 'evento') {
    const { data: e } = await db().from('rg_app_eventos').select('*').eq('id', t(b?.id, 40)).eq('activo', true).maybeSingle()
    if (!e) return erro('Já não está disponível.', 404)
    const quer = String(b?.estado || '')
    const { data: ja } = await db().from('rg_app_eventos_membros').select('estado').eq('evento_id', e.id).eq('membro_id', m.id).maybeSingle()
    if (quer === 'concluido') {
      if (e.tipo !== 'desafio') return erro('Só os desafios se concluem.')
      if (ja?.estado === 'concluido') return erro('Já concluíste este desafio.')
      const resposta = t(b?.resposta, 1500)
      if (resposta.length < 20) return erro('Conta em pelo menos 20 caracteres como correu.')
      await db().from('rg_app_eventos_membros').upsert({ evento_id: e.id, membro_id: m.id, estado: 'concluido', resposta }, { onConflict: 'evento_id,membro_id' })
      const g = await (async () => { if (!e.xp) return { xp: 0, subiu: false }; const r = await awardXp(db(), m.id, 'app_desafio', { amount: Math.min(200, e.xp), actionDescription: `Desafio: ${e.titulo}`, oncePerDescription: true }); return { xp: r.awarded ? r.xp_gained : 0, subiu: r.awarded && r.level - 1 > m.patente } })()
      try { await avisarAdmin(db(), `🏁 Desafio concluído na app\n${m.nome} concluiu «${e.titulo}»:\n${resposta.slice(0, 300)}`) } catch {}
      return responder(g)
    }
    if (!['interesse', 'reservado'].includes(quer)) return erro('Escolha inválida.')
    if (ja?.estado === 'concluido') return erro('Já concluíste este desafio.')
    if (quer === 'reservado' && e.vagas) {
      const { count } = await db().from('rg_app_eventos_membros').select('membro_id', { count: 'exact', head: true }).eq('evento_id', e.id).eq('estado', 'reservado')
      if ((count || 0) >= e.vagas && ja?.estado !== 'reservado') return erro('As vagas de pré-reserva esgotaram.')
    }
    await db().from('rg_app_eventos_membros').upsert({ evento_id: e.id, membro_id: m.id, estado: quer }, { onConflict: 'evento_id,membro_id' })
    if (ja?.estado !== quer) try { await avisarAdmin(db(), `${quer === 'reservado' ? '🎟️ Pré-reserva' : '⭐ Interesse'} na app\n${m.nome} (${m.email}) · «${e.titulo}»${m.telefone ? '\n' + m.telefone : ''}`) } catch {}
    return NextResponse.json(await estado(m))
  }

  // Diário livre: páginas soltas. XP só na primeira do dia.
  if (accao === 'diario_novo') {
    const texto = textoLivre(b?.texto, 4000), titulo = t(b?.titulo, 120)
    if (texto.length < 10) return erro('Escreve pelo menos uma frase.')
    const humor = Math.round(Number(b?.humor)); 
    if (!checkRateLimit('rg-app-diario:' + m.id, 15, 24 * 3600_000).allowed) return erro('Já escreveste muito hoje. Amanhã há mais páginas.', 429)
    const { error } = await db().from('rg_app_diario_livre').insert({ membro_id: m.id, dia, titulo: titulo || null, texto, humor: humor >= 1 && humor <= 5 ? humor : null })
    if (error) return erro('Não consegui guardar. Tenta outra vez.')
    const primeira = await registarDia('diario', XP_DIA_DIARIO)
    return responder(primeira ? await darXp('app_diario', XP_DIA_DIARIO, `Diário ${dia}`) : { xp: 0 })
  }
  if (accao === 'diario_apagar') {
    await db().from('rg_app_diario_livre').delete().eq('id', t(b?.id, 40)).eq('membro_id', m.id)
    return NextResponse.json(await estado(m))
  }

  // Desafios criados pelos membros.
  if (accao === 'desafio_criar') {
    const titulo = t(b?.titulo, 80), descricao = textoLivre(b?.descricao, 600), dias = Number(b?.dias)
    if (titulo.length < 4) return erro('Dá um nome ao desafio.')
    if (!DIAS_DESAFIO.includes(dias)) return erro('Escolhe 3, 7, 14 ou 30 dias.')
    if (!checkRateLimit('rg-app-desafio-criar:' + m.id, 3, 24 * 3600_000).allowed) return erro('Já criaste 3 desafios hoje.', 429)
    const { data: d, error } = await db().from('rg_app_desafios_m').insert({ autor_id: m.id, titulo, descricao: descricao || null, dias, publico: b?.publico !== false }).select('id').single()
    if (error || !d) return erro('Não consegui criar o desafio.')
    await db().from('rg_app_desafios_m_adesoes').insert({ desafio_id: d.id, membro_id: m.id, inicio: dia })
    if (b?.publico !== false) try { await avisarAdmin(db(), `🎯 Desafio novo na app\n${m.nome}: «${titulo}» (${dias} dias)${descricao ? '\n' + descricao.slice(0, 200) : ''}`) } catch {}
    return NextResponse.json(await estado(m))
  }
  if (accao === 'desafio_entrar' || accao === 'desafio_sair' || accao === 'desafio_checkin' || accao === 'desafio_denunciar' || accao === 'desafio_apagar') {
    const id = t(b?.id, 40)
    const { data: d } = await db().from('rg_app_desafios_m').select('*').eq('id', id).maybeSingle()
    if (!d || (d.oculto && d.autor_id !== m.id)) return erro('Este desafio já não existe.', 404)
    const { data: a } = await db().from('rg_app_desafios_m_adesoes').select('*').eq('desafio_id', id).eq('membro_id', m.id).maybeSingle()
    if (accao === 'desafio_entrar') {
      if (!d.publico && d.autor_id !== m.id) return erro('Este desafio é privado.')
      if (!a) await db().from('rg_app_desafios_m_adesoes').insert({ desafio_id: id, membro_id: m.id, inicio: dia })
      return NextResponse.json(await estado(m))
    }
    if (accao === 'desafio_sair') {
      if (a && !a.concluido) await db().from('rg_app_desafios_m_adesoes').delete().eq('desafio_id', id).eq('membro_id', m.id)
      return NextResponse.json(await estado(m))
    }
    if (accao === 'desafio_apagar') {
      if (d.autor_id !== m.id) return erro('Só quem criou pode apagar.')
      await db().from('rg_app_desafios_m').delete().eq('id', id)
      return NextResponse.json(await estado(m))
    }
    if (accao === 'desafio_denunciar') {
      if (d.autor_id === m.id) return erro('Não podes denunciar o que é teu.')
      const { error } = await db().from('rg_app_denuncias').insert({ alvo: 'desafio', alvo_id: id, membro_id: m.id, motivo: t(b?.motivo, 200) || null })
      if (error) return erro('Já denunciaste isto. Obrigado.')
      const n = (d.denuncias || 0) + 1
      await db().from('rg_app_desafios_m').update({ denuncias: n, ...(n >= 3 ? { oculto: true } : {}) }).eq('id', id)
      try { await avisarAdmin(db(), `🚩 Desafio denunciado na app (${n}.ª)\n«${d.titulo}»${n >= 3 ? '\nSaiu do ar automaticamente.' : ''}`) } catch {}
      return NextResponse.json({ ...(await estado(m)), aviso: 'Obrigado. Vamos rever.' })
    }
    // Check-in: um por dia; ao chegar aos dias do desafio, conclui.
    if (!a) return erro('Entra primeiro no desafio.')
    if (a.concluido) return erro('Já concluíste este desafio. 🎖️')
    if (a.ultimo === dia || !(await registarDia('dm:' + id, 0))) return erro('Já fizeste o check-in de hoje.')
    const checkins = (a.checkins || 0) + 1, fim = checkins >= d.dias
    await db().from('rg_app_desafios_m_adesoes').update({ checkins, ultimo: dia, ...(fim ? { concluido: new Date().toISOString() } : {}) }).eq('desafio_id', id).eq('membro_id', m.id)
    const g1 = await darXp('app_desafio_membro_dia', 5, `Desafio «${d.titulo}» dia ${checkins}`)
    const g2 = fim ? await darXp('app_desafio_membro_fim', 20, `Desafio «${d.titulo}» concluído`) : { xp: 0, subiu: false }
    return responder({ xp: g1.xp + g2.xp, subiu: g1.subiu || g2.subiu }, { desafio_fim: fim ? d.titulo : null })
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
