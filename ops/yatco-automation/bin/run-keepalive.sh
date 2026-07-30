#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly IMAGE="moana-yatco-refresh:local"
readonly CONFIG_DIR="/home/ubuntu/.config/moana-yatco"
readonly DATA_DIR="/home/ubuntu/.local/share/moana-yatco"
readonly AUTH_FILE="${CONFIG_DIR}/yatcoboss.json"
readonly REFRESHED_FILE="${CONFIG_DIR}/.yatcoboss.refreshed.json"
readonly LOCK_FILE="${DATA_DIR}/yatco.lock"
readonly VALIDATOR="/home/ubuntu/moana-yatco/ops/yatco-automation/bin/validate-storage-state.py"

install -d -m 700 "${CONFIG_DIR}" "${DATA_DIR}"

if [[ ! -f "${AUTH_FILE}" ]]; then
  echo "Required runtime file is missing: ${AUTH_FILE}" >&2
  exit 66
fi
permissions="$(stat -c '%a' "${AUTH_FILE}")"
if [[ "${permissions}" != "600" ]]; then
  echo "Unsafe permissions on ${AUTH_FILE}: expected 600, got ${permissions}" >&2
  exit 77
fi

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another YATCO operation is already running" >&2
  exit 75
fi

cleanup() {
  rm -f -- "${REFRESHED_FILE}"
}
trap cleanup EXIT

install -m 600 /dev/null "${REFRESHED_FILE}"
docker image inspect "${IMAGE}" >/dev/null

docker run --rm --init \
  --name moana-yatco-keepalive \
  --pull never \
  --user "$(id -u):$(id -g)" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=256m \
  --shm-size 256m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 256 \
  --memory 700m \
  --memory-swap 900m \
  --cpus 0.75 \
  --volume "${AUTH_FILE}:/auth/yatcoboss.json:ro" \
  --volume "${REFRESHED_FILE}:/auth/refreshed.json:rw" \
  --entrypoint node \
  "${IMAGE}" \
  /app/scripts/auth-keepalive.mjs /auth/yatcoboss.json /auth/refreshed.json

python3 "${VALIDATOR}" "${REFRESHED_FILE}"
install -m 600 "${REFRESHED_FILE}" "${AUTH_FILE}"
echo "YATCO BOSS session keepalive completed"
