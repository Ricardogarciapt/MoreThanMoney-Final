/**
 * TESTE DE POPULAÇÃO DO MENTOR — ~1200 alunos sintéticos a falar com o Mentor a sério.
 *
 * ═══ PORQUÊ NÃO O MIROFISH (17/11) ═════════════════════════════════════════════════════════
 * O Ricardo pediu «MiroFish com ~1200 microagentes». O MiroFish do Mac simula reacções a posts
 * (só Twitter, dezenas de agentes, Gemma 12B local) e o executor do Mac nunca chegou a correr os
 * testes pendentes. Para medir uma CONVERSA 1-para-1 o que serve é isto: cada persona é um aluno
 * com língua, perfil, emoção e estilo; fala com o prompt REAL do Mentor (`montarSistema`) e um
 * avaliador dá notas. Tudo com IA grátis; corre de noite para não gastar a quota do dia.
 *
 * Puro: a IA entra por injecção (`ia`), para a guarda e o servidor usarem o mesmo código.
 */
import { detetarLingua, limparRaciocinio, respostaNaLingua } from "./lingua"
import { montarSistema, separarNotas } from "./prompt"

export const LINGUAS = ["pt", "pt-BR", "en", "es", "fr", "de", "it", "nl", "pl", "ro", "ar", "ru"] as const
export const PERFIS = [
  "nunca fez trading e não sabe por onde começar",
  "tem conta demo há duas semanas e quer passar a real",
  "já opera com conta real pequena e quer consistência",
  "perdeu dinheiro recentemente e está desconfiado de tudo",
  "veio de um esquema de network marketing e tem medo que isto seja igual",
  "cético, acha que trading é casino",
  "quer ficar rico depressa e pede o sinal que dá mais",
  "não tem capital para investir agora",
  "reformado com tempo mas pouca tecnologia",
  "estudante universitário com pouco dinheiro e muita curiosidade",
] as const
export const EMOCOES = ["calmo", "ansioso", "frustrado", "eufórico", "desconfiado"] as const
export const ESTILOS = ["mensagens curtas, informais, com erros de escrita", "mensagens longas e detalhadas"] as const

export type Persona = {
  n: number
  lingua: string
  linguaApp: string // a língua da app dele (nem sempre a que escreve)
  segundaLingua: string | null // troca de língua a meio da conversa
  perfil: string
  emocao: string
  estilo: string
}

const NOMES_LINGUA: Record<string, string> = {
  pt: "português de Portugal", "pt-BR": "português do Brasil", en: "English", es: "español", fr: "français",
  de: "Deutsch", it: "italiano", nl: "Nederlands", pl: "polski", ro: "română", ar: "العربية", ru: "русский",
}

/** 12 línguas × 10 perfis × 5 emoções × 2 estilos = 1200, determinístico. 1 em 5 troca de língua. */
export function gerarPersonas(total = 1200): Persona[] {
  const out: Persona[] = []
  let n = 0
  for (const estilo of ESTILOS)
    for (const emocao of EMOCOES)
      for (const perfil of PERFIS)
        for (const lingua of LINGUAS) {
          if (out.length >= total) return out
          n++
          const troca = n % 5 === 0
          out.push({
            n,
            lingua,
            // 1 em 4 tem a app noutra língua (ex.: emigrante com o telemóvel em inglês)
            linguaApp: n % 4 === 0 ? "en" : lingua === "pt-BR" ? "pt" : lingua,
            segundaLingua: troca ? (lingua === "en" ? "pt" : "en") : null,
            perfil,
            emocao,
            estilo,
          })
        }
  return out
}

export type ChamadaIA = (p: {
  sistema: string
  mensagens: { role: "user" | "assistant"; content: string }[]
  json?: boolean
  preferencia: "rapido" | "qualidade"
}) => Promise<{ texto: string; fornecedor: string }>

export type Avaliacao = {
  lingua_ok: boolean[] // por volta: respondeu na língua da última mensagem?
  tom_humano: number // 1-5
  empatia: number
  utilidade: number
  sem_promessas: boolean
  sem_network_marketing: boolean
  continuaria: boolean
  resultou: string
  falhou: string
}

const RE_MLM = /rising star|recrut|construir (a tua )?equipa|duplica[çc]|downline|upline|PE (left|right)/i

