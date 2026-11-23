"""Generate the chain table: rows with wanted from the principles, and today/todayBy from dump.json if present."""
import json, os, sys

HERE = os.path.dirname(__file__)

def I(l, r): return ("item", l, r)
def G(l, r): return ("gone", l, r)
def S(l, r): return ("soon", l, r)

STATES = {  # name: (const, cache)
  "live+soon": ("LiveSoon", {"item": I(4, 11), "soon": S(4, 12)}),
  "live":      ("Live",     {"item": I(4, 11)}),
  "dead":      ("Dead",     {"item": None, "dead": G(5, 15)}),
  "dead+soon": ("DeadSoon", {"item": None, "soon": S(6, 16), "dead": G(5, 15)}),
  "bare+soon": ("BareSoon", {"soon": S(4, 12)}),
}
SEEDS = {"live+soon": [I(4, 11), S(4, 12)], "live": [I(4, 11)], "dead": [G(5, 15)], "dead+soon": [G(5, 15), S(6, 16)], "bare+soon": [S(4, 12)]}
OLDER       = {"live+soon": [I(0, 1), S(0, 2)], "live": [I(0, 1)], "dead": [G(1, 3)], "dead+soon": [G(1, 3), S(2, 4)], "bare+soon": [S(0, 2)]}
OLDER_SAME  = {"live+soon": [I(4, 9), S(4, 10)], "live": [I(4, 9)]}
NEWER_4     = {"live+soon": [I(6, 16), S(6, 17)], "live": [I(6, 16)], "dead": [G(5, 15)], "dead+soon": [G(5, 15), S(6, 16)], "bare+soon": [S(6, 17)]}
NEWER_SAME4 = {"live+soon": [I(4, 13), S(4, 14)], "live": [I(4, 13)], "bare+soon": [S(4, 14)]}
NEWER_DEAD  = {"live+soon": [I(6, 16), S(6, 17)], "live": [I(6, 16)], "dead": [G(7, 20)], "dead+soon": [G(7, 20), S(8, 21)], "bare+soon": [S(6, 17)]}
NEWER_DS    = {"live+soon": [I(8, 21), S(8, 22)], "live": [I(8, 21)], "dead": [G(7, 20)], "dead+soon": [G(7, 20), S(8, 21)], "bare+soon": [S(8, 22)]}
NEWER_SAME6 = {"live+soon": [I(6, 17), S(6, 18)], "live": [I(6, 17)], "bare+soon": [S(6, 18)]}
NEWER = {"live+soon": (NEWER_4, NEWER_SAME4), "live": (NEWER_4, NEWER_SAME4), "bare+soon": (NEWER_4, NEWER_SAME4), "dead": (NEWER_DEAD, {}), "dead+soon": (NEWER_DS, NEWER_SAME6)}
# Older in the start's own life ends apart from older in an earlier life only under a bare soon, where it fills the item.
OLDER_SAME_ON = {"bare+soon"}
NAMED = {("live+soon", "bare+soon, newer"): "(a) ", ("live+soon", "dead, newer"): "(b) ", ("dead", "live, newer"): "(c) "}
ORDER = ["live+soon", "live", "dead", "dead+soon", "bare+soon"]

# == the principles
def isWhole(p): return p[0] in ("item", "gone")
def isDeath(p): return p[0] in ("gone",)
def rev(p): return -1 if p is None else p[2]
def wholeOf(c):
  if "item" not in c: return None
  return c.get("dead") if c["item"] is None else c["item"]
def newestOf(c):
  ps = [p for p in (c.get("item"), c.get("soon"), c.get("dead")) if p]
  return max(ps, key=lambda p: p[2]) if ps else None
def wantedOf(initial, chain):
  c = dict(initial)
  for p in chain:
    if isWhole(p):
      if p[2] > rev(wholeOf(c)):
        if isDeath(p): c["item"] = None; c["dead"] = p
        else: c["item"] = p; c.pop("dead", None)
    elif p[2] > rev(wholeOf(c)) and p[2] > rev(c.get("soon")): c["soon"] = p
    if c.get("soon") and c["soon"][2] <= rev(wholeOf(c)): c.pop("soon")
    # A record of a later life ends what the cache holds of an earlier life.
    life = newestOf(c)[1]
    whole = wholeOf(c)
    if whole is not None and whole[1] < life: c.pop("item", None); c.pop("dead", None)
  return c

