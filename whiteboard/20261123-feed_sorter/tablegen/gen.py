"""Generate the feed table: each row a chain of records fed to a FeedSorter, and `streamed`, the events it returns.

A duplicate of whiteboard/20261123-minder_matrix/tablegen/gen.py (#866), with `streamed` in place of `wanted`, and no
`today`: there is no earlier sorter to baseline against.

A record is (kind, life, rev) or (kind, life, rev, chunk), all flat: 'soon' a sparse record, 'full' a whole live one, 'gone' a whole tombstone, 'void'
nothing stored, its rev -1. A life is one number that orders the lives at this scope, as a lifepath does: even lives are
live, odd ones dead. A dead life has one revision, written 0, and no soon. A void's life is -1 where nothing was ever
stored, or a number of its own where its parent was born again: a void of life 9 is above every record of an earlier
life. A void counts as dead, and is treated as any whole record is. No chain gives a void and another record one life.
A record's chunk is a small whole number naming the span of time it was read in, 0 where it is left out: the harness
reads it at a read_tc whose first eight hexadecimal digits spell it.

A scope's agerank is the joined string `life|high|item|time`: `life`, `high` and `item` each spelled as a lifeseq is, in
ten base-32 digits with -1 as `-000000001`, `high` the highest revision known of in that life, `item` the highest of a
whole record seen in it, -1 for none; `time` the chunk the highest revision was last seen in, in eight hexadecimal
digits. Two ageranks compare as text. A record is taken by preparing the agerank it would leave and comparing the two
strings. The time belongs to the newest revision: a record of another life, or above `high`, brings its own; one at
`high` brings the later of its own and the one before; any other keeps the one before. So a record seen again at the
newest revision in a later chunk is taken, and returns its item. It reads as here where high and item are equal, bare
where item is -1, and cold otherwise. A row's `agerank` is the one its chain leaves the scope at: at a root's scope it
is the sorter's own string, and at a deeper one the lifepath stands where the life does.

Run: python3 gen.py > table.ts.txt
"""
import itertools, sys

def timed(p, t):
  """`p` read in chunk `t`: chunk 0 is left out, so a row at chunk 0 reads as it did before times."""
  return p if t == 0 else p + (t,)
VOID = ("void", -1, -1)
def S(l, r, t=0): return timed(("soon", l, r), t)
def F(l, r, t=0): return timed(("full", l, r), t)
def G(l, t=0): return timed(("gone", l, 0), t)
def V(l, t=0): return timed(("void", l, -1), t)
def chunkOf(p): return p[3] if len(p) > 3 else 0

# == the agerank
DIGITS = "0123456789abcdefghijklmnopqrstuv"
def padded(n):
  """`n` as a lifeseq spells it: ten base-32 digits, -1 as `-000000001`."""
  if n == -1: return "-000000001"
  out = ""
  while n: out = DIGITS[n % 32] + out; n //= 32
  return out.rjust(10, "0")
def agerankOf(life, high, item, time): return "|".join([padded(life), padded(high), padded(item), format(time, "08x")])
def partsOf(agerank):
  life, high, item, time = agerank.split("|")
  return (int(life, 32), int(high, 32), int(item, 32), int(time, 16))

# == the principles
def isWhole(p): return p[0] != "soon"

def raisedOf(was, p):
  """The agerank `p` raises `was` to, or None where it raises nothing: prepare the agerank `p` would leave, then compare."""
  kind, life, rev = p[:3]
  t = chunkOf(p)
  lifeWas, high, item, time = partsOf(was) if was else (None, -1, -1, None)
  if life != lifeWas: high, item, time = -1, -1, None
  # The time belongs to the newest revision: when it was last seen.
  if time is None or rev > high: time = t
  elif rev == high: time = max(time, t)
  agerank = agerankOf(life, max(high, rev), max(item, rev) if isWhole(p) else item, time)
  return agerank if (was is None or agerank > was) else None

def tagOf(agerank):
  _, high, item, _ = partsOf(agerank)
  return "here" if item == high else ("bare" if item == -1 else "cold")

def eventsOf(was, agerank, p):
  """The events a record taken returns: the record, then a life change, then an aging."""
  kind, life, rev = p[:3]
  events = [timed(("item", kind, life, rev), chunkOf(p))]
  lifeWas, highWas = partsOf(was)[:2] if was else (None, None)
  # The first record of a scope returns a life too, from nothing: a listing may return only these.
  if life != lifeWas:
    events.append(("life", "died" if (kind == "void" or life % 2 == 1) else "born", lifeWas, highWas, life, rev))
  # An aging says what it was before, null for nothing: cold to cold may matter where bare to cold does not.
  if tagOf(agerank) != "here": events.append(("aged", tagOf(was) if was else None, tagOf(agerank), life, partsOf(agerank)[1]))
  return events

