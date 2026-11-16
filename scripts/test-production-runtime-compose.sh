#!/usr/bin/env bash
# Read-only integration: render the real production Compose, never start services.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP="$(mktemp -d /tmp/portal-rendered-compose.XXXXXX)"
trap 'rm -rf -- "$TEMP"' EXIT
cp "$ROOT/scripts/production-release-records.sh" "$TEMP/"
sed '/^remote_main "\$@"$/d' "$ROOT/scripts/production-staged-release-remote.sh" >"$TEMP/remote.sh"
# The helper's functions are tested against the installed Docker Compose CLI.
source "$TEMP/remote.sh"
trap 'rm -rf -- "$TEMP"' EXIT
REMOTE_PYTHON_BIN="$(command -v python3)"
REMOTE_DOCKER=(docker)
commit="$(printf 'a%.0s' {1..40})"
python3 - "$ROOT/infra/production/compose.yaml" "$TEMP/env" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]).read_text()
keys=sorted(set(re.findall(r'\$\{([A-Z0-9_]+):\?',source)))
pathlib.Path(sys.argv[2]).write_text(''.join(f'{key}=fixture-value\n' for key in keys))
PY
for gateway in none app.lancora.ru; do
  REMOTE_COMPOSE_HOST_GATEWAY="$gateway"
  remote_override_bytes "$commit" "$gateway" >"$TEMP/compose.release.yaml"
  REMOTE_COMPOSE=(docker compose --env-file "$TEMP/env" -f "$ROOT/infra/production/compose.yaml" -f "$TEMP/compose.release.yaml")
  remote_validate_rendered_runtime
  images="$("${REMOTE_COMPOSE[@]}" config --images portal-backend portal-web)"
  [[ "$images" != *telegram* ]] || { echo 'Bridge image selected' >&2; exit 1; }
  REMOTE_COMPOSE_HOST_GATEWAY=wrong.example.test
  if remote_validate_rendered_runtime; then echo 'Rendered gateway mismatch accepted' >&2; exit 1; fi
  printf 'PASS real Compose service selection and gateway %s\n' "$gateway"
done
