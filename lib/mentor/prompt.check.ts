/**
 * GUARDA DO MENTOR.   npx tsx lib/mentor/prompt.check.ts
 *
 * Prova o que não dá erro quando parte: o prompt voltar a falar de ranks/recrutamento, a regra da
 * língua desaparecer, ou a linha de notas escapar para o aluno.
 */
import assert from "node:assert/strict"
import { juntarMemoria, montarSistema, separarNotas } from "./prompt"

const s = montarSistema({ langApp: "de", ultimaPorBotao: false, contexto: { primeiroNome: "Ana" } })

// 1. Nada de network marketing a ser PEDIDO: os termos só podem aparecer na lista do que é proibido.
const proibidos = /rising star|recrut|construir equipa|duplica|pernas|PE Left|PE Right|leads qualificados/gi
const ocorrencias = s.match(proibidos) || []
const secaoNunca = s.split("## O que NUNCA fazes")[1]?.split("## Testemunhos")[0] || ""
for (const o of ocorrencias) assert.ok(secaoNunca.includes(o), `«${o}» aparece fora da secção do que é proibido`)

// 2. A regra da língua existe e vem em último (os modelos pequenos pesam mais o fim).
assert.ok(s.trim().split("\n## ").pop()!.startsWith("Língua"), "a regra da língua tem de ser o último bloco")
assert.match(s, /ÚLTIMA mensagem/)
assert.match(montarSistema({ langApp: "de", ultimaPorBotao: true, contexto: {} }), /botão da app.*German/)

// 2b. Base de conhecimento: planos, onboarding, MTM Funded, scanners; sem a academia de Network Marketing.
assert.match(s, /Base de conhecimento MTM/)
assert.match(s, /Premium · /)
assert.match(s, /onboarding em 5 passos/)
assert.match(s, /MTM Gold Killer/)
assert.ok(!/Network Marketing/i.test(s.split("Base de conhecimento MTM")[1].split("## O que já sabes")[0]), "a academia de Network Marketing não pode ser recomendada")
assert.match(s, /misturar línguas/)

// 3. As notas nunca chegam ao aluno, mesmo mal formadas ou sem fecho.
const r1 = separarNotas('Olá Ana!\n<notas>{"lingua":"pt","sinais":[{"tipo":"emocao","tema":"medo","resumo":"x"},{"tipo":"inventado","tema":"y","resumo":"z"}],"lembrar":"tem conta demo"}</notas>')
assert.equal(r1.resposta, "Olá Ana!")
assert.equal(r1.notas?.sinais.length, 1, "tipos desconhecidos são descartados")
assert.equal(r1.notas?.lembrar, "tem conta demo")
assert.equal(separarNotas("Hallo!\n<notas>{partido").resposta, "Hallo!")
assert.equal(separarNotas("Sem notas.").notas, null)

// 4. Memória sem repetidos e com tecto.
let m = juntarMemoria("", "tem conta demo")
m = juntarMemoria(m, "tem conta demo")
assert.equal(m, "- tem conta demo")
for (let i = 0; i < 200; i++) m = juntarMemoria(m, `facto ${i}`)
assert.ok(m.length <= 1200 && m.includes("facto 199"))

console.log("mentor/prompt: ok")
