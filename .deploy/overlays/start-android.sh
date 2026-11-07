#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. В Termux выполни: pkg install nodejs-lts"
  exit 1
fi
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Нужен Node.js 22 или новее. Сейчас установлен: $(node --version)"
  exit 1
fi
exec node server/local-server.mjs