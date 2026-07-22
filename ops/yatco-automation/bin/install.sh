#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPOSITORY_ROOT="$(cd "${PACKAGE_DIR}/../.." && pwd)"
readonly SOURCE_ENV="${1:-/home/ubuntu/moana/.env.kyc}"
readonly CONFIG_DIR="/home/ubuntu/.config/moana-yatco"
readonly DATA_DIR="/home/ubuntu/.local/share/moana-yatco"

install -d -m 700 "${CONFIG_DIR}" "${DATA_DIR}"
chmod 700 "${PACKAGE_DIR}/bin/run-container.sh" "${PACKAGE_DIR}/bin/run-keepalive.sh" "${PACKAGE_DIR}/bin/install.sh"
chmod 700 "${PACKAGE_DIR}/bin/extract-runtime-env.py" "${PACKAGE_DIR}/bin/validate-storage-state.py"
python3 "${PACKAGE_DIR}/bin/extract-runtime-env.py" "${SOURCE_ENV}" "${CONFIG_DIR}/env"

if [[ -f "${CONFIG_DIR}/yatcoboss.json" ]]; then
  chmod 600 "${CONFIG_DIR}/yatcoboss.json"
fi

docker build --pull \
  --tag moana-yatco-refresh:local \
  --file "${PACKAGE_DIR}/Dockerfile" \
  "${REPOSITORY_ROOT}"

sudo install -o root -g root -m 0644 \
  "${PACKAGE_DIR}/systemd/moana-yatco-refresh.service" \
  /etc/systemd/system/moana-yatco-refresh.service
sudo install -o root -g root -m 0644 \
  "${PACKAGE_DIR}/systemd/moana-yatco-refresh.timer" \
  /etc/systemd/system/moana-yatco-refresh.timer
sudo install -o root -g root -m 0644 \
  "${PACKAGE_DIR}/systemd/moana-yatco-keepalive.service" \
  /etc/systemd/system/moana-yatco-keepalive.service
sudo install -o root -g root -m 0644 \
  "${PACKAGE_DIR}/systemd/moana-yatco-keepalive.timer" \
  /etc/systemd/system/moana-yatco-keepalive.timer
sudo systemctl daemon-reload

echo "YATCO automation installed. Timers remain disabled until successful manual runs."
