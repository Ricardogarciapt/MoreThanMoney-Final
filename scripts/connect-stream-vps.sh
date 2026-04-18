#!/usr/bin/env bash
set -euo pipefail

# Conector rápido para VPS Stream (AWS EC2 Ubuntu)
# Uso:
#   ./scripts/connect-stream-vps.sh
#   ./scripts/connect-stream-vps.sh --ip 13.62.98.15 --user ubuntu --key ~/.ssh/mtm-stream.pem

HOST="13.62.98.15"
USER_NAME="ubuntu"
KEY_PATH="${HOME}/.ssh/mtm-stream.pem"
PORT="22"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)
      HOST="${2:-}"
      shift 2
      ;;
    --user)
      USER_NAME="${2:-}"
      shift 2
      ;;
    --key)
      KEY_PATH="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Uso: $0 [--ip HOST] [--user USER] [--key /path/key.pem] [--port 22]"
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $1"
      echo "Usa --help para ajuda."
      exit 1
      ;;
  esac
done

if [[ -z "${HOST}" || -z "${USER_NAME}" || -z "${KEY_PATH}" ]]; then
  echo "Erro: host/user/key inválidos."
  exit 1
fi

if [[ ! -f "${KEY_PATH}" ]]; then
  echo "Erro: chave não encontrada em ${KEY_PATH}"
  exit 1
fi

chmod 400 "${KEY_PATH}" 2>/dev/null || true

echo "A ligar ao VPS ${USER_NAME}@${HOST}:${PORT}..."
exec ssh -i "${KEY_PATH}" -p "${PORT}" "${USER_NAME}@${HOST}"
