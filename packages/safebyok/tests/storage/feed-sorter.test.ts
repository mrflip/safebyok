import { describe, expect, it } from 'vitest'
import { Thing } from '../../src/models/thing'
import { type Lifepath, Lifeseq, Revseq, VoidLifeseq } from '../../src/shapes/primitives'
import { Shell } from '../../src/shapes/shapes-thing'
import type { Agekind, Agerank, Lifekind, Liveness, SeenThing, VaultEvent } from '../../src/shapes/shapes-vault-event'
import { FeedSorter } from '../../src/storage/feed-sorter'
import { readTcNow } from '../../src/storage/thing-classifier'
import type { ReadTc } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

// == [Shorthand]: Life, Seen, Shorthand, FeedCase, the starts

/** A life at this scope, one number ordered as lifepaths are: even for a live life, odd for a dead one or a void */
type Life = number
/** A span of 65.536 seconds a record was read in, as a small whole number: 0 where it is left out */
type Chunk = number
/** A record, as `[liveness, life, revseq]`, or with the chunk it was read in after them */
type Seen = readonly [Liveness, Life, number] | readonly [Liveness, Life, number, Chunk]
/** An event: an item as its record is, a life or an aging with what stood before (null for none) and after */
type Shorthand =
  | readonly ['item', Liveness, Life, number]
  | readonly ['item', Liveness, Life, number, Chunk]
  | readonly ['life', Lifekind, Life | null, number | null, Life, number]
  | readonly ['aged', Agekind | null, Agekind, Life, number]
type FeedCase = Readonly<{ initial: readonly Seen[], chain: readonly Seen[], streamed: readonly Shorthand[], agerank: string, blurb: string }>

// Each start is the chain its row under "Each start, from nothing" feeds.
const Empty:    readonly Seen[] = []
const Void:     readonly Seen[] = [["void", -1, -1]]
const BareSoon: readonly Seen[] = [["soon", 4, 4]]
const Cold:     readonly Seen[] = [["full", 4, 2], ["soon", 4, 4]]
const Here:     readonly Seen[] = [["full", 4, 4]]
const Dead:     readonly Seen[] = [["gone", 5, 0]]
const StartNames = new Map([[Empty, 'nothing'], [Void, 'void'], [BareSoon, 'bare'], [Cold, 'cold'], [Here, 'here'], [Dead, 'dead']])
// --

// == [The feed table]: FeedCases

