# Agente MT5 — criação de contas do Torneio e do MTM Funded

Corre no **Mac do Ricardo**, onde o MetaTrader 5 está instalado. Pergunta ao site se há
contas para criar, conduz o MT5, e devolve as credenciais.

## Porque existe

Nenhuma função da Vercel abre o MetaTrader. O site escreve o pedido numa fila
(`mtm_account_requests`) e este agente reclama-o quando puder. **Se o Mac estiver desligado,
o pedido espera — não se perde.** Quando o Mac voltar, o agente apanha o atraso todo.

É a mesma forma dos relays que já correm no VPS: uma fila na base de dados e um processo
teimoso do outro lado.

## Instalar

```bash
cd ~/Projetos/morethanmoney/services/mt5-agent
./instalar.sh
```

Cria `~/.mtm-agent.env`, pede-te o token, e instala um `launchd` que arranca com o Mac
e se levanta sozinho se morrer.

## O que precisa de estar configurado

Na Vercel (site):

| Variável | Para quê |
|---|---|
| `MTMFUNDED_AGENT_SECRET` | o token partilhado; ≥16 caracteres |
| `MTMFUNDED_CRED_KEY` | cifra das passwords MT5; ≥32 caracteres |

No Mac (`~/.mtm-agent.env`), o mesmo `MTMFUNDED_AGENT_SECRET`.

## Comandos

```bash
./agente.sh uma-vez     # processa um pedido e sai (para testar)
./agente.sh correr      # ciclo contínuo, em primeiro plano
./agente.sh estado      # o launchd está a correr?
./agente.sh registos    # últimas linhas do log
launchctl unload ~/Library/LaunchAgents/pt.morethanmoney.mt5agent.plist   # parar
```

## O passo manual que fica

A criação da conta no MT5 é um **formulário gráfico** (Ficheiro → Abrir uma conta →
TheTradingMaster-Live → ECN → depósito → alavancagem). Automatizá-la exige controlar
janelas, e o AppleScript sozinho não chega para um formulário Wine/Qt como o do MT5 no Mac.

O agente está preparado para os dois modos:

- **`MTM_AGENT_MODO=assistido`** (por omissão) — o agente mostra-te os dados exactos a
  introduzir, tu preenches, colas o login e a password, e ele trata do resto: cifra, grava,
  mete na MetaApi e manda o email com a marca. **É o modo que funciona hoje.**
- **`MTM_AGENT_MODO=auto`** — chama `criar_conta.py`, que conduz o formulário. Deixado
  preparado mas por calibrar: as coordenadas do formulário mudam com a versão do MT5, e um
  clique no sítio errado cria uma conta com o depósito errado.

Começa em assistido. Quando houver volume que justifique, calibra-se o automático — e nessa
altura o resto do caminho já está construído e provado.
