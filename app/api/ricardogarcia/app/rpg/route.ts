// RPG da app Missão: GET devolve tudo o que o ecrã do jogo precisa; POST { accao } faz o resto.
// Dados lançados no servidor, XP pelo registo único (awardXp) com os tectos de xp-config.
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/admin-api-helpers'
import { db, membroDaSessao, patenteDe } from '@/lib/ricardogarcia/app'
import { eSuperAdmin } from '@/lib/super-admin-regras'
import { awardXp } from '@/lib/xp-service'
import {
  RPG, ATRS, capitulo, cicloAtual, codigoMesa, d, lerFicha, mod, atributos, bonusKits, progresso, respostaCerta,
  salaActiva, salasActivas, testar, verFicha, verSala, verificarFoto, xpEscape, type Atr,
} from '@/lib/ricardogarcia/rpg'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n)
const erro = (m: string, s = 400) => NextResponse.json({ ok: false, erro: m }, { status: s })
const primeiro = (n: string) => String(n || '').trim().split(/\s+/)[0].slice(0, 20) || 'Membro'
const ehEquipa = (m: any) => m.user_type === 'admin' || eSuperAdmin(m.email)

async function darXp(userId: string, tipo: string, n: number, desc: string, unico = false) {
  if (n <= 0) return 0
  try { const r = await awardXp(db(), userId, tipo, { amount: n, actionDescription: desc, oncePerDescription: unico }); return r.awarded ? r.xp_gained : 0 } catch { return 0 }
}

async function ranking(salaId: string, ciclo: string) {
  const { data } = await db().from('rg_app_rpg_escape').select('membro_id, segundos, pistas').eq('sala_id', salaId).eq('ciclo', ciclo).not('fim', 'is', null).order('segundos').limit(10)
  const ids = (data || []).map(r => r.membro_id)
  const { data: fichas } = ids.length ? await db().from('rg_app_rpg_fichas').select('membro_id, nome, classe').in('membro_id', ids) : { data: [] as any[] }
  const f = new Map((fichas || []).map(x => [x.membro_id, x]))
  return (data || []).map(r => ({ nome: f.get(r.membro_id)?.nome || 'Agente', classe: f.get(r.membro_id)?.classe || null, segundos: r.segundos, pistas: (r.pistas || []).length }))
}

async function listarMesas(m: any) {
  const [{ data: minhas }, { data: pubs }] = await Promise.all([
    db().from('rg_app_rpg_mesa_membros').select('mesa_id').eq('membro_id', m.id),
    db().from('rg_app_rpg_mesas').select('*').eq('publica', true).eq('fechada', false).gte('actividade', new Date(Date.now() - 21 * 86_400_000).toISOString()).order('actividade', { ascending: false }).limit(20),
  ])
  const meusIds = (minhas || []).map(x => x.mesa_id)
  const { data: meus } = meusIds.length ? await db().from('rg_app_rpg_mesas').select('*').in('id', meusIds).eq('fechada', false) : { data: [] as any[] }
  const todas = new Map<string, any>()
  for (const x of [...(meus || []), ...(pubs || [])]) todas.set(x.id, x)
  const ids = [...todas.keys()]
  const { data: membros } = ids.length ? await db().from('rg_app_rpg_mesa_membros').select('mesa_id, membro_id').in('mesa_id', ids) : { data: [] as any[] }
  const mestres = [...new Set([...todas.values()].map(x => x.mestre_id))]
  const { data: fm } = mestres.length ? await db().from('rg_app_rpg_fichas').select('membro_id, nome').in('membro_id', mestres) : { data: [] as any[] }
  const nomeMestre = new Map((fm || []).map(x => [x.membro_id, x.nome]))
  const conta = new Map<string, number>()
  for (const x of membros || []) conta.set(x.mesa_id, (conta.get(x.mesa_id) || 0) + 1)
  return [...todas.values()].map(x => ({
    id: x.id, nome: x.nome, descricao: x.descricao, publica: x.publica, maximo: x.maximo, jogadores: conta.get(x.id) || 0,
    mestre: nomeMestre.get(x.mestre_id) || 'Mestre', sou_mestre: x.mestre_id === m.id, dentro: meusIds.includes(x.id),
    codigo: meusIds.includes(x.id) ? x.codigo : null,
  })).sort((a, b) => (+b.dentro - +a.dentro))
}

