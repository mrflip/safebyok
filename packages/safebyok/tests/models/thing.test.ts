import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { type Adoptable, Thing } from '../../src/models/thing'
import { type Lifepath, Lifeseq, Revseq, VoidLifeseq } from '../../src/shapes/primitives'
import { type ThingRecord, type ThingScope, Shell } from '../../src/shapes/shapes-thing'
import type { Agekind, Agerank, Lifekind, Liveness, ReadTc, SeenThing, VaultEvent, VaultItemEvent } from '../../src/shapes/shapes-vault-event'
import { readAtOf, readTcNow } from '../../src/storage/agerank'
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
    agerank: "0000000004|0000000005|0000000005|00000002", blurb: 'a newer revision read earlier than the last sighting: its tcchunk starts over at its own' },
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


// == [Harness]: lifepathOf, lifeOf, recordOf, chunkOf, readTcOf, readTcAt, tcchunkOf, eventOf, received, agerankOf, agerankAtBoxOf, lifeHighOf, shorthandOf, isNewer

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
  return (liveness === 'soon') ? TH.boxSparseOf(whole) : whole
}

// A subclass's adopt may check what it adopts, as Gate's does its wayins: this one refuses outright.
/** A Thing whose adopt throws for a record of revseq {@link RefusingThing.RefusedRevseq} */
class RefusingThing extends Thing<ThingRecord, ThingScope, undefined, Adoptable<ThingRecord>> {
  /** The revseq whose record this Thing's adopt refuses. */
  static readonly RefusedRevseq = 3
  /** What its adopt says as it refuses. */
  static readonly Refusal = "This record is refused."

  /** A Thing begun from `begun`. */
  static make(begun: Adoptable<ThingRecord>): RefusingThing { return new RefusingThing(begun) }

  /** Where this Thing is stored. */
  get scope(): ThingScope { return { userid: this.userid, banklabel: this.banklabel, labelpath: this.labelpath } }

  /** No stamp. */
  get stamp(): undefined { return }

  /** Adopt `record`, refusing one of revseq {@link RefusingThing.RefusedRevseq}. */
  protected override adopt(record: Adoptable<ThingRecord>): void {
    if (record.revseq === RefusingThing.RefusedRevseq) { throw new Error(RefusingThing.Refusal) }
    super.adopt(record)
  }
}

/** The chunk `seen` was read in */
function chunkOf(seen: Seen): Chunk { return seen[3] ?? 0 }

// A chunk's read_tc is a UUID version 7 whose first eight hexadecimal digits spell the chunk's number: chunk 0 is the
// first 65.536 seconds of 1970.
/** A read_tc in `chunk` */
function readTcOf(chunk: Chunk): ReadTc { return `${tcchunkOf(chunk)}-0000-7000-8000-000000000000` }

