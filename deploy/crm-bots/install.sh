#!/usr/bin/env bash
# Executar num checkout revisto: sudo bash deploy/crm-bots/install.sh
set -euo pipefail
set +x
umask 077
ACTION="${1:-install}"
case "$ACTION" in
  install|--enable|--status|--disable) ;;
  *) printf 'Uso: sudo bash deploy/crm-bots/install.sh [--enable|--status|--disable]\n' >&2; exit 2 ;;
esac
[[ ${EUID} -eq 0 ]] || { echo 'Executa com sudo.' >&2; exit 1; }
command -v systemctl >/dev/null || { echo 'Requer Linux com systemd.' >&2; exit 1; }
[[ -d /run/systemd/system ]] || { echo 'systemd não está activo.' >&2; exit 1; }
UNIT=mtm-crm-bots
if [[ "$ACTION" == --status ]]; then
  systemctl status "${UNIT}.timer" "${UNIT}.service" --no-pager || true
  exit 0
fi
if [[ "$ACTION" == --disable ]]; then
  systemctl disable --now "${UNIT}.timer"
  systemctl stop "${UNIT}.service"
  echo 'Consumidor VPS parado. O cron Vercel é independente; desliga crm_bots_ligado para parar a fila.'
  exit 0
fi
if [[ "$ACTION" == --enable ]]; then
  [[ -f /etc/mtm-crm-bots.env && -f /opt/mtm-crm-bots/worker.mjs ]] || { echo 'Instala primeiro.' >&2; exit 1; }
  read -r -p 'Confirmas migrações 203/204, deployment Ready e ensaio real aprovado? Escreve ACTIVAR: ' confirm </dev/tty
  [[ "$confirm" == ACTIVAR ]] || { echo 'Activação cancelada.'; exit 1; }
  # Primeira execução pode consumir UM item real. Só ocorre após confirmação explícita.
  systemctl start "${UNIT}.service"
  systemctl enable --now "${UNIT}.timer"
  systemctl list-timers "${UNIT}.timer" --no-pager
  echo 'Timer activo. Confirma o resultado no journal e no estado CRM; isto não prova o fluxo ponta a ponta.'
  exit 0
fi
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for file in worker.mjs mtm-crm-bots.service mtm-crm-bots.timer; do
  [[ -f "$DIR/$file" && ! -L "$DIR/$file" ]] || { echo "Ficheiro ausente ou symlink: $file" >&2; exit 1; }
done
[[ -x /usr/bin/node ]] || { echo 'Instala Node.js 22 em /usr/bin/node e volta a executar. O instalador não altera o Node de outros serviços.' >&2; exit 1; }
major="$(/usr/bin/node -p 'process.versions.node.split(".")[0]')"
[[ "$major" == 22 ]] || { echo 'Requer Node.js 22 em /usr/bin/node.' >&2; exit 1; }
/usr/bin/node --check "$DIR/worker.mjs"
# Não seguir links de configuração controlados por terceiros como root.
for path in /opt/mtm-crm-bots /etc/mtm-crm-bots.env /etc/systemd/system/mtm-crm-bots.service /etc/systemd/system/mtm-crm-bots.timer; do
  [[ ! -L "$path" ]] || { echo "Recusado symlink: $path" >&2; exit 1; }
done
if systemctl is-active --quiet "${UNIT}.timer" || systemctl is-active --quiet "${UNIT}.service"; then
  echo 'O consumidor está activo. Executa --disable antes de actualizar.' >&2; exit 1
fi
ENV=/etc/mtm-crm-bots.env
if [[ ! -e "$ENV" ]]; then
  echo 'Introduz o CRON_SECRET já configurado na Vercel (não será mostrado).'
  IFS= read -r -s -p 'CRON_SECRET: ' secret </dev/tty
  printf '\n'
  # Alfabeto seguro para EnvironmentFile; não executar/evaluar conteúdo do ficheiro.
  [[ ${#secret} -ge 32 && "$secret" =~ ^[a-zA-Z0-9_./+=:-]+$ ]] || { unset secret; echo 'Requer >=32 caracteres, sem espaços ou aspas.' >&2; exit 1; }
  tmp="$(mktemp /etc/mtm-crm-bots.env.XXXXXX)"
  trap '[[ -z "${tmp:-}" ]] || rm -f -- "$tmp"' EXIT
  printf 'CRON_SECRET=%s\nCRM_WORKER_URL=https://www.morethanmoney.pt/api/cron/crm-bots\n' "$secret" > "$tmp"
  unset secret
  chmod 0600 "$tmp"
  chown root:root "$tmp"
  mv -T -- "$tmp" "$ENV"
  tmp=''
else
  [[ -f "$ENV" ]] || { echo 'Configuração não é ficheiro regular.' >&2; exit 1; }
  echo 'Configuração existente preservada (valores não lidos nem mostrados).'
  chown root:root "$ENV"
  chmod 0600 "$ENV"
fi
install -d -o root -g root -m 0755 /opt/mtm-crm-bots
install -o root -g root -m 0644 "$DIR/worker.mjs" /opt/mtm-crm-bots/worker.mjs
install -o root -g root -m 0644 "$DIR/mtm-crm-bots.service" "$DIR/mtm-crm-bots.timer" /etc/systemd/system/
systemctl daemon-reload
printf '\nInstalado, SEM activar o timer ou contactar produção.\n'
printf 'Depois dos pré-requisitos e ensaio: sudo bash deploy/crm-bots/install.sh --enable\n'
printf 'Estado: sudo bash deploy/crm-bots/install.sh --status\n'
printf 'Parar: sudo bash deploy/crm-bots/install.sh --disable\n'
