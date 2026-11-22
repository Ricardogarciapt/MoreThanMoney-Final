/**
 * GUARDA DA LÍNGUA DO MENTOR.   npx tsx lib/mentor/lingua.check.ts
 * Casos tirados do teste de população de 18/11 (onde o Mentor respondeu em português a it/de/pl).
 */
import assert from "node:assert/strict"
import { detetarLingua, limparRaciocinio, respostaNaLingua } from "./lingua"
import { montarSistema } from "./prompt"

const casos: [string, string | null][] = [
  ["maestro senti che qui la situazione è un po strana... ho perso un bel po' e ora nn so se fidarmi ancora di sta roba", "it"],
  ["bin mir ned sicher ob des net alles nur zocken is, wie casino. erklär ma wieso i net mein geld verbrenne soll", "de"],
  ["Hey, ik heb 2 weken demo, wil graag live gaan, maar ik ben nog onzeker over risico's", "nl"],
  ["hej, mam troche obawy... bylem wczesniej w takim network marketingu i straciłem kasę. czy to jest piramida?", "pl"],
  ["e aí, perdi uma grana e tô na dúvida se vc tá falando sério", "pt-BR"],
  ["Olá, perdi dinheiro esta semana e não sei se estou a fazer isto bem", "pt"],
  ["hey just wanna ask, is this legit? i was in a scheme before and lost money", "en"],
  ["Hola, tengo miedo de perder dinero otra vez, no sé cómo empezar", "es"],
  ["Bonjour, je suis perdu, j'ai perdu de l'argent et je ne sais pas comment faire", "fr"],
  ["Salut, am pierdut bani si nu stiu cum sa continui, vreau sa invat", "ro"],
  ["Привет, я потерял деньги и не знаю что делать", "ru"],
  ["مرحبا، خسرت المال ولا أعرف ماذا أفعل", "ar"],
  ["ok", null],
  ["👍", null],
]
for (const [t, esperado] of casos) assert.equal(detetarLingua(t), esperado, `«${t.slice(0, 40)}…» devia ser ${esperado}`)

// A resposta do caso italiano real (em português) tem de ser apanhada.
assert.equal(respostaNaLingua("Entendo perfeitamente o que estás a sentir. Perder dinheiro mexe sempre com a cabeça e não é fácil.", "it"), false)
assert.equal(respostaNaLingua("Capisco benissimo. Perdere soldi non è facile, ma non sei solo e possiamo capire insieme come fare.", "it"), true)
assert.equal(respostaNaLingua("Percebo, isso acontece com muita gente.", "pt-BR"), true, "pt e pt-BR contam como a mesma")

// Raciocínio do modelo nunca chega ao aluno como resposta válida.
assert.equal(limparRaciocinio("The user is speaking Dutch.\n* Status: demo").pareceRaciocinio, true)
assert.equal(limparRaciocinio("Student at a trading school.\n* Draft 1: hi").pareceRaciocinio, true)
assert.equal(limparRaciocinio("<think>plan</think>Olá! Vamos por partes.").texto, "Olá! Vamos por partes.")
assert.equal(limparRaciocinio("Olá! Vamos por partes.").pareceRaciocinio, false)

// A língua detetada vai no prompt, no fim, pelo nome.
const s = montarSistema({ langApp: "pt", ultimaPorBotao: false, contexto: {}, linguaDetetada: "it" })
assert.match(s.slice(-400), /Reply ONLY in Italian/)
assert.ok(!/Reply ONLY/.test(montarSistema({ langApp: "it", ultimaPorBotao: true, contexto: {}, linguaDetetada: "it" })), "botão da app: vale a língua da app")
console.log("mentor/lingua: ok")