def streamOf(agerank, chain):
  """(the events `chain` returns from `agerank`, the agerank it ends at, each agerank taken along the way)."""
  events, taken = [], []
  for p in chain:
    raised = raisedOf(agerank, p)
    if raised is None: continue
    events += eventsOf(agerank, raised, p)
    agerank = raised
    taken.append((agerank, p))
  return events, agerank, taken

# == what the principles promise, checked here over every short chain of the alphabet
ALPHABET = [VOID, V(9), G(3), G(5), G(7)] + [k(l, r) for k in (S, F) for (l, r) in [(2, 9), (4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (6, 0), (6, 1)]]
# The alphabet read in each of three chunks, for the checks alone.
TIMED_ALPHABET = [timed(p, t) for p in ALPHABET for t in (0, 1, 2)]

def isFlat(chain):
  """True where no life is both a void's and another record's."""
  return not ({p[1] for p in chain if p[0] == "void"} & {p[1] for p in chain if p[0] != "void"})

def checkPrinciples():
  count = 0
  for n in (1, 2, 3):
    for chain in itertools.product(TIMED_ALPHABET, repeat=n):
      events, end, taken = streamOf(None, chain)
      ranks = [a for a, _ in taken]
      # Each agerank taken is above the last, as text.
      assert all(a < b for a, b in zip(ranks, ranks[1:])), chain
      # Text orders ageranks as their numbers do.
      assert sorted(ranks) == sorted(ranks, key=partsOf), chain
      # A chain ends at one agerank in whatever order its records arrive.
      assert all(streamOf(None, perm)[1] == end for perm in itertools.permutations(chain)), chain
      # A record returns events once: a repeat or an older one returns none.
      items = [e for e in events if e[0] == "item"]
      assert len(items) == len(set(items)), chain
      # A dead life, a void's among them, is always here.
      assert all(tagOf(a) == "here" for a, p in taken if p[0] == "void" or p[1] % 2 == 1), chain
      # A record taken that raises only the time leaves the high and item as they were, and returns its item alone or with an aging.
      for (a, p), was in zip(taken, [None] + ranks):
        if was and a[:a.rindex("|")] == was[:was.rindex("|")]:
          assert [e[0] for e in eventsOf(was, a, p)] in (["item"], ["item", "aged"]), chain
      # The time an agerank ends at is the latest chunk of the records at its life and highest revision.
      if taken:
        life, high, _, time = partsOf(end)
        assert time == max(chunkOf(p) for p in chain if p[1] == life and p[2] == high), chain
      count += 1
  return count

# == rows
STARTS = [  # const, the chain that seeds it, its name in a comment
  ("Empty",    [],                 "nothing"),
  ("Void",     [VOID],             "void"),
  ("BareSoon", [S(4, 4)],          "bare: a soon at 4, no item"),
  ("Cold",     [F(4, 2), S(4, 4)], "cold: an item at 2, a soon at 4"),
  ("Here",     [F(4, 4)],          "here: an item at 4"),
  ("Dead",     [G(5)],             "dead: a tombstone of life 5"),
]

def relOf(was, p):
  """How `p` stands to the agerank `was`, in words, with the chunk it was read in where that is not 0."""
  return f"{relOfRecord(was, p)}, a chunk later" if chunkOf(p) else relOfRecord(was, p)

def relOfRecord(was, p):
  """How `p`, as a record, stands to the agerank `was`, in words."""
  kind, life, rev = p[:3]
  noun = {"soon": "a soon", "full": "a full record", "gone": "a tombstone", "void": "a void"}[kind]
  if was is None: return noun
  lifeWas, high, item, _ = partsOf(was)
  if life < lifeWas: return f"{noun} of an earlier life"
  if life > lifeWas: return f"{noun} of a later life"
  if kind in ("gone", "void"): return "its tombstone again" if kind == "gone" else "its void again"
  if rev > high: return f"{noun} above its highest"
  if rev == high: return f"{noun} at its highest"
  if rev > item: return f"{noun} between its item and its highest"
  if rev == item: return f"{noun} at the revision of its item"
  return f"{noun} below its item"

CHAINS = [  # hand-written chains from nothing, each with what it is for
  ([VOID, S(4, 2), F(4, 2), G(5)],                                            "the first chain proposed: a void, a list, a get, a death"),
  ([F(4, 2), F(4, 2), S(4, 2), S(4, 1), F(4, 1), G(3), VOID],                  "repeats and olders return no events"),
  ([F(4, 1), F(4, 2), F(4, 3)],                                               "three writes in a row"),
  ([F(4, 3), F(4, 2), F(4, 1)],                                               "three writes arriving newest first"),
  ([S(4, 2), F(4, 2), F(4, 3)],                                               "a list, a get, a write"),
  ([S(4, 2), S(4, 2), S(4, 3), F(4, 3)],                                      "a list twice, a write seen between, then its get"),
  ([F(4, 2), S(4, 2)],                                                        "a soon at the revision of the item"),
  ([F(4, 1), S(4, 2), F(4, 2), S(4, 3), F(4, 3)],                             "each soon caught up before the next"),
  ([F(4, 3), S(4, 2), S(4, 3), S(4, 4)],                                      "a full record ahead of its soons, then one soon past it"),
  ([S(4, 1), S(4, 3), S(4, 2), F(4, 3)],                                      "soons out of order over a bare item"),
  ([S(4, 5), F(4, 2), F(4, 1), F(4, 5)],                                      "a bare soon, filled from behind, then caught up"),
  ([F(4, 2), S(4, 5), F(4, 4), S(4, 3), F(4, 5)],                             "a second full record between the item and the soon"),
  ([F(4, 1), S(4, 6), F(4, 2), F(4, 4), F(4, 3), F(4, 7)],                    "full records climbing under a soon, then past it"),
  ([F(4, 2), S(4, 4), S(4, 6), F(4, 4), F(4, 6)],                             "the soon moves on while the item is cold"),
  ([F(4, 2), S(4, 5), F(4, 5), S(4, 5), F(4, 4)],                             "once here, nothing more at or under that revision"),
  ([F(4, 2), G(5), F(6, 0), G(7)],                                            "die, be born, die"),
  ([G(5), S(6, 0), G(5), F(6, 0), G(7)],                                      "dead from the start, born by a soon, the old tombstone again"),
  ([G(5), G(7)],                                                              "dead to dead, the life between unseen"),
  ([F(4, 2), S(6, 0), F(6, 1)],                                               "a birth past an unseen death, seen by a soon"),
  ([F(4, 2), F(6, 0)],                                                        "a birth past an unseen death, by a full record"),
  ([F(4, 2), F(8, 0)],                                                        "two lives on, nothing seen between"),
  ([F(4, 2), G(7)],                                                           "on to a later death, a life unseen"),
  ([F(4, 1), S(4, 3), G(5)],                                                  "a death while cold"),
  ([S(4, 3), G(5)],                                                           "a death while bare"),
  ([F(4, 2), G(5), F(4, 3), S(4, 9), G(5)],                                   "records of the dead life after its tombstone"),
  ([G(5), S(6, 2), F(4, 9), F(6, 1), F(6, 2)],                                "a soon of a rebirth, a record of an old life, then catching up"),
  ([F(4, 1), S(4, 2), S(6, 0), F(4, 2), F(6, 0)],                             "cold across a rebirth: the catch-up of the old life comes too late"),
  ([G(5), S(6, 0), S(6, 0), F(6, 0), F(6, 0)],                                "a rebirth seen twice and fetched twice"),
  ([F(4, 7), G(5), F(6, 0), S(6, 1)],                                         "revisions start over in each life"),
  ([VOID, VOID],                                                              "a void twice"),
  ([VOID, V(9), VOID, V(9)],                                                  "a void, then a void of a later life, each again"),
  ([F(4, 2), V(5), F(4, 3), S(4, 9)],                                         "a void of a later life: records of the old life return no events"),
  ([F(4, 2), V(5), S(6, 0), F(6, 0), G(7)],                                   "a void of a later life, then born, written and dead"),
  ([V(5), F(4, 2), V(9)],                                                     "a void of each of two later lives, a record of an earlier life between"),
  ([F(4, 1), VOID],                                                           "a void after a record"),
  ([VOID, F(4, 0)],                                                           "a void, then a first write"),
  ([VOID, G(5)],                                                              "a void, then a tombstone"),
  ([VOID, S(4, 0), F(4, 0), S(4, 2), F(4, 1), F(4, 2), G(5), S(6, 0), F(6, 0), G(7)], "a long life: void, born, written, behind, dead, born again, dead"),
]

TIMED_CHAINS = [  # hand-written chains from nothing, read across chunks, each with what it is for
  ([F(4, 4, 1), F(4, 4, 1)],                                                  "the same whole record twice in one chunk: the second returns nothing"),
  ([F(4, 4, 2), F(4, 4, 1)],                                                  "the same whole record again from an earlier chunk returns nothing"),
  ([F(4, 4), F(4, 4, 1), F(4, 4, 2)],                                         "the same whole record in each of three chunks"),
  ([F(4, 4), S(4, 4, 1), F(4, 4, 1)],                                         "here, then a soon at its revision a chunk later, then the full record in that chunk"),
  ([F(4, 4, 1), F(4, 3, 2), S(4, 3, 2)],                                      "a record below the highest, in a later chunk, returns nothing"),
  ([F(4, 2), S(4, 4), F(4, 2, 1), S(4, 4, 1)],                                "while cold: the revision of the item a chunk later returns nothing, the highest returns its item"),
  ([S(4, 3), S(4, 3, 1), F(4, 3, 1)],                                         "while bare: the soon a chunk later, then its full record in that chunk"),
  ([F(4, 4, 2), F(4, 5, 1), F(4, 5, 2)],                                      "a newer revision read earlier than the last sighting: its time starts over at its own"),
  ([F(4, 4, 2), F(4, 5, 1), F(4, 4, 3)],                                      "an older revision read later returns nothing"),
  ([F(4, 4, 2), F(6, 0, 1)],                                                  "a later life read earlier"),
  ([F(6, 0, 1), F(4, 4, 2)],                                                  "an earlier life read later returns nothing"),
  ([F(4, 4, 3), F(4, 4, 1), F(4, 4, 2), F(4, 4, 4)],                          "sightings out of order: only a chunk past the latest returns its item"),
  ([G(5), G(5, 1), G(5, 1)],                                                  "a tombstone again a chunk later, then again in that chunk"),
  ([F(4, 2), V(5, 1), V(5, 2)],                                               "a void of a later life, then again a chunk later"),
  ([S(4, 1), F(4, 1, 1), S(4, 2, 1), F(4, 2, 3), F(4, 2, 2), S(4, 2, 4), G(5, 4), G(5, 5)], "a life across chunks: listed, fetched, listed, fetched late, seen again, dead"),
]

def fmtX(x): return "null" if x is None else (f"'{x}'" if isinstance(x, str) else (f"[{x[0]}, {x[1]}]" if isinstance(x, tuple) else str(x)))
def fmtP(p): return "[" + ", ".join(fmtX(x) for x in p) + "]"
def fmtPs(ps): return "[" + ", ".join(fmtP(p) for p in ps) + "]"
def fmtAge(agerank): return "null" if agerank is None else f"'{agerank}'"

lines = []
lines.append(("comment", "Each start, from nothing:"))
for const, seed, name in STARTS[1:]:
  events, end, _ = streamOf(None, seed)
  lines.append(("row", "Empty", seed, events, end, name))
for const, seed, name in STARTS:
  start = streamOf(None, seed)[1]
  lines.append(("comment", f"On {name}, each record of the alphabet:"))
  for p in ALPHABET:
    events, end, _ = streamOf(start, [p])
    lines.append(("row", const, [p], events, end, relOf(start, p)))
def itemsUntimed(events): return [e[:4] if e[0] == "item" else e for e in events]
for const, seed, name in STARTS:
  start = streamOf(None, seed)[1]
  # Only the records a chunk later makes news of: any other returns what it returns in chunk 0.
  later = [timed(p, 1) for p in ALPHABET if itemsUntimed(streamOf(start, [timed(p, 1)])[0]) != streamOf(start, [p])[0]]
  if not later: continue
  lines.append(("comment", f"On {name}, each record of the alphabet that a chunk later makes news:"))
  for p in later:
    events, end, _ = streamOf(start, [p])
    lines.append(("row", const, [p], events, end, relOf(start, p)))
lines.append(("comment", "Longer chains, from nothing:"))
for chain, blurb in CHAINS:
  assert isFlat(chain), chain
  events, end, _ = streamOf(None, chain)
  lines.append(("row", "Empty", chain, events, end, blurb))
lines.append(("comment", "Longer chains across chunks, from nothing:"))
for chain, blurb in TIMED_CHAINS:
  assert isFlat(chain), chain
  events, end, _ = streamOf(None, chain)
  lines.append(("row", "Empty", chain, events, end, blurb))

rows = [l for l in lines if l[0] == "row"]
cells = [(f"initial: {c},", f"chain: {fmtPs(ch)},", f"streamed: {fmtPs(ev)},", f"agerank: {fmtAge(end)},", f"blurb: '{b}'") for (_, c, ch, ev, end, b) in rows]
# Past its cap, a cell runs into the next on its own row only.
widths = [min(max(len(c[i]) for c in cells), cap) for i, cap in enumerate([18, 36, 96, 56])]
out, it = [], iter(cells)
for l in lines:
  if l[0] == "comment": out.append(f"  // {l[1]}")
  else:
    c = next(it)
    row = "  { " + " ".join(c[i].ljust(widths[i]) for i in range(4)) + " " + c[4] + " },"
    # A row too wide for a screen takes its streamed, then its agerank and blurb, onto lines of their own.
    if len(row) > 250: row = "  { " + c[0].ljust(widths[0]) + " " + c[1] + "\n    " + c[2] + "\n    " + c[3] + " " + c[4] + " },"
    out.append(row)
print("\n".join(out))
print(f"// rows: {len(rows)} ({len(CHAINS)} longer chains, {len(TIMED_CHAINS)} across chunks); principles held over {checkPrinciples()} chains of up to 3 records, each in up to three chunks", file=sys.stderr)
