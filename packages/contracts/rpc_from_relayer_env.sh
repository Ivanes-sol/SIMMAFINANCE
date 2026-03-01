#!/usr/bin/env bash
set -euo pipefail

RELAYER_ENV="/mnt/c/WINDOWS/SystemApps/MicrosoftWindows.Client.CBS_cw5n1h2txyewy/simma/packages/relayer/.env"

if [ ! -f "$RELAYER_ENV" ]; then
  echo "rpc_from_relayer_env.sh ERROR: relayer .env not found at: $RELAYER_ENV" >&2
  return 1 2>/dev/null || exit 1
fi

# Extract RELAYER_BASE_RPC_URL safely (no eval, no dotenv)
RPC_LINE="$(grep -E '^RELAYER_BASE_RPC_URL=' "$RELAYER_ENV" | tail -n 1 || true)"
RPC="${RPC_LINE#RELAYER_BASE_RPC_URL=}"

# Trim quotes/spaces
RPC="${RPC%\"}"; RPC="${RPC#\"}"
RPC="${RPC%\'}"; RPC="${RPC#\'}"
RPC="$(echo -n "$RPC" | tr -d '\r')"

if [ -z "$RPC" ]; then
  echo "rpc_from_relayer_env.sh ERROR: RELAYER_BASE_RPC_URL is empty in $RELAYER_ENV" >&2
  return 1 2>/dev/null || exit 1
fi

export BASE_RPC_URL="$RPC"
echo "BASE_RPC_URL=$BASE_RPC_URL"