async function estadoRpg(m: any) {
  const nivel = (m.patente || 0) + 1
  const [f, p] = await Promise.all([lerFicha(m.id), progresso(m.id)])
  const ciclo = cicloAtual()
  const activas = salasActivas()
  const { data: regs } = await db().from('rg_app_rpg_escape').select('*').eq('membro_id', m.id).eq('ciclo', ciclo).in('sala_id', activas.map(s => s.sala.id))
  const reg = new Map((regs || []).map(r => [r.sala_id, r]))
  const salas = await Promise.all(activas.map(async s => ({ ...verSala(s.sala, reg.get(s.sala.id), m.id, ciclo), nova: s.nova, sai: s.sai, ranking: await ranking(s.sala.id, ciclo) })))
  return {
    ok: true, nivel, ciclo, equipa: ehEquipa(m),
    meta: {
      nome: RPG.nome, atributos: RPG.atributos, origens: RPG.origens,
      classes: RPG.classes.map((c: any) => ({ id: c.id, nome: c.nome, emoji: c.emoji, cor: c.cor, lema: c.lema, principal: c.principal, talentos: c.talentos, kit: RPG.kits.find((k: any) => k.id === c.kit) })),
      capitulos: RPG.capitulos.map((c: any) => ({ n: c.n, titulo: c.titulo, resumo: c.resumo })),
    },
    ficha: f ? verFicha(f, nivel, p) : null,
    progresso: p, salas, mesas: f ? await listarMesas(m) : [],
  }
}

async function verMesa(m: any, id: string, desde: number, comJogadores = true) {
  const { data: mesa } = await db().from('rg_app_rpg_mesas').select('*').eq('id', id).maybeSingle()
  if (!mesa) return null
  const { data: mem } = await db().from('rg_app_rpg_mesa_membros').select('membro_id, entrou').eq('mesa_id', id)
  const ids = (mem || []).map(x => x.membro_id)
  if (!ids.includes(m.id) && !ehEquipa(m)) return { fora: true, mesa }
  const [{ data: fichas }, { data: log }, { data: perfis }] = await Promise.all([
    db().from('rg_app_rpg_fichas').select('*').in('membro_id', ids),
    db().from('rg_app_rpg_mesa_log').select('id, membro_id, tipo, texto, dados, criado').eq('mesa_id', id).gt('id', desde).order('id', { ascending: false }).limit(80),
    db().from('rg_app_membros').select('id, nome').in('id', ids),
  ])
  const nomes = new Map((perfis || []).map(x => [x.id, primeiro(x.nome)]))
  const fichaDe = new Map((fichas || []).map(x => [x.membro_id, x]))
  const { data: xps } = ids.length ? await db().from('user_xp').select('user_id, total_xp').in('user_id', ids) : { data: [] as any[] }
  const nivelDe = new Map((xps || []).map(x => [x.user_id, patenteDe(x.total_xp || 0) + 1]))
  const jogadores = !comJogadores ? null : await Promise.all(ids.map(async uid => {
    const f = fichaDe.get(uid)
    if (!f) return { id: uid, eu: uid === m.id, pessoa: nomes.get(uid) || 'Membro', nome: nomes.get(uid) || 'Membro', classe: null, nivel: nivelDe.get(uid) || 1, mestre: uid === mesa.mestre_id, atributos: [] }
    const p = await progresso(uid), nv = nivelDe.get(uid) || 1, at = atributos(f, p), bk = bonusKits(f, nv, p)
    return { id: uid, eu: uid === m.id, pessoa: nomes.get(uid) || 'Membro', nome: f.nome, classe: f.classe, nivel: nv, mestre: uid === mesa.mestre_id,
      atributos: ATRS.map(a => ({ id: a, v: at[a].v, mod: mod(at[a].v) + bk[a] })) }
  }))
  const quem = (uid: string | null) => { const f = uid ? fichaDe.get(uid) : null; return f ? f.nome : uid ? nomes.get(uid) || 'Membro' : 'Mesa' }
  return {
    mesa: { id: mesa.id, nome: mesa.nome, descricao: mesa.descricao, codigo: mesa.codigo, publica: mesa.publica, maximo: mesa.maximo, cena: mesa.cena, fechada: mesa.fechada, sou_mestre: mesa.mestre_id === m.id },
    jogadores, log: (log || []).reverse().map(l => ({ id: l.id, tipo: l.tipo, texto: l.texto, dados: l.dados, quem: quem(l.membro_id), eu: l.membro_id === m.id, criado: l.criado })),
  }
}

