# MTM Autonomous OS v2

Decisão do dono, 07/10/2026. Este documento é o desenho (FASE 0) e o registo do que ficou implementado (FASE 1). A FASE 2, a experimentação automática, está só desenhada.

Cópias: `SITE-MORETHANMONEY-FINAL/docs/mtm-autonomous-os-v2.md` e `aios/docs/mtm-autonomous-os-v2.md`.

---

## 0. Em uma página

| Antes (até 07/10) | Agora (OS v2) |
|---|---|
| 48 h sem receita atribuída → o agente **morre** | **Ciclo de vida económico**: PROVING → ACTIVE → PROVEN → SCALING, ou UNDERPERFORMING → MUTATING → reteste → ARCHIVED. Mede o **valor marginal** (receita + valor diferido medido − custo) |
| Reprodução: ≥ 50 € em 7 dias → 1 filho; tecto de 15 vivos, 1 filho a cada 7 dias, orçamento total de 250 | **Agent Cloning Engine**: Proof Score com amostra mínima → ninhada de N clones (1 igual + variações) que competem; a melhor variante passa a DNA dominante. **Sem tecto fixo de vivos**: a população é limitada pela quota do `claude -p` |
| Números fixos: 24/260 execuções, 40 contactos por agente, 20 B2B, 2 posts, 40 acções de pipeline | **Orçamentos dinâmicos**: `f(procura legal, desempenho, reputação, warm-up, quota)`, presos aos **tectos duros externos**. Sem dados, valem os números antigos (chão seguro) |
| Por omissão, tudo o que o motor não reconhecia ia à fila do dono | **Fila invertida**: ao dono só chegam 13 categorias HUMANAS; o resto executa-se dentro dos guardrails ou volta ao agente com o caminho certo |
| CEO: pressiona os filhos (medir/propor/construir/baixar_custo/justificar) | **CEO como motor económico**: lê o P&L e o gargalo, cria missões com workers efémeros, aloca recursos, escala, arquiva. É imortal |

Reverter: `site_settings.agentes_os_v2.ligado = false` faz voltar ao caminho de 06/10 no site, no cron e no motor. Nada do que o OS v2 escreveu se perde.

---

## 1. As regras actuais, uma a uma

Cada regra fica numa de quatro classes:

- **HG (Hard Guardrail)**: nunca muda. Está no código e, onde dá, também na base (gatilho ou constraint).
- **DP (Dynamic Policy)**: o valor é calculado a partir de sinais e fica preso a um tecto duro externo.
- **AI (AI Decision)**: a IA decide dentro dos guardrails.
- **HE (Human Escalation)**: vai à fila do dono.

Na coluna «Destino», **elimina** quer dizer que a regra sai, **fica** que se mantém como está e **autónoma** que passa a ser decidida pela IA ou calculada.

### 1.1 Leis fixas (`aios/leis-mtm.md`)

| Regra | Classe | Destino |
|---|---|---|
| Vida: 48 h sem receita → morre | — | **Elimina.** Passa a ciclo de vida económico (§3) |
| O CEO é imortal | HG | Fica, e agora também na base (gatilho `agentes_ceo_nao_se_arquiva`) |
| Todo o link leva `?ag=` do agente | HG | Fica, porque é a medição. Clones e workers nascem com código e cupão próprios |
| Contacto só com base legal confirmada pelo motor (resposta, soft opt-in, consentimento, B2B, serviço) | HG | Fica (RGPD, Lei 41/2004) |
| Exclusão global | HG | Fica |
| Nada de LinkedIn nem de comentários por robô em perfis de terceiros | HG | Fica. O tecto duro do LinkedIn é 0 |
| Sem dinheiro, sem trading, sem apagar; merge só do dono | HG + HE | Fica. As ferramentas continuam fora dos agentes, e o pedido vai à fila humana |
| A prova mede-se em pips e %, com origem; não se inventam números nem se promete lucro | HG | Fica, com a guarda da marca no Social |
| Marca: ouro sobre carvão | HG | Fica |
| pt-PT, a tratar por tu | HG | Fica |
| Instagram `@morethanmoney.pt` | HG | Fica |

### 1.2 Vida, reprodução e evolução (`lib/agentes/vida.ts`, `reproducao.ts`, `evolucao.ts`)

