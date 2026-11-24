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
# A run that wrote no dump has left the table spliced without its tripwires: say so, and put the table back.
cp "$TABLEGEN_DUMP" "$S/dump.prev.json" 2>/dev/null || true; rm -f "$TABLEGEN_DUMP"
pnpm exec vitest run $d 2>&1 | rg 'Tests|Error' || true
if [ ! -s "$TABLEGEN_DUMP" ]; then
  mv "$S/dump.prev.json" "$TABLEGEN_DUMP" 2>/dev/null || true; git checkout -- $f
  echo "cycle.sh: the run wrote no dump (is the workspace built?); $f is put back as committed" >&2; exit 1
fi
rm -f "$S/dump.prev.json"
