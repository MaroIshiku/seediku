#!/bin/sh
set -eu

uid="${SEEDIKU_UID:-10001}"
gid="${SEEDIKU_GID:-10001}"

if [ "$(id -u)" = "0" ]; then
  chown -R "$uid:$gid" /data /config
  exec su-exec "$uid:$gid" "$@"
fi

exec "$@"