| Regra | Valor | Classe | Destino |
|---|---|---|---|
| Janela da morte | 48 h | — | **Elimina** |
| Graça do recém-nascido | 72 h | DP | Fica como graça de PROVING (configurável, mínimo 24 h) |
| `regra_desde` | 06/10 | — | Elimina, porque a régua deixa de existir |
| `parado` é só a mão do dono | — | HG | Fica (SUSPENDED; a pausa do dono ganha a qualquer transição) |
| Um morto não ressuscita | — | HG | Passa a: ARCHIVED não volta sozinho, só o dono restaura |
| Morrer = arquivar, nunca apagar | — | HG | Fica e alarga-se: a base recusa DELETE em **toda** a equipa, no arquivo e na genealogia |
| Limiar de reprodução | 50 € em 7 dias | — | **Elimina.** Passa a Proof Score ≥ 85 com amostra (≥ 70 com validação do CEO) |
| Máximo de vivos | 15 | — | **Elimina.** O limite passa a ser a quota do `claude -p` |
| 1 filho a cada 7 dias | — | — | **Elimina.** Passa a «uma ninhada de cada vez»: o pai não abre outra enquanto a anterior estiver em prova |
| Orçamento do filho | 5 | AI | Fica (contabilístico) |
| Orçamento total da equipa | 250 | — | **Elimina** (era um tecto arbitrário). Passa a capacidade económica + quota |
| Reprodução ligada/desligada | `agentes_reproducao.ligada` | HE | Fica para o caminho antigo. No novo, o interruptor é `agentes_os_v2` |
| Mutação do pai ou do catálogo | — | AI | Fica, alargada a hook, CTA, público, oferta e canal |
| Guarda das instruções em cada nascimento | — | HG | Fica (`validarReescrita`) |
| Reforma do pai quando o filho rende 1,25× | — | AI | Passa a «DNA dominante»: o pai não se reforma, a geração seguinte nasce da dominante |
| Versões: o agente propõe, o CEO decide com catálogo fechado, reverte se a receita baixar | — | AI + HG | Fica |
| A receita dos filhos nunca soma ao pai | — | HG | Fica |

### 1.3 Motor (`aios/motor`, `site_settings.agentes_motor`)

| Regra | Valor | Classe | Destino |
|---|---|---|---|
| Interruptor geral + ficheiro `PARAR` | — | HG | Fica |
| Ritmo do CEO / dos filhos | 60 / 60 min | DP | **Autónoma.** O ritmo é por estado: SCALING 30, PROVEN 60, ACTIVE/PROVING 90, MUTATING 120, UNDERPERFORMING 180 min, sempre ÷ `recursos_mult` do CEO. O CEO fica em 60 |
| Execuções por agente por dia | 24 | DP | **Autónoma:** 24 × 60 ÷ ritmo do estado |
| Execuções totais por dia | 260 | DP | **Autónoma:** `capacidade_ciclos` (§2.2), com 260 como chão sem dados e tecto duro de 600 |
| Horas de trabalho | 0–24 | AI | Fica |
| Contacto com o dono | 10h–18h | HG | Fica |
| `timeout_ciclo_seg` | 900 | HG | Fica |
| `envios_dia_agente` | 20 | — | Elimina (era duplicado; manda o orçamento de contacto do site) |
| Merge para `main` só com item `dono/merge` aprovado | — | HG + HE | Fica |
| Push só do ramo `agente/<CODIGO>/…` | — | HG | Fica |
| Terminal só do Hacker e do Ambrósio, com hook `guarda_bash` | — | HG | Fica |
| Ferramentas proibidas (push, merge, rm, curl, supabase, psql…) | — | HG | Fica |
| `classificar_accao`: o desconhecido vai ao dono | — | — | **Elimina.** Passa a fila invertida (§6) |
| Autonomia conservadora/equilibrada/ousada (personalidade) | — | HE | Fica. Só aperta: em «conservadora», o que seria devolvido volta a ir ao dono |

### 1.4 Contacto, envios, auto-aprovar (`contacto-inicial.ts`, `envios.py`, `envios-auto-aprovar.ts`)

| Regra | Valor | Classe | Destino |
|---|---|---|---|
| As cinco bases legais, decididas no servidor com evidência lida da base | — | HG | Fica |
| Cada mensagem identifica a MTM e tem forma de sair | — | HG | Fica |
| Webmail não conta como B2B | — | HG | Fica |
| Particulares sem consentimento → bloqueado (não vai à fila) | — | HG | Fica |
| WhatsApp só com template + opt-in, ou na janela de 24 h | — | HG | Fica |
| Tecto por agente por dia | 40 | DP | **Autónoma** (§2.1) |
| Tecto por canal (email 30, SMS 10, WhatsApp 15, Telegram 30, Instagram 15) | — | DP | **Autónoma** (§2.1) |
| Sem registo da base legal, não sai | — | HG | Fica |
| Sem conseguir contar os envios de hoje, não sai | — | HG | Fica |
| Executor do Telegram desligado por omissão | — | HE | Fica: ligar um executor é decisão do dono |
| Toggle «auto-aprovar» (AIOS) | — | HE → AI | O toggle continua do dono. Com ele ligado, tudo o que tem base legal sai sozinho (é a execução dentro dos guardrails) |

