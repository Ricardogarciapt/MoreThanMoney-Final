// Mentor IA dentro da app Missão. Quem usa a app ainda NÃO é membro nem Premium: é um lead a ganhar
// confiança. O mentor acompanha a pessoa no plano de 39 dias (corpo, mente, rede, melhoria) e só
// fala da MoreThanMoney quando a conversa lá chega sozinha. As notas escondidas alimentam o funil.
import { blocoFramework } from '@/lib/framework-mtm'
import { chamarIAGratis, mensagemIndisponivel } from '@/lib/ia/chamar'
import { separarNotas, TIPOS_SINAL } from '@/lib/mentor/prompt'
import { db, hoje } from '@/lib/ricardogarcia/app'
import { diaDoPlano } from '@/lib/ricardogarcia/plano39'
import { avisarAdmin } from '@/lib/primegate/verificacao'

const SITE = 'https://www.morethanmoney.pt'

export const MENTOR_APP = `És o Mentor da app Missão do Ricardo Garcia (MoreThanMoney). Acompanhas pessoas que estão a fazer um plano de 39 dias com quatro missões por dia: corpo (treino curto), mente (desenvolvimento pessoal), rede (networking e presença) e melhoria (produtividade e hábitos).

## Quem está do outro lado
Pessoas entre os 20 e os 45 anos que querem mudar de vida: mais energia, mais disciplina, melhores pessoas à volta. Ainda NÃO são membros nem Premium da MoreThanMoney e muitas nem sabem bem o que é. Nunca digas que são «leads» nem fales de funil, vendas ou conversão.

## Como acompanhas
- Fala como um treinador próximo: PT-PT, «tu», frases curtas, sem sermões. Máximo 120 palavras por resposta, salvo se pedirem detalhe.
- Puxa sempre para a ação de hoje: a missão do dia, a série, o próximo passo de 5 minutos.
- Faz uma pergunta de cada vez. Lembra-te do que a pessoa já te contou.
- Celebra progresso concreto. Nos dias maus, normaliza e dá um passo pequeno ("nunca falhar dois dias seguidos").
- Saúde: só dicas gerais. Dor, lesão, doença, gravidez ou alimentação clínica → diz para falar com um profissional de saúde. Sofrimento emocional sério → sugere ajuda profissional (SNS 24: 808 24 24 24).

## Quando (e só quando) falar da MoreThanMoney
O objetivo é que a pessoa ganhe tanto valor aqui que queira ir mais longe por vontade própria. Por isso:
- Só sugeres um caminho quando a pessoa toca no tema: dinheiro, poupança, rendimento extra, investir/trading → educação financeira MTM (${SITE}/ricardogarcia#caminhos). Inteligência artificial, negócio próprio, automatizar → MTM Soluções (${SITE}/solucoes). Quer falar com o Ricardo ou com alguém da equipa → ${SITE}/agendar.
- No máximo uma sugestão em cada 4 respostas, numa frase, como convite e não como venda. Se a pessoa disser que não, não insistas.
- Nunca prometas lucros, rendimentos nem resultados. Trading tem risco; diz que é conteúdo educativo, não aconselhamento financeiro. Nada de números de desempenho.
- Não descrevas funcionalidades de membros/Premium como se a pessoa já as tivesse. Não inventes preços: para preços, encaminha para o link.

## Notas internas (a pessoa não as vê)
No fim de CADA resposta, numa linha à parte, escreve exactamente:
<notas>{"sinais":[{"tipo":"<tipo>","tema":"<2-4 palavras>","resumo":"<1 frase, sem dados sensíveis>"}],"lembrar":"<facto novo e útil sobre a pessoa, ou vazio>"}</notas>
Tipos possíveis: ${TIPOS_SINAL.join(', ')}. Usa "interesse_upgrade" quando a pessoa mostra interesse em aprender finanças/trading/IA com a MTM ou pergunta por preços; "pedido_humano" quando quer falar com alguém; "emocao" para medo, frustração ou desânimo forte; "bloqueio" quando está parada no plano. Lista vazia é normal.`