const registar = async (mesaId: string, membroId: string | null, tipo: string, texto: string, dados: any = null) => {
  await db().from('rg_app_rpg_mesa_log').insert({ mesa_id: mesaId, membro_id: membroId, tipo, texto, dados })
  await db().from('rg_app_rpg_mesas').update({ actividade: new Date().toISOString() }).eq('id', mesaId)
}

export async function GET(req: NextRequest) {
  const m = await membroDaSessao(req)
  if (!m) return erro('Entra primeiro na app.', 401)
  const mesa = req.nextUrl.searchParams.get('mesa')
  if (mesa) {
    const desde = Number(req.nextUrl.searchParams.get('desde')) || 0
    const v = await verMesa(m, t(mesa, 40), desde, !desde || req.nextUrl.searchParams.get('jog') === '1')
    if (!v) return erro('Esta mesa já não existe.', 404)
    if ('fora' in v) return erro('Não estás nesta mesa.', 403)
    return NextResponse.json({ ok: true, ...v })
  }
  return NextResponse.json(await estadoRpg(m))
}

export async function POST(req: NextRequest) {
  const m = await membroDaSessao(req)
  if (!m) return erro('Entra primeiro na app.', 401)
  const b = await req.json().catch(() => ({} as any))
  const accao = String(b?.accao || '')
  const nivel = (m.patente || 0) + 1
  if (!checkRateLimit('rg-rpg:' + m.id, 60, 60_000).allowed) return erro('Calma, agente. Tenta daqui a um minuto.', 429)

  // ── Personagem e kits ─────────────────────────────────────────────────────
  if (accao === 'ficha_criar' || accao === 'ficha_editar') {
    const nome = t(b?.nome, 30), cl = RPG.classes.find((c: any) => c.id === b?.classe), og = RPG.origens.find((o: any) => o.id === b?.origem)
    if (nome.length < 2) return erro('Dá um nome à tua personagem.')
    if (!cl || !og) return erro('Escolhe a classe e a origem.')
    const ja = await lerFicha(m.id)
    if (ja) {
      // Mudar de classe recomeça os kits (o kit inicial é da classe).
      const up: any = { nome, origem: og.id }
      if (ja.classe !== cl.id) { up.classe = cl.id; up.equipados = [cl.kit] }
      await db().from('rg_app_rpg_fichas').update(up).eq('membro_id', m.id)
    } else {
      const { error } = await db().from('rg_app_rpg_fichas').insert({ membro_id: m.id, nome, classe: cl.id, origem: og.id, equipados: [cl.kit], capitulo: 1, cena: null })
      if (error) return erro('Não consegui criar a personagem.')
    }
    return NextResponse.json(await estadoRpg(m))
  }

  const f = await lerFicha(m.id)
  if (!f) return erro('Cria primeiro a tua personagem.')

  if (accao === 'equipar') {
    const p = await progresso(m.id)
    const disp = new Set(verFicha(f, nivel, p).kits.filter((k: any) => k.disponivel).map((k: any) => k.id))
    const escolhidos = [...new Set((Array.isArray(b?.kits) ? b.kits : []).map((x: unknown) => String(x)))].filter(k => disp.has(k)).slice(0, 3)
    await db().from('rg_app_rpg_fichas').update({ equipados: escolhidos }).eq('membro_id', m.id)
    return NextResponse.json(await estadoRpg(m))
  }

  // ── Campanha a solo ───────────────────────────────────────────────────────
  if (accao === 'capitulo') {
    const n = Number(b?.n), cap = capitulo(n)
    if (!cap) return erro('Capítulo desconhecido.')
    if (n > 1 && !(f.capitulos_feitos || []).includes(n - 1)) return erro(`Termina primeiro o capítulo ${n - 1}.`)
    await db().from('rg_app_rpg_fichas').update({ capitulo: n, cena: cap.inicio, talento_usado: null }).eq('membro_id', m.id)
    return NextResponse.json(await estadoRpg(m))
  }
  if (accao === 'escolher') {
    const cap = capitulo(f.capitulo), cena = cap && f.cena ? cap.cenas[f.cena] : null
    if (!cena || cena.fim) return erro('Escolhe um capítulo para jogar.')
    const op = (cena.opcoes || [])[Number(b?.opcao)]
    if (!op) return erro('Opção inválida.')
    const usar = !!b?.talento && f.talento_usado !== f.capitulo && !!op.teste
    const p = await progresso(m.id)
    const r = op.teste ? testar(f, nivel, p, op.teste as { atr: Atr; cd: number }, usar) : null
    const sucesso = r ? r.ok : true
    const prox = sucesso ? op.ok : (op.ko || op.ok)
    const nota = sucesso ? (op.nota_ok || '') : (op.nota_ko || op.nota_ok || '')
    const proxCena = cap.cenas[prox]
    const feitos: number[] = f.capitulos_feitos || []
    const acabou = !!proxCena?.fim, novo = acabou && !feitos.includes(cap.n)
    const diario = [...(f.diario || []), { cap: cap.n, cena: cena.titulo, escolha: op.t, nota, teste: r ? { atr: r.atr, d20: r.d20, total: r.total, cd: r.cd, ok: r.ok } : null, quando: new Date().toISOString() }].slice(-30)
    await db().from('rg_app_rpg_fichas').update({ cena: prox, diario, ...(usar ? { talento_usado: f.capitulo } : {}), ...(novo ? { capitulos_feitos: [...feitos, cap.n] } : {}) }).eq('membro_id', m.id)
    let xp = await darXp(m.id, 'app_rpg_cena', 5, `RPG: ${cena.titulo}`)
    if (novo) xp += await darXp(m.id, 'app_rpg_capitulo', 40, `RPG: capítulo ${cap.n} concluído`, true)
    return NextResponse.json({ ...(await estadoRpg(m)), resultado: { teste: r, nota, sucesso, talento: usar, fim: acabou ? cap.titulo : null }, ganho: { xp } })
  }

  // ── Escape rooms ──────────────────────────────────────────────────────────
  if (accao.startsWith('escape_')) {
    const sala = salaActiva(t(b?.sala, 40))
    if (!sala) return erro('Esta sala já saiu de rotação.')
    const ciclo = cicloAtual()
    const chave = { membro_id: m.id, sala_id: sala.id, ciclo }
    let { data: reg } = await db().from('rg_app_rpg_escape').select('*').match(chave).maybeSingle()
    if (accao === 'escape_entrar') {
      if (!reg) { await db().from('rg_app_rpg_escape').insert(chave); reg = (await db().from('rg_app_rpg_escape').select('*').match(chave).maybeSingle()).data }
      return NextResponse.json({ ok: true, sala: verSala(sala, reg, m.id, ciclo) })
    }
    if (!reg) return erro('Entra primeiro na sala.')
    if (reg.fim) return erro('Já saíste desta sala este mês. 🎖️')
    const i = Number(b?.i)
    if (!(i >= 0 && i < sala.enigmas.length)) return erro('Enigma inválido.')
    if (accao === 'escape_pista') {
      if (!(reg.pistas || []).includes(i)) await db().from('rg_app_rpg_escape').update({ pistas: [...(reg.pistas || []), i] }).match(chave)
      reg.pistas = [...new Set([...(reg.pistas || []), i])]
      return NextResponse.json({ ok: true, sala: verSala(sala, reg, m.id, ciclo) })
    }
    if (accao === 'escape_responder') {
      if (!checkRateLimit('rg-escape:' + m.id, 30, 60_000).allowed) return erro('Muitas tentativas. Respira e pensa.', 429)
      if (sala.enigmas[i].tipo === 'foto') {
        if (!checkRateLimit('rg-escape-foto:' + m.id, 12, 3600_000).allowed) return erro('Já enviaste muitas fotos nesta hora. Volta daqui a pouco.', 429)
        const v = await verificarFoto(sala.enigmas[i], b?.foto)
        if (v.indisponivel) return erro(v.motivo, 503)
        if (!v.ok) return NextResponse.json({ ok: true, certo: false, motivo: v.motivo, sala: verSala(sala, reg, m.id, ciclo) })
      } else if (!respostaCerta(sala, i, b?.resposta)) return NextResponse.json({ ok: true, certo: false, sala: verSala(sala, reg, m.id, ciclo) })
      const resolvidos = [...new Set([...(reg.resolvidos || []), i])]
      const fim = resolvidos.length >= sala.enigmas.length
      let xp = 0, tempo: any = null
      if (fim) {
        const x = xpEscape(sala, reg, f.classe, nivel)
        tempo = x
        await db().from('rg_app_rpg_escape').update({ resolvidos, fim: new Date().toISOString(), segundos: x.seg, xp: x.xp }).match(chave)
        xp = await darXp(m.id, 'app_escape', x.xp, `Escape room ${sala.id} ${ciclo}`, true)
      } else await db().from('rg_app_rpg_escape').update({ resolvidos }).match(chave)
      const { data: novo } = await db().from('rg_app_rpg_escape').select('*').match(chave).maybeSingle()
      return NextResponse.json({ ok: true, certo: true, fim, tempo, ganho: { xp }, sala: verSala(sala, novo, m.id, ciclo), ranking: fim ? await ranking(sala.id, ciclo) : null })
    }
    return erro('Acção desconhecida.')
  }

  // ── Mesas de jogo ─────────────────────────────────────────────────────────
  if (accao === 'mesa_criar') {
    const nome = t(b?.nome, 60)
    if (nome.length < 3) return erro('Dá um nome à mesa.')
    if (!checkRateLimit('rg-mesa-criar:' + m.id, 3, 24 * 3600_000).allowed) return erro('Já criaste 3 mesas hoje.', 429)
    let codigo = codigoMesa(), mesa: any = null
    for (let k = 0; k < 4 && !mesa; k++) {
      const r = await db().from('rg_app_rpg_mesas').insert({ mestre_id: m.id, nome, descricao: t(b?.descricao, 300) || null, publica: b?.publica !== false, maximo: Math.min(8, Math.max(2, Number(b?.maximo) || 6)), codigo }).select('*').single()
      if (r.data) mesa = r.data; else codigo = codigoMesa()
    }
    if (!mesa) return erro('Não consegui criar a mesa.')
    await db().from('rg_app_rpg_mesa_membros').insert({ mesa_id: mesa.id, membro_id: m.id })
    await registar(mesa.id, null, 'sistema', `${f.nome} abriu a mesa como mestre.`)
    return NextResponse.json({ ...(await estadoRpg(m)), mesa: mesa.id })
  }
  if (accao === 'mesa_entrar') {
    const codigo = t(b?.codigo, 10).toUpperCase()
    const q = db().from('rg_app_rpg_mesas').select('*').eq('fechada', false)
    const { data: mesa } = codigo ? await q.eq('codigo', codigo).maybeSingle() : await q.eq('id', t(b?.id, 40)).maybeSingle()
    if (!mesa) return erro(codigo ? 'Não há nenhuma mesa com esse código.' : 'Esta mesa já fechou.', 404)
    if (!mesa.publica && !codigo) return erro('Esta mesa é privada: pede o código a quem a criou.')
    const { count } = await db().from('rg_app_rpg_mesa_membros').select('membro_id', { count: 'exact', head: true }).eq('mesa_id', mesa.id)
    const { data: ja } = await db().from('rg_app_rpg_mesa_membros').select('membro_id').eq('mesa_id', mesa.id).eq('membro_id', m.id).maybeSingle()
    if (!ja) {
      if ((count || 0) >= mesa.maximo) return erro('A mesa está cheia.')
      await db().from('rg_app_rpg_mesa_membros').insert({ mesa_id: mesa.id, membro_id: m.id })
      await registar(mesa.id, null, 'sistema', `${f.nome} sentou-se à mesa.`)
    }
    return NextResponse.json({ ok: true, mesa: mesa.id })
  }

  if (accao.startsWith('mesa_')) {
    const id = t(b?.id, 40)
    const { data: mesa } = await db().from('rg_app_rpg_mesas').select('*').eq('id', id).maybeSingle()
    if (!mesa) return erro('Esta mesa já não existe.', 404)
    const { data: dentro } = await db().from('rg_app_rpg_mesa_membros').select('membro_id').eq('mesa_id', id).eq('membro_id', m.id).maybeSingle()
    const mestre = mesa.mestre_id === m.id
    if (accao === 'mesa_fechar') {
      if (!mestre && !ehEquipa(m)) return erro('Só o mestre pode fechar a mesa.')
      await db().from('rg_app_rpg_mesas').update({ fechada: true }).eq('id', id)
      await registar(id, null, 'sistema', 'A mesa foi fechada.')
      return NextResponse.json(await estadoRpg(m))
    }
    if (!dentro) return erro('Não estás nesta mesa.', 403)
    if (mesa.fechada) return erro('Esta mesa está fechada.')
    if (accao === 'mesa_sair') {
      if (mestre) return erro('És o mestre: fecha a mesa em vez de sair.')
      await db().from('rg_app_rpg_mesa_membros').delete().eq('mesa_id', id).eq('membro_id', m.id)
      await registar(id, null, 'sistema', `${f.nome} saiu da mesa.`)
      return NextResponse.json(await estadoRpg(m))
    }
    if (accao === 'mesa_msg') {
      const texto = t(b?.texto, 600)
      if (!texto) return erro('Escreve alguma coisa.')
      if (!checkRateLimit('rg-mesa-msg:' + m.id, 20, 60_000).allowed) return erro('Mais devagar.', 429)
      await registar(id, m.id, mestre && b?.narrar ? 'cena' : 'msg', texto)
      return NextResponse.json({ ok: true })
    }
    if (accao === 'mesa_dado') {
      const tipo = ['d20', '3d6', 'd6', 'd4', 'd8', 'd12'].includes(b?.dado) ? b.dado : 'd20'
      const rolos = tipo === '3d6' ? [d(6), d(6), d(6)] : [d(Number(tipo.slice(1)))]
      const a = ATRS.includes(b?.atr) ? b.atr as Atr : null
      let bonus = 0
      if (a) { const p = await progresso(m.id); bonus = mod(atributos(f, p)[a].v) + bonusKits(f, nivel, p)[a] }
      const soma = rolos.reduce((s, x) => s + x, 0) + bonus
      const nomeA = a ? RPG.atributos.find((x: any) => x.id === a)?.nome : null
      await registar(id, m.id, 'dado', `${tipo}${nomeA ? ' de ' + nomeA : ''}: ${rolos.join(' + ')}${bonus ? (bonus > 0 ? ' + ' : ' − ') + Math.abs(bonus) : ''} = ${soma}`, { tipo, rolos, bonus, soma, atr: a, critico: tipo === 'd20' && rolos[0] === 20, falhanco: tipo === 'd20' && rolos[0] === 1 })
      return NextResponse.json({ ok: true, soma })
    }
    if (accao === 'mesa_cena') {
      if (!mestre) return erro('Só o mestre muda a cena.')
      const cap = capitulo(Number(b?.capitulo)), cena = cap?.cenas?.[t(b?.cena, 20)]
      const nova = cena ? { titulo: cena.titulo, texto: cena.texto, opcoes: (cena.opcoes || []).map((o: any) => ({ t: o.t, teste: o.teste || null })), capitulo: cap.n }
        : { titulo: t(b?.titulo, 80) || 'Cena', texto: t(b?.texto, 1200), opcoes: [] }
      if (!nova.texto) return erro('Escreve a cena.')
      await db().from('rg_app_rpg_mesas').update({ cena: nova }).eq('id', id)
      await registar(id, m.id, 'cena', `${nova.titulo}: ${nova.texto}`.slice(0, 1400), { cena: nova })
      return NextResponse.json({ ok: true })
    }
    if (accao === 'mesa_xp' || accao === 'mesa_expulsar') {
      if (!mestre) return erro('Só o mestre pode fazer isto.')
      const alvo = t(b?.alvo, 40)
      if (alvo === m.id) return erro('O mestre não se pode dar XP a si próprio.')
      const { data: ok } = await db().from('rg_app_rpg_mesa_membros').select('membro_id').eq('mesa_id', id).eq('membro_id', alvo).maybeSingle()
      if (!ok) return erro('Essa pessoa não está na mesa.')
      const fa = await lerFicha(alvo)
      if (accao === 'mesa_expulsar') {
        await db().from('rg_app_rpg_mesa_membros').delete().eq('mesa_id', id).eq('membro_id', alvo)
        await registar(id, null, 'sistema', `${fa?.nome || 'Um jogador'} saiu da mesa por decisão do mestre.`)
        return NextResponse.json({ ok: true })
      }
      const xp = await darXp(alvo, 'app_rpg_mesa', 10, `Mesa de RPG: ${mesa.nome}`)
      await registar(id, m.id, 'xp', xp ? `${fa?.nome || 'Jogador'} ganhou +${xp} XP do mestre.` : `${fa?.nome || 'Jogador'} já recebeu o XP de mesa de hoje.`, { alvo, xp })
      return NextResponse.json({ ok: true, xp })
    }
  }
  return erro('Acção desconhecida.')
}