### 1.5 B2B (`lib/b2b`, `b2b_prospeccao`)

| Regra | Valor | Classe | Destino |
|---|---|---|---|
| Interruptor `ligado` | — | HE | Fica |
| Tecto diário | 20 (máx. 50 no código) | DP | **Autónoma**: chão 20, tecto duro 50, warm-up |
| Primeiro lote | 10 | DP | Fica (warm-up do primeiro dia) |
| Intervalo entre envios | 12 s | HG | Fica (deliverability) |
| Toques 0/4/7 dias | — | AI | Fica (fase 2: em teste A/B) |
| Só páginas públicas de empresa, robots.txt, sem redes sociais nem LinkedIn | — | HG | Fica |
| Excluído nunca recebe, incluindo quem cancelou a subscrição noutro email | — | HG | Fica |

### 1.6 Social e setter IG

| Regra | Valor | Classe | Destino |
|---|---|---|---|
| Auto-publicar dos agentes (interruptor) | — | HE | Fica |
| Posts por conta e dia | 2 | DP | **Autónoma**: chão 2, tecto duro 6 |
| Histórias por conta e dia | 1 | DP | **Autónoma**: chão 1, tecto duro 10 |
| Guarda da marca (paleta, sem promessas, números só com «Fonte:», `@morethanmoney.pt`, `?ag=`) | — | HG | Fica |
| Comentários em perfis de terceiros → fila do dono | — | HG + HE | Fica (lei da casa: não há robô) |
| Setter IG (redigir, DM, resposta pública) só a quem escreveu ou comentou, na janela da Meta | — | HG | Fica |

### 1.7 Pipeline (`pipeline-agentes.ts`)

| Regra | Valor | Classe | Destino |
|---|---|---|---|
| Catálogo fechado (criar_lead … rascunho_mensagem) | — | HG | Fica |
| Nunca «ganho» (a venda nasce do pagamento) | — | HG | Fica |
| Num negócio de um humano, só notas | — | HG | Fica |
| Nada se apaga | — | HG | Fica |
| Tecto diário por agente | 40 | DP | **Autónoma** (chão 40, tecto duro 150, limitado pelo trabalho que existe) |
| Máximo por ciclo | 15 | HG | Fica |

### 1.8 Execução e trading (fora dos agentes)

O isolamento das estratégias, «não executar sinais atrasados», o direito pago antes de executar, a rastreabilidade de cada operação e o facto de a MetaApi só entregar a slaves são todos **HG**. Vivem nos motores de execução, não nos agentes. Os agentes da família TRADING são só análise e propostas.

### 1.9 Resumo

| | Nº | Quais |
|---|---|---|
| **Eliminadas** | 8 | 48 h → morte · `regra_desde` · limiar 50 €/7 dias · 15 vivos · 1 filho a cada 7 dias · orçamento total 250 · `envios_dia_agente` duplicado · «o desconhecido vai ao dono» |
| **Dinâmicas** | 11 | execuções por agente (24) · execuções totais (260) · ritmo por estado · contacto por agente (40) · contacto por canal (×6) · B2B por dia (20) · posts (2) · histórias (1) · pipeline (40) · clones por ninhada · população activa |
| **Autónomas (IA)** | 7 | missões e workers · alocação de recursos · escalar/clonar (Proof ≥ 70) · arquivar (reversível) · mutações/variações · versões das instruções · DNA dominante |
| **Fixas (HG)** | ~35 | todas as leis da casa · bases legais · exclusão · marca · prova · sem dinheiro/trading/apagar · merge · push · terminal · catálogos fechados · arquivar ≠ apagar · CEO imortal · isolamento das estratégias · sinais atrasados · direito pago |
| **Humanas (HE)** | 13 categorias | §6 |

---

## 2. Limites dinâmicos: fórmula, sinais e tectos duros

### 2.1 A fórmula comum (`lib/agentes/os/orcamento.ts`)