// Pasted from whiteboard/20261123-feed_sorter/tablegen/table.ts.txt, written by its gen.py, with every quote but the blurb's made double.
const FeedCases: readonly FeedCase[] = [
  // Each start, from nothing:
  { initial: Empty,    chain: [["void", -1, -1]],           streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1]],                      agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'void' },
  { initial: Empty,    chain: [["soon", 4, 4]],
    streamed: [["item", "soon", 4, 4], ["life", "born", null, null, 4, 4], ["aged", null, "bare", 4, 4]],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'bare: a soon at 4, no item' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 4]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'cold: an item at 2, a soon at 4' },
  { initial: Empty,    chain: [["full", 4, 4]],             streamed: [["item", "full", 4, 4], ["life", "born", null, null, 4, 4]],                          agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'here: an item at 4' },
  { initial: Empty,    chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0]],                          agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'dead: a tombstone of life 5' },
  // On nothing, each record of the alphabet:
  { initial: Empty,    chain: [["void", -1, -1]],           streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1]],                      agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'a void' },
  { initial: Empty,    chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", null, null, 9, -1]],                        agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void' },
  { initial: Empty,    chain: [["gone", 3, 0]],             streamed: [["item", "gone", 3, 0], ["life", "died", null, null, 3, 0]],                          agerank: "0000000003|0000000000|0000000000|00000000", blurb: 'a tombstone' },
  { initial: Empty,    chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0]],                          agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone' },
  { initial: Empty,    chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", null, null, 7, 0]],                          agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone' },
  { initial: Empty,    chain: [["soon", 2, 9]],             streamed: [["item", "soon", 2, 9], ["life", "born", null, null, 2, 9], ["aged", null, "bare", 2, 9]], agerank: "0000000002|0000000009|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 1]],             streamed: [["item", "soon", 4, 1], ["life", "born", null, null, 4, 1], ["aged", null, "bare", 4, 1]], agerank: "0000000004|0000000001|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 2]],             streamed: [["item", "soon", 4, 2], ["life", "born", null, null, 4, 2], ["aged", null, "bare", 4, 2]], agerank: "0000000004|0000000002|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 3]],             streamed: [["item", "soon", 4, 3], ["life", "born", null, null, 4, 3], ["aged", null, "bare", 4, 3]], agerank: "0000000004|0000000003|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 4]],             streamed: [["item", "soon", 4, 4], ["life", "born", null, null, 4, 4], ["aged", null, "bare", 4, 4]], agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 5]],             streamed: [["item", "soon", 4, 5], ["life", "born", null, null, 4, 5], ["aged", null, "bare", 4, 5]], agerank: "0000000004|0000000005|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", null, null, 6, 0], ["aged", null, "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", null, null, 6, 1], ["aged", null, "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["full", 2, 9]],             streamed: [["item", "full", 2, 9], ["life", "born", null, null, 2, 9]],                          agerank: "0000000002|0000000009|0000000009|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 1]],             streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1]],                          agerank: "0000000004|0000000001|0000000001|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 2]],             streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2]],                          agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 3]],             streamed: [["item", "full", 4, 3], ["life", "born", null, null, 4, 3]],                          agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 4]],             streamed: [["item", "full", 4, 4], ["life", "born", null, null, 4, 4]],                          agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 5]],             streamed: [["item", "full", 4, 5], ["life", "born", null, null, 4, 5]],                          agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 6, 0]],             streamed: [["item", "full", 6, 0], ["life", "born", null, null, 6, 0]],                          agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 6, 1]],             streamed: [["item", "full", 6, 1], ["life", "born", null, null, 6, 1]],                          agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record' },
  // On void, each record of the alphabet:
  { initial: Void,     chain: [["void", -1, -1]],           streamed: [],                                                                                    agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'its void again' },
  { initial: Void,     chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", -1, -1, 9, -1]],                            agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of a later life' },
  { initial: Void,     chain: [["gone", 3, 0]],             streamed: [["item", "gone", 3, 0], ["life", "died", -1, -1, 3, 0]],                              agerank: "0000000003|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Void,     chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", -1, -1, 5, 0]],                              agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Void,     chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", -1, -1, 7, 0]],                              agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Void,     chain: [["soon", 2, 9]],             streamed: [["item", "soon", 2, 9], ["life", "born", -1, -1, 2, 9], ["aged", "here", "bare", 2, 9]], agerank: "0000000002|0000000009|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 4, 1]],             streamed: [["item", "soon", 4, 1], ["life", "born", -1, -1, 4, 1], ["aged", "here", "bare", 4, 1]], agerank: "0000000004|0000000001|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 4, 2]],             streamed: [["item", "soon", 4, 2], ["life", "born", -1, -1, 4, 2], ["aged", "here", "bare", 4, 2]], agerank: "0000000004|0000000002|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 4, 3]],             streamed: [["item", "soon", 4, 3], ["life", "born", -1, -1, 4, 3], ["aged", "here", "bare", 4, 3]], agerank: "0000000004|0000000003|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 4, 4]],             streamed: [["item", "soon", 4, 4], ["life", "born", -1, -1, 4, 4], ["aged", "here", "bare", 4, 4]], agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 4, 5]],             streamed: [["item", "soon", 4, 5], ["life", "born", -1, -1, 4, 5], ["aged", "here", "bare", 4, 5]], agerank: "0000000004|0000000005|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", -1, -1, 6, 0], ["aged", "here", "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", -1, -1, 6, 1], ["aged", "here", "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Void,     chain: [["full", 2, 9]],
    streamed: [["item", "full", 2, 9], ["life", "born", -1, -1, 2, 9]],
    agerank: "0000000002|0000000009|0000000009|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 4, 1]],
    streamed: [["item", "full", 4, 1], ["life", "born", -1, -1, 4, 1]],
    agerank: "0000000004|0000000001|0000000001|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 4, 2]],
    streamed: [["item", "full", 4, 2], ["life", "born", -1, -1, 4, 2]],
    agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 4, 3]],
    streamed: [["item", "full", 4, 3], ["life", "born", -1, -1, 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 4, 4]],
    streamed: [["item", "full", 4, 4], ["life", "born", -1, -1, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 4, 5]],
    streamed: [["item", "full", 4, 5], ["life", "born", -1, -1, 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 6, 0]],
    streamed: [["item", "full", 6, 0], ["life", "born", -1, -1, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record of a later life' },
  { initial: Void,     chain: [["full", 6, 1]],
    streamed: [["item", "full", 6, 1], ["life", "born", -1, -1, 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record of a later life' },
  // On bare: a soon at 4, no item, each record of the alphabet:
  { initial: BareSoon, chain: [["void", -1, -1]],           streamed: [],                                                                                    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a void of an earlier life' },
  { initial: BareSoon, chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", 4, 4, 9, -1]],                              agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of a later life' },
  { initial: BareSoon, chain: [["gone", 3, 0]],
    streamed: [],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a tombstone of an earlier life' },
  { initial: BareSoon, chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", 4, 4, 5, 0]],                                agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: BareSoon, chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", 4, 4, 7, 0]],                                agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: BareSoon, chain: [["soon", 2, 9]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon of an earlier life' },
  { initial: BareSoon, chain: [["soon", 4, 1]],
    streamed: [],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon between its item and its highest' },
  { initial: BareSoon, chain: [["soon", 4, 2]],
    streamed: [],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon between its item and its highest' },
  { initial: BareSoon, chain: [["soon", 4, 3]],
    streamed: [],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon between its item and its highest' },
  { initial: BareSoon, chain: [["soon", 4, 4]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon at its highest' },
  { initial: BareSoon, chain: [["soon", 4, 5]],             streamed: [["item", "soon", 4, 5], ["aged", "bare", "bare", 4, 5]],                              agerank: "0000000004|0000000005|-000000001|00000000", blurb: 'a soon above its highest' },
  { initial: BareSoon, chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", 4, 4, 6, 0], ["aged", "bare", "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: BareSoon, chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", 4, 4, 6, 1], ["aged", "bare", "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: BareSoon, chain: [["full", 2, 9]],
    streamed: [],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a full record of an earlier life' },
  { initial: BareSoon, chain: [["full", 4, 1]],
    streamed: [["item", "full", 4, 1], ["aged", "bare", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000001|00000000", blurb: 'a full record between its item and its highest' },
  { initial: BareSoon, chain: [["full", 4, 2]],
    streamed: [["item", "full", 4, 2], ["aged", "bare", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a full record between its item and its highest' },
  { initial: BareSoon, chain: [["full", 4, 3]],
    streamed: [["item", "full", 4, 3], ["aged", "bare", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000003|00000000", blurb: 'a full record between its item and its highest' },
  { initial: BareSoon, chain: [["full", 4, 4]],
    streamed: [["item", "full", 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record at its highest' },
  { initial: BareSoon, chain: [["full", 4, 5]],
    streamed: [["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a full record above its highest' },
  { initial: BareSoon, chain: [["full", 6, 0]],
    streamed: [["item", "full", 6, 0], ["life", "born", 4, 4, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record of a later life' },
  { initial: BareSoon, chain: [["full", 6, 1]],
    streamed: [["item", "full", 6, 1], ["life", "born", 4, 4, 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record of a later life' },
  // On cold: an item at 2, a soon at 4, each record of the alphabet:
  { initial: Cold,     chain: [["void", -1, -1]],           streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a void of an earlier life' },
  { initial: Cold,     chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", 4, 4, 9, -1]],                              agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of a later life' },
  { initial: Cold,     chain: [["gone", 3, 0]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a tombstone of an earlier life' },
  { initial: Cold,     chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", 4, 4, 5, 0]],                                agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Cold,     chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", 4, 4, 7, 0]],                                agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Cold,     chain: [["soon", 2, 9]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a soon of an earlier life' },
  { initial: Cold,     chain: [["soon", 4, 1]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a soon below its item' },
  { initial: Cold,     chain: [["soon", 4, 2]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a soon at the revision of its item' },
  { initial: Cold,     chain: [["soon", 4, 3]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a soon between its item and its highest' },
  { initial: Cold,     chain: [["soon", 4, 4]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a soon at its highest' },
  { initial: Cold,     chain: [["soon", 4, 5]],             streamed: [["item", "soon", 4, 5], ["aged", "cold", "cold", 4, 5]],                              agerank: "0000000004|0000000005|0000000002|00000000", blurb: 'a soon above its highest' },
  { initial: Cold,     chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", 4, 4, 6, 0], ["aged", "cold", "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Cold,     chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", 4, 4, 6, 1], ["aged", "cold", "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Cold,     chain: [["full", 2, 9]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a full record of an earlier life' },
  { initial: Cold,     chain: [["full", 4, 1]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a full record below its item' },
  { initial: Cold,     chain: [["full", 4, 2]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'a full record at the revision of its item' },
  { initial: Cold,     chain: [["full", 4, 3]],
    streamed: [["item", "full", 4, 3], ["aged", "cold", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000003|00000000", blurb: 'a full record between its item and its highest' },
  { initial: Cold,     chain: [["full", 4, 4]],
    streamed: [["item", "full", 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record at its highest' },
  { initial: Cold,     chain: [["full", 4, 5]],
    streamed: [["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a full record above its highest' },
  { initial: Cold,     chain: [["full", 6, 0]],
    streamed: [["item", "full", 6, 0], ["life", "born", 4, 4, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record of a later life' },
  { initial: Cold,     chain: [["full", 6, 1]],
    streamed: [["item", "full", 6, 1], ["life", "born", 4, 4, 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record of a later life' },
  // On here: an item at 4, each record of the alphabet:
  { initial: Here,     chain: [["void", -1, -1]],           streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a void of an earlier life' },
  { initial: Here,     chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", 4, 4, 9, -1]],                              agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of a later life' },
  { initial: Here,     chain: [["gone", 3, 0]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a tombstone of an earlier life' },
  { initial: Here,     chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", 4, 4, 5, 0]],                                agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Here,     chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", 4, 4, 7, 0]],                                agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Here,     chain: [["soon", 2, 9]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a soon of an earlier life' },
  { initial: Here,     chain: [["soon", 4, 1]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a soon below its item' },
  { initial: Here,     chain: [["soon", 4, 2]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a soon below its item' },
  { initial: Here,     chain: [["soon", 4, 3]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a soon below its item' },
  { initial: Here,     chain: [["soon", 4, 4]],             streamed: [],                                                                                    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a soon at its highest' },
  { initial: Here,     chain: [["soon", 4, 5]],             streamed: [["item", "soon", 4, 5], ["aged", "here", "cold", 4, 5]],                              agerank: "0000000004|0000000005|0000000004|00000000", blurb: 'a soon above its highest' },
  { initial: Here,     chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", 4, 4, 6, 0], ["aged", "here", "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Here,     chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", 4, 4, 6, 1], ["aged", "here", "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Here,     chain: [["full", 2, 9]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record of an earlier life' },
  { initial: Here,     chain: [["full", 4, 1]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record below its item' },
  { initial: Here,     chain: [["full", 4, 2]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record below its item' },
  { initial: Here,     chain: [["full", 4, 3]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record below its item' },
  { initial: Here,     chain: [["full", 4, 4]],
    streamed: [],
    agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record at its highest' },
  { initial: Here,     chain: [["full", 4, 5]],
    streamed: [["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a full record above its highest' },
  { initial: Here,     chain: [["full", 6, 0]],
    streamed: [["item", "full", 6, 0], ["life", "born", 4, 4, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record of a later life' },
  { initial: Here,     chain: [["full", 6, 1]],
    streamed: [["item", "full", 6, 1], ["life", "born", 4, 4, 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record of a later life' },
  // On dead: a tombstone of life 5, each record of the alphabet:
  { initial: Dead,     chain: [["void", -1, -1]],           streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a void of an earlier life' },
  { initial: Dead,     chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", 5, 0, 9, -1]],                              agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of a later life' },
  { initial: Dead,     chain: [["gone", 3, 0]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone of an earlier life' },
  { initial: Dead,     chain: [["gone", 5, 0]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'its tombstone again' },
  { initial: Dead,     chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", 5, 0, 7, 0]],                                agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone of a later life' },
  { initial: Dead,     chain: [["soon", 2, 9]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a soon of an earlier life' },
  { initial: Dead,     chain: [["soon", 4, 1]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a soon of an earlier life' },
  { initial: Dead,     chain: [["soon", 4, 2]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a soon of an earlier life' },
  { initial: Dead,     chain: [["soon", 4, 3]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a soon of an earlier life' },
  { initial: Dead,     chain: [["soon", 4, 4]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a soon of an earlier life' },
  { initial: Dead,     chain: [["soon", 4, 5]],             streamed: [],                                                                                    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a soon of an earlier life' },
  { initial: Dead,     chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Dead,     chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", 5, 0, 6, 1], ["aged", "here", "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon of a later life' },
  { initial: Dead,     chain: [["full", 2, 9]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a full record of an earlier life' },
  { initial: Dead,     chain: [["full", 4, 1]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a full record of an earlier life' },
  { initial: Dead,     chain: [["full", 4, 2]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a full record of an earlier life' },
  { initial: Dead,     chain: [["full", 4, 3]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a full record of an earlier life' },
  { initial: Dead,     chain: [["full", 4, 4]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a full record of an earlier life' },
  { initial: Dead,     chain: [["full", 4, 5]],
    streamed: [],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a full record of an earlier life' },
  { initial: Dead,     chain: [["full", 6, 0]],
    streamed: [["item", "full", 6, 0], ["life", "born", 5, 0, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record of a later life' },
  { initial: Dead,     chain: [["full", 6, 1]],
    streamed: [["item", "full", 6, 1], ["life", "born", 5, 0, 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record of a later life' },
  // On void, each record of the alphabet that a chunk later makes news:
  { initial: Void,     chain: [["void", -1, -1, 1]],
    streamed: [["item", "void", -1, -1, 1]],
    agerank: "-000000001|-000000001|-000000001|00000001", blurb: 'its void again, a chunk later' },
  // On bare: a soon at 4, no item, each record of the alphabet that a chunk later makes news:
  { initial: BareSoon, chain: [["soon", 4, 4, 1]],
    streamed: [["item", "soon", 4, 4, 1], ["aged", "bare", "bare", 4, 4]],
    agerank: "0000000004|0000000004|-000000001|00000001", blurb: 'a soon at its highest, a chunk later' },
  // On cold: an item at 2, a soon at 4, each record of the alphabet that a chunk later makes news:
  { initial: Cold,     chain: [["soon", 4, 4, 1]],
    streamed: [["item", "soon", 4, 4, 1], ["aged", "cold", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000002|00000001", blurb: 'a soon at its highest, a chunk later' },
  // On here: an item at 4, each record of the alphabet that a chunk later makes news:
  { initial: Here,     chain: [["soon", 4, 4, 1]],
    streamed: [["item", "soon", 4, 4, 1]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'a soon at its highest, a chunk later' },
  { initial: Here,     chain: [["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4, 1]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'a full record at its highest, a chunk later' },
  // On dead: a tombstone of life 5, each record of the alphabet that a chunk later makes news:
  { initial: Dead,     chain: [["gone", 5, 0, 1]],
    streamed: [["item", "gone", 5, 0, 1]],
    agerank: "0000000005|0000000000|0000000000|00000001", blurb: 'its tombstone again, a chunk later' },
  // Longer chains, from nothing:
  { initial: Empty,    chain: [["void", -1, -1], ["soon", 4, 2], ["full", 4, 2], ["gone", 5, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1], ["item", "soon", 4, 2], ["life", "born", -1, -1, 4, 2], ["aged", "here", "bare", 4, 2], ["item", "full", 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'the first chain proposed: a void, a list, a get, a death' },
  { initial: Empty,    chain: [["full", 4, 2], ["full", 4, 2], ["soon", 4, 2], ["soon", 4, 1], ["full", 4, 1], ["gone", 3, 0], ["void", -1, -1]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2]],
    agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'repeats and olders return no events' },
  { initial: Empty,    chain: [["full", 4, 1], ["full", 4, 2], ["full", 4, 3]],
    streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1], ["item", "full", 4, 2], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'three writes in a row' },
  { initial: Empty,    chain: [["full", 4, 3], ["full", 4, 2], ["full", 4, 1]],
    streamed: [["item", "full", 4, 3], ["life", "born", null, null, 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'three writes arriving newest first' },
  { initial: Empty,    chain: [["soon", 4, 2], ["full", 4, 2], ["full", 4, 3]],
    streamed: [["item", "soon", 4, 2], ["life", "born", null, null, 4, 2], ["aged", null, "bare", 4, 2], ["item", "full", 4, 2], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a list, a get, a write' },
  { initial: Empty,    chain: [["soon", 4, 2], ["soon", 4, 2], ["soon", 4, 3], ["full", 4, 3]],
    streamed: [["item", "soon", 4, 2], ["life", "born", null, null, 4, 2], ["aged", null, "bare", 4, 2], ["item", "soon", 4, 3], ["aged", "bare", "bare", 4, 3], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a list twice, a write seen between, then its get' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 2]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2]],
    agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'a soon at the revision of the item' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 2], ["full", 4, 2], ["soon", 4, 3], ["full", 4, 3]],
    streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1], ["item", "soon", 4, 2], ["aged", "here", "cold", 4, 2], ["item", "full", 4, 2], ["item", "soon", 4, 3], ["aged", "here", "cold", 4, 3], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'each soon caught up before the next' },
  { initial: Empty,    chain: [["full", 4, 3], ["soon", 4, 2], ["soon", 4, 3], ["soon", 4, 4]],
    streamed: [["item", "full", 4, 3], ["life", "born", null, null, 4, 3], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000003|00000000", blurb: 'a full record ahead of its soons, then one soon past it' },
  { initial: Empty,    chain: [["soon", 4, 1], ["soon", 4, 3], ["soon", 4, 2], ["full", 4, 3]],
    streamed: [["item", "soon", 4, 1], ["life", "born", null, null, 4, 1], ["aged", null, "bare", 4, 1], ["item", "soon", 4, 3], ["aged", "bare", "bare", 4, 3], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'soons out of order over a bare item' },
  { initial: Empty,    chain: [["soon", 4, 5], ["full", 4, 2], ["full", 4, 1], ["full", 4, 5]],
    streamed: [["item", "soon", 4, 5], ["life", "born", null, null, 4, 5], ["aged", null, "bare", 4, 5], ["item", "full", 4, 2], ["aged", "bare", "cold", 4, 5], ["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a bare soon, filled from behind, then caught up' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 5], ["full", 4, 4], ["soon", 4, 3], ["full", 4, 5]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "soon", 4, 5], ["aged", "here", "cold", 4, 5], ["item", "full", 4, 4], ["aged", "cold", "cold", 4, 5], ["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a second full record between the item and the soon' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 6], ["full", 4, 2], ["full", 4, 4], ["full", 4, 3], ["full", 4, 7]],
    streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1], ["item", "soon", 4, 6], ["aged", "here", "cold", 4, 6], ["item", "full", 4, 2], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 4], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 7]],
    agerank: "0000000004|0000000007|0000000007|00000000", blurb: 'full records climbing under a soon, then past it' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 4], ["soon", 4, 6], ["full", 4, 4], ["full", 4, 6]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4], ["item", "soon", 4, 6], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 4], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 6]],
    agerank: "0000000004|0000000006|0000000006|00000000", blurb: 'the soon moves on while the item is cold' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 5], ["full", 4, 5], ["soon", 4, 5], ["full", 4, 4]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "soon", 4, 5], ["aged", "here", "cold", 4, 5], ["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'once here, nothing more at or under that revision' },
  { initial: Empty,    chain: [["full", 4, 2], ["gone", 5, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0], ["item", "full", 6, 0], ["life", "born", 5, 0, 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'die, be born, die' },
  { initial: Empty,    chain: [["gone", 5, 0], ["soon", 6, 0], ["gone", 5, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0], ["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'dead from the start, born by a soon, the old tombstone again' },
  { initial: Empty,    chain: [["gone", 5, 0], ["gone", 7, 0]],
    streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0], ["item", "gone", 7, 0], ["life", "died", 5, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'dead to dead, the life between unseen' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 6, 0], ["full", 6, 1]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "soon", 6, 0], ["life", "born", 4, 2, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a birth past an unseen death, seen by a soon' },
  { initial: Empty,    chain: [["full", 4, 2], ["full", 6, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "full", 6, 0], ["life", "born", 4, 2, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a birth past an unseen death, by a full record' },
  { initial: Empty,    chain: [["full", 4, 2], ["full", 8, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "full", 8, 0], ["life", "born", 4, 2, 8, 0]],
    agerank: "0000000008|0000000000|0000000000|00000000", blurb: 'two lives on, nothing seen between' },
  { initial: Empty,    chain: [["full", 4, 2], ["gone", 7, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "gone", 7, 0], ["life", "died", 4, 2, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'on to a later death, a life unseen' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 3], ["gone", 5, 0]],
    streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1], ["item", "soon", 4, 3], ["aged", "here", "cold", 4, 3], ["item", "gone", 5, 0], ["life", "died", 4, 3, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a death while cold' },
  { initial: Empty,    chain: [["soon", 4, 3], ["gone", 5, 0]],
    streamed: [["item", "soon", 4, 3], ["life", "born", null, null, 4, 3], ["aged", null, "bare", 4, 3], ["item", "gone", 5, 0], ["life", "died", 4, 3, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a death while bare' },
  { initial: Empty,    chain: [["full", 4, 2], ["gone", 5, 0], ["full", 4, 3], ["soon", 4, 9], ["gone", 5, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'records of the dead life after its tombstone' },
  { initial: Empty,    chain: [["gone", 5, 0], ["soon", 6, 2], ["full", 4, 9], ["full", 6, 1], ["full", 6, 2]],
    streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0], ["item", "soon", 6, 2], ["life", "born", 5, 0, 6, 2], ["aged", "here", "bare", 6, 2], ["item", "full", 6, 1], ["aged", "bare", "cold", 6, 2], ["item", "full", 6, 2]],
    agerank: "0000000006|0000000002|0000000002|00000000", blurb: 'a soon of a rebirth, a record of an old life, then catching up' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 2], ["soon", 6, 0], ["full", 4, 2], ["full", 6, 0]],
    streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1], ["item", "soon", 4, 2], ["aged", "here", "cold", 4, 2], ["item", "soon", 6, 0], ["life", "born", 4, 2, 6, 0], ["aged", "cold", "bare", 6, 0], ["item", "full", 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'cold across a rebirth: the catch-up of the old life comes too late' },
  { initial: Empty,    chain: [["gone", 5, 0], ["soon", 6, 0], ["soon", 6, 0], ["full", 6, 0], ["full", 6, 0]],
    streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0], ["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a rebirth seen twice and fetched twice' },
  { initial: Empty,    chain: [["full", 4, 7], ["gone", 5, 0], ["full", 6, 0], ["soon", 6, 1]],
    streamed: [["item", "full", 4, 7], ["life", "born", null, null, 4, 7], ["item", "gone", 5, 0], ["life", "died", 4, 7, 5, 0], ["item", "full", 6, 0], ["life", "born", 5, 0, 6, 0], ["item", "soon", 6, 1], ["aged", "here", "cold", 6, 1]],
    agerank: "0000000006|0000000001|0000000000|00000000", blurb: 'revisions start over in each life' },
  { initial: Empty,    chain: [["void", -1, -1], ["void", -1, -1]], streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1]],                      agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'a void twice' },
  { initial: Empty,    chain: [["void", -1, -1], ["void", 9, -1], ["void", -1, -1], ["void", 9, -1]],
    streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1], ["item", "void", 9, -1], ["life", "died", -1, -1, 9, -1]],
    agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void, then a void of a later life, each again' },
  { initial: Empty,    chain: [["full", 4, 2], ["void", 5, -1], ["full", 4, 3], ["soon", 4, 9]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "void", 5, -1], ["life", "died", 4, 2, 5, -1]],
    agerank: "0000000005|-000000001|-000000001|00000000", blurb: 'a void of a later life: records of the old life return no events' },
  { initial: Empty,    chain: [["full", 4, 2], ["void", 5, -1], ["soon", 6, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "void", 5, -1], ["life", "died", 4, 2, 5, -1], ["item", "soon", 6, 0], ["life", "born", 5, -1, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a void of a later life, then born, written and dead' },
  { initial: Empty,    chain: [["void", 5, -1], ["full", 4, 2], ["void", 9, -1]],
    streamed: [["item", "void", 5, -1], ["life", "died", null, null, 5, -1], ["item", "void", 9, -1], ["life", "died", 5, -1, 9, -1]],
    agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of each of two later lives, a record of an earlier life between' },
  { initial: Empty,    chain: [["full", 4, 1], ["void", -1, -1]], streamed: [["item", "full", 4, 1], ["life", "born", null, null, 4, 1]],                          agerank: "0000000004|0000000001|0000000001|00000000", blurb: 'a void after a record' },
  { initial: Empty,    chain: [["void", -1, -1], ["full", 4, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1], ["item", "full", 4, 0], ["life", "born", -1, -1, 4, 0]],
    agerank: "0000000004|0000000000|0000000000|00000000", blurb: 'a void, then a first write' },
  { initial: Empty,    chain: [["void", -1, -1], ["gone", 5, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1], ["item", "gone", 5, 0], ["life", "died", -1, -1, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a void, then a tombstone' },
  { initial: Empty,    chain: [["void", -1, -1], ["soon", 4, 0], ["full", 4, 0], ["soon", 4, 2], ["full", 4, 1], ["full", 4, 2], ["gone", 5, 0], ["soon", 6, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", null, null, -1, -1], ["item", "soon", 4, 0], ["life", "born", -1, -1, 4, 0], ["aged", "here", "bare", 4, 0], ["item", "full", 4, 0], ["item", "soon", 4, 2], ["aged", "here", "cold", 4, 2], ["item", "full", 4, 1], ["aged", "cold", "cold", 4, 2], ["item", "full", 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0], ["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a long life: void, born, written, behind, dead, born again, dead' },
  // Longer chains across chunks, from nothing:
  { initial: Empty,    chain: [["full", 4, 4, 1], ["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4, 1], ["life", "born", null, null, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'the same whole record twice in one chunk: the second returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", null, null, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000002", blurb: 'the same whole record again from an earlier chunk returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4], ["full", 4, 4, 1], ["full", 4, 4, 2]],
    streamed: [["item", "full", 4, 4], ["life", "born", null, null, 4, 4], ["item", "full", 4, 4, 1], ["item", "full", 4, 4, 2]],
    agerank: "0000000004|0000000004|0000000004|00000002", blurb: 'the same whole record in each of three chunks' },
  { initial: Empty,    chain: [["full", 4, 4], ["soon", 4, 4, 1], ["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4], ["life", "born", null, null, 4, 4], ["item", "soon", 4, 4, 1]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'here, then a soon at its revision a chunk later, then the full record in that chunk' },
  { initial: Empty,    chain: [["full", 4, 4, 1], ["full", 4, 3, 2], ["soon", 4, 3, 2]],
    streamed: [["item", "full", 4, 4, 1], ["life", "born", null, null, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'a record below the highest, in a later chunk, returns nothing' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 4], ["full", 4, 2, 1], ["soon", 4, 4, 1]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4], ["item", "soon", 4, 4, 1], ["aged", "cold", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000002|00000001", blurb: 'while cold: the revision of the item a chunk later returns nothing, the highest returns its item' },
  { initial: Empty,    chain: [["soon", 4, 3], ["soon", 4, 3, 1], ["full", 4, 3, 1]],
    streamed: [["item", "soon", 4, 3], ["life", "born", null, null, 4, 3], ["aged", null, "bare", 4, 3], ["item", "soon", 4, 3, 1], ["aged", "bare", "bare", 4, 3], ["item", "full", 4, 3, 1]],
    agerank: "0000000004|0000000003|0000000003|00000001", blurb: 'while bare: the soon a chunk later, then its full record in that chunk' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 4, 5, 1], ["full", 4, 5, 2]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", null, null, 4, 4], ["item", "full", 4, 5, 1], ["item", "full", 4, 5, 2]],
    agerank: "0000000004|0000000005|0000000005|00000002", blurb: 'a newer revision read earlier than the last sighting: its time starts over at its own' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 4, 5, 1], ["full", 4, 4, 3]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", null, null, 4, 4], ["item", "full", 4, 5, 1]],
    agerank: "0000000004|0000000005|0000000005|00000001", blurb: 'an older revision read later returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 6, 0, 1]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", null, null, 4, 4], ["item", "full", 6, 0, 1], ["life", "born", 4, 4, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000001", blurb: 'a later life read earlier' },
  { initial: Empty,    chain: [["full", 6, 0, 1], ["full", 4, 4, 2]],
    streamed: [["item", "full", 6, 0, 1], ["life", "born", null, null, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000001", blurb: 'an earlier life read later returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4, 3], ["full", 4, 4, 1], ["full", 4, 4, 2], ["full", 4, 4, 4]],
    streamed: [["item", "full", 4, 4, 3], ["life", "born", null, null, 4, 4], ["item", "full", 4, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000004", blurb: 'sightings out of order: only a chunk past the latest returns its item' },
  { initial: Empty,    chain: [["gone", 5, 0], ["gone", 5, 0, 1], ["gone", 5, 0, 1]],
    streamed: [["item", "gone", 5, 0], ["life", "died", null, null, 5, 0], ["item", "gone", 5, 0, 1]],
    agerank: "0000000005|0000000000|0000000000|00000001", blurb: 'a tombstone again a chunk later, then again in that chunk' },
  { initial: Empty,    chain: [["full", 4, 2], ["void", 5, -1, 1], ["void", 5, -1, 2]],
    streamed: [["item", "full", 4, 2], ["life", "born", null, null, 4, 2], ["item", "void", 5, -1, 1], ["life", "died", 4, 2, 5, -1], ["item", "void", 5, -1, 2]],
    agerank: "0000000005|-000000001|-000000001|00000002", blurb: 'a void of a later life, then again a chunk later' },
  { initial: Empty,    chain: [["soon", 4, 1], ["full", 4, 1, 1], ["soon", 4, 2, 1], ["full", 4, 2, 3], ["full", 4, 2, 2], ["soon", 4, 2, 4], ["gone", 5, 0, 4], ["gone", 5, 0, 5]],
    streamed: [["item", "soon", 4, 1], ["life", "born", null, null, 4, 1], ["aged", null, "bare", 4, 1], ["item", "full", 4, 1, 1], ["item", "soon", 4, 2, 1], ["aged", "here", "cold", 4, 2], ["item", "full", 4, 2, 3], ["item", "soon", 4, 2, 4], ["item", "gone", 5, 0, 4], ["life", "died", 4, 2, 5, 0], ["item", "gone", 5, 0, 5]],
    agerank: "0000000005|0000000000|0000000000|00000005", blurb: 'a life across chunks: listed, fetched, listed, fetched late, seen again, dead' },
]
// --

// == [Harness]: lifepathOf, lifeOf, recordOf, chunkOf, readTcOf, timeOf, agerankOf, agerankAtBoxOf, lifeHighOf, shorthandOf, isRaised

// At box/openai, a record of life n has the lifepath `n/n` and a void of life n `n/-000000001`, each n spelled as a
// lifeseq, so that lifepaths sort as the lives do. A void's own lifeseq is always the shell's, so its life is its parent's.
// The void of life -1, nothing ever stored, sits under the parent's life 0, as the record checks refuse the shell's lifeseq
// anywhere but last: it sorts below every record of life 0 and up, and no row has a void of life 0.

/** The lifepath at box/openai of a record or a void of `life` */
function lifepathOf(life: Life, isVoid: boolean): Lifepath {
  if (isVoid) { return `${Lifeseq.ofLifenum(Math.max(life, 0))}/${VoidLifeseq}` }
  return `${Lifeseq.ofLifenum(life)}/${Lifeseq.ofLifenum(life)}`
}

/** The life a lifepath of {@link lifepathOf} stands for */
function lifeOf(lifepath: Lifepath): Life {
  const parent = Lifeseq.lifenumOf(Lifeseq.leadingOf(lifepath))
  return ((parent === 0) && (Lifeseq.ofLifepath(lifepath) === VoidLifeseq)) ? -1 : parent
}

/** The record `seen` names, at box/openai */
function recordOf([liveness, life, revseq]: Seen): SeenThing {
  const lifepath = lifepathOf(life, liveness === 'void')
  if (liveness === 'void') { return Shell.of({ ...TH.BoxScope, lifepath }) }
  const whole = TH.boxThingOf('openai', { am: (liveness === 'gone') ? 'x' : 'a', lifepath, lifeseq: Lifeseq.ofLifepath(lifepath), revseq })
  return (liveness === 'soon') ? Thing.sparseOf(whole) : whole
}

/** The chunk `seen` was read in */
function chunkOf(seen: Seen): Chunk { return seen[3] ?? 0 }

// A chunk's read_tc is a UUID version 7 whose first eight hexadecimal digits spell the chunk's number: chunk 0 is the
// first 65.536 seconds of 1970.
/** A read_tc in `chunk` */
function readTcOf(chunk: Chunk): ReadTc { return `${timeOf(chunk)}-0000-7000-8000-000000000000` }

/** A read_tc in chunk 0 */
const ReadTcChunk0 = readTcOf(0)

/** The time an agerank keeps of a read_tc in `chunk` */
function timeOf(chunk: Chunk): string { return chunk.toString(16).padStart(8, '0') }

/** The agerank at box/openai of a record's life and these revseqs, its newest revision last seen in `chunk`, spelled apart from the sorter */
function agerankOf(life: Life, highRevseq: number, itemRevseq: number, chunk: Chunk = 0): Agerank {
  return `${lifepathOf(life, false)}|${Revseq.padded(highRevseq)}|${Revseq.padded(itemRevseq)}|${timeOf(chunk)}`
}

/** The table's `agerank` at box/openai: its life field becomes the lifepath that `seens` gave that life */
function agerankAtBoxOf(agerank: string, seens: readonly Seen[]): Agerank {
  const lifeEnd = agerank.indexOf('|')
  const life    = Lifeseq.lifenumOf(agerank.slice(0, lifeEnd))
  const isVoid  = seens.some(([liveness, lifeSeen]) => (liveness === 'void') && (lifeSeen === life))
  return `${lifepathOf(life, isVoid)}${agerank.slice(lifeEnd)}`
}

/** The life and highest revision of `agerank` */
function lifeHighOf(agerank: Agerank): readonly [Life, number] {
  const [lifepath = '', highPadded = ''] = agerank.split('|', 2)
  return [lifeOf(lifepath), Number.parseInt(highPadded, 32)]
}

/** `event`, returned for `record` read in `chunk`, as shorthand */
function shorthandOf(event: VaultEvent, record: SeenThing, chunk: Chunk = 0): Shorthand {
  switch (event.eventkind) {
  case 'item': {
    const item = ['item', event.liveness, lifeOf(record.lifepath), record.revseq] as const
    return (chunk === 0) ? item : [...item, chunk]
  }
  case 'life': {
    const [lifeWas, highWas] = (event.agerankWas === undefined) ? [null, null] : lifeHighOf(event.agerankWas)
    const [life, high] = lifeHighOf(event.agerank)
    return ['life', event.lifekind, lifeWas, highWas, life, high]
  }
  case 'aged': {
    const [life, high] = lifeHighOf(event.agerank)
    return ['aged', event.agekindWas ?? null, event.agekind, life, high]
  }
  }
}

/** True when `event`'s agerank is above the one before it */
function isRaised(event: VaultEvent): boolean {
  return (event.agerank !== undefined) && ((event.agerankWas === undefined) || (event.agerank > event.agerankWas))
}
// --

describe("FeedSorter.eventify, over the feed table", () => {
  for (const [rowIndex, { initial, chain, streamed, agerank, blurb }] of FeedCases.entries()) {
    it(`${blurb}, from ${StartNames.get(initial) ?? 'elsewhere'} (row ${String(rowIndex + 1)})`, () => {
      const sorter = new FeedSorter(TH.ThingBank)
      for (const seen of initial) { sorter.eventify(recordOf(seen), readTcOf(chunkOf(seen))) }
      const shorthands: Shorthand[] = []
      for (const seen of chain) {
        const record        = recordOf(seen)
        const agerankBefore = sorter.agerankAt(TH.BoxScope)
        const events        = sorter.eventify(record, readTcOf(chunkOf(seen)))
        const agerankAfter  = sorter.agerankAt(TH.BoxScope)
        shorthands.push(...events.map((event) => shorthandOf(event, record, chunkOf(seen))))
        const vals = events.flatMap((event) => (event.eventkind === 'item') ? [event.val] : [])
        expect(vals, 'a record taken comes first, as given').to.deep.equal((events.length === 0) ? [] : [record])
        for (const event of events) {
          expect(isRaised(event), 'each event raises the agerank').to.eq(true)
          expect([event.agerankWas, event.agerank], 'each event carries the agerank before and after its record').to.deep.equal([agerankBefore, agerankAfter])
        }
      }
      expect(shorthands).to.deep.equal(streamed)
      expect(sorter.agerankAt(TH.BoxScope)).to.eq(agerankAtBoxOf(agerank, [...initial, ...chain]))
    })
  }
})

describe("FeedSorter", () => {
  it("returns each event with the scope and modelkind of its record, and the item with the record as given", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    const record = Thing.sparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const events = sorter.eventify(record, ReadTcChunk0)
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life', 'aged'])
    expect(events[0]).to.include({ liveness: 'soon', val: record })
    for (const event of events) {
      expect(event).to.deep.include({ userid: 'u1', banklabel: 'acme', labelpath: 'box/openai', modelkind: 'box', agerankWas: undefined, bank_lifetok: undefined, sourcelabel: undefined, read_tc: ReadTcChunk0 })
    }
  })

  it("hands out frozen events in a frozen list", () => {
    const events = new FeedSorter(TH.ThingBank).eventify(TH.boxThingOf(), ReadTcChunk0)
    expect(Object.isFrozen(events)).to.eq(true)
    expect(events.every((event) => Object.isFrozen(event))).to.eq(true)
  })

  it("returns no events, in a frozen list, for a record that raises nothing", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    sorter.eventify(TH.boxThingOf(), ReadTcChunk0)
    const events = sorter.eventify(TH.boxThingOf(), ReadTcChunk0)
    expect(events).to.deep.equal([])
    expect(Object.isFrozen(events)).to.eq(true)
  })

  it("keeps each Thing's agerank apart from another's", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    sorter.eventify(TH.boxThingOf('openai', { revseq: 2 }), ReadTcChunk0)
    const otherEvents = sorter.eventify(Thing.sparseOf(TH.boxThingOf('other', { revseq: 1 })), ReadTcChunk0)
    expect(otherEvents.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life', 'aged'])
    expect(otherEvents.every(({ labelpath, agerankWas }) => (labelpath === 'box/other') && (agerankWas === undefined))).to.eq(true)
    expect(sorter.eventify(TH.boxThingOf('openai', { revseq: 1 }), ReadTcChunk0)).to.deep.equal([])
    expect(sorter.agerankAt(TH.BoxScope)).to.eq(agerankOf(0, 2, 2))
    expect(sorter.agerankAt({ ...TH.ThingBank, labelpath: 'box/other' })).to.eq(agerankOf(0, 1, -1))
  })

  it("answers no agerank for a Thing it has taken no record of", () => {
    expect(new FeedSorter(TH.ThingBank).agerankAt(TH.BoxScope)).to.eq(undefined)
  })

  it("counts a sparse tombstone as whole, so a dead life reads here", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    sorter.eventify(TH.boxThingOf('openai', { revseq: 2 }), ReadTcChunk0)
    sorter.eventify(Thing.sparseOf(TH.boxThingOf('openai', { revseq: 4 })), ReadTcChunk0)
    const tomb = Thing.sparseOf(TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(5, false), lifeseq: Lifeseq.ofLifenum(5), revseq: 3 }))
    const events = sorter.eventify(tomb, ReadTcChunk0)
    expect(events.map((event) => shorthandOf(event, tomb))).to.deep.equal([["item", "gone", 5, 3], ["life", "died", 0, 4, 5, 3]])
    expect(sorter.agerankAt(TH.BoxScope)).to.eq(agerankOf(5, 3, 3))
  })

  it("orders revisions past the first base-32 digit", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    sorter.eventify(TH.boxThingOf('openai', { revseq: 31 }), ReadTcChunk0)
    const events = sorter.eventify(Thing.sparseOf(TH.boxThingOf('openai', { revseq: 32 })), ReadTcChunk0)
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'aged'])
    expect(events.every((event) => isRaised(event))).to.eq(true)
    expect(sorter.agerankAt(TH.BoxScope)).to.eq(agerankOf(0, 32, 31))
  })

  it("takes a root's records, its lifepath a single lifeseq", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    expect(sorter.eventify(Shell.of(TH.RootScope), ReadTcChunk0).map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(sorter.eventify(TH.rootBoxOf(), ReadTcChunk0).map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(sorter.agerankAt(TH.RootScope)).to.eq(`${TH.Life0}|${Revseq.padded(0)}|${Revseq.padded(0)}|${timeOf(0)}`)
  })

  it("keeps as an agerank's time the first eight hexadecimal digits of the read_tc, and puts the read_tc on each event", () => {
    const read_tc = readTcNow()
    const events = new FeedSorter(TH.ThingBank).eventify(TH.boxThingOf(), read_tc)
    expect(events.map((event) => event.read_tc)).to.deep.equal([read_tc, read_tc])
    expect(events[0]!.agerank).to.eq(`${lifepathOf(0, false)}|${Revseq.padded(0)}|${Revseq.padded(0)}|${read_tc.slice(0, 8)}`)
  })

  it("takes the newest revision seen again a chunk later, its agerank raised in its time alone", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    sorter.eventify(TH.boxThingOf(), ReadTcChunk0)
    expect(sorter.eventify(TH.boxThingOf(), ReadTcChunk0)).to.deep.equal([])
    const events = sorter.eventify(TH.boxThingOf(), readTcOf(1))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item'])
    expect([events[0]!.agerankWas, events[0]!.agerank]).to.deep.equal([agerankOf(0, 0, 0, 0), agerankOf(0, 0, 0, 1)])
  })
})

describe("FeedSorter refusals", () => {
  const live = TH.boxThingOf('openai', { revseq: 2 })
  const RefusedCases = [
    // not a record:
    [42,                                                  'a number'],
    [null,                                                'null'],
    [{},                                                  'an empty bag'],
    // a record the sorter cannot order:
    [{ ...live, userid: "u2" },                           'a record of another user'],
    [{ ...live, banklabel: "other" },                     'a record of another bank'],
    [{ ...live, lifepath: TH.Life0, lifeseq: TH.Life0 },  'a lifepath shallower than its labelpath'],
    [{ ...Thing.sparseOf(live), ...Shell.Cited },         "the root's shell cited at a box under it"],
    [{ ...live, am: "x" },                                'a tombstone in a live life'],
    [{ ...live, am: "d" },                                'a record marked for deletion'],
  ] as const

  for (const [val, blurb] of RefusedCases) {
    it(`refuses ${blurb}, its agerank unchanged`, () => {
      const sorter = new FeedSorter(TH.ThingBank)
      sorter.eventify(TH.boxThingOf('openai', { revseq: 1 }), ReadTcChunk0)
      TH.expectSyncRefusal(() => sorter.eventify(val as never, ReadTcChunk0), 'bad_record')
      expect(sorter.agerankAt(TH.BoxScope)).to.eq(agerankOf(0, 1, 1))
    })
  }

  it("refuses a read_tc that is no UUID version 7, its agerank unchanged", () => {
    const sorter = new FeedSorter(TH.ThingBank)
    sorter.eventify(TH.boxThingOf('openai', { revseq: 1 }), ReadTcChunk0)
    TH.expectSyncRefusal(() => sorter.eventify(TH.boxThingOf('openai', { revseq: 2 }), crypto.randomUUID()), 'bad_record')
    TH.expectSyncRefusal(() => sorter.eventify(TH.boxThingOf('openai', { revseq: 2 }), undefined as never), 'bad_record')
    expect(sorter.agerankAt(TH.BoxScope)).to.eq(agerankOf(0, 1, 1))
  })

  it("refuses to be made without a bank's scope", () => {
    TH.expectSyncRefusal(() => new FeedSorter({ userid: 'u1' } as never), 'bad_record')
  })

  it("refuses the agerank of another bank's Thing", () => {
    TH.expectSyncRefusal(() => new FeedSorter(TH.ThingBank).agerankAt({ ...TH.BoxScope, banklabel: 'other' }), 'bad_record')
  })
})
