#!/usr/bin/env bash
# Regenerate the chain table: run twice, the first pass to dump what the minder does today, the second to write today/todayBy.
# today/todayBy are what the minder did on this run: once the minder changes, regenerate wanted only, as gen.py's head says.
set -e
S=$(cd "$(dirname "$0")" && pwd)
export TABLEGEN_DUMP=$S/dump.json
cd "$S/../../../packages/safebyok"
f=tests/minding/vault-minder/vault-minder-chains.test.ts; d=tests/minding/vault-minder/zz-debug.test.ts
# The scratch test must never outlive a failed step: the package's suite would pick it up.
trap 'rm -f "$d" "$S/table.ts"' EXIT
python3 "$S/gen.py" > "$S/table.ts" && python3 "$S/splice.py" $f "$S/table.ts"
sed -e 's/^describe("/describe.skip("/' $f > $d && cat "$S/dumptail.ts.txt" >> $d
pnpm exec vitest run $d 2>&1 | rg 'Tests|Error' || true
