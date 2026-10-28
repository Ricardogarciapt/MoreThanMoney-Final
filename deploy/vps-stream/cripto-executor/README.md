# Agente cripto na VPS

Dois processos, de propósito separados:

| Processo | O que faz | Tem chaves? |
|---|---|---|
| `mtm-vigias` (tarefa `agente-cripto`) | dados → gatilhos → sub-agentes → IA → guarda → posição (papel) ou pedido `pendente` (real) | Não. Só Supabase e IA grátis |
| `mtm-cripto-executor` | carteira Solana, subconta Bybit, cumpre pedidos que passem os tectos da VPS, envia lucros | Sim, e só ele |

## 1. Papel (já, sem dinheiro)

```bash
# no Mac, na pasta do repo
git pull origin main && npm install
node_modules/.bin/esbuild services/vigias/worker.ts --bundle --platform=node --target=node18 --outfile=/tmp/vigias.js
scp /tmp/vigias.js mtm-stream:/tmp/
ssh mtm-stream
  sudo cp /tmp/vigias.js /opt/mtm/vigias/vigias.js        # confirmar o caminho com: systemctl cat mtm-vigias
  # acrescentar agente-cripto a VIGIAS_TAREFAS no env do mtm-vigias
  sudo systemctl restart mtm-vigias
  journalctl -u mtm-vigias -f                              # esperar "vigias-003 · … agente-cripto"
```

O dashboard está em `/admin/cripto`.

## 2. Real (só quando o Ricardo decidir; dinheiro que está disposto a perder)

1. **Bybit:** criar uma **subconta** «MTM Agente» (não usar a mestre Aurum, que os clientes copiam). Chave API da subconta com *Contracts → Orders/Positions*, presa ao IP da VPS. Se quiseres que os lucros da Bybit também saiam: permissão *Withdraw* + lista branca de endereços ligada só com o teu endereço Solana.
2. **Executor:**
   ```bash
   # no Mac
   (cd services/cripto-executor && npm ci)
   node_modules/.bin/esbuild services/cripto-executor/executor.ts --bundle --platform=node --target=node18 --outfile=/tmp/cripto-executor.js
   scp /tmp/cripto-executor.js deploy/vps-stream/cripto-executor/mtm-cripto-executor.service deploy/vps-stream/cripto-executor/executor.env.example mtm-stream:/tmp/
   ssh mtm-stream
     sudo useradd --system --home /var/lib/mtm-cripto --shell /usr/sbin/nologin mtm-cripto
     sudo mkdir -p /opt/mtm/cripto-executor /etc/mtm-cripto && sudo cp /tmp/cripto-executor.js /opt/mtm/cripto-executor/executor.js
     sudo install -m 600 -o root -g root /tmp/executor.env.example /etc/mtm-cripto/executor.env
     sudo nano /etc/mtm-cripto/executor.env          # frase do cofre, chaves da subconta, CRIPTO_REAL=0 para começar
     sudo cp /tmp/mtm-cripto-executor.service /etc/systemd/system/ && sudo systemctl daemon-reload
     sudo systemctl enable --now mtm-cripto-executor
     journalctl -u mtm-cripto-executor -f            # mostra o endereço da carteira NOVA
   ```
3. **Cópia de segurança da chave** (uma vez, tu, no terminal da VPS):
   `sudo -u mtm-cripto env $(sudo cat /etc/mtm-cripto/executor.env | xargs) node /opt/mtm/cripto-executor/executor.js --exportar-chave` → guardar no gestor de palavras-passe.
4. **Financiar:** USDC + ~0,05 SOL no endereço da carteira (aparece no dashboard) e/ou USDT na subconta Bybit.
5. **Ligar:** no env `CRIPTO_CAPITAL_BASE_USD=<o que puseste>`, `CRIPTO_DESTINO_LUCROS=<o teu endereço Solana>`, `CRIPTO_REAL=1` → `sudo systemctl restart mtm-cripto-executor`; no dashboard «Passar a real» (escrever REAL) e o mesmo capital base.

## 2a. Real na AURUM pela Vercel (o caminho em uso desde 28/10)

Os perps reais correm em `app/api/cron/cripto-executar` (cron de 1 min, fra1), com a chave que a
Vercel já tem (`BYBIT_API_KEY`, subconta AURUM, mestre do Copy Trading). Nada de chaves na VPS.
Ligar: `CRIPTO_REAL=1` no env de Production da Vercel **e** «real» no /admin/cripto. Tectos por
env da Vercel (`CRIPTO_CAPITAL_BYBIT_USD`, por omissão 100; ordem 25, exposição 100, perda do dia
10, alavancagem 3). Memecoins reais não correm aqui. Não activar também o executor da VPS com a
mesma conta.

## 2b. Real na MESTRE do Copy Trading (escolha do Ricardo, 28/10)

Em vez da subconta, o agente usa a conta-mestre do Copy Trading. **Os seguidores copiam cada trade
do agente.** Para isso:

1. Na mestre, criar uma chave **nova** só para o agente: *Contracts → Orders/Positions*, **sem
   Withdraw**, presa ao IP da VPS. Não reutilizar a BYBIT_API_KEY da Vercel: assim revoga-se uma sem
   parar a outra.
2. No env: `BYBIT_AGENTE_API_KEY/SECRET` = essa chave, `CRIPTO_BYBIT_MESTRE=1`,
   `CRIPTO_CAPITAL_BYBIT_USD=<parte da mestre que o agente pode usar>`, e
   `CRIPTO_CAPITAL_BASE_USD` = esse valor + o que estiver na carteira Solana.
3. O resto igual ao passo 2 (arrancar com `CRIPTO_REAL=0`, ver os saldos no dashboard, depois `1`).

O que muda neste modo:
- O agente **não entra** num par onde a mestre já tem posição (o Aurum), e o Aurum **salta** a
  entrada num par onde o agente está (`/api/bybit/place`). A conta é one-way: as posições fundiam-se.
- Fecha só a quantidade que abriu.
- O tamanho das ordens sai de `CRIPTO_CAPITAL_BYBIT_USD` + PnL realizado do agente, nunca do saldo
  da mestre.
- **Nunca levanta da Bybit**: o lucro dos perps fica na mestre e aparece no dashboard. Só o lucro
  da carteira Solana é enviado para `CRIPTO_DESTINO_LUCROS`.

## Fechaduras

- A chave privada nasce na VPS, cifrada (scrypt + AES-256-GCM) em `/var/lib/mtm-cripto/solana.json` 0600. Nunca vai para a Supabase, o Vercel, logs ou IA.
- Real precisa de **duas chaves**: `modo=real` no dashboard **e** `CRIPTO_REAL=1` no env da VPS.
- Tectos só no env da VPS (ordem, exposição, perda do dia, alavancagem ≤ 5, envio máximo). O que a Supabase pedir acima disso é recusado.
- Os lucros só podem ir para `CRIPTO_DESTINO_LUCROS` (env da VPS). Só sai o que está **acima do capital base**; conta a perder não envia nada.
- Para parar tudo: «Desligar» no dashboard, ou `sudo systemctl stop mtm-cripto-executor`. Os SL/TP dos perps ficam na Bybit mesmo com a VPS desligada.
