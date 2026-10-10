#!/usr/bin/env bash
# Settlement V2 configuration: adapter, fee, hook.
# Sends 3 owner-only transactions ONE AT A TIME and verifies each on-chain before the next.
# Stops immediately on any failure or mismatch. Password is read once, never printed.
set -u

V2=0xeF913A73c8279987eE9a5f549593e7029a7Ac48E
V1=0xf6A316617Ea1C0a1Dde7cB331324d4DAC82E7C4b
OWNER=0x7Ab2EDb61850F8C0E60fd02e462dC169b5f7cb53
ADAPTER=0x631B038B3Cf7Ac5f513dC74750345E48beceBCC0
HOOK=0x87ADa5e12c7D7396982BC4BF5034f358f3FE92E0
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
SIMMA=0xfcB4Ac2cb9266E00C44B8e1b872B92a04Cd28156
WETH=0x4200000000000000000000000000000000000006
RPC="${BASE_RPC_URL:-}"

lc() { echo "$1" | tr 'A-Z' 'a-z'; }
die() { echo; echo "STOPPED: $1"; exit 1; }

[ -n "$RPC" ] || die "BASE_RPC_URL is not set in this shell"
[ "$(cast chain-id --rpc-url "$RPC")" = "8453" ] || die "RPC is not Base mainnet"
[ "$(lc "$(cast call $V2 'owner()(address)' --rpc-url "$RPC")")" = "$(lc $OWNER)" ] || die "V2 owner is not $OWNER"

read -rsp "deployer keystore password: " PW; echo
SIGNER=$(cast wallet address --account deployer --password "$PW" 2>&1) || { echo "$SIGNER" | tail -3; die "could not unlock keystore 'deployer' (see error above)"; }
[ "$(lc "$SIGNER")" = "$(lc $OWNER)" ] || die "keystore 'deployer' is $SIGNER, not $OWNER"
echo "Signer verified: $SIGNER"

echo
echo "About to send 3 ON-CHAIN TRANSACTIONS on Base mainnet to V2 $V2:"
echo "  4) setAdapterAllowed($ADAPTER, true)"
echo "  5) setFee(30, $OWNER)"
echo "  6) setHook($HOOK)"
read -rp "Type YES to continue: " OK
[ "$OK" = "YES" ] || die "not confirmed, nothing sent"

wait_eq() { # expected, then the cast call args
  local exp="$1"; shift; local v=""
  for i in $(seq 1 15); do
    v=$(cast call "$@" --rpc-url "$RPC" 2>/dev/null)
    [ "$(lc "$v")" = "$(lc "$exp")" ] && { echo "   verified on-chain: $v"; return 0; }
    sleep 2
  done
  die "readback mismatch: got '$v', expected '$exp'"
}

send() { # label, then cast send args
  local label="$1"; shift
  echo; echo "== $label"
  local out; out=$(cast send $V2 "$@" --account deployer --password "$PW" --rpc-url "$RPC" 2>&1)
  echo "$out" | grep -E "^(status|transactionHash)"
  echo "$out" | grep -qE "^status +1 \(success\)" || { echo "$out" | tail -5; die "$label transaction failed"; }
}

send "4) adapter" "setAdapterAllowed(address,bool)" $ADAPTER true
wait_eq true $V2 "adapterAllowed(address)(bool)" $ADAPTER

send "5) fee" "setFee(uint16,address)" 30 $OWNER
wait_eq 30 $V2 "feeBps()(uint16)"
wait_eq $OWNER $V2 "feeRecipient()(address)"

send "6) hook" "setHook(address)" $HOOK
wait_eq $HOOK $V2 "hook()(address)"

unset PW

echo
echo "================ V1 vs V2 (read-only) ================"
row() { printf "%-26s V1=%-44s V2=%s\n" "$1" "$(cast call $V1 "$2" ${3:-} --rpc-url "$RPC")" "$(cast call $V2 "$2" ${3:-} --rpc-url "$RPC")"; }
row owner "owner()(address)"
row feeBps "feeBps()(uint16)"
row feeRecipient "feeRecipient()(address)"
row hook "hook()(address)"
row "adapterAllowed" "adapterAllowed(address)(bool)" $ADAPTER
row "tokenAllowed USDC" "tokenAllowed(address)(bool)" $USDC
row "tokenAllowed SIMMA" "tokenAllowed(address)(bool)" $SIMMA
row "tokenAllowed WETH" "tokenAllowed(address)(bool)" $WETH
row "SWAP_INTENT_TYPEHASH" "SWAP_INTENT_TYPEHASH()(bytes32)"
echo
echo "DONE: all 3 transactions succeeded and verified."
