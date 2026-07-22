#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly IMAGE="moana-yatco-refresh:local"
readonly CONFIG_DIR="/home/ubuntu/.config/moana-yatco"
readonly DATA_DIR="/home/ubuntu/.local/share/moana-yatco"
readonly ENV_FILE="${CONFIG_DIR}/env"
readonly AUTH_FILE="${CONFIG_DIR}/yatcoboss.json"
readonly LOCK_FILE="${DATA_DIR}/yatco.lock"

install -d -m 700 "${DATA_DIR}"

for required_file in "${ENV_FILE}" "${AUTH_FILE}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required runtime file is missing: ${required_file}" >&2
    exit 66
  fi
  permissions="$(stat -c '%a' "${required_file}")"
  if [[ "${permissions}" != "600" ]]; then
    echo "Unsafe permissions on ${required_file}: expected 600, got ${permissions}" >&2
    exit 77
  fi
done

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another YATCO refresh is already running" >&2
  exit 75
fi

docker image inspect "${IMAGE}" >/dev/null

exec docker run --rm --init \
  --name moana-yatco-refresh \
  --pull never \
  --user "$(id -u):$(id -g)" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=512m \
  --shm-size 512m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 512 \
  --memory 1400m \
  --memory-swap 1800m \
  --cpus 1.5 \
  --env-file "${ENV_FILE}" \
  --env YATCO_AUTH_FILE=/run/secrets/yatcoboss.json \
  --env YATCO_DATA_DIR=/data \
  --volume "${AUTH_FILE}:/run/secrets/yatcoboss.json:ro" \
  --volume "${DATA_DIR}:/data:rw" \
  "${IMAGE}"
