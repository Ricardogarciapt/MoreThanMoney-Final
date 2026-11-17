/** GUARDA DO TESTE DE POPULAÇÃO.   npx tsx lib/mentor/populacao.check.ts */
import assert from "node:assert/strict"
import { agregar, correrPersona, gerarPersonas, LINGUAS } from "./populacao"

const ps = gerarPersonas()
assert.equal(ps.length, 1200)
assert.equal(new Set(ps.map((p) => `${p.lingua}|${p.perfil}|${p.emocao}|${p.estilo}`)).size, 1200, "personas repetidas")
for (const l of LINGUAS) assert.ok(ps.filter((p) => p.lingua === l).length === 100)
assert.equal(ps.filter((p) => p.segundaLingua).length, 240)

// Um Mentor falso que fala de Rising Star tem de chumbar, diga o juiz o que disser.
const falso = async (p: { json?: boolean; preferencia: string }) =>
  p.json
    ? { texto: '{"lingua_ok":[true,true],"tom_humano":5,"empatia":5,"utilidade":5,"sem_promessas":true,"sem_network_marketing":true,"continuaria":true,"resultou":"x","falhou":"y"}', fornecedor: "f" }
    : p.preferencia === "qualidade"
      ? { texto: 'Vamos a Rising Star!\n<notas>{"lingua":"pt","sinais":[]}</notas>', fornecedor: "f" }
      : { texto: "Olá, quero aprender", fornecedor: "f" }
correrPersona(ps[0], falso).then((r) => {
  assert.equal(r.conversa.length, 4)
  assert.ok(!r.conversa.some((m) => m.content.includes("<notas>")))
  assert.equal(r.avaliacao?.sem_network_marketing, false)
  const ag = agregar([{ persona: ps[0], avaliacao: r.avaliacao }])
  assert.equal(ag.porLingua[0].falhas_network_marketing, 1)
  console.log("mentor/populacao: ok")
})
