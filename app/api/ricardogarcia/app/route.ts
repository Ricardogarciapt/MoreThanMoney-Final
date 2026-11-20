import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { avisarAdmin } from '@/lib/primegate/verificacao'
import {
  COOKIE, PATENTES, INSIGNIAS, db, hoje, diasEntre, patenteDe, hashPass, confere, criarSessao, membroDaSessao,
  terminarSessao, economia, missoesDoDia, ligarAoCrm, podeResgatar,
} from '@/lib/ricardogarcia/app'

export const dynamic = 'force-dynamic'

const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)
const erro = (m: string, s = 400) => NextResponse.json({ ok: false, erro: m }, { status: s })
const primeiroNome = (n: string) => String(n || '').trim().split(/\s+/)[0].slice(0, 20)

function comSessao(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 90 * 86400 })
  return res
}

async function estado(m: any) {
  const dia = hoje()
  const [missoes, regs, conq, recs, resg, top] = await Promise.all([
    missoesDoDia(dia),
    db().from('rg_app_registos').select('missao_id, iniciado, concluido, xp').eq('membro_id', m.id).eq('dia', dia),
    db().from('rg_app_conquistas').select('insignia, criado').eq('membro_id', m.id),
    db().from('rg_app_recompensas').select('*').eq('activo', true).order('ordem'),
    db().from('rg_app_resgates').select('id, recompensa_id, custo, estado, criado').eq('membro_id', m.id).order('criado', { ascending: false }).limit(20),
    db().from('rg_app_membros').select('id, nome, xp, patente, sequencia').eq('estado', 'ativo').order('xp', { ascending: false }).limit(10),
  ])
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
    missoes: missoes.map(x => {
      const r: any = porMissao.get(x.id)
      return { id: x.id, tipo: x.tipo, titulo: x.titulo, resumo: x.resumo, conteudo: x.conteudo, xp: x.xp, min_seg: x.min_seg,
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
    const { data: ja } = await db().from('rg_app_membros').select('id').eq('email', email).maybeSingle()
    if (ja) return erro('Já existe uma conta com este email. Entra com a tua palavra-passe.', 409)
    const { data: m, error } = await db().from('rg_app_membros').insert({
      nome, email, telefone: telefone || null, pass_hash: hashPass(pass), consentimento: true, origem: t(b?.origem, 60) || 'app',
    }).select('*').single()
    if (error || !m) return erro('Não consegui criar a conta. Tenta outra vez.', 500)
    await ligarAoCrm(m)
    try { await avisarAdmin(db(), `🎖️ Novo recruta na app Missão\n${nome} · ${email}${telefone ? ' · ' + telefone : ''}\nJá está no pipeline (origem app-ricardo).`) } catch {}
    return comSessao(NextResponse.json({ ok: true }), await criarSessao(m.id))
  }

  if (accao === 'entrar') {
    if (!checkRateLimit('rg-app-in:' + ip, 10, 15 * 60_000).allowed) return erro('Muitas tentativas. Espera uns minutos.', 429)
    const email = t(b?.email, 160).toLowerCase()
    const { data: m } = await db().from('rg_app_membros').select('id, pass_hash, estado').eq('email', email).maybeSingle()
    if (!m || !confere(String(b?.pass || ''), m.pass_hash)) return erro('Email ou palavra-passe errados.', 401)
    if (m.estado !== 'ativo') return erro('Esta conta está suspensa. Fala com o Ricardo.', 403)
    return comSessao(NextResponse.json({ ok: true }), await criarSessao(m.id))
  }

  if (accao === 'sair') {
    await terminarSessao(req)
    const r = NextResponse.json({ ok: true }); r.cookies.delete(COOKIE); return r
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

    const { data: hojeRegs } = await db().from('rg_app_registos').select('xp, concluido').eq('membro_id', m.id).eq('dia', dia)
    const ganhoHoje = (hojeRegs || []).reduce((s, r) => s + (r.xp || 0), 0)
    const feitasAntes = (hojeRegs || []).filter(r => r.concluido).length
    let xp = Math.max(0, Math.min(mi.xp, eco.xp_dia_max - ganhoHoje))
    await db().from('rg_app_registos').update({ concluido: new Date().toISOString(), xp, resposta: resposta || null }).eq('id', reg.id)

    const up: any = {}
    let moedas = 0, xpTotal = m.xp + xp, bonus = 0
    if (feitasAntes === 0) {
      const ontem = new Date(Date.parse(dia) - 86_400_000).toISOString().slice(0, 10)
      const seq = m.ultimo_dia === ontem ? m.sequencia + 1 : m.ultimo_dia === dia ? m.sequencia : 1
      up.sequencia = seq; up.melhor_sequencia = Math.max(m.melhor_sequencia, seq); up.ultimo_dia = dia; up.dias_ativos = m.dias_ativos + 1
      if (seq > 0 && seq % 7 === 0 && m.ultimo_dia !== dia) moedas += eco.moedas_semana
    }
    const completo = feitasAntes + 1 >= missoes.length
    if (completo) {
      bonus = Math.max(0, Math.min(eco.bonus_dia_completo, eco.xp_dia_max - ganhoHoje - xp))
      if (bonus) { xpTotal += bonus; await db().from('rg_app_registos').update({ xp: xp + bonus }).eq('id', reg.id) }
      moedas += eco.moedas_dia_completo
    }
    const pat = patenteDe(xpTotal)
    if (pat > m.patente) moedas += eco.moedas_patente * (pat - m.patente)
    const novo = { ...m, ...up, xp: xpTotal, patente: pat, _completo: completo }
    const { data: tem } = await db().from('rg_app_conquistas').select('insignia').eq('membro_id', m.id)
    const novas = INSIGNIAS.filter(i => !(tem || []).some(c => c.insignia === i.id) && i.teste(novo))
    if (novas.length) {
      await db().from('rg_app_conquistas').insert(novas.map(i => ({ membro_id: m.id, insignia: i.id })))
      moedas += eco.moedas_insignia * novas.length
    }
    await db().from('rg_app_membros').update({ ...up, xp: xpTotal, patente: pat, moedas: m.moedas + moedas }).eq('id', m.id)
    const atual = { ...m, ...up, xp: xpTotal, patente: pat, moedas: m.moedas + moedas }
    return NextResponse.json({ ...(await estado(atual)), ganho: { xp: xp + bonus, moedas, subiu: pat > m.patente, insignias: novas.map(i => i.nome), completo } })
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