```
sem dados (amostra < 20):  valor = min(chão, tecto duro, procura legal) × reputação
com dados:                 valor = min(tecto duro, procura legal, warm-up,
                                       round(chão × desempenho × reputação))

desempenho = clamp(0,5 ; 2,5 ; taxa suavizada ÷ taxa de referência)
             taxa suavizada = (sucessos + 20 × ref) ÷ (tentativas + 20)    média bayesiana
             (sucessos não medidos → desempenho 1, neutro)
reputação  = 1 se erros < 2 % e queixas < 0,1 %
             0,5 se erros < 5 % e queixas < 0,3 %
             0 acima disso → o canal PÁRA, mesmo abaixo do chão
warm-up    = ceil(1,5 × o máximo enviado num só dia nos últimos 7)      (nunca mais de +50 %/dia)
procura    = destinatários com base legal (null = não se mediu)
```

| Dimensão | Chão (o fixo antigo) | Tecto duro externo | Sinais | Ref. |
|---|---|---|---|---|
| Contacto por agente/dia | 40 | 200 | `agentes_envios` dele, erros | 5 % |
| Email/dia | 30 | 150 (e 400 no total do domínio) | envios, erros, `contacto_exclusao` (email), warm-up | 5 % |
| WhatsApp | 15 | 250 conversas iniciadas/24 h (conta verificada) | idem | 5 % |
| Telegram | 30 | 300 (o bot só escreve a quem lhe escreveu) | idem | 5 % |
| Instagram DM | 15 | 100 (só na janela de 24 h da Meta) | idem | 5 % |
| SMS / chamada | 10 / 10 | 50 / 20 | idem | 5 % |
| LinkedIn | 0 | **0** | — | — |
| B2B/dia | 20 | 50 | `b2b_envios`, respostas, erros, exclusões, prospectos por contactar | 2 % |
| Posts/conta/dia | 2 | 6 (a API da Meta permite dezenas; a casa fica muito abaixo) | publicados, falhados, leads com origem Instagram | 0,5 lead/post |
| Histórias/conta/dia | 1 | 10 | publicadas, falhadas | — |
| Pipeline/agente/dia | 40 | 150 | acções aceites/recusadas, negócios abertos × 4 + 20 | 80 % |

O dono pode **baixar** qualquer tecto em `os_objectivos.tectos`, mas nunca subir acima do tecto duro. Os tectos duros são constantes de código (`TECTOS_DUROS`, `lib/agentes/os/objectivos.ts`).

### 2.2 A quota do `claude -p`, o recurso escasso real (`motor/regras.py`, `capacidade_ciclos`)

```
sem dados (< 20 ciclos ok em 24 h)   → min(260, tecto)
limite da sessão batido em 24 h      → max(48, 85 % dos ciclos que correram bem)   (recua)
                                         e, na hora a seguir ao limite, ninguém acorda
sem limite                           → min(tecto, ceil(max(260, ok_24h) × 1,15))   (sonda +15 %/dia)
tecto = min(600, os_objectivos.recursos.claude_ciclos_dia_max = 400)
```

O compasso impede uma rajada de manhã: até à hora H só se gasta `total × (minutos até H + 60) / 1440`. A fila ordena o CEO primeiro, depois por **Proof Score** (do maior para o menor) e depois por quem espera há mais tempo.

**Quantos ciclos por dia aguenta a subscrição hoje (medido na base, `agentes_eventos.tipo='ciclo'`):**

