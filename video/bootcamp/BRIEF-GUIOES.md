# Como escrever um guião de bootcamp (para agentes)

Modelo a seguir: `guioes/defy.pt.json` (lê-o todo antes de começar: estrutura, tom, ritmo, avisos).

## Estrutura do ficheiro
Top-level: `estrategia` (nome tal como na marca), `marca` ("MoreThanMoney"), `cores` ({bull,bear}), `ui`
({nivel,compra,venda,entrada,tp1,tp2,tp3}), `pronuncia` (pares [texto, como dizer]), `plano`
({"warning":false,"slAtr":<múltiplo de ATR>,"alvos":[R1,R2,...],"rotulos":["Exit 1",...]}), `videos` (lista de módulos).
Cada módulo: `rotulo` ("Bootcamp <Nome> · n/N"), `titulo`, `cenas`.

## Tipos de cena (campos)
- abertura: kicker, titulo (nome da estratégia), sub, rodape, semVoz (5) — sem fala
- capitulo: cap, numero ("01"), titulo, sub, fala (curta)
- pontos: cap, kicker, titulo, itens[3–5], fala
- checklist: cap, kicker, titulo, itens[4–8], fala
- comparar: cap, kicker, titulo, cartoes[{t,d}] (2–4), fala
- plano: cap, kicker, titulo, linhas[[nome, valor, tipo]] tipo ∈ "entrada","warning","sl","tp","" , fala
- pontuacao: cap, kicker, titulo, inicio (número), itens (cada item soma 1), fala
- frase: cap, texto (pode ter <span class='ouro'>…</span>), autor, fala
- camadas3d: cap, kicker, titulo, itens (4 nomes de camadas), fala
- grafico: cap, kicker, titulo, cenario ("compra"|"venda"|"falha"|"tendencia"), seed (número), base[], camadas[]
  (aparecem uma a uma), ate [ini,fim] (fracção de velas mostradas 0–1, sinal em ~0.62), zoom [ini,fim] (0–1),
  estrelas (texto do cartão, ex. "12/20"), rotulo (texto do cartão do sinal, opcional), fala.
  Camadas disponíveis: medias (3 médias duplas azul/verde/amarela), poc (linha dourada tracejada), banda
  (banda roxa/cinzenta à volta da média de 89, tipo Sensei), estrutura (BOS/CHoCH), nuvem, cores (cor das velas),
  niveis, bandas (bandas de exaustão DEFY — não usar noutras estratégias), toque, volume, sinal, plano, setas.
- aviso: titulo, sub, texto (aviso legal completo), fala curta, respiro 4

Todas as cenas com voz têm `id` único ("v1-01", …) e `cap` (capítulo mostrado no canto).

## Regras de conteúdo (obrigatórias)
- PT-PT, tratamento por «tu», tom do Ricardo Garcia: próximo, claro, científico, transparente. Nunca «você», «tela», «celular».
- Nunca prometer resultados, nunca taxas de acerto, nunca números de desempenho. Exemplos numéricos só com números
  redondos e ditos «inventados/ilustrativos». Os gráficos são ilustrativos e o vídeo diz isso uma vez no módulo 1.
- Nomes de estratégias, scanners, definições e opções nunca se traduzem.
- Não nomear empresas nem pessoas de fora da MTM. Não nomear a plataforma dos cursos.
- Cada módulo acaba com uma cena aviso (conteúdo educativo, não é aconselhamento financeiro, risco de perder capital,
  gráficos ilustrativos, resultados passados não garantem futuros).
- Só afirmar o que está no guia PDF ou no código Pine da estratégia. Se não tiveres a certeza de um pormenor, não o digas.
- `fala` escreve-se para ser dita: frases curtas, números por extenso ("oitenta e nove"), sem siglas soltas
  (escreve "R", "ATR", "POC" e põe a pronúncia em `pronuncia` se for preciso), 80–220 palavras por cena.
- Duração: o Fish lê ~194 palavras por minuto. Bootcamp longo = 3 módulos com ~3000 palavras de `fala` cada
  (mínimo 2800). Bootcamp curto = 2 módulos com ~1700 palavras cada (máximo 1900, para ficar ≤10 min).
- Estrutura sugerida (longo): M1 fundamentos e leitura de cada peça do gráfico; M2 como nasce o sinal, confirmações,
  plano e alertas; M3 risco, tamanho da posição, gestão, quando não entrar, perfis, rotina, diário, psicologia, FAQ.
  (curto): V1 o que é e como se lê; V2 sinal, plano, gestão e rotina.
