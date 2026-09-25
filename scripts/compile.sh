#!/usr/bin/env bash
# Compile every reference contract with a pinned Compact toolchain.
#
#   ./scripts/compile.sh                  compile all contracts into contracts/managed/<name>/
#   ./scripts/compile.sh NativeShieldedToken   compile just one (name without .compact)
#   ./scripts/compile.sh --check          compile into a temp tree and diff against
#                                         the committed one (implies SKIP_ZK: keys
#                                         are not committed and not compared)
#   SKIP_ZK=true ./scripts/compile.sh     skip proving-key generation (fast; TypeScript output only)
#   ZKIR_V3=true ./scripts/compile.sh     emit ZKIR v3 instead of the default v2
#                                         (~4.4x fewer rows — see README "Proving
#                                         cost"; only use it once a probe deploy
#                                         has shown the network accepts v3)
#
# Contracts are compiled ONE AT A TIME on purpose: proving-key generation is the
# memory peak of this toolchain and this repository is developed on a shared,
# memory-tight host. Available memory is printed before each compile.
set -euo pipefail

COMPACT_VERSION="${COMPACT_VERSION:-0.34.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT/contracts"
OUT_DIR="$SRC_DIR/managed"

# The contracts to build, in order. TokenMetadata.compact is a module: it has no
# contract of its own and is compiled transitively by every importer.
#
# The generated/ half is the MIP-18 variant of the reference set as literal-payload
# contracts (see scripts/generate-literal-contracts.ts; spec 00024 §6.A); it is
# listed here so that `--check` covers what actually gets deployed, not only the
# parameterised templates.
CONTRACTS=(
  "probe/MetadataProbe"
  "NativeShieldedToken"
  "NativeUnshieldedToken"
  "NativeDualToken"
  "ShieldedCollection"
  "LedgerToken"
  "generated/LSUN18"
  "generated/LMOON18"
  "generated/SSTAR18"
  "generated/SNEB18"
  "generated/SGHOST18"
  "generated/UCOM18"
  "generated/UMET18"
  "generated/UPROM18"
  "generated/DAUR18"
  "generated/CNST18"
  "generated/LLIAR18"
)

CHECK=0
SELECTED=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *) SELECTED+=("$arg") ;;
  esac
done
if [ "${#SELECTED[@]}" -gt 0 ]; then
  CONTRACTS=("${SELECTED[@]}")
fi

compiler() {
  # `compact compile +<version>` runs that exact toolchain without touching the
  # host default (see README "Toolchain").
  compact compile "+$COMPACT_VERSION" "$@"
}

# The generated source map records the path from the target directory back to
# the sources, so without this the output would depend on WHERE it was compiled
# and `--check` could never match. This is the value a compile into
# contracts/managed/<name>/ produces.
SOURCE_ROOT='../../../'

echo "== compactc $(compiler --version) (language $(compiler --language-version), runtime $(compiler --runtime-version))"

FLAGS=()
# --check never compares keys, so never spend the ten minutes generating them.
if [ "$CHECK" = "1" ]; then SKIP_ZK=true; fi
if [ "${SKIP_ZK:-}" = "true" ]; then
  FLAGS+=(--skip-zk)
  echo "== SKIP_ZK=true: no proving keys will be generated"
fi
if [ "${ZKIR_V3:-}" = "true" ]; then
  FLAGS+=(--feature-zkir-v3)
  echo "== ZKIR_V3=true: generating ZKIR version 3 circuits"
fi

TARGET_ROOT="$OUT_DIR"
if [ "$CHECK" = "1" ]; then
  TARGET_ROOT="$(mktemp -d)"
  trap 'rm -rf "$TARGET_ROOT"' EXIT
  echo "== --check: compiling into $TARGET_ROOT"
fi

for name in "${CONTRACTS[@]}"; do
  src="$SRC_DIR/$name.compact"
  [ -f "$src" ] || { echo "missing source: $src" >&2; exit 1; }
  out="$TARGET_ROOT/$(basename "$name")"
  echo
  echo "== $name"
  if avail_mb=$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}') && [ -n "$avail_mb" ]; then
    echo "   memory: ${avail_mb} MiB available"
    # Proving-key generation is this toolchain's memory peak and this is a
    # shared host. Below 1.5 GiB, stop rather than push the machine into swap.
    if [ "${SKIP_ZK:-}" != "true" ] && [ "$avail_mb" -lt 1536 ]; then
      echo "   refusing to generate proving keys with less than 1.5 GiB available" >&2
      exit 3
    fi
  fi
  mkdir -p "$out"
  compiler ${FLAGS[@]+"${FLAGS[@]}"} --sourceRoot "$SOURCE_ROOT" "$src" "$out"
done

if [ "$CHECK" = "1" ]; then
  echo
  status=0
  for name in "${CONTRACTS[@]}"; do
    base="$(basename "$name")"
    # keys/ is not committed (a k=19 .prover is ~134 MB and is a pure function
    # of the ZKIR); compare the generated TypeScript, the ZKIR and the metadata.
    # *.bzkir is excluded for the same reason: it is a byproduct that `zkir`
    # writes beside a .zkir during key generation or ./scripts/circuit-cost.sh,
    # it is gitignored, and a --check run (which implies SKIP_ZK) never produces
    # one — so without this, measuring a circuit's cost would "break" --check.
    if diff -r -q -x keys -x '*.bzkir' "$OUT_DIR/$base" "$TARGET_ROOT/$base"; then
      echo "== $base: managed/ matches the sources"
    else
      echo "== $base: managed/ DIFFERS from a fresh compile" >&2
      status=1
    fi
  done
  exit "$status"
fi

echo
echo "== done; artefacts in $OUT_DIR"
