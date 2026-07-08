#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

REGISTRY="${REGISTRY:-}"
TAG="${TAG:-latest}"
PUSH="${PUSH:-false}"
NO_CACHE="${NO_CACHE:-false}"
PLATFORM="${PLATFORM:-}"

declare -A SERVICES=(
  ["app"]="${ROOT_DIR}|docker/app.Dockerfile|simstudioai/simstudio"
  ["copilot"]="${ROOT_DIR}/apps/copilot|docker/copilot.Dockerfile|simstudioai/copilot"
  ["db"]="${ROOT_DIR}|docker/db.Dockerfile|simstudioai/migrations"
  ["pii"]="${ROOT_DIR}|docker/pii.Dockerfile|simstudioai/pii"
  ["realtime"]="${ROOT_DIR}|docker/realtime.Dockerfile|simstudioai/realtime"
)

ALL_SERVICES=("app" "copilot" "db" "pii" "realtime")

usage() {
  cat <<EOF
Usage: $0 [OPTIONS] [SERVICE...]

Build Docker images for Sim services.

SERVICES: ${ALL_SERVICES[*]}  (default: all)

Options:
  -t, --tag TAG        Image tag (default: latest)
  -r, --registry REG   Registry prefix (e.g. ghcr.io/simstudioai)
  -p, --push           Push images after build
  -n, --no-cache       Build without cache
  --platform PLATFORM  Target platform (e.g. linux/amd64,linux/arm64)
  -h, --help           Show this help

Examples:
  $0                          # build all services
  $0 app realtime             # build only app and realtime
  $0 -t v2.0.0 -p copilot    # build copilot with tag v2.0.0 and push
EOF
  exit 0
}

build_service() {
  local name="$1"
  local entry="${SERVICES[$name]}"
  local context="${entry%%|*}"
  local rest="${entry#*|}"
  local dockerfile="${rest%%|*}"
  local image_name="${rest##*|}"

  local full_image
  if [[ -n "$REGISTRY" ]]; then
    full_image="${REGISTRY}/${image_name}:${TAG}"
  else
    full_image="${image_name}:${TAG}"
  fi

  local build_args=()
  if [[ "$NO_CACHE" == "true" ]]; then
    build_args+=("--no-cache")
  fi
  if [[ -n "$PLATFORM" ]]; then
    build_args+=("--platform" "$PLATFORM")
  fi

  echo "========================================="
  echo "Building: ${full_image}"
  echo "  context:    ${context}"
  echo "  dockerfile: ${dockerfile}"
  echo "========================================="

  docker build \
    "${build_args[@]}" \
    -f "${ROOT_DIR}/${dockerfile}" \
    -t "${full_image}" \
    "${context}"

  if [[ "$PUSH" == "true" ]]; then
    echo "Pushing: ${full_image}"
    docker push "${full_image}"
  fi

  echo "✓ ${full_image} done"
  echo ""
}

main() {
  local services=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -t|--tag)
        TAG="$2"; shift 2 ;;
      -r|--registry)
        REGISTRY="$2"; shift 2 ;;
      -p|--push)
        PUSH="true"; shift ;;
      -n|--no-cache)
        NO_CACHE="true"; shift ;;
      --platform)
        PLATFORM="$2"; shift 2 ;;
      -h|--help)
        usage ;;
      -*)
        echo "Unknown option: $1" >&2; usage ;;
      *)
        services+=("$1"); shift ;;
    esac
  done

  if [[ ${#services[@]} -eq 0 ]]; then
    services=("${ALL_SERVICES[@]}")
  fi

  for svc in "${services[@]}"; do
    if [[ -z "${SERVICES[$svc]:-}" ]]; then
      echo "Unknown service: ${svc}" >&2
      echo "Available: ${ALL_SERVICES[*]}" >&2
      exit 1
    fi
  done

  for svc in "${services[@]}"; do
    build_service "$svc"
  done

  echo "All builds completed."
}

main "$@"
