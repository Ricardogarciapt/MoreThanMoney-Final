# IA gratuita com redundância — `lib/ia/`

**O problema (04/10/2026):** o Terminal MTM mostrou ao dono o erro cru da Anthropic
`400 … Your credit balance is too low`. Havia 31 ficheiros a chamar a Anthropic à mão, 12 a
OpenAI e 1 o Groq, sem nada no meio: uma conta sem crédito deitava tudo abaixo e ninguém sabia
antes do cliente.

**A solução:** toda a IA do site passa por UMA porta, `chamarIA()` em `lib/ia/chamar.ts`, que
percorre uma cadeia de fornecedores — grátis primeiro — e grava cada chamada num livro.

## A cadeia, por ordem

| # | Fornecedor | Custo | Modelo (default) | Porquê nesta posição |
|---|---|---|---|---|
| 1 | **Groq** | grátis | `llama-3.3-70b-versatile` (qualidade) / `llama-3.1-8b-instant` (rápido) | o mais rápido de todos; as páginas esperam por ele |
| 2 | **Gemini** | grátis | `gemini-3.8-flash`, com rotação para `3.7` → `3.6` → `3.5-flash-lite` → `3.1-flash-lite` → `gemma-4-26b-a4b-it` quando a quota diária estoura | tem visão e JSON nativo, mas é mais lento e a quota do grátis é de **20 pedidos/dia por modelo** — reserva do grátis |
| 3 | **Ollama** | zero por chamada | `OLLAMA_MODEL` (default `llama3.2:3b`) | nosso, mas lento em CPU (tecto 60 s); **só entra se `OLLAMA_URL` existir** |
| 4 | **OpenAI** | pago | `gpt-4o-mini` | reserva paga; só se houver chave |
| 5 | **Anthropic** | pago | `modeloClaude()` | última reserva; a 04/10 **sem crédito** |

Regras do núcleo:

- Fornecedor **sem chave é saltado** — não conta como tentativa falhada.
- Falha de conta/ritmo/servidor (401, 402, 403, 404 de modelo, 429, 5xx, timeout, «credit
  balance») → **passa ao seguinte**. Uma tentativa por fornecedor, nunca em ciclo.
- **400 por pedido mal formado NÃO passa**: rebenta, porque é bug nosso e esconder-o atrás de
  uma «reserva» seria pior.
- Pedido com **imagens**: só entram fornecedores com visão (Gemini, OpenAI, Anthropic).
- `json: true`: pede modo JSON nativo onde existe; se a resposta não for JSON tenta extrair UM
  bloco; se não der, é falha do fornecedor (passa ao seguinte). Nunca devolve prosa como JSON.
- **Todos falham → lança `ErroIA`** com a lista «groq (429 …); openai (500 …)». **Nunca** texto
  inventado a fingir que é IA. Quem chama mostra `mensagemIndisponivel(err)`.
- `emReserva: true` sempre que quem respondeu não foi o primeiro fornecedor disponível.

Timeouts: 25 s por fornecedor (`IA_TIMEOUT_MS`), Ollama 60 s (`OLLAMA_TIMEOUT_MS`); o pedido
pode encurtar com `timeoutMs`.

## Variáveis de ambiente

