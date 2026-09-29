# Centro de Controlo MTM Auto — paridade com /admin/mtmcopy

Rota nova: **/admin/centro** (`?s=<secção>&g=<tipo>:<id>`). A página antiga continua em
/admin/mtmcopy com a faixa «Novo Centro de Controlo» (o alias /admin/mtmauto-copia foi apagado a
29/09; as rotas de API /api/admin/mtmauto-copia/* ficaram, porque vivem noutra árvore). Quando esta lista
estiver toda a ✓, liga-se `site_settings.admin_centro_padrao = true` (Centro → Sincronização →
Transição, ou env `ADMIN_CENTRO_PADRAO=1`) e /admin/mtmcopy passa a redireccionar.

Legenda: ✓ no Centro · ✓♻ no Centro reutilizando o componente de sempre (mesmas APIs) · ⏳ pendente

## Novo (não existia)

| Função | Onde | Estado |
|---|---|---|
| Cockpit: pipeline por fonte (último sinal, idade, volume/h, sparkline 24 h) | Cockpit | ✓ |
| Execução 1 h / 24 h: sucesso, saltos, erros do sistema (sem «sem acesso/sem saldo»), latência p50/p95 | Cockpit | ✓ |
| MetaApi sem RPC: travão de créditos (080), registo de inexistentes (`nao_existe` + apagadas conhecidas), contas vs quota dos clientes | Cockpit | ✓ |
| Streaming por conta (071), sonda Supabase, batimentos VPS (servicos_pulso) | Cockpit | ✓ |
| Crons da Vercel (horários do vercel.json) | Cockpit | ✓ horários · ⏳ «última execução» (095 `cron_pulso` + ligar `registarPulsoCron` nos crons) |
| Alertas com severidade + runbook («Pausar monitores 10 min», «Retomar», «Desligar motor da cópia», atalhos para secções) — confirmação escrita + auditoria | Cockpit | ✓ |
| Feed unificado de sinais (site/Premium/T2T, TradingView, MTM Auto, PrimeVerse) com fan-out por conta e motivo | Sinais | ✓ |
| Reprocessar sinal | Sinais | ⏳ não há caminho seguro no servidor (relay-post só reprocessa edições) |
| Estratégias: fonte mestre/espelho + veredicto 082, seguidores por plataforma, pips/%/acerto 30 d, € (admin), divergências, resultados incoerentes excluídos | Estratégias | ✓ |
| Trocar fonte de execução (função atómica 084, exige veredicto) | Gaveta estratégia | ✓ |
| Pausar/apagar estratégia | Gaveta estratégia | ✓ ligação ao admin MTM Auto (caminho guardado `apagado_em`); ⏳ API no site |
| Contas sem MetaApi (estado guardado, streaming, inexistente, motor), categoria cliente/casa/seguidora/equipa/mestre, erro actual vs histórico | Contas | ✓ |
| Matriz de direitos MTM Auto (admin/stripe/apple/legado/isento/manual/vip/premium/membro/suspenso/nenhum), contas sem direito, legado pagante, acima da quota | Utilizadores | ✓ |
| Equidade da casa (`conta_casa`) | MTM Funded | ✓ lê · ⏳ dados (contas da casa do ramo estrategias-primeverse) |
| Gavetas interligadas conta ↔ estratégia ↔ utilizador ↔ sinal | todas | ✓ |
| Paleta ⌘/Ctrl+K e «/», atalhos 1–8, R, Esc, ? | todas | ✓ |
| Auditoria do admin (Centro 095 + MTM Funded 079) | Sincronização & Auditoria | ✓ · ⏳ persistência do Centro (aplicar 095; até lá vai para os logs) |
| Flag de transição `admin_centro_padrao` | Sincronização | ✓ |

## Página antiga → Centro

### Shell
| Antigo | Novo | Estado |
|---|---|---|
| `?tab=` + aliases antigos (overview, strategies, …) | `?s=` (a página antiga mantém os seus) | ✓ (links antigos continuam a funcionar na página antiga) |
| `?userId=` / `?routeId=` | `?s=contas&userId=` / `?s=estrategias&routeId=` | ✓ |
| Links /mtmauto, /webtrader | barra lateral + paleta | ✓ |

### Visão geral (`mtmauto-copia/visao-geral`)
| Antigo | Novo | Estado |
|---|---|---|
| Entrega 24 h (sinais, execuções, erros, latência p50/p95/máx) | Cockpit KPIs | ✓ |
| MetaApi custo (total, deployed, ligadas, undeployed, streaming) | Cockpit MetaApi (estado guardado) · real em Sincronização → pré-visualizar | ✓ |
| CopyFactory: estratégias, subscritores, estratégia morta → Sincronização | Estratégias → «Reconciliação CopyFactory» · Sincronização | ✓♻ |
| Cópia entre contas: KPIs + ligar em sombra/desligar | Cópia | ✓ |
| Serviços do VPS | Cockpit | ✓ |
| Últimos erros 24 h | Sinais (filtro «Erro do sistema») | ✓ |

### Contas (`mtmauto-copia/contas`)
| Antigo | Novo | Estado |
|---|---|---|
| Lista 4 plataformas, pesquisa, filtro plataforma, «só com problemas» | Contas | ✓ |
| Filtrar por dono | gaveta utilizador / pesquisa | ✓ |
| sync · pausar · retomar · deploy/undeploy (CONFIRMAR) · remover (REMOVER) | Gaveta conta (via `/api/admin/centro/acoes` → `acaoConta`, auditado) | ✓ |
| «ver» posições ao vivo | Gaveta conta → «Ver posições (ao vivo)» | ✓ |
| Lista com fotografia MetaApi ao vivo | Contas → «Contas com MetaApi ao vivo (clássico)» | ✓♻ |

### MTMcopierManager (gestor por utilizador)
| Antigo | Novo | Estado |
|---|---|---|
| KPIs, pesquisa, filtros, criar ligação, activo/pausado | Contas → «Gestor detalhado por utilizador (clássico)» | ✓♻ |
| Gerir subscritor, re-sync CopyFactory, preset FTMO, auditoria de risco (+email), editor da ligação, testar MT5, últimos sinais | idem | ✓♻ |

### Estratégias (`mtmauto-copia/estrategias` + afinações)
| Antigo | Novo | Estado |
|---|---|---|
| Seguidores CopyFactory/MTM Auto/Funded + flags + re-sync em lote | Estratégias (resumo sem MetaApi) + «Reconciliação CopyFactory» | ✓ / ✓♻ |
| Providers das equipas | Estratégias → recolhível | ✓♻ |
| Espelho provider (relatório/config) | Estratégias → recolhível | ✓♻ |
| Fontes vivas | recolhível | ✓♻ |
| Controlo das estratégias (switches, intake, Sensei shadow, PrimeVerse/Forex Swings, perps) + desempenho + trailing | recolhível | ✓♻ |
| Saúde das ligações (pausar/retomar) | recolhível | ✓♻ |
| Senders Telegram (webhook, canais) | recolhível | ✓♻ |
| Rotas provider + modal de configuração | recolhível (abre com `routeId`) | ✓♻ |
| Contas provider (criar/desligar) | recolhível | ✓♻ |
| Testes provider/Telegram | recolhível | ✓♻ |
| Visão global de performance | recolhível | ✓♻ |

### Cópia entre contas / Eventos
| Antigo | Novo | Estado |
|---|---|---|
| Rotas: criar, aprovar/recusar, pausar/activar, sombra, pedir live (LIGAR), editar, apagar, eventos por rota, legado 068 | Cópia → «Rotas de cópia» | ✓♻ |
| Eventos com filtros + CSV | Cópia → «Eventos» | ✓♻ |
| Log de sinais dos providers | Sinais → recolhível | ✓♻ |

### Sincronização
| Antigo | Novo | Estado |
|---|---|---|
| Pré-visualizar / aplicar seleccionadas (APAGAR) / reparador CopyFactory | Sincronização & Auditoria | ✓♻ |

### MTM Funded (`/admin?tab=mtmfunded`)
| Antigo | Novo | Estado |
|---|---|---|
| Gestor completo (resumo, lançamento, torneios, participantes, contas, programas, levantamentos, certificados, regras) | MTM Funded → recolhível | ✓♻ |
| Ficha da conta (ContaModal: métricas, posições, histórico, gestão, levantamentos, auditoria) | MTM Funded (clique) e qualquer gaveta `funded:` | ✓♻ |

## APIs do Centro (só leitura salvo `acoes`; todas `soAdmin`)
`/api/admin/centro/{cockpit, sinais, estrategias, contas, copia, utilizadores, funded, auditoria, pesquisa, acoes}` —
verificado por `npx tsx lib/admin-centro/__tests__/centro.check.ts` (403 sem admin, sem MetaApi no painel).

## Pendentes que dependem de outros ramos / decisões
- Aplicar **095** (auditoria persistente, `cron_pulso`, índices por data em mtmauto_signals/executions).
- Ligar `registarPulsoCron` aos crons que interessam (decidir quais — escrita extra por execução).
- Contas da casa / Edge·King·Wolf / conta «todos os sinais» (ramo estrategias-primeverse): o Centro já lê `conta_casa` e `recolhe_todos_sinais` quando existirem.
- Reprocessar sinal: precisa de um caminho seguro no servidor (idempotente por mensagem).
- Pausar/apagar estratégia a partir do site (hoje: admin MTM Auto).