/** A read_tc read at `millis` past the epoch */
function readTcAt(millis: number): ReadTc {
  const hex = millis.toString(16).padStart(12, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`
}

/** A read_tc in chunk 0 */
const ReadTcChunk0 = readTcOf(0)

/** The tcchunk an agerank spells for a read_tc in `chunk` */
function tcchunkOf(chunk: Chunk): string { return chunk.toString(16).padStart(8, '0') }

/** The item event of `record` read at `read_tc`, as a VaultMinder builds it, with no source or bank lifetok */
function eventOf(record: SeenThing, read_tc: ReadTc = ReadTcChunk0): VaultItemEvent {
  return { ...TH.itemEventOf(record), read_tc }
}

/** Hand `thing`'s receive the event of `record` read at `read_tc`, a plain Thing begun from `record` where there is none yet, and return the Thing and the events it returns */
function received(thing: TH.PlainThing | undefined, record: SeenThing, read_tc: ReadTc = ReadTcChunk0): readonly [TH.PlainThing, readonly VaultEvent[]] {
  const receiver = thing ?? TH.PlainThing.make(record)
  return [receiver, receiver.receive(eventOf(record, read_tc))]
}

// The spread is the subject: what a host's `{ ...thing }` sees of a Thing.
/** `thing`'s props, as its spread shows them */
function propsOf(thing: TH.PlainThing): Record<string, unknown> { return { ...thing } } // eslint-disable-line @typescript-eslint/no-misused-spread

/** The agerank at box/openai of a record's life and these revseqs, its newest revision last seen in `chunk`, spelled apart from the rule */
function agerankOf(life: Life, highRevseq: number, itemRevseq: number, chunk: Chunk = 0): Agerank {
  return `${lifepathOf(life, false)}|${Revseq.padded(highRevseq)}|${Revseq.padded(itemRevseq)}|${tcchunkOf(chunk)}`
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
function isNewer(event: VaultEvent): boolean {
  return (event.agerank !== undefined) && ((event.agerankWas === undefined) || (event.agerank > event.agerankWas))
}
// --

describe("Thing.receive, over the feed table", () => {
  for (const [rowIndex, { initial, chain, streamed, agerank, blurb }] of FeedCases.entries()) {
    it(`${blurb}, from ${StartNames.get(initial) ?? 'elsewhere'} (row ${String(rowIndex + 1)})`, () => {
      let thing: TH.PlainThing | undefined
      for (const seen of initial) { [thing] = received(thing, recordOf(seen), readTcOf(chunkOf(seen))) }
      const shorthands: Shorthand[] = []
      for (const seen of chain) {
        const record        = recordOf(seen)
        const agerankBefore = thing?.agerank
        const [receiver, events] = received(thing, record, readTcOf(chunkOf(seen)))
        thing = receiver
        shorthands.push(...events.map((event) => shorthandOf(event, record, chunkOf(seen))))
        const vals = events.flatMap((event) => (event.eventkind === 'item') ? [event.val] : [])
        expect(vals, 'a record taken comes first, as given').to.deep.equal((events.length === 0) ? [] : [record])
        for (const event of events) {
          expect(isNewer(event), 'each event leaves the agerank greater').to.eq(true)
          expect([event.agerankWas, event.agerank], 'each event carries the agerank before and after its record').to.deep.equal([agerankBefore, thing.agerank])
        }
      }
      expect(shorthands).to.deep.equal(streamed)
      expect(thing?.agerank).to.eq(agerankAtBoxOf(agerank, [...initial, ...chain]))
    })
  }
})

describe("Thing.receive", () => {
  it("returns each event with the scope and modelkind of its record, and the item with the record as given", () => {
    const record = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const [, events] = received(undefined, record)
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life', 'aged'])
    expect(events[0]).to.include({ liveness: 'soon', val: record })
    for (const event of events) {
      expect(event).to.deep.include({ userid: 'u1', banklabel: 'acme', labelpath: 'box/openai', modelkind: 'box', agerankWas: undefined, banktok: undefined, sourcelabel: undefined, read_tc: ReadTcChunk0 })
    }
  })

  it("keeps the sourcelabel, read_tc and banktok of the event it receives on every event", () => {
    const record = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const stamp  = { sourcelabel: 'other_tab', read_tc: readTcNow(), banktok: TH.FirstLifetok }
    const events = TH.PlainThing.make(record).receive({ ...eventOf(record), ...stamp })
    expect(events).to.have.lengthOf(3)
    for (const event of events) { expect(event).to.include(stamp) }
  })

  it("hands out frozen events in a frozen list", () => {
    const [, events] = received(undefined, TH.boxThingOf())
    expect(Object.isFrozen(events)).to.eq(true)
    expect(events.every((event) => Object.isFrozen(event))).to.eq(true)
  })

  it("returns no events, in a frozen list, and changes nothing, for a record that is not news", () => {
    const [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 2 }))
    const before = [thing.agerank, thing.read_at, thing.citable, thing.pickle()]
    for (const record of [TH.boxThingOf('openai', { revseq: 2 }), TH.boxThingOf('openai', { revseq: 1 }), TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 1 }))]) {
      const events = thing.receive(eventOf(record, readTcOf(0)))
      expect(events).to.deep.equal([])
      expect(Object.isFrozen(events)).to.eq(true)
    }
    expect([thing.agerank, thing.read_at, thing.citable, thing.pickle()]).to.deep.equal(before)
  })

  it("returns no events for a life or aged event, and changes nothing", () => {
    const soon = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const [thing, events] = received(undefined, soon)
    const later = TH.PlainThing.make(soon).receive(eventOf(soon, readTcOf(2)))
    for (const event of [...events.slice(1), ...later.slice(1)]) {
      expect(thing.receive(event)).to.deep.equal([])
    }
    expect(thing.agerank).to.eq(agerankOf(0, 3, -1))
  })

  it("adopts a tombstone after a sparse record, so a dead life reads here", () => {
    let [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 2 }))
    ;[thing] = received(thing, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })))
    const tomb = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(5, false), lifeseq: Lifeseq.ofLifenum(5), revseq: 3 })
    const [, events] = received(thing, tomb)
    expect(events.map((event) => shorthandOf(event, tomb))).to.deep.equal([["item", "gone", 5, 3], ["life", "died", 0, 4, 5, 3]])
    expect(thing.agerank).to.eq(agerankOf(5, 3, 3))
    expect(thing.pickle()).to.eq(tomb)
  })

  it("orders revisions past the first base-32 digit", () => {
    const [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 31 }))
    const [, events] = received(thing, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 32 })))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'aged'])
    expect(events.every((event) => isNewer(event))).to.eq(true)
    expect(thing.agerank).to.eq(agerankOf(0, 32, 31))
  })

  it("takes a root's records, its lifepath a single lifeseq", () => {
    const [thing, voidEvents] = received(undefined, Shell.of(TH.RootScope))
    expect(voidEvents.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(received(thing, TH.rootBoxOf())[1].map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(thing.agerank).to.eq(`${TH.Life0}|${Revseq.padded(0)}|${Revseq.padded(0)}|${tcchunkOf(0)}`)
  })

  it("spells as an agerank's tcchunk the first eight hexadecimal digits of the read_tc, and puts the read_tc on each event", () => {
    const read_tc = readTcNow()
    const [, events] = received(undefined, TH.boxThingOf(), read_tc)
    expect(events.map((event) => event.read_tc)).to.deep.equal([read_tc, read_tc])
    expect(events[0]!.agerank).to.eq(`${lifepathOf(0, false)}|${Revseq.padded(0)}|${Revseq.padded(0)}|${read_tc.slice(0, 8)}`)
  })

  it("takes the newest revision seen again a chunk later, its agerank moved in its tcchunk alone", () => {
    const record  = TH.boxThingOf()
    const [thing] = received(undefined, record)
    expect(thing.receive(eventOf(record))).to.deep.equal([])
    const events = thing.receive(eventOf(record, readTcOf(1)))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item'])
    expect([events[0]!.agerankWas, events[0]!.agerank]).to.deep.equal([agerankOf(0, 0, 0, 0), agerankOf(0, 0, 0, 1)])
  })
})

describe("Thing.agekind", () => {
  const whole2 = TH.boxThingOf('openai', { revseq: 2 })
  const AgekindCases = [
    [[],                                                                        undefined, 'is undefined before any record'],
    [[whole2],                                                                  "here",    'is here once the newest revision is seen whole'],
    [[TH.boxSparseOf(whole2)],                                                  "bare",    'is bare while no revision of the life is seen whole'],
    [[whole2, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 }))],          "cold",    'is cold while an older revision of the life is seen whole'],
    [[whole2, TH.boxSparseOf(TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 0 }))], "bare", 'is bare for a later life seen only sparse, whatever was seen whole before'],
  ] as const
  for (const [seens, expected, blurb] of AgekindCases) {
    it(blurb, () => {
      const thing = TH.PlainThing.make(seens[0] ?? whole2)
      for (const seen of seens) { thing.receive(eventOf(seen)) }
      expect(thing.agekind).to.eq(expected)
    })
  }
})

describe("Thing's held record, the same object", () => {
  it("stays the record held for an equal one seen again a chunk later, while read_at and the agerank move", () => {
    const record  = TH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const [thing] = received(undefined, record)
    const events  = thing.receive(eventOf(structuredClone(record), readTcOf(1)))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item'])
    expect(thing.pickle()).to.equal(record)
    expect([thing.agerank, thing.read_at]).to.deep.equal([agerankOf(0, 0, 0, 1), readAtOf(readTcOf(1))])
  })

})

describe("thing.subscribe(listener)", () => {
  it("tells each subscriber once for each record that is news, a newer sparse revision among them, and for none that is not", () => {
    const whole2   = TH.boxThingOf('openai', { revseq: 2 })
    const thing    = TH.PlainThing.make(whole2)
    const listener = vi.fn()
    thing.subscribe(listener)
    thing.receive(eventOf(whole2))
    thing.receive(eventOf(whole2))
    thing.receive(eventOf(TH.boxThingOf('openai', { revseq: 1 })))
    expect(listener).toHaveBeenCalledOnce()
    const soon4 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 }))
    thing.receive(eventOf(soon4))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("tells a subscriber once the news is taken in, the Thing reading as the record it adopted", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    const thing  = TH.PlainThing.make(whole2)
    const read: unknown[] = []
    thing.subscribe(() => { read.push([thing.pickle(), thing.agerank]) })
    thing.receive(eventOf(whole2))
    expect(read).to.deep.equal([[whole2, thing.agerank]])
  })

  it("stops telling a listener once it unsubscribes", () => {
    const thing       = TH.PlainThing.make(TH.boxThingOf())
    const listener    = vi.fn()
    const unsubscribe = thing.subscribe(listener)
    unsubscribe()
    thing.receive(eventOf(TH.boxThingOf()))
    expect(listener).not.toHaveBeenCalled()
  })

  it("lets what a subscriber throws reach receive's caller, where its maker gave no bulletproofCallback", () => {
    const thing = TH.PlainThing.make(TH.boxThingOf())
    thing.subscribe(() => { throw new Error("a bug in the host") })
    expect(() => thing.receive(eventOf(TH.boxThingOf()))).to.throw("a bug in the host")
  })

  it("refuses a listener that is not a function", () => {
    const thing = TH.PlainThing.make(TH.boxThingOf())
    TH.expectSyncRefusal(() => thing.subscribe('call me' as never), 'bad_record')
  })
})

describe("Thing's props, record and citable", () => {
  it("adopts a record of each later life, every prop set again from it", () => {
    const live0 = TH.boxThingOf('openai', { revseq: 3 })
    const tomb1 = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(1, false), lifeseq: Lifeseq.ofLifenum(1), revseq: 4, written_at: TH.T0 + 9 })
    const live2 = TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 5, born_at: TH.T0 + 10, written_at: TH.T0 + 10 })
    let [thing] = received(undefined, live0)
    for (const record of [tomb1, live2]) {
      ;[thing] = received(thing, record)
      expect(thing).to.deep.include(Thing.sparseOf(record))
      expect(thing.pickle()).to.eq(record)
      expect(thing.citable).to.deep.equal(Thing.sparseOf(record))
    }
  })

  it("moves only citable on a newer soon, then adopts the whole record that catches up", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const [thing] = received(undefined, whole2)
    received(thing, TH.boxSparseOf(whole4))
    expect(thing.citable).to.deep.equal(Thing.sparseOf(whole4))
    expect(thing.pickle()).to.eq(whole2)
    expect(thing).to.include({ revseq: 2, revtok: whole2.revtok })
    received(thing, whole4)
    expect(thing.pickle()).to.eq(whole4)
    expect(thing).to.include({ revseq: 4, revtok: whole4.revtok })
    expect(thing.citable).to.deep.equal(Thing.sparseOf(whole4))
  })

  it("cites the Thing fields of a newer soon over a cold record: no body, nothing secret", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2, sidecar: { account: 'work' } })
    const soon4  = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four'), written_at: TH.T0 + 4 }))
    const [thing] = received(undefined, whole2)
    received(thing, soon4)
    expect(thing.agekind).to.eq('cold')
    expect(thing.citable).to.deep.equal(soon4)
    expect(thing.citable).to.not.have.any.keys('sidecar', 'whisper_sealed')
    expect(Object.isFrozen(thing.citable)).to.be.true
  })

  it("keeps citable at the newest revision when an older whole record is adopted", () => {
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const [thing] = received(undefined, TH.boxSparseOf(whole4))
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    expect(received(thing, whole2)[1].map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'aged'])
    expect(thing.pickle()).to.eq(whole2)
    expect(thing.citable).to.deep.include({ revseq: 4, revtok: whole4.revtok })
  })

  describe("begun by a soon", () => {
    const soon4 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') }))
    /** The shell at box/openai under the root box's life 0, which the soon's lifepath names */
    const shell = Shell.of({ ...TH.BoxScope, lifepath: lifepathOf(0, true) })

    it("pickles as the shell under the lives the soon names for the Things above it", () => {
      const [thing] = received(undefined, soon4)
      expect(thing.pickle()).to.deep.equal(shell)
      expect(thing.pickle()).to.include({ lifepath: `${TH.Life0}/${VoidLifeseq}` })
      expect(Object.isFrozen(thing.pickle())).to.eq(true)
    })

    it("pickles as the shell under a later life of the root box, where the soon names one", () => {
      const soon = TH.boxSparseOf(TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 1 }))
      expect(TH.PlainThing.make(soon).pickle()).to.deep.equal(Shell.of({ ...TH.BoxScope, lifepath: `${Lifeseq.ofLifenum(2)}/${VoidLifeseq}` }))
    })

    it("pickles as a root's own shell, begun by a soon of the root", () => {
      const soon = TH.boxSparseOf(TH.rootBoxOf({ revseq: 3 }))
      expect(TH.PlainThing.make(soon).pickle()).to.deep.equal(Shell.of(TH.RootScope))
    })

    it("has the shell's props", () => {
      const [thing] = received(undefined, soon4)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(shell))
    })

    it("cites the soon, and moves only its citable, agerank and read_at on a newer soon", () => {
      const [thing] = received(undefined, soon4)
      expect(thing.citable).to.deep.equal(soon4)
      expect([thing.agerank, thing.read_at]).to.deep.equal([agerankOf(0, 4, -1), 0])
      const soon5 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5, revtok: TH.revtokOf('five') }))
      received(thing, soon5, readTcOf(3))
      expect(thing.citable).to.deep.include({ revseq: 5, revtok: soon5.revtok })
      expect([thing.agerank, thing.read_at]).to.deep.equal([agerankOf(0, 5, -1, 3), readAtOf(readTcOf(3))])
      expect(thing.pickle()).to.deep.equal(shell)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(shell))
    })

    it("adopts a whole record in place of the shell, and its props follow", () => {
      const [thing] = received(undefined, soon4)
      const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
      received(thing, whole4)
      expect(thing.pickle()).to.eq(whole4)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(whole4))
      expect(thing.agerank).to.eq(agerankOf(0, 4, 4))
    })
  })

  it("adopts the record it is begun from where that is whole, a tombstone or the void sentinel", () => {
    const tomb = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(1, false), lifeseq: Lifeseq.ofLifenum(1), revseq: 0 })
    for (const record of [TH.boxThingOf(), tomb, Shell.of({ ...TH.BoxScope, lifepath: lifepathOf(0, true) })]) {
      const thing = TH.PlainThing.make(record)
      expect(thing.pickle()).to.eq(record)
      expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(record))
    }
  })

  it("has no agerank and no read_at until it first receives a record", () => {
    const thing = TH.PlainThing.make(TH.boxThingOf())
    expect([thing.agerank, thing.read_at]).to.deep.equal([undefined, undefined])
  })

  it("shows only its Thing fields in a spread, its keys and JSON", () => {
    const record = TH.boxThingOf()
    const [thing] = received(undefined, record)
    expect(Object.keys(thing)).to.have.members(Object.keys(Thing.sparseOf(record)))
    expect(propsOf(thing)).to.deep.equal(Thing.sparseOf(record))
    expect(JSON.stringify(thing)).to.eq(JSON.stringify(propsOf(thing)))
  })

  it("answers its Thing fields by name, and no body: a kind writes out its own", () => {
    const record = TH.boxThingOf()
    const thing = TH.PlainThing.make(record)
    expect(Object.getOwnPropertyNames(thing)).to.have.members(Object.keys(Thing.sparseOf(record)))
  })

  it("sets every Thing field non-writable, its scope fields non-configurable and the rest configurable", () => {
    const record = TH.boxThingOf()
    const thing = TH.PlainThing.make(record)
    const scopeFieldnames = new Set(['userid', 'banklabel', 'labelpath'])
    const thingFieldnames = Object.keys(Thing.sparseOf(record))
    for (const fieldname of thingFieldnames) {
      const configurable = ! scopeFieldnames.has(fieldname)
      expect(Object.getOwnPropertyDescriptor(thing, fieldname), fieldname).to.include({ writable: false, configurable })
    }
    expect(() => { (thing as { revseq: number }).revseq = 9 }).to.throw(TypeError)
    expect(Reflect.deleteProperty(thing, 'labelpath')).to.eq(false)
  })

  it("pickles to the very record it was made from, deeply frozen", () => {
    const record = TH.boxThingOf()
    const thing = TH.PlainThing.make(record)
    expect(thing.pickle()).to.eq(record)
    expect(Object.isFrozen(record.sidecar)).to.eq(true)
  })

  it("is the scope of its record, and has no stamp", () => {
    const thing = TH.PlainThing.make(TH.boxThingOf())
    expect(thing.scope).to.deep.equal(TH.BoxScope)
    expect(thing.stamp).to.eq(undefined)
  })

  it("is left as it was by a receive whose adopt throws", () => {
    const live2 = TH.boxThingOf('openai', { revseq: 2 })
    const thing = RefusingThing.make(live2)
    thing.receive(eventOf(live2))
    const before = [thing.agerank, thing.read_at, thing.citable, thing.pickle(), thing.revseq]
    const refused = TH.boxThingOf('openai', { revseq: RefusingThing.RefusedRevseq, revtok: TH.revtokOf('three') })
    expect(() => thing.receive(eventOf(refused, readTcOf(1)))).to.throw(RefusingThing.Refusal)
    expect([thing.agerank, thing.read_at, thing.citable, thing.pickle(), thing.revseq]).to.deep.equal(before)
  })
})

describe("Thing.read_at", () => {
  it("is the time in the first 48 bits of the read_tc that moved the agerank", () => {
    const [thing] = received(undefined, TH.boxThingOf(), '0190a1b2-c3d4-7000-8000-000000000000')
    expect(thing.read_at).to.eq(0x01_90_A1_B2_C3_D4)
  })

  it("is when a read_tc minted now was read", () => {
    const before  = Date.now()
    const read_tc = readTcNow()
    const [thing] = received(undefined, TH.boxThingOf(), read_tc)
    expect(thing.read_at).to.be.within(before, Date.now())
    expect(thing.read_at).to.eq(readAtOf(read_tc))
  })

  it("follows the newest revision: a newer one brings its own time, the same one the later, an older one none", () => {
    const [thing] = received(undefined, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })), readTcAt(500_000))
    received(thing, TH.boxThingOf('openai', { revseq: 2 }), readTcAt(900_000))
    expect(thing.read_at, 'an older whole record').to.eq(500_000)
    received(thing, TH.boxThingOf('openai', { revseq: 4 }), readTcAt(400_000))
    expect(thing.read_at, 'the newest revision whole, read earlier').to.eq(500_000)
    received(thing, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5 })), readTcAt(300_000))
    expect(thing.read_at, 'a newer revision').to.eq(300_000)
  })
})

describe("Thing refusals", () => {
  const live = TH.boxThingOf('openai', { revseq: 2 })
  const RefusedVals = [
    // not a record:
    [42,                                                  'a number'],
    [null,                                                'null'],
    [{},                                                  'an empty bag'],
    // a record no agerank can order, or of another Thing:
    [{ ...live, userid: "u2" },                           'a record of another user'],
    [{ ...live, banklabel: "other" },                     'a record of another bank'],
    [{ ...live, labelpath: "box/other", label: "other" }, 'a record of another Thing'],
    [{ ...live, lifepath: TH.Life0, lifeseq: TH.Life0 },  'a lifepath shallower than its labelpath'],
    [{ ...Thing.sparseOf(live), ...Shell.Cited },         "the root's shell cited at a box under it"],
    [{ ...live, am: "x" },                                'a tombstone in a live life'],
    [{ ...live, am: "d" },                                'a record marked for deletion'],
    // a record in no form a Thing receives:
    [Thing.sparseOf(TH.boxTombOf(live)),                  'a sparse tombstone'],
    [omit(live, ['whisper_sealed']),                      'a live box with half its body'],
  ] as const

  for (const [val, blurb] of RefusedVals) {
    it(`refuses an event whose val is ${blurb}, its agerank unchanged`, () => {
      const [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 1 }))
      TH.expectSyncRefusal(() => thing.receive({ ...eventOf(live), val } as never), 'bad_record')
      expect(thing.agerank).to.eq(agerankOf(0, 1, 1))
    })
  }

  const RefusedEvents = [
    [{ labelpath: "box/other" },                          'of another Thing'],
    [{ banklabel: "other" },                              'of another bank'],
    [{ eventkind: "seen" },                               'of an unknown kind'],
    [{ modelkind: "gate" },                               'whose modelkind is not its labelpath'],
    [{ liveness: "soon" },                                "whose liveness is not its val's"],
    [{ read_tc: crypto.randomUUID() },                    'read at a UUID other than version 7'],
    [{ read_tc: undefined },                              'read at no time'],
  ] as const

  for (const [fields, blurb] of RefusedEvents) {
    it(`refuses an event ${blurb}, its agerank unchanged`, () => {
      const [thing] = received(undefined, TH.boxThingOf('openai', { revseq: 1 }))
      TH.expectSyncRefusal(() => thing.receive({ ...eventOf(live), ...fields } as never), 'bad_record')
      expect(thing.agerank).to.eq(agerankOf(0, 1, 1))
    })
  }

  it("refuses to begin from anything but a record of a Thing", () => {
    for (const val of [undefined, 42, {}, { ...live, lifepath: TH.Life0, lifeseq: TH.Life0 }]) {
      TH.expectSyncRefusal(() => TH.PlainThing.make(val as never), 'bad_record')
    }
  })
})