- 06/10: 172 ciclos entre as 11:20 e as 23:58 UTC. Desses, **25 bateram no limite de sessão** («You've hit your session limit»), numa rajada logo de arranque, à mesma hora das sessões interactivas do dono.
- 07/10: **152 ciclos em 14,7 h (≈ 10/h, ≈ 248/24 h) sem bater no limite** (1 falso positivo).
- Capacidade de hoje pela fórmula: **≈ 260–300 ciclos/dia**. Sem dados no registo local começa nos 260; com os 152 de hoje sonda 299. Recua sozinha se voltar a bater no limite. A subscrição é partilhada com o Claude Code interactivo, e por isso o valor real varia com o uso do dono.
- O que a equipa pede agora: o CEO 24, mais 7 agentes em UNDERPERFORMING × 8, mais 5 em PROVING × 16, dá **≈ 160 ciclos/dia**. Sobram ≈ 100–140, o que dá para 6 a 8 clones ou workers em PROVING antes de a fila começar a contar.

---

## 3. Ciclo de vida económico (`lib/agentes/os/ciclo-vida.ts`)

```
PROVING ──valor>0──▶ ACTIVE ──Proof≥70 + amostra──▶ PROVEN ──Proof≥95──▶ SCALING
   │                  │  ▲                              │                      │
   └──fim da graça────┴──┴───────────valor ≤ 0──────────┴──────────────────────┘
                      ▼
            UNDERPERFORMING ─48 h─▶ MUTATING ─48 h─▶ PROVING (reteste 72 h)
                                       ▲                    │ valor ≤ 0
                                       └── tentativa < 2 ───┤
                                                            └── 2 retestes falhados ──▶ ARCHIVED
SUSPENDED = pausa do dono (ou o CEO pela acção suspender) · IDLE = worker sem missão ─24 h─▶ ARCHIVED
```

- **Valor marginal** (janela do proof, 14 dias) = receita atribuída + 0,5 × valor diferido medido − custo.
  - O **valor diferido medido** conta o pipeline avançado pelo agente (qualificado 2 €, marcado 8 €, apresentado 15 €), os leads criados (0,5 €), as respostas B2B (5 €) e os posts publicados com o seu código (1 €). Estes valores são estimativas da casa e estão declarados como tal em `agentes_proof.valor_diferido`, para recalibrar com dados.
  - O **custo** é o custo de oportunidade da quota: cada ciclo custa a subscrição mensal ÷ (capacidade × 30) (≈ 0,026 € com 200 €/mês e 260 ciclos/dia), mais o gasto registado.
- Um agente que nunca cria valor só é arquivado ao fim de **≈ 12 dias** (48 + 48 + 72 + 48 + 72 h), depois de mutar e retestar duas vezes. Antes eram 48 h.
- Os recursos seguem o estado através do ritmo: SCALING tem o dobro do ACTIVE, e UNDERPERFORMING um terço.
- O **CEO** passa por tudo e é medido, mas nunca chega a ARCHIVED: fica em UNDERPERFORMING. A base também o garante.
- Com uma leitura em falta (vendas, eventos, pipeline…), ninguém é arquivado nessa passagem: valor não lido não é valor zero.
- **Arquivar** grava em `agentes_arquivo` (`tipo='arquivo'`) uma ficha com a receita, os clones, os descendentes, a melhor geração, o ROI médio e o proof final. A linha, os eventos e a genealogia ficam todos.

---

## 4. Agent Cloning Engine (`proof-score.ts`, `clonagem.ts`)

### 4.1 DNA operacional

Cada agente (`agentes_equipa`) tem ID, código (tracking), família, especialização, missão (`dna.missao`), canal/estratégia (`dna`), custo (`agentes_memoria.custo_eur`), memória própria (`agentes_memoria`, pasta do agente no motor) e geração.

### 4.2 Proof Score (pesos em `site_settings.agentes_proof`, nunca fixos no código)

`score = 100 × Σ peso × componente ÷ Σ pesos`. Por omissão: **30 % receita, 20 % margem, 15 % conversão, 15 % consistência, 10 % retenção, 10 % custo**. CONTENT e CUSTOMER têm pesos próprios.

| Componente | Fórmula |
|---|---|
| receita | r ÷ (r + 150 €) |
| margem | (r − custo) ÷ r, entre 0 e 1 |
| conversão | (convertidos + 20 × 2 %) ÷ (oportunidades + 20), ÷ 5 %, no máximo 1 |
| consistência | dias com valor ÷ dias da janela |
| retenção | clientes atribuídos que renovaram ÷ elegíveis (0,5 quando não se mede) |
| custo | 15 € ÷ (15 € + custo) |

**Amostra mínima:** ≥ 3 vendas, ≥ 2 dias com valor, ≥ 72 h de vida e uma família com resultado medido em vendas (SALES, CONTENT, GROWTH, CUSTOMER). Sem amostra, o score fica preso em **69**. Nenhum setting desce abaixo de 2 vendas, por isso **uma venda isolada nunca clona**.

| Proof | Banda | Efeito |
|---|---|---|
| < 50 | observar | — |
| 50–70 | testar | — |
| 70–85 | candidato | Clona (2) só com REQUEST_CLONING validado pelo CEO |
| 85–95 | clonar | Ninhada de 3, sozinho |
| 95+ | escalar | Ninhada de 5 e estado SCALING (o dobro dos ciclos) |

### 4.3 Clonagem com mutação, competição e genealogia

- Cada **ninhada** tem 1 clone IGUAL (o controlo) e N−1 clones com **uma** variação: primeiro a mutação proposta pelo próprio pai, depois o catálogo (hook, CTA, público, oferta, canal), sem repetir entre irmãos.
- `agentes_genealogia` regista o pai, o filho, a ninhada, a geração (pai + 1), a variação e o seu texto, a origem e o proof do pai. A base recusa DELETE.
- Os clones **competem**: enquanto a ninhada está em prova (a janela do proof), o pai não abre outra. No fim, o melhor clone com amostra que bata o pai passa a **DNA dominante** (`dominante=true`), e é dele que nasce a geração seguinte.
- As métricas por geração estão na view `agentes_metricas_geracao` (família, especialização, geração, nº de agentes, arquivados, proof médio e máximo, receita, gasto).
- **REQUEST_CLONING**: o agente pede com a acção `pedir_clonagem` e a sua evidência. O CEO valida economicamente com `escalar` (só Proof ≥ 70 e amostra) e o CLONER (a passagem «vida» do motor) cria os clones.
- **População sem tecto fixo**: nascem clones enquanto a procura total de ciclos couber em capacidade × 1,25. Os 25 % a mais esperam na fila do motor por Proof Score. Há um máximo de 6 por ninhada. Só o motor clona (conhece a quota); o cron do site mede e transita, mas não clona.
- O papel do CEO resume-se em **FIND → TEST → CLONE → SCALE → MUTATE → KILL**.

### 4.4 Famílias e os 12 agentes de 07/10 (sem perder histórico; a migração só acrescentou colunas)

| Família | Especializações | Agentes actuais | Ciclo à entrada |
|---|---|---|---|
| CEO | Motor económico | CEO-MTM | UNDERPERFORMING (imortal) |
| SALES | Setter, Closer, Follow-up, B2B | AG-SETTER (Setter), AG-CLOSER (Closer), AG-FORMACAO «Vendedora» (Closer), AG-PROSPECTOR (B2B) | PROVING / PROVING / UNDERPERFORMING / PROVING |
| CONTENT | Reels, Stories, Copy, Creative | AG-SOCIAL (Creative) | PROVING |
| GROWTH | Funnel, CRO, Ads (só propostas), Affiliate | — (nascem por missão do CEO) | — |
| CUSTOMER | Onboarding, Support, Retention | AG-EMAIL (Retention), AG-LMS «Professora» (Onboarding) | PROVING / UNDERPERFORMING |
| PRODUCT | Research, QA, Development | AG-SAAS «Hacker» (Development), AG-SITE «Ambrósio» (QA) | UNDERPERFORMING |
| TRADING | Scanner, Strategy, Risk | AG-SCANNER «Analista» (Scanner), AG-TRADER «Sensei» (Strategy) | UNDERPERFORMING |

TRADING e PRODUCT não têm resultado medido em vendas e por isso não clonam sozinhos. TRADING é só análise e propostas.

---

## 5. Workers efémeros e missões (`os_missoes`)

- O CEO cria uma missão com `criar_missao` (título, objectivo, KPI, `base_codigo`, workers, prazo em horas). O site aprova `min(pedidos, quota livre ÷ ciclos por worker, 10)`.
- Um worker é uma linha `agentes_equipa` com `efemero=true` e `missao_id`. Herda o DNA do agente base e acrescenta o bloco da missão, validado pela guarda. Tem código `AG-<base>-W<n>` e cupão de atribuição próprios, por isso o que vende é medido.
- O ciclo do worker é ACTIVE → (missão fechada ou prazo passado) IDLE → 24 h → ARCHIVED. Um worker que prove valor pode ser clonado como qualquer outro.

---

## 6. Fila humana invertida

Só chegam ao dono estas 13 categorias (`CATEGORIAS_HUMANAS`, iguais em `ceo-economico.ts` e `regras.py`, e a guarda compara as duas):

`juridico` · `propriedade` · `credenciais` · `dinheiro_clientes` · `trading` · `apagar` · `permissoes` · `merge` · `regulatorio` · `api_impossivel` · `conflito_politica` · `estrategia` · `gasto_pago` (primeira activação de um canal pago ou aumento do tecto mensal).

- Antes, qualquer acção que o motor não reconhecesse ia à fila do dono. Agora, um `pedido_dono` ou um tipo desconhecido **sem** categoria humana fica como `devolvida`: não executa, não enche a fila, e o agente recebe no ciclo seguinte o caminho (as acções do seu catálogo).
- O que já executava continua igual: envios com veredicto legal do site, pipeline, posts com a guarda da marca, recolha B2B, código no ramo do agente.
- Com autonomia «conservadora», o que seria devolvido volta a ir ao dono, porque a autonomia só aperta.

---

## 7. Gastar dinheiro da casa: `site_settings.os_objectivos`

O sistema **propõe** orçamento e alocação (o CEO escreve-os em `nota_ao_dono`). A primeira activação de cada canal pago e qualquer aumento do tecto mensal são do dono. Não há ferramenta de compra nos agentes.

**Formato** (por omissão, arranque só orgânico):

```json
{
  "receita_mensal_eur": 3000,
  "orcamento_pago_mensal_eur": 0,
  "tecto_pago_mensal_eur": 0,
  "margem_minima_pct": 60,
  "canais_organicos": ["instagram_organico","telegram","email_soft_opt_in","email_b2b","whatsapp_resposta","pipeline"],
  "canais_pagos_activos": [],
  "regra": "organico_primeiro",
  "listas_novas_permitidas": ["b2b_paginas_publicas","optin_formularios","ex_clientes_soft_opt_in"],
  "recursos": { "custo_subscricao_mensal_eur": 200, "claude_ciclos_dia_max": 400 },
  "tectos": {},
  "nota": "..."
}
```

**Como o dono define o orçamento mensal no painel.** É a secção «Objectivos e recursos» do artifact das leis, que escreve `os_objectivos`:

- `tecto_pago_mensal_eur` só o dono o mexe. O `orcamento_pago_mensal_eur` lê-se sempre como `min(orçamento, tecto)`, por isso com tecto 0 nada é pago.
- Para activar um canal pago, o dono põe o tecto maior do que 0 e o canal em `canais_pagos_activos`. Sem orçamento maior do que 0, a lista é ignorada.
- `tectos` serve para baixar um tecto duro, por exemplo `{"b2b_dia": 10, "email_total_dia": 200, "posts_dia_conta": 3, "contacto_por_agente_dia": 30}`.
- `listas_compradas`, `particulares_sem_consentimento`, `linkedin` e `scraping_redes_sociais` são ignoradas mesmo que alguém as escreva.
- Os valores 3000 €, 60 % e 200 € são por omissão prudentes. **Confirma** o objectivo mensal e o custo real da subscrição.

---

## 8. Modelo de dados (migração 202)

| Objecto | O que guarda |
|---|---|
| `agentes_equipa` (+ colunas) | `ciclo`, `ciclo_desde`, `ciclo_meta {tentativas, reteste}`, `familia`, `especializacao`, `geracao`, `dna`, `efemero`, `missao_id`, `proof_score/banda/amostra_ok/em`, `recursos_mult` (0,25–3), `clonagem_validada_em`, `dominante`, `arquivado_em/porque`. O `estado` antigo continua a ser escrito (vivo, em_risco, pausado, arquivado) |
| `agentes_memoria` | A memória económica por agente: missão, competências, canais, custo, receita, margem, diferido, valor marginal, vendas, oportunidades, conversão, CAC, LTV, taxa de resposta, taxa de erro, confiança, histórico (60 passagens), experiências (fase 2), políticas |
| `agentes_genealogia` | pai, filho, ninhada, geração, variação + texto + origem, proof do pai, dominante, decisão. Sem DELETE |
| `os_missoes` | título, objectivo, KPI, família, base, estado, workers pedidos/aprovados, prazo, resultado |
| `agentes_arquivo` (+ `tipo`, `ficha`) | A ficha de quem foi arquivado |
| `agentes_eventos` (+ tipos) | `ciclo_estado`, `proof`, `clonagem_pedida/validada/bloqueada`, `dominante`, `missao`, `recursos`, `arquivado`, `worker`, `ceo_accao` |
| view `agentes_metricas_geracao` | As métricas por geração |
| settings | `os_objectivos`, `agentes_proof`, `agentes_os_v2 {ligado, ciclo{…}}` |
| gatilhos | DELETE recusado em toda a equipa e na genealogia; o CEO não se arquiva |

---

## 9. O loop

```
OBJECTIVO     os_objectivos (receita do mês, margem, canais, orçamento pago = proposta)
   │
EXECUÇÃO      motor: a quota decide quem acorda (Proof primeiro) → claude -p → contrato
              → acções pelo catálogo (envio com base legal, pipeline, post, B2B, código, missão…)
   │
RESULTADO     vendas_vendas.agente_codigo (?ag=), pipeline, respostas B2B, posts, custo da quota
   │
APRENDIZAGEM  correrOs (de hora a hora): medir → Proof Score → valor marginal → memória
              económica → competição das ninhadas (DNA dominante)
   │
DECISÃO       ciclo de vida (escala/muta/arquiva) + cloner (pela quota) + CEO (P&L, gargalo,
              missões, recursos, escalar, arquivar) + orçamentos dinâmicos de amanhã
   └──────────▶ volta ao OBJECTIVO
```

---

## 10. Implementado (FASE 1)

| Peça | Onde |
|---|---|
| Tectos duros, chão seguro, objectivos | `lib/agentes/os/objectivos.ts` |
| Orçamentos dinâmicos | `lib/agentes/os/orcamento.ts`. Ligados ao contacto (rota do motor + auto-aprovar), ao B2B (`lib/b2b/envio.ts`), ao Social (`/api/admin/agentes/social`) e ao pipeline (`pipeline-agentes-db.ts`) |
| Quota e escalonador por Proof | `aios/motor/regras.py` (`capacidade_ciclos`, `quem_acorda_os`, `sinais_quota`) + `orquestrador.py` (registo local da quota) |
| Proof Score | `lib/agentes/os/proof-score.ts` |
| Ciclo de vida económico | `lib/agentes/os/ciclo-vida.ts` |
| Cloning Engine | `lib/agentes/os/clonagem.ts` |
| CEO económico, fila humana | `lib/agentes/os/ceo-economico.ts` + `regras.py` (`classificar_accao_os`) |
| Passagem, P&L, acções do CEO, missões | `lib/agentes/os/os-db.ts` · rota do motor: `vida` (com quota), `os_pnl`, `os_orcamento`, `ceo_accao`, `pedir_clonagem` · cron `/api/cron/agentes` |
| Prompts | `aios/motor/ciclo.py`: ciclo de vida, fila invertida, P&L e acções do CEO, `pedir_clonagem` |
| Instruções do CEO | migração 202: bloco «MOTOR ECONÓMICO», versão `activa` registada, avaliação em 7 dias |

### Guardas

- `npx tsx lib/agentes/os/os.check.ts`: 69 provas. Orçamentos contra 3000 sinais aleatórios; chão sem dados; transições sem apagar; uma passagem inteira contra uma base falsa sem nenhum delete; CEO; fila humana; uma venda isolada não clona; mutação com pai e variação; quota; genealogia intacta ao arquivar.
- `/usr/bin/python3 motor/os_check.py`: 46 provas. Quota ≤ tecto, chão 260, recuo e pausa depois do limite; um dia simulado com 40 agentes nunca passa a capacidade nem acorda ARCHIVED/IDLE/SUSPENDED; fila por Proof; fila humana; lista igual à do site.
- As guardas antigas continuam verdes, porque o caminho de 06/10 ficou intacto para o interruptor: `motor.check`, `motor-autonomo.check`, `vida.check`, `contacto-inicial.check`, `pipeline-agentes.check`, `b2b.check`, `social-agente.check`, `envios-auto-aprovar.check`, `motor_check.py`, `retrato_check.py` e `autonomia_check.py`.

---

## 11. FASE 2 — Experimentação automática (só desenho)

- **O que se testa:** hook, CTA, landing, oferta, formato (carrossel/reel/história/email curto), canal e setter (humano vs agente vs worker).
- **Unidade:** uma `experiencia` (tabela `os_experiencias`: hipótese, variável, variantes, métrica primária, amostra mínima, início, fim, vencedora, decisão). Cada envio, post ou lead leva `exp_id` e `variante` (em `?ag=<código>&v=<variante>` e no `payload`).
- **Expected Profit** de cada variante: `EP = P(conversão) × receita esperada − custo − risco`.
  - `P` é a média bayesiana (Beta(1+sucessos, 1+falhas)).
  - A receita esperada é o ticket médio real do pacote.
  - O custo são os ciclos × custo por ciclo, mais o gasto.
  - O risco é a penalização por reputação (bounce/queixa) e pela guarda da marca.
- **Alocação:** Thompson sampling sobre o EP. A vencedora recebe mais tráfego e mais ciclos (`recursos_mult`); a perdedora desce até 10 % (exploração), nunca a 0 antes da amostra mínima.
- **Fecho:** com amostra mínima e P(melhor) ≥ 95 %, a vencedora passa a DNA do agente (versão nova pelo mecanismo de evolução, com reversão automática se a receita baixar). A experiência fica em `agentes_memoria.experiencias`.
- **Guardrails:** nenhuma variante sai fora da guarda da marca nem da base legal; a variante «oferta» nunca mexe em preços (fila humana); uma variante com promessa de lucro ou número inventado é recusada à entrada.

---

## 12. Em aberto (honesto)

- Os valores do diferido (2/8/15/0,5/5/1 €) e o custo da subscrição (200 €/mês) são **estimativas declaradas** e estão em settings para recalibrar. Não são medições.
- A taxa de resposta dos `agentes_envios` ainda não se mede (não há ligação resposta ↔ envio). Por isso o desempenho do contacto fica neutro (1) e, até haver medida, o orçamento de contacto anda pelo chão, a reputação e o warm-up.
- A secção «Objectivos e recursos» do painel das leis fica para o artifact. O formato está no §7.