function contexto(m: any, extra: { plano: any; feitasHoje: number; totalHoje: number; respostas: string[]; lembrar: string[] }) {
  const p = extra.plano
  return `## Esta pessoa (dados da app, não os recites)
- Nome: ${String(m.nome || '').split(/\s+/)[0] || 'sem nome'} · patente ${m.patente?.nome || m.patente_nome || ''} · série de ${m.sequencia || 0} dias (melhor ${m.melhor_sequencia || 0})
- Plano 39: dia ${p.dia} de 39, fase ${p.fase.n} (${p.fase.nome})${p.ciclo > 1 ? `, ciclo ${p.ciclo}` : ''}
- Missões hoje: ${extra.feitasHoje} de ${extra.totalHoje} feitas
${extra.respostas.length ? `- O que escreveu nas últimas missões:\n${extra.respostas.map(r => `  · ${r}`).join('\n')}` : ''}
${extra.lembrar.length ? `- Lembra-te: ${extra.lembrar.join(' · ')}` : ''}`
}

export async function historico(membroId: string, n = 40) {
  const { data } = await db().from('rg_app_mentor').select('papel, texto, criado').eq('membro_id', membroId).in('papel', ['user', 'assistant']).order('criado', { ascending: false }).limit(n)
  return (data || []).reverse()
}

export async function falarComMentor(m: any, texto: string) {
  const dia = hoje()
  const [hist, regs, notas] = await Promise.all([
    historico(m.id, 16),
    db().from('rg_app_registos').select('concluido, resposta, dia').eq('membro_id', m.id).order('dia', { ascending: false }).limit(12),
    db().from('rg_app_mentor').select('texto').eq('membro_id', m.id).eq('papel', 'nota').order('criado', { ascending: false }).limit(6),
  ])
  const hojeRegs = (regs.data || []).filter(r => r.dia === dia)
  const plano = diaDoPlano(m, dia)
  const sistema = [blocoFramework('apoio'), MENTOR_APP, contexto(m, {
    plano, feitasHoje: hojeRegs.filter(r => r.concluido).length, totalHoje: 4,
    respostas: (regs.data || []).filter(r => r.resposta).slice(0, 3).map(r => String(r.resposta).slice(0, 160)),
    lembrar: (notas.data || []).map(n => n.texto),
  })].join('\n\n')
  await db().from('rg_app_mentor').insert({ membro_id: m.id, papel: 'user', texto })
  const mensagens = [...hist.map(h => ({ role: h.papel as 'user' | 'assistant', content: h.texto })), { role: 'user' as const, content: texto }]
  let resposta = ''
  try {
    const r = await chamarIAGratis({ tarefa: 'mentor-app-missao', sistema, mensagens, maxTokens: 600, temperatura: 0.7, preferencia: 'qualidade' })
    const s = separarNotas(r.texto)
    resposta = s.resposta || 'Conta-me mais. O que é que te está a travar hoje?'
    if (s.notas?.lembrar) await db().from('rg_app_mentor').insert({ membro_id: m.id, papel: 'nota', texto: s.notas.lembrar })
    const quentes = (s.notas?.sinais || []).filter(x => x.tipo === 'interesse_upgrade' || x.tipo === 'pedido_humano')
    if (s.notas?.sinais?.length) await db().from('rg_app_mentor').insert({ membro_id: m.id, papel: 'nota', texto: `[sinais] ${s.notas.sinais.map(x => x.tipo + ': ' + x.tema).join('; ')}`.slice(0, 300), dados: { sinais: s.notas.sinais } })
    if (quentes.length) {
      // Um aviso por pessoa por dia, para a equipa ligar no momento certo.
      const { count } = await db().from('rg_app_mentor').select('id', { count: 'exact', head: true }).eq('membro_id', m.id).eq('papel', 'nota').like('texto', '[aviso]%').gte('criado', dia + 'T00:00:00Z')
      if (!count) {
        await db().from('rg_app_mentor').insert({ membro_id: m.id, papel: 'nota', texto: '[aviso] equipa avisada' })
        try { await avisarAdmin(db(), `🧭 <b>Mentor da app Missão</b>: ${String(m.nome || '').split(/\s+/)[0]} (${m.email || 'sem email'})\n${quentes.map(q => `• ${q.tipo === 'pedido_humano' ? 'Quer falar com alguém' : 'Interesse'}: ${q.resumo}`).join('\n')}\nDia ${plano.dia}/39 · série ${m.sequencia || 0}`) } catch {}
      }
    }
  } catch (e) {
    resposta = mensagemIndisponivel(e)
  }
  await db().from('rg_app_mentor').insert({ membro_id: m.id, papel: 'assistant', texto: resposta })
  return resposta
}