def lifeOf(c):
  n = newestOf(c)
  return "vacant" if n is None else n[1]

def withListing(initial, wanted):
  w = {k: wanted[k] for k in ("item", "soon", "dead") if k in wanted}
  if lifeOf(initial) != lifeOf(w): w["isListingStale"] = True
  return w

# == rows
groups = []
groups.append(("Each start, from nothing:", [("Empty", SEEDS[s], None) for s in ORDER]))
for a in ORDER:
  const, _ = STATES[a]
  rs = []
  for b in ORDER:
    rs.append((const, OLDER[b], f"{b}, older"))
    if a in OLDER_SAME_ON and b in OLDER_SAME: rs.append((const, OLDER_SAME[b], f"{b}, older in its life"))
    newer, same = NEWER[a]
    rs.append((const, newer[b], f"{b}, newer"))
    if b in same: rs.append((const, same[b], f"{b}, newer in its life"))
  rs = [(c, ch, NAMED.get((a, bl), "") + bl) for (c, ch, bl) in rs]
  groups.append((f"On {a}:", rs))

CONSTS = {"Empty": {}, **{c: st for (c, st) in STATES.values()}}
CONST_NAMES = {"Empty": "nothing", **{c: n for n, (c, _) in STATES.items()}}

def fmtP(p): return f'["{p[0]}", {p[1]}, {p[2]}]'
def fmtCache(c):
  for name, st in CONSTS.items():
    if name != "Empty" and c == st: return name
  parts = []
  for k in ("item", "soon", "dead"):
    if k in c: parts.append(f"{k}: {'null' if c[k] is None else fmtP(c[k])}")
  if c.get("isListingStale"): parts.append("isListingStale: true")
  return "{ " + ", ".join(parts) + " }" if parts else "{}"

dump = {}
if os.path.exists(os.path.join(HERE, "dump.json")):
  for d in json.load(open(os.path.join(HERE, "dump.json"))): dump.setdefault(d["key"], {})[d["routes"]] = d
def keyOf(init, chain): return CONST_NAMES[init] + " " + json.dumps([list(p) for p in chain], separators=(",", ":"))
def thaw(v): return {k: (None if x is None else (tuple(x) if isinstance(x, list) else x)) for k, x in v.items()}

lines = []
for comment, rs in groups:
  lines.append(("comment", comment))
  for init, chain, blurb in rs:
    w = withListing(CONSTS[init], wantedOf(CONSTS[init], chain))
    fields = [f"initial: {init},", "chain: [" + ", ".join(fmtP(p) for p in chain) + "],", f"wanted: {fmtCache(w)},"]
    extra = []
    obs = dump.get(keyOf(init, chain))
    if obs:
      diffs, actuals = {}, {}
      for routes, d in obs.items():
        actual = thaw(d["cache"])
        if d["stale"]: actual["isListingStale"] = True
        exp = dict(w)
        if d["hasListStep"]:
          exp.pop("isListingStale", None)
          if d["derived"]: exp["isListingStale"] = True
        actuals[routes] = actual
        if actual != exp: diffs[routes] = actual
      if diffs:
        counts = {}
        for v in diffs.values(): counts[json.dumps(v, sort_keys=True)] = counts.get(json.dumps(v, sort_keys=True), 0) + 1
        topval = thaw(json.loads(max(counts, key=counts.get)))
        withToday = {r: a for r, a in actuals.items() if a != topval}
        if len(withToday) < len(diffs):
          extra.append(f"today: {fmtCache(topval)},")
          chosen = withToday
        else:
          chosen = diffs
        if chosen: extra.append("todayBy: { " + ", ".join((f'"{r}"' if len(r) == 1 else r) + f": {fmtCache(v)}" for r, v in sorted(chosen.items())) + " },")
    if blurb: extra.append(f'blurb: "{blurb}",')
    lines.append(("row", fields + extra))

widths = [0, 0, 0]
for kind, f in lines:
  if kind == "row":
    for i in range(3): widths[i] = max(widths[i], len(f[i]))
widths = [min(w, 60) for w in widths]
out = []
for kind, f in lines:
  if kind == "comment": out.append(f"  // {f}")
  else:
    cells = [f[i].ljust(widths[i]) for i in range(3)] + f[3:]
    out.append(("  { " + " ".join(cells)).rstrip().rstrip(",") + " },")
print("\n".join(out))
print(f"// rows: {sum(1 for k, _ in lines if k == 'row')}", file=sys.stderr)