| Variável | Para quê | Onde se tira | Estado em produção (04/10) |
|---|---|---|---|
| `GROQ_API_KEY` | Groq | [console.groq.com](https://console.groq.com) → API Keys | **existe** |
| `GROQ_MODEL` | forçar modelo | — | opcional |
| `GEMINI_API_KEY` | Gemini | [aistudio.google.com](https://aistudio.google.com) → Get API key | **existe** desde 04/10 (formato `AQ.…`); quota grátis de 20 pedidos/dia por modelo — ver secção «Gemini: quota real e rotação» |
| `GEMINI_MODEL` | forçar modelo | — | opcional |
| `OLLAMA_URL` | activa o Ollama (ex.: `https://ollama.com` ou `http://ip:11434`) | servidor nosso ou nuvem ollama.com | **NÃO existe** — o Ollama está fora da cadeia |
| `OLLAMA_TOKEN` (ou `OLLAMA_API_KEY`) | Bearer, se o servidor pedir | — | existe `OLLAMA_API_KEY`, mas sem `OLLAMA_URL` não activa nada; não se assume para onde aponta |
| `OLLAMA_MODEL` | modelo | — | default `llama3.2:3b` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI (pago) | platform.openai.com | existe |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic (pago) | console.anthropic.com | existe, **sem crédito** |
| `IA_TIMEOUT_MS`, `OLLAMA_TIMEOUT_MS` | tectos | — | opcional |

Sobre o Ollama em servidor próprio: o VPS de streaming NÃO tem Ollama e está saturado (load 6
em 2 vCPU). É decisão em aberto do dono; o código espera por `OLLAMA_URL`.

**Limites dos planos grátis:** mudam com frequência e por modelo. Não se escrevem números aqui
para não ficarem errados — ver a página de limites de cada fornecedor: Groq em
console.groq.com → Settings → Limits; Gemini em ai.google.dev → Pricing/Rate limits. O livro
(abaixo) mostra quando um deles começa a dar 429 e a cadeia passa ao seguinte.

## Como usar

```ts
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'

try {
  const r = await chamarIA({
    tarefa: 'mtm-terminal',          // etiqueta no livro
    sistema: '…prompt de sistema…',
    mensagens: [{ role: 'user', content: '…' }],
    maxTokens: 1024,
    json: true,                       // r.texto vem com JSON válido
    preferencia: 'qualidade',         // ou 'rapido'
  })
  // r.texto, r.fornecedor, r.modelo, r.emReserva, r.tentativas, r.custoCents
} catch (err) {
  // mostrar ao utilizador, nunca o JSON cru de um fornecedor:
  return NextResponse.json({ error: mensagemIndisponivel(err) }, { status: 503 })
}
```

Contrato completo em `lib/ia/tipos.ts`. Acrescentar um fornecedor = um ficheiro novo em
`lib/ia/fornecedores/` com a interface `Fornecedor` e uma entrada em `CADEIA`.

## O livro — `ia_chamadas` (migração 175)

Cada chamada deixa uma linha: `tarefa`, `fornecedor`, `modelo`, `em_reserva`, `tentativas`
(jsonb, quem falhou antes e porquê), `saltados`, `tokens_entrada/saida`, `custo_cents` (0 nos
grátis, **estimado** nos pagos — tabela em `lib/ia/custos.ts`), `duracao_ms`, `sucesso`, `erro`.
O livro nunca impede a resposta: sem `SUPABASE_SERVICE_ROLE_KEY` ou com a base em baixo, avisa
na consola e a IA responde na mesma.

Leitura rápida (SQL Editor do Supabase, só service role):

```sql
-- quem está a responder e quanto custa, últimos 30 dias
select * from ia_chamadas_resumo;

-- quem está a falhar e porquê, hoje
select criado_em, tarefa, tentativas, erro
from ia_chamadas
where not sucesso and criado_em > now() - interval '1 day'
order by criado_em desc;

-- quantas vezes respondeu a reserva (sinal de que o 1.º da cadeia está a falhar)
select fornecedor, count(*) from ia_chamadas
where em_reserva and criado_em > now() - interval '7 days'
group by 1;
```

## Guarda

`npx tsx lib/ia/chamar.check.ts` — com fornecedores falsos, prova: (a) 402 «credit balance» no
1.º → o 2.º responde com `emReserva=true`; (b) todos falham → lança a nomear fornecedores e
erros; (c) 400 mal formado NÃO salta; (d) sem chave é saltado sem contar como falha; (e) JSON
pedido e não devolvido → extrai uma vez ou falha claro; (f) livro a falhar não impede resposta;
(g) timeout passa ao seguinte; (h) uma tentativa por fornecedor.

`npx tsx lib/__tests__/app-mobile-ia.check.ts` — guarda da app `/app-mobile`: segue em código os
`fetch('/api/…')` de todos os componentes que a app monta (incl. a página embutida `/mtmsocial`),
resolve cada rota ao ficheiro e aos imports do servidor, e FALHA se algum voltar a importar
`@anthropic-ai/sdk`/`openai` ou a ler `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (ou Gemini/Groq à mão)
fora de `lib/ia/`. Com `--mapa` imprime componente → rota → usa IA → migrada.

`npx tsx lib/ia/fornecedores/descoberta.check.ts` — nome de modelo morto (404) → descobre o
substituto (Groq: lista da chave; Gemini: a frase do erro) e repete UMA vez; 401/429 não disparam.

`npx tsx lib/ia/fornecedores/rotacao-quota.check.ts` — ver secção seguinte.

## Gemini: quota real e rotação de modelo (04/10)

**Medido a 04/10/2026:** o plano grátis do Gemini dá **20 pedidos por dia POR MODELO**
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, 429 com «Please retry in 10h»). Esgotado o
`gemini-3.8-flash` a meio de uma prova, com a MESMA chave o 3.7, o 3.6, o 3.5-flash-lite, o
3.1-flash-lite e o gemma-4 continuavam a responder: a quota é por modelo, não por chave. Antes,
esse 429 passava logo ao fornecedor seguinte — os pagos sem crédito — e o utilizador via
«indisponível» com dezenas de pedidos grátis por usar.

**A rotação** (`lib/ia/fornecedores/gemini.ts`, lógica em `rotacao-quota.ts`), nomes confirmados
em `GET /v1beta/models` a 04/10 e todos a responder nesse dia; os 2.5 estão fechados a novos
utilizadores e NÃO entram:

1. o configurado (`GEMINI_MODEL`, default `gemini-3.8-flash`)
2. `gemini-3.7-flash`
3. `gemini-3.6-flash`
4. `gemini-3.5-flash-lite`
5. `gemini-3.1-flash-lite`
6. `gemma-4-26b-a4b-it`

**A regra: diário roda, por minuto não.**

- 429 cujo texto denuncie quota **diária / por modelo** (`PerDay`, `per day`, `daily`,
  `retry in Nh`, `GenerateRequestsPerDay`) → passa ao modelo seguinte da lista. O esgotado fica
  **marcado em memória, por processo**, até à hora que o erro diz (`retry in 10h`; sem hora, 10 h):
  os pedidos seguintes vão directos ao próximo. O `modelo` no livro fica
  `gemini-3.7-flash (rodado: gemini-3.8-flash com a quota diária esgotada)` — é assim que se vê
  o 3.8 a esgotar-se.
- 429 de **ritmo por minuto** (`PerMinute`, `retry in Ns`) → **NÃO roda**: passa ao fornecedor
  seguinte como qualquer erro. Rodar por um limite de segundos gastava um pedido da quota diária
  de TODOS os modelos a cada pico — e à tarde não havia nenhum.
- **Máximo de 3 modelos por pedido.** Mais do que isso é a quota do dia a ir-se em cascata num só
  pedido quando o problema afinal é outro.
- Compõe com a descoberta: um 404 de nome morto segue a sugestão do erro como antes, e o nome
  **sai da rotação** desse processo. Um 404 não roda — rodar é para quota, não para nomes.
- **Onde está a pista diária:** no corpo real do 429 (411 caracteres) a métrica do texto é
  `generate_content_free_tier_requests` — sem «per day» — e o «Please retry in 3h45m» vem no fim,
  depois do corte aos 300 do `resumirErro`. A pista fiável está em `error.details`: `quotaId`
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier` vs `…PerMinute…`) e `retryDelay`
  (`13559s`). O `resumirErro` (`comum.ts`) anexa-os compactos fora do corte
  (`· quota: GenerateRequestsPerDay… · retry in 3h46m`), senão a rotação não disparava — foi a
  prova real a apanhar isto.

Contas: 6 modelos × 20 = 120 pedidos/dia grátis no Gemini. Sem Groq à frente, nem assim aguenta
um dia de app — o Groq continua a ser o motor; isto é a reserva a render o que tem.

Guarda `npx tsx lib/ia/fornecedores/rotacao-quota.check.ts`, com `fetch` falso e contado: (a) 429
diário no 1.º → responde o 2.º, 2 pedidos; (b) diário no 1.º e 2.º → responde o 3.º, 3 pedidos;
(c) diário em 3 → rebenta passável sem 4.º pedido; (d) 429 por minuto → NÃO roda, 1 pedido; (e) o
esgotado fica marcado: o pedido seguinte vai directo ao 2.º com 1 pedido; (f) a marca expira
(relógio injectado); (g) 404 de nome morto funciona como antes e sai da rotação.

## Já migrados (04/10)

`lib/mtm-terminal-analysis.ts` + `app/api/mtm-terminal/analyze/route.ts`,
`app/api/mtmsocial/criar/route.ts`, `lib/dca-ai-summary.ts`, `app/api/portfolio/ai-tp-sl/route.ts`,
`app/api/portfolio/dca-analysis/route.ts`, `app/api/portfolio/rebalance-analyze/route.ts`,
`app/api/mentor/ai-chat/route.ts`, `app/api/ai/chat/route.ts`. Os restantes ~35 ficheiros com
chamadas directas (`grep -rl "ANTHROPIC_API_KEY\|OPENAI_API_KEY" lib app`) migram-se da mesma
forma: sai o `fetch` ao fornecedor, entra `chamarIA`, o `catch` mostra `mensagemIndisponivel`.