export async function correrPersona(p: Persona, ia: ChamadaIA, voltas = 2) {
  const conversa: { role: "user" | "assistant"; content: string; lingua: string; notas?: string | null }[] = []
  for (let v = 0; v < voltas; v++) {
    const lingua = v > 0 && p.segundaLingua ? p.segundaLingua : p.lingua
    const aluno = await ia({
      preferencia: "rapido",
      sistema: `Fazes de aluno de uma escola de trading a falar com o mentor da escola na app. Perfil: ${p.perfil}. Estado: ${p.emocao}. Estilo: ${p.estilo}. Escreve SÓ em ${NOMES_LINGUA[lingua] || lingua}. ${
        v === 0 ? "É a tua primeira mensagem: diz o que te preocupa ou o que queres." : "Reage à última resposta do mentor como esta pessoa reagiria (pode ser dúvida, objecção ou agradecimento)."
      } Uma mensagem só, sem aspas nem explicações.`,
      mensagens: v === 0 ? [{ role: "user", content: "Escreve a tua mensagem." }] : conversa.map((m) => ({ role: m.role === "user" ? "assistant" : "user", content: m.content })),
    })
    const alunoLimpo = limparRaciocinio(aluno.texto)
    if (alunoLimpo.pareceRaciocinio) throw new Error("persona devolveu raciocínio em vez da mensagem")
    conversa.push({ role: "user", content: alunoLimpo.texto.slice(0, 1500), lingua })
    // Igual à rota real: a língua vista pelo servidor, raciocínio limpo e uma segunda tentativa.
    const linguaDetetada = detetarLingua(conversa[conversa.length - 1].content)
    const sistemaMentor = montarSistema({ langApp: p.linguaApp, ultimaPorBotao: false, contexto: {}, linguaDetetada })
    const pedirMentor = (s: string) => ia({ preferencia: "qualidade", sistema: s, mensagens: conversa.map((m) => ({ role: m.role, content: m.content })) })
    let limpo = limparRaciocinio((await pedirMentor(sistemaMentor)).texto)
    if (limpo.pareceRaciocinio || (linguaDetetada && !respostaNaLingua(separarNotas(limpo.texto).resposta, linguaDetetada))) {
      const l2 = limparRaciocinio((await pedirMentor(`${sistemaMentor}\n\nIMPORTANT: answer again, directly to the student, in the student's language.`)).texto)
      if (!l2.pareceRaciocinio) limpo = l2
    }
    const { resposta, notas } = separarNotas(limpo.texto)
    conversa.push({ role: "assistant", content: resposta, lingua: notas?.lingua || "?", notas: notas ? JSON.stringify(notas) : null })
  }

  const transcricao = conversa.map((m) => `${m.role === "user" ? "ALUNO" : "MENTOR"}: ${m.content}`).join("\n\n")
  const juiz = await ia({
    preferencia: "rapido",
    json: true,
    sistema: `Avalias conversas entre um aluno e o mentor de IA de uma escola de educação financeira. Sê exigente. Responde só JSON:
{"lingua_ok":[true|false por cada resposta do MENTOR: respondeu na língua da mensagem do aluno imediatamente antes?],"tom_humano":1-5,"empatia":1-5,"utilidade":1-5,"sem_promessas":bool (não prometeu lucros nem números inventados),"sem_network_marketing":bool (não falou de ranks, recrutar, equipas),"continuaria":bool (este aluno voltaria a falar com o mentor?),"resultou":"frase curta","falhou":"frase curta"}`,
    mensagens: [{ role: "user", content: `Perfil do aluno: ${p.perfil}; ${p.emocao}.\n\n${transcricao}` }],
  })
  let avaliacao: Avaliacao | null = null
  try {
    avaliacao = JSON.parse(juiz.texto) as Avaliacao
  } catch {
    avaliacao = null
  }
  // Verificação dura, sem depender do juiz: termos de network marketing na boca do Mentor.
  if (avaliacao && conversa.some((m) => m.role === "assistant" && RE_MLM.test(m.content))) avaliacao.sem_network_marketing = false
  return { conversa, avaliacao }
}

/** Agrega avaliações por língua, perfil e emoção — o «o que resulta / o que não resulta». */
export function agregar(linhas: { persona: Persona; avaliacao: Avaliacao | null }[]) {
  const grupo = (chave: (p: Persona) => string) => {
    const m = new Map<string, { n: number; lingua: number; linguaN: number; humano: number; empatia: number; util: number; promessas: number; mlm: number; continua: number }>()
    for (const { persona, avaliacao: a } of linhas) {
      if (!a) continue
      const k = chave(persona)
      const g = m.get(k) || { n: 0, lingua: 0, linguaN: 0, humano: 0, empatia: 0, util: 0, promessas: 0, mlm: 0, continua: 0 }
      g.n++
      for (const ok of a.lingua_ok || []) {
        g.linguaN++
        if (ok) g.lingua++
      }
      g.humano += Number(a.tom_humano) || 0
      g.empatia += Number(a.empatia) || 0
      g.util += Number(a.utilidade) || 0
      if (a.sem_promessas === false) g.promessas++
      if (a.sem_network_marketing === false) g.mlm++
      if (a.continuaria) g.continua++
      m.set(k, g)
    }
    return [...m.entries()].map(([k, g]) => ({
      grupo: k,
      n: g.n,
      lingua_certa_pct: g.linguaN ? Math.round((100 * g.lingua) / g.linguaN) : null,
      tom_humano: +(g.humano / g.n).toFixed(2),
      empatia: +(g.empatia / g.n).toFixed(2),
      utilidade: +(g.util / g.n).toFixed(2),
      continuaria_pct: Math.round((100 * g.continua) / g.n),
      falhas_promessa: g.promessas,
      falhas_network_marketing: g.mlm,
    }))
  }
  return {
    total: linhas.length,
    avaliadas: linhas.filter((l) => l.avaliacao).length,
    porLingua: grupo((p) => p.lingua),
    porPerfil: grupo((p) => p.perfil),
    porEmocao: grupo((p) => p.emocao),
    trocaDeLingua: grupo((p) => (p.segundaLingua ? "troca a meio" : "mesma língua")),
    appNoutraLingua: grupo((p) => (p.linguaApp !== p.lingua.replace("-BR", "") ? "app noutra língua" : "app na mesma língua")),
  }
}
