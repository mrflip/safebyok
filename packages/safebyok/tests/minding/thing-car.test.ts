/** A ThingCar: what `ThingCar.make` takes and makes; which records `receive` takes as news, over the feed table, and the events, agerank, citable and read_tc it keeps; and the refusal it keeps. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { Box } from '../../src/models/box'
import { Thing } from '../../src/models/thing'
import { ThingCar } from '../../src/minding/thing-car'
import type { CarWorld } from '../../src/shapes/shapes-vault-minder'
import { type Lifepath, Lifeseq, Revseq, VoidLifeseq } from '../../src/shapes/primitives'
import { Shell } from '../../src/shapes/shapes-thing'
import { type Agekind, type Agerank, type Lifekind, type Liveness, type ReadTc, type SeenThing, type VaultEvent, type VaultItemEvent, VaultDBSourcelabel } from '../../src/shapes/shapes-vault-event'
import { VacantAgerank, VacantReadTc, readAtOf, readTcNow } from '../../src/storage/agerank'
import * as TH from '../test-helpers'

/** A box's revisions: `two`, which a {@link TH.RefusingThing} takes, and `three` after it, which it refuses. */
const Revs = (() => {
  const two = TH.nextOf(TH.nextOf(TH.boxThingOf()))
  return { two, three: TH.nextOf(two) }
})()

/** A world that makes a {@link TH.RefusingThing} at each labelpath. */
const RefusingWorld: CarWorld<TH.RefusingThing> = Object.freeze({ makeThing: (shell) => TH.RefusingThing.make(shell) })

// == [Shorthand]: Life, Seen, Shorthand, FeedCase, the starts

/** A life at this scope, one number ordered as lifepaths are: even for a live life, odd for a dead one or a void */
type Life = number
/** A span of 65.536 seconds a record was read in, as a small whole number: 0 where it is left out */
type Chunk = number
/** A record, as `[liveness, life, revseq]`, or with the chunk it was read in after them */
type Seen = readonly [Liveness, Life, number] | readonly [Liveness, Life, number, Chunk]
/** An event: an item as its record is, a life or an aging with what stood before (`vacant` and -1 for the vacant agerank) and after */
type Shorthand =
  | readonly ['item', Liveness, Life, number]
  | readonly ['item', Liveness, Life, number, Chunk]
  | readonly ['life', Lifekind, Life | 'vacant', number, Life, number]
  | readonly ['aged', Agekind, Agekind, Life, number]
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
  { initial: Empty,    chain: [["void", -1, -1]],           streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1]],                    agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'void' },
  { initial: Empty,    chain: [["soon", 4, 4]],
    streamed: [["item", "soon", 4, 4], ["life", "born", "vacant", -1, 4, 4], ["aged", "vacant", "bare", 4, 4]],
    agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'bare: a soon at 4, no item' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 4]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000002|00000000", blurb: 'cold: an item at 2, a soon at 4' },
  { initial: Empty,    chain: [["full", 4, 4]],             streamed: [["item", "full", 4, 4], ["life", "born", "vacant", -1, 4, 4]],                        agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'here: an item at 4' },
  { initial: Empty,    chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0]],                        agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'dead: a tombstone of life 5' },
  // On nothing, each record of the alphabet:
  { initial: Empty,    chain: [["void", -1, -1]],           streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1]],                    agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'a void' },
  { initial: Empty,    chain: [["void", 9, -1]],            streamed: [["item", "void", 9, -1], ["life", "died", "vacant", -1, 9, -1]],                      agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void' },
  { initial: Empty,    chain: [["gone", 3, 0]],             streamed: [["item", "gone", 3, 0], ["life", "died", "vacant", -1, 3, 0]],                        agerank: "0000000003|0000000000|0000000000|00000000", blurb: 'a tombstone' },
  { initial: Empty,    chain: [["gone", 5, 0]],             streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0]],                        agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a tombstone' },
  { initial: Empty,    chain: [["gone", 7, 0]],             streamed: [["item", "gone", 7, 0], ["life", "died", "vacant", -1, 7, 0]],                        agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a tombstone' },
  { initial: Empty,    chain: [["soon", 2, 9]],             streamed: [["item", "soon", 2, 9], ["life", "born", "vacant", -1, 2, 9], ["aged", "vacant", "bare", 2, 9]], agerank: "0000000002|0000000009|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 1]],             streamed: [["item", "soon", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["aged", "vacant", "bare", 4, 1]], agerank: "0000000004|0000000001|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 2]],             streamed: [["item", "soon", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["aged", "vacant", "bare", 4, 2]], agerank: "0000000004|0000000002|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 3]],             streamed: [["item", "soon", 4, 3], ["life", "born", "vacant", -1, 4, 3], ["aged", "vacant", "bare", 4, 3]], agerank: "0000000004|0000000003|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 4]],             streamed: [["item", "soon", 4, 4], ["life", "born", "vacant", -1, 4, 4], ["aged", "vacant", "bare", 4, 4]], agerank: "0000000004|0000000004|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 4, 5]],             streamed: [["item", "soon", 4, 5], ["life", "born", "vacant", -1, 4, 5], ["aged", "vacant", "bare", 4, 5]], agerank: "0000000004|0000000005|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 6, 0]],             streamed: [["item", "soon", 6, 0], ["life", "born", "vacant", -1, 6, 0], ["aged", "vacant", "bare", 6, 0]], agerank: "0000000006|0000000000|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["soon", 6, 1]],             streamed: [["item", "soon", 6, 1], ["life", "born", "vacant", -1, 6, 1], ["aged", "vacant", "bare", 6, 1]], agerank: "0000000006|0000000001|-000000001|00000000", blurb: 'a soon' },
  { initial: Empty,    chain: [["full", 2, 9]],             streamed: [["item", "full", 2, 9], ["life", "born", "vacant", -1, 2, 9]],                        agerank: "0000000002|0000000009|0000000009|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 1]],             streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1]],                        agerank: "0000000004|0000000001|0000000001|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 2]],             streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2]],                        agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 3]],             streamed: [["item", "full", 4, 3], ["life", "born", "vacant", -1, 4, 3]],                        agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 4]],             streamed: [["item", "full", 4, 4], ["life", "born", "vacant", -1, 4, 4]],                        agerank: "0000000004|0000000004|0000000004|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 4, 5]],             streamed: [["item", "full", 4, 5], ["life", "born", "vacant", -1, 4, 5]],                        agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 6, 0]],             streamed: [["item", "full", 6, 0], ["life", "born", "vacant", -1, 6, 0]],                        agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a full record' },
  { initial: Empty,    chain: [["full", 6, 1]],             streamed: [["item", "full", 6, 1], ["life", "born", "vacant", -1, 6, 1]],                        agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a full record' },
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
    streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1], ["item", "soon", 4, 2], ["life", "born", -1, -1, 4, 2], ["aged", "here", "bare", 4, 2], ["item", "full", 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'the first chain proposed: a void, a list, a get, a death' },
  { initial: Empty,    chain: [["full", 4, 2], ["full", 4, 2], ["soon", 4, 2], ["soon", 4, 1], ["full", 4, 1], ["gone", 3, 0], ["void", -1, -1]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2]],
    agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'repeats and olders return no events' },
  { initial: Empty,    chain: [["full", 4, 1], ["full", 4, 2], ["full", 4, 3]],
    streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["item", "full", 4, 2], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'three writes in a row' },
  { initial: Empty,    chain: [["full", 4, 3], ["full", 4, 2], ["full", 4, 1]],
    streamed: [["item", "full", 4, 3], ["life", "born", "vacant", -1, 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'three writes arriving newest first' },
  { initial: Empty,    chain: [["soon", 4, 2], ["full", 4, 2], ["full", 4, 3]],
    streamed: [["item", "soon", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["aged", "vacant", "bare", 4, 2], ["item", "full", 4, 2], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a list, a get, a write' },
  { initial: Empty,    chain: [["soon", 4, 2], ["soon", 4, 2], ["soon", 4, 3], ["full", 4, 3]],
    streamed: [["item", "soon", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["aged", "vacant", "bare", 4, 2], ["item", "soon", 4, 3], ["aged", "bare", "bare", 4, 3], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'a list twice, a write seen between, then its get' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 2]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2]],
    agerank: "0000000004|0000000002|0000000002|00000000", blurb: 'a soon at the revision of the item' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 2], ["full", 4, 2], ["soon", 4, 3], ["full", 4, 3]],
    streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["item", "soon", 4, 2], ["aged", "here", "cold", 4, 2], ["item", "full", 4, 2], ["item", "soon", 4, 3], ["aged", "here", "cold", 4, 3], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'each soon caught up before the next' },
  { initial: Empty,    chain: [["full", 4, 3], ["soon", 4, 2], ["soon", 4, 3], ["soon", 4, 4]],
    streamed: [["item", "full", 4, 3], ["life", "born", "vacant", -1, 4, 3], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000003|00000000", blurb: 'a full record ahead of its soons, then one soon past it' },
  { initial: Empty,    chain: [["soon", 4, 1], ["soon", 4, 3], ["soon", 4, 2], ["full", 4, 3]],
    streamed: [["item", "soon", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["aged", "vacant", "bare", 4, 1], ["item", "soon", 4, 3], ["aged", "bare", "bare", 4, 3], ["item", "full", 4, 3]],
    agerank: "0000000004|0000000003|0000000003|00000000", blurb: 'soons out of order over a bare item' },
  { initial: Empty,    chain: [["soon", 4, 5], ["full", 4, 2], ["full", 4, 1], ["full", 4, 5]],
    streamed: [["item", "soon", 4, 5], ["life", "born", "vacant", -1, 4, 5], ["aged", "vacant", "bare", 4, 5], ["item", "full", 4, 2], ["aged", "bare", "cold", 4, 5], ["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a bare soon, filled from behind, then caught up' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 5], ["full", 4, 4], ["soon", 4, 3], ["full", 4, 5]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "soon", 4, 5], ["aged", "here", "cold", 4, 5], ["item", "full", 4, 4], ["aged", "cold", "cold", 4, 5], ["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'a second full record between the item and the soon' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 6], ["full", 4, 2], ["full", 4, 4], ["full", 4, 3], ["full", 4, 7]],
    streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["item", "soon", 4, 6], ["aged", "here", "cold", 4, 6], ["item", "full", 4, 2], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 4], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 7]],
    agerank: "0000000004|0000000007|0000000007|00000000", blurb: 'full records climbing under a soon, then past it' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 4], ["soon", 4, 6], ["full", 4, 4], ["full", 4, 6]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4], ["item", "soon", 4, 6], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 4], ["aged", "cold", "cold", 4, 6], ["item", "full", 4, 6]],
    agerank: "0000000004|0000000006|0000000006|00000000", blurb: 'the soon moves on while the item is cold' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 5], ["full", 4, 5], ["soon", 4, 5], ["full", 4, 4]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "soon", 4, 5], ["aged", "here", "cold", 4, 5], ["item", "full", 4, 5]],
    agerank: "0000000004|0000000005|0000000005|00000000", blurb: 'once here, nothing more at or under that revision' },
  { initial: Empty,    chain: [["full", 4, 2], ["gone", 5, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0], ["item", "full", 6, 0], ["life", "born", 5, 0, 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'die, be born, die' },
  { initial: Empty,    chain: [["gone", 5, 0], ["soon", 6, 0], ["gone", 5, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0], ["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'dead from the start, born by a soon, the old tombstone again' },
  { initial: Empty,    chain: [["gone", 5, 0], ["gone", 7, 0]],
    streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0], ["item", "gone", 7, 0], ["life", "died", 5, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'dead to dead, the life between unseen' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 6, 0], ["full", 6, 1]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "soon", 6, 0], ["life", "born", 4, 2, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 1]],
    agerank: "0000000006|0000000001|0000000001|00000000", blurb: 'a birth past an unseen death, seen by a soon' },
  { initial: Empty,    chain: [["full", 4, 2], ["full", 6, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "full", 6, 0], ["life", "born", 4, 2, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a birth past an unseen death, by a full record' },
  { initial: Empty,    chain: [["full", 4, 2], ["full", 8, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "full", 8, 0], ["life", "born", 4, 2, 8, 0]],
    agerank: "0000000008|0000000000|0000000000|00000000", blurb: 'two lives on, nothing seen between' },
  { initial: Empty,    chain: [["full", 4, 2], ["gone", 7, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "gone", 7, 0], ["life", "died", 4, 2, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'on to a later death, a life unseen' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 3], ["gone", 5, 0]],
    streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["item", "soon", 4, 3], ["aged", "here", "cold", 4, 3], ["item", "gone", 5, 0], ["life", "died", 4, 3, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a death while cold' },
  { initial: Empty,    chain: [["soon", 4, 3], ["gone", 5, 0]],
    streamed: [["item", "soon", 4, 3], ["life", "born", "vacant", -1, 4, 3], ["aged", "vacant", "bare", 4, 3], ["item", "gone", 5, 0], ["life", "died", 4, 3, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a death while bare' },
  { initial: Empty,    chain: [["full", 4, 2], ["gone", 5, 0], ["full", 4, 3], ["soon", 4, 9], ["gone", 5, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'records of the dead life after its tombstone' },
  { initial: Empty,    chain: [["gone", 5, 0], ["soon", 6, 2], ["full", 4, 9], ["full", 6, 1], ["full", 6, 2]],
    streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0], ["item", "soon", 6, 2], ["life", "born", 5, 0, 6, 2], ["aged", "here", "bare", 6, 2], ["item", "full", 6, 1], ["aged", "bare", "cold", 6, 2], ["item", "full", 6, 2]],
    agerank: "0000000006|0000000002|0000000002|00000000", blurb: 'a soon of a rebirth, a record of an old life, then catching up' },
  { initial: Empty,    chain: [["full", 4, 1], ["soon", 4, 2], ["soon", 6, 0], ["full", 4, 2], ["full", 6, 0]],
    streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["item", "soon", 4, 2], ["aged", "here", "cold", 4, 2], ["item", "soon", 6, 0], ["life", "born", 4, 2, 6, 0], ["aged", "cold", "bare", 6, 0], ["item", "full", 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'cold across a rebirth: the catch-up of the old life comes too late' },
  { initial: Empty,    chain: [["gone", 5, 0], ["soon", 6, 0], ["soon", 6, 0], ["full", 6, 0], ["full", 6, 0]],
    streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0], ["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000000", blurb: 'a rebirth seen twice and fetched twice' },
  { initial: Empty,    chain: [["full", 4, 7], ["gone", 5, 0], ["full", 6, 0], ["soon", 6, 1]],
    streamed: [["item", "full", 4, 7], ["life", "born", "vacant", -1, 4, 7], ["item", "gone", 5, 0], ["life", "died", 4, 7, 5, 0], ["item", "full", 6, 0], ["life", "born", 5, 0, 6, 0], ["item", "soon", 6, 1], ["aged", "here", "cold", 6, 1]],
    agerank: "0000000006|0000000001|0000000000|00000000", blurb: 'revisions start over in each life' },
  { initial: Empty,    chain: [["void", -1, -1], ["void", -1, -1]], streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1]],                    agerank: "-000000001|-000000001|-000000001|00000000", blurb: 'a void twice' },
  { initial: Empty,    chain: [["void", -1, -1], ["void", 9, -1], ["void", -1, -1], ["void", 9, -1]],
    streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1], ["item", "void", 9, -1], ["life", "died", -1, -1, 9, -1]],
    agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void, then a void of a later life, each again' },
  { initial: Empty,    chain: [["full", 4, 2], ["void", 5, -1], ["full", 4, 3], ["soon", 4, 9]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "void", 5, -1], ["life", "died", 4, 2, 5, -1]],
    agerank: "0000000005|-000000001|-000000001|00000000", blurb: 'a void of a later life: records of the old life return no events' },
  { initial: Empty,    chain: [["full", 4, 2], ["void", 5, -1], ["soon", 6, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "void", 5, -1], ["life", "died", 4, 2, 5, -1], ["item", "soon", 6, 0], ["life", "born", 5, -1, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a void of a later life, then born, written and dead' },
  { initial: Empty,    chain: [["void", 5, -1], ["full", 4, 2], ["void", 9, -1]],
    streamed: [["item", "void", 5, -1], ["life", "died", "vacant", -1, 5, -1], ["item", "void", 9, -1], ["life", "died", 5, -1, 9, -1]],
    agerank: "0000000009|-000000001|-000000001|00000000", blurb: 'a void of each of two later lives, a record of an earlier life between' },
  { initial: Empty,    chain: [["full", 4, 1], ["void", -1, -1]], streamed: [["item", "full", 4, 1], ["life", "born", "vacant", -1, 4, 1]],                        agerank: "0000000004|0000000001|0000000001|00000000", blurb: 'a void after a record' },
  { initial: Empty,    chain: [["void", -1, -1], ["full", 4, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1], ["item", "full", 4, 0], ["life", "born", -1, -1, 4, 0]],
    agerank: "0000000004|0000000000|0000000000|00000000", blurb: 'a void, then a first write' },
  { initial: Empty,    chain: [["void", -1, -1], ["gone", 5, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1], ["item", "gone", 5, 0], ["life", "died", -1, -1, 5, 0]],
    agerank: "0000000005|0000000000|0000000000|00000000", blurb: 'a void, then a tombstone' },
  { initial: Empty,    chain: [["void", -1, -1], ["soon", 4, 0], ["full", 4, 0], ["soon", 4, 2], ["full", 4, 1], ["full", 4, 2], ["gone", 5, 0], ["soon", 6, 0], ["full", 6, 0], ["gone", 7, 0]],
    streamed: [["item", "void", -1, -1], ["life", "died", "vacant", -1, -1, -1], ["item", "soon", 4, 0], ["life", "born", -1, -1, 4, 0], ["aged", "here", "bare", 4, 0], ["item", "full", 4, 0], ["item", "soon", 4, 2], ["aged", "here", "cold", 4, 2], ["item", "full", 4, 1], ["aged", "cold", "cold", 4, 2], ["item", "full", 4, 2], ["item", "gone", 5, 0], ["life", "died", 4, 2, 5, 0], ["item", "soon", 6, 0], ["life", "born", 5, 0, 6, 0], ["aged", "here", "bare", 6, 0], ["item", "full", 6, 0], ["item", "gone", 7, 0], ["life", "died", 6, 0, 7, 0]],
    agerank: "0000000007|0000000000|0000000000|00000000", blurb: 'a long life: void, born, written, behind, dead, born again, dead' },
  // Longer chains across chunks, from nothing:
  { initial: Empty,    chain: [["full", 4, 4, 1], ["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4, 1], ["life", "born", "vacant", -1, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'the same whole record twice in one chunk: the second returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", "vacant", -1, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000002", blurb: 'the same whole record again from an earlier chunk returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4], ["full", 4, 4, 1], ["full", 4, 4, 2]],
    streamed: [["item", "full", 4, 4], ["life", "born", "vacant", -1, 4, 4], ["item", "full", 4, 4, 1], ["item", "full", 4, 4, 2]],
    agerank: "0000000004|0000000004|0000000004|00000002", blurb: 'the same whole record in each of three chunks' },
  { initial: Empty,    chain: [["full", 4, 4], ["soon", 4, 4, 1], ["full", 4, 4, 1]],
    streamed: [["item", "full", 4, 4], ["life", "born", "vacant", -1, 4, 4], ["item", "soon", 4, 4, 1]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'here, then a soon at its revision a chunk later, then the full record in that chunk' },
  { initial: Empty,    chain: [["full", 4, 4, 1], ["full", 4, 3, 2], ["soon", 4, 3, 2]],
    streamed: [["item", "full", 4, 4, 1], ["life", "born", "vacant", -1, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000001", blurb: 'a record below the highest, in a later chunk, returns nothing' },
  { initial: Empty,    chain: [["full", 4, 2], ["soon", 4, 4], ["full", 4, 2, 1], ["soon", 4, 4, 1]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "soon", 4, 4], ["aged", "here", "cold", 4, 4], ["item", "soon", 4, 4, 1], ["aged", "cold", "cold", 4, 4]],
    agerank: "0000000004|0000000004|0000000002|00000001", blurb: 'while cold: the revision of the item a chunk later returns nothing, the highest returns its item' },
  { initial: Empty,    chain: [["soon", 4, 3], ["soon", 4, 3, 1], ["full", 4, 3, 1]],
    streamed: [["item", "soon", 4, 3], ["life", "born", "vacant", -1, 4, 3], ["aged", "vacant", "bare", 4, 3], ["item", "soon", 4, 3, 1], ["aged", "bare", "bare", 4, 3], ["item", "full", 4, 3, 1]],
    agerank: "0000000004|0000000003|0000000003|00000001", blurb: 'while bare: the soon a chunk later, then its full record in that chunk' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 4, 5, 1], ["full", 4, 5, 2]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", "vacant", -1, 4, 4], ["item", "full", 4, 5, 1], ["item", "full", 4, 5, 2]],
    agerank: "0000000004|0000000005|0000000005|00000002", blurb: 'a newer revision read earlier than the last sighting: its tcchunk starts over at its own' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 4, 5, 1], ["full", 4, 4, 3]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", "vacant", -1, 4, 4], ["item", "full", 4, 5, 1]],
    agerank: "0000000004|0000000005|0000000005|00000001", blurb: 'an older revision read later returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4, 2], ["full", 6, 0, 1]],
    streamed: [["item", "full", 4, 4, 2], ["life", "born", "vacant", -1, 4, 4], ["item", "full", 6, 0, 1], ["life", "born", 4, 4, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000001", blurb: 'a later life read earlier' },
  { initial: Empty,    chain: [["full", 6, 0, 1], ["full", 4, 4, 2]],
    streamed: [["item", "full", 6, 0, 1], ["life", "born", "vacant", -1, 6, 0]],
    agerank: "0000000006|0000000000|0000000000|00000001", blurb: 'an earlier life read later returns nothing' },
  { initial: Empty,    chain: [["full", 4, 4, 3], ["full", 4, 4, 1], ["full", 4, 4, 2], ["full", 4, 4, 4]],
    streamed: [["item", "full", 4, 4, 3], ["life", "born", "vacant", -1, 4, 4], ["item", "full", 4, 4, 4]],
    agerank: "0000000004|0000000004|0000000004|00000004", blurb: 'sightings out of order: only a chunk past the latest returns its item' },
  { initial: Empty,    chain: [["gone", 5, 0], ["gone", 5, 0, 1], ["gone", 5, 0, 1]],
    streamed: [["item", "gone", 5, 0], ["life", "died", "vacant", -1, 5, 0], ["item", "gone", 5, 0, 1]],
    agerank: "0000000005|0000000000|0000000000|00000001", blurb: 'a tombstone again a chunk later, then again in that chunk' },
  { initial: Empty,    chain: [["full", 4, 2], ["void", 5, -1, 1], ["void", 5, -1, 2]],
    streamed: [["item", "full", 4, 2], ["life", "born", "vacant", -1, 4, 2], ["item", "void", 5, -1, 1], ["life", "died", 4, 2, 5, -1], ["item", "void", 5, -1, 2]],
    agerank: "0000000005|-000000001|-000000001|00000002", blurb: 'a void of a later life, then again a chunk later' },
  { initial: Empty,    chain: [["soon", 4, 1], ["full", 4, 1, 1], ["soon", 4, 2, 1], ["full", 4, 2, 3], ["full", 4, 2, 2], ["soon", 4, 2, 4], ["gone", 5, 0, 4], ["gone", 5, 0, 5]],
    streamed: [["item", "soon", 4, 1], ["life", "born", "vacant", -1, 4, 1], ["aged", "vacant", "bare", 4, 1], ["item", "full", 4, 1, 1], ["item", "soon", 4, 2, 1], ["aged", "here", "cold", 4, 2], ["item", "full", 4, 2, 3], ["item", "soon", 4, 2, 4], ["item", "gone", 5, 0, 4], ["life", "died", 4, 2, 5, 0], ["item", "gone", 5, 0, 5]],
    agerank: "0000000005|0000000000|0000000000|00000005", blurb: 'a life across chunks: listed, fetched, listed, fetched late, seen again, dead' },
]
// --

// == [Harness]: lifepathOf, lifeOf, recordOf, chunkOf, readTcOf, readTcAt, tcchunkOf, eventOf, received, carReceived, agerankOf, agerankAtBoxOf, lifeHighOf, shorthandOf, isNewer, carFieldsOf

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

/** The chunk `seen` was read in */
function chunkOf(seen: Seen): Chunk { return seen[3] ?? 0 }

// A chunk's read_tc is a UUID version 7 whose first eight hexadecimal digits spell the chunk's number: chunk 0 is the
// first 65.536 seconds of 1970.
/** A read_tc in `chunk` */
function readTcOf(chunk: Chunk): ReadTc { return `${tcchunkOf(chunk)}-0000-7000-8000-000000000000` }

/** A read_tc in chunk 0 */
const ReadTcChunk0 = readTcOf(0)

/** The tcchunk an agerank spells for a read_tc in `chunk` */
function tcchunkOf(chunk: Chunk): string { return chunk.toString(16).padStart(8, '0') }

/** The item event of `record` read at `read_tc`, as a VaultMinder builds it, with no source or bank lifetok */
function eventOf(record: SeenThing, read_tc: ReadTc = ReadTcChunk0): VaultItemEvent {
  return { ...TH.itemEventOf(record), read_tc }
}

/** A read_tc read at `millis` past the epoch */
function readTcAt(millis: number): ReadTc {
  const hex = millis.toString(16).padStart(12, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`
}

/** Hand `car`'s receive the event of `record` read at `read_tc`, a car of a plain Thing made at `record`'s shell where there is none yet, and return the car and the events it returns */
function received(car: ThingCar | undefined, record: SeenThing, read_tc: ReadTc = ReadTcChunk0): readonly [ThingCar, readonly VaultEvent[]] {
  const receiver = car ?? ThingCar.make(Thing.shellOf(record), { world: TH.PlainWorld })
  return [receiver, receiver.receive(eventOf(record, read_tc))]
}

/** Have `car` receive the event of `record` read at `read_tc`, as {@link received} does, and return the car */
function carReceived(car: ThingCar | undefined, record: SeenThing, read_tc: ReadTc = readTcNow()): ThingCar { return received(car, record, read_tc)[0] }

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
    const [lifeWas, highWas] = (event.agerankWas === VacantAgerank) ? ['vacant', -1] as const : lifeHighOf(event.agerankWas)
    const [life, high] = lifeHighOf(event.agerank)
    return ['life', event.lifekind, lifeWas, highWas, life, high]
  }
  case 'aged': {
    const [life, high] = lifeHighOf(event.agerank)
    return ['aged', event.agekindWas, event.agekind, life, high]
  }
  }
}

/** True when `event`'s agerank is above the one before it */
function isNewer(event: VaultEvent): boolean { return event.agerank > event.agerankWas }

/** What `car` holds of its refusal and its read_tc, as a plain object */
function carFieldsOf(car: ThingCar): Pick<ThingCar, 'thing' | 'lastErr' | 'erred_at' | 'read_tc'> {
  return { thing: car.thing, lastErr: car.lastErr, erred_at: car.erred_at, read_tc: car.read_tc }
}
// --

describe("ThingCar.make(begun, { world })", () => {
  it("made from a Thing, carries that Thing, and has taken nothing", () => {
    const thing = TH.PlainThing.make(Thing.shellOf(TH.boxThingOf()))
    const car   = ThingCar.make(thing, { world: TH.PlainWorld })
    expect(carFieldsOf(car)).to.deep.equal({ thing, lastErr: null, erred_at: null, read_tc: VacantReadTc })
  })

  it("made from the shell, carries the Thing its world makes there, which has received nothing", () => {
    const makeThing = vi.fn(TH.makePlainThing)
    const shell     = Thing.shellOf(TH.boxThingOf())
    const car       = ThingCar.make(shell, { world: { makeThing } })
    expect(makeThing.mock.calls).to.deep.equal([[shell]])
    expect(car.thing).to.equal(makeThing.mock.results[0]!.value)
    expect([car.agekind, car.read_tc]).to.deep.equal(['vacant', VacantReadTc])
  })

  it("made from an item event, has the Thing its world makes at the record's shell receive it, and keeps when it was read", () => {
    const makeThing = vi.fn(TH.makePlainThing)
    const event     = TH.thingEventOf(TH.boxThingOf())
    const car       = ThingCar.make(event, { world: { makeThing } })
    expect(makeThing.mock.calls).to.deep.equal([[Thing.shellOf(event.val)]])
    expect(carFieldsOf(car)).to.deep.equal({ thing: car.thing, lastErr: null, erred_at: null, read_tc: event.read_tc })
    expect(car.thing.pickle()).to.equal(event.val)
  })

  it("made from an item event its Thing refuses, still answers the car, its Thing at the shell, keeping the refusal", () => {
    const car = ThingCar.make(TH.thingEventOf(Revs.three), { world: RefusingWorld })
    expect(car.thing.pickle()).to.deep.equal(Thing.shellOf(Revs.three))
    expect(car.lastErr?.refusalkind).to.eq('unexpected_error')
    expect(car.erred_at).to.be.a('number')
    expect(car.read_tc).to.eq(VacantReadTc)
  })

  it("carries the Thing of its kind that a device's world makes", () => {
    const car = ThingCar.make(Thing.shellOf(TH.boxThingOf()), { world: TH.makeDevice().world })
    expect(car.thing).to.be.instanceOf(Box)
  })

  it("throws where its world refuses to make the Thing, as a device's does a record of another bank", () => {
    TH.expectSyncRefusal(() => ThingCar.make(TH.thingEventOf({ ...TH.boxThingOf(), userid: 'u2' }), { world: TH.makeDevice().world }), 'record_conflict')
  })

  const RefusedBegun = [
    [null,                                                      'nothing at all'],
    [42,                                                        'a number'],
    [TH.boxThingOf(),                                           'a whole record with no item event'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), read_tc: undefined }, 'an item event read at no time'],
    [{ ...TH.thingEventOf(TH.boxThingOf()), banktok: 'none' },    'an item event whose banktok is no lifetok'],
  ] as const

  for (const [begun, blurb] of RefusedBegun) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => ThingCar.make(begun as never, { world: TH.PlainWorld }), 'bad_record')
    })
  }

  const RefusedOpts = [
    [undefined,                       'no options'],
    [{},                              'no world'],
    [{ world: { makeThing: 'plain' } }, 'a world whose makeThing is no function'],
  ] as const

  for (const [opts, blurb] of RefusedOpts) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => ThingCar.make(Thing.shellOf(TH.boxThingOf()), opts as never), 'bad_record')
    })
  }

  it("is frozen, its Thing its one own field", () => {
    const car = ThingCar.make(Thing.shellOf(TH.boxThingOf()), { world: TH.PlainWorld })
    expect(Object.isFrozen(car)).to.eq(true)
    expect(Object.keys(car)).to.deep.equal(['thing'])
  })
})

describe("car.receive(event)", () => {
  it("returns the events its Thing returns, and moves read_tc only for a record that is news", () => {
    const car     = ThingCar.make(Thing.shellOf(Revs.two), { world: TH.PlainWorld })
    const event   = TH.thingEventOf(Revs.two)
    const events  = car.receive(event)
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(car.read_tc).to.eq(event.read_tc)
    expect(car.receive({ ...event, read_tc: readTcNow() })).to.deep.equal([])
    expect(car.read_tc).to.eq(event.read_tc)
  })

  it("keeps and throws its Thing's refusal and when, then clears it at a record taken, keeping when", () => {
    const car = ThingCar.make(TH.thingEventOf(Revs.two), { world: RefusingWorld })
    TH.expectSyncRefusal(() => car.receive(TH.thingEventOf(Revs.three)), 'unexpected_error')
    const { lastErr, erred_at } = car
    expect(lastErr?.refusalkind).to.eq('unexpected_error')
    expect(erred_at).to.be.a('number')
    car.receive(TH.thingEventOf(Revs.two))
    expect([car.lastErr, car.erred_at]).to.deep.equal([null, erred_at])
  })

  it("throws the refusal its Thing raised, as a refusal", () => {
    const car = ThingCar.make(Thing.shellOf(Revs.two), { world: TH.PlainWorld })
    const err = TH.expectSyncRefusal(() => car.receive({ ...TH.thingEventOf(Revs.two), labelpath: 'box/other' }), 'bad_record')
    expect(car.lastErr).to.equal(err)
  })
})

describe("car.read_tc", () => {
  it("is the read_tc of the record that was news, its first 48 bits the time it was read", () => {
    const car = carReceived(undefined, TH.boxThingOf(), '0190a1b2-c3d4-7000-8000-000000000000')
    expect(car.read_tc).to.eq('0190a1b2-c3d4-7000-8000-000000000000')
    expect(readAtOf(car.read_tc)).to.eq(0x01_90_A1_B2_C3_D4)
  })

  it("is when a read_tc minted now was read", () => {
    const before  = Date.now()
    const read_tc = readTcNow()
    const car     = carReceived(undefined, TH.boxThingOf(), read_tc)
    expect(readAtOf(car.read_tc)).to.be.within(before, Date.now())
  })

  it("follows the newest revision: a newer one brings its own time, the same one the later, an older one none", () => {
    const car = carReceived(undefined, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })), readTcAt(500_000))
    carReceived(car, TH.boxThingOf('openai', { revseq: 2 }), readTcAt(900_000))
    expect(readAtOf(car.read_tc), 'an older whole record').to.eq(500_000)
    carReceived(car, TH.boxThingOf('openai', { revseq: 4 }), readTcAt(400_000))
    expect(readAtOf(car.read_tc), 'the newest revision whole, read earlier').to.eq(500_000)
    carReceived(car, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5 })), readTcAt(300_000))
    expect(readAtOf(car.read_tc), 'a newer revision').to.eq(300_000)
  })

  it("moves for the newest revision seen again a chunk later, its Thing holding the record it held", () => {
    const record = TH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const car    = carReceived(undefined, record, readTcAt(0))
    carReceived(car, structuredClone(record), readTcAt(70_000))
    expect(readAtOf(car.read_tc)).to.eq(70_000)
    expect(car.thing.pickle()).to.equal(record)
  })

  it("moves for a newer soon over a soon, its Thing at the shell", () => {
    const car = carReceived(undefined, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })), readTcAt(0))
    expect(car.read_tc).to.eq(readTcAt(0))
    carReceived(car, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5 })), readTcAt(200_000))
    expect(readAtOf(car.read_tc)).to.eq(200_000)
    expect(TH.PlainThing.isVoidSentinel(car.thing.pickle())).to.eq(true)
  })

  it("is left as it was by a record its Thing refuses, as is its citable", () => {
    const car     = ThingCar.make({ ...TH.thingEventOf(Revs.two), read_tc: readTcAt(1000) }, { world: RefusingWorld })
    const { citable } = car
    TH.expectSyncRefusal(() => car.receive({ ...TH.thingEventOf(Revs.three), read_tc: readTcAt(2000) }), 'unexpected_error')
    expect(car.read_tc).to.eq(readTcAt(1000))
    expect(car.citable).to.equal(citable)
  })
})

describe("car.citable", () => {
  it("made from a Thing, cites what the Thing holds: the shell, or a record", () => {
    const shell = Thing.shellOf(TH.boxThingOf())
    expect(ThingCar.make(TH.PlainThing.make(shell), { world: TH.PlainWorld }).citable).to.deep.equal(Thing.sparseOf(shell))
    const record = TH.boxThingOf('openai', { revseq: 2 })
    const thing  = TH.PlainThing.make(TH.thingEventOf(record))
    expect(ThingCar.make(thing, { world: TH.PlainWorld }).citable).to.deep.equal(Thing.sparseOf(record))
  })

  it("cites each record of a later life", () => {
    const live0 = TH.boxThingOf('openai', { revseq: 3 })
    const tomb1 = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(1, false), lifeseq: Lifeseq.ofLifenum(1), revseq: 4, written_at: TH.T0 + 9 })
    const live2 = TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 5, born_at: TH.T0 + 10, written_at: TH.T0 + 10 })
    const car = carReceived(undefined, live0)
    for (const record of [tomb1, live2]) {
      carReceived(car, record)
      expect(car.citable).to.deep.equal(Thing.sparseOf(record))
    }
  })

  it("moves on a newer soon, its Thing holding its record, then stays as the whole record that catches up is adopted", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const car = carReceived(undefined, whole2)
    carReceived(car, TH.boxSparseOf(whole4))
    expect(car.citable).to.deep.equal(Thing.sparseOf(whole4))
    expect(car.thing.pickle()).to.eq(whole2)
    carReceived(car, whole4)
    expect(car.thing.pickle()).to.eq(whole4)
    expect(car.citable).to.deep.equal(Thing.sparseOf(whole4))
  })

  it("cites the Thing fields of a newer soon over a cold record: no body, nothing secret, frozen", () => {
    const whole2 = TH.boxThingOf('openai', { revseq: 2, sidecar: { account: 'work' } })
    const soon4  = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four'), written_at: TH.T0 + 4 }))
    const car = carReceived(carReceived(undefined, whole2), soon4)
    expect(car.agekind).to.eq('cold')
    expect(car.citable).to.deep.equal(soon4)
    expect(car.citable).to.not.have.any.keys('sidecar', 'whisper_sealed')
    expect(Object.isFrozen(car.citable)).to.be.true
  })

  it("stays at the newest revision when an older whole record is adopted", () => {
    const whole4 = TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') })
    const whole2 = TH.boxThingOf('openai', { revseq: 2 })
    const [car]  = received(undefined, TH.boxSparseOf(whole4))
    expect(received(car, whole2)[1].map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'aged'])
    expect(car.thing.pickle()).to.eq(whole2)
    expect(car.citable).to.deep.include({ revseq: 4, revtok: whole4.revtok })
  })

  it("cites a soon over the shell, and a newer soon after it, its Thing at the shell", () => {
    const soon4 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4, revtok: TH.revtokOf('four') }))
    const soon5 = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 5, revtok: TH.revtokOf('five') }))
    const [car] = received(undefined, soon4)
    expect([car.citable, car.agerank]).to.deep.equal([soon4, agerankOf(0, 4, -1)])
    received(car, soon5, readTcOf(3))
    expect(car.citable).to.deep.include({ revseq: 5, revtok: soon5.revtok })
    expect(car.agerank).to.eq(agerankOf(0, 5, -1, 3))
    expect(car.thing.pickle()).to.deep.equal(Thing.shellOf(soon4))
  })
})

describe("car.receive, over the feed table", () => {
  for (const [rowIndex, { initial, chain, streamed, agerank, blurb }] of FeedCases.entries()) {
    it(`${blurb}, from ${StartNames.get(initial) ?? 'elsewhere'} (row ${String(rowIndex + 1)})`, () => {
      let car: ThingCar | undefined
      for (const seen of initial) { [car] = received(car, recordOf(seen), readTcOf(chunkOf(seen))) }
      const shorthands: Shorthand[] = []
      for (const seen of chain) {
        const record        = recordOf(seen)
        const agerankBefore = car?.agerank ?? VacantAgerank
        const [receiver, events] = received(car, record, readTcOf(chunkOf(seen)))
        car = receiver
        shorthands.push(...events.map((event) => shorthandOf(event, record, chunkOf(seen))))
        const vals = events.flatMap((event) => (event.eventkind === 'item') ? [event.val] : [])
        expect(vals, 'a record taken comes first, as given').to.deep.equal((events.length === 0) ? [] : [record])
        for (const event of events) {
          expect(isNewer(event), 'each event leaves the agerank greater').to.eq(true)
          expect([event.agerankWas, event.agerank], 'each event carries the agerank before and after its record').to.deep.equal([agerankBefore, car.agerank])
        }
      }
      expect(shorthands).to.deep.equal(streamed)
      expect(car?.agerank).to.eq(agerankAtBoxOf(agerank, [...initial, ...chain]))
    })
  }
})

describe("a car made from a Thing that holds a record", () => {
  const whole2 = TH.boxThingOf('openai', { revseq: 2 })

  it("starts from that record, seen whole at the VacantReadTc, and from the vacant agerank over the shell", () => {
    const held  = TH.PlainThing.make(eventOf(whole2, readTcOf(5)))
    const car   = ThingCar.make(held, { world: TH.PlainWorld })
    expect([car.agerank, car.agekind, car.read_tc]).to.deep.equal([agerankOf(0, 2, 2), 'here', VacantReadTc])
    const shell = TH.PlainThing.make(Thing.shellOf(whole2))
    expect(ThingCar.make(shell, { world: TH.PlainWorld }).agerank).to.eq(VacantAgerank)
  })

  it("calls neither that record nor an older one news, and the same revision news a chunk later, which its Thing declines", () => {
    const thing  = TH.PlainThing.make(eventOf(whole2))
    const car    = ThingCar.make(thing, { world: TH.PlainWorld })
    const older  = eventOf(TH.boxThingOf('openai', { revseq: 1 }), readTcOf(1))
    const again  = eventOf(structuredClone(whole2), readTcOf(1))
    expect(car.receive(eventOf(whole2))).to.deep.equal([])
    expect(car.receive(older)).to.deep.equal([])
    expect(car.receive(again).map(({ eventkind }) => eventkind)).to.deep.equal(['item'])
    expect(thing.pickle()).to.equal(whole2)
  })
})

describe("car.receive", () => {
  it("returns each event with the scope and modelkind of its record, and the item with the record as given", () => {
    const record = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const [, events] = received(undefined, record)
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life', 'aged'])
    expect(events[0]).to.include({ liveness: 'soon', val: record })
    for (const event of events) {
      expect(event).to.deep.include({ userid: 'u1', banklabel: 'acme', labelpath: 'box/openai', modelkind: 'box', agerankWas: VacantAgerank, banktok: SX.VoidLifeTok, sourcelabel: VaultDBSourcelabel, read_tc: ReadTcChunk0 })
    }
  })

  it("keeps the sourcelabel, read_tc and banktok of the event it receives on every event", () => {
    const record = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const stamp  = { sourcelabel: 'other_tab', read_tc: readTcNow(), banktok: TH.FirstLifetok }
    const events = ThingCar.make(Thing.shellOf(record), { world: TH.PlainWorld }).receive({ ...eventOf(record), ...stamp })
    expect(events).to.have.lengthOf(3)
    for (const event of events) { expect(event).to.include(stamp) }
  })

  it("hands out frozen events in a frozen list", () => {
    const [, events] = received(undefined, TH.boxThingOf())
    expect(Object.isFrozen(events)).to.eq(true)
    expect(events.every((event) => Object.isFrozen(event))).to.eq(true)
  })

  it("returns no events, in a frozen list, and changes nothing, for a record that is not news", () => {
    const [car] = received(undefined, TH.boxThingOf('openai', { revseq: 2 }))
    const before = [car.agerank, car.thing.pickle()]
    for (const record of [TH.boxThingOf('openai', { revseq: 2 }), TH.boxThingOf('openai', { revseq: 1 }), TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 1 }))]) {
      const events = car.receive(eventOf(record, readTcOf(0)))
      expect(events).to.deep.equal([])
      expect(Object.isFrozen(events)).to.eq(true)
    }
    expect([car.agerank, car.thing.pickle()]).to.deep.equal(before)
  })

  it("returns no events for a life or aged event, and changes nothing", () => {
    const soon = TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 3 }))
    const [car, events] = received(undefined, soon)
    const later = ThingCar.make(Thing.shellOf(soon), { world: TH.PlainWorld }).receive(eventOf(soon, readTcOf(2)))
    for (const event of [...events.slice(1), ...later.slice(1)]) {
      expect(car.receive(event)).to.deep.equal([])
    }
    expect(car.agerank).to.eq(agerankOf(0, 3, -1))
  })

  it("adopts a tombstone after a sparse record, so a dead life reads here", () => {
    let [car] = received(undefined, TH.boxThingOf('openai', { revseq: 2 }))
    ;[car] = received(car, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 })))
    const tomb = TH.boxThingOf('openai', { am: 'x', lifepath: lifepathOf(5, false), lifeseq: Lifeseq.ofLifenum(5), revseq: 3 })
    const [, events] = received(car, tomb)
    expect(events.map((event) => shorthandOf(event, tomb))).to.deep.equal([["item", "gone", 5, 3], ["life", "died", 0, 4, 5, 3]])
    expect(car.agerank).to.eq(agerankOf(5, 3, 3))
    expect(car.thing.pickle()).to.eq(tomb)
  })

  it("orders revisions past the first base-32 digit", () => {
    const [car] = received(undefined, TH.boxThingOf('openai', { revseq: 31 }))
    const [, events] = received(car, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 32 })))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'aged'])
    expect(events.every((event) => isNewer(event))).to.eq(true)
    expect(car.agerank).to.eq(agerankOf(0, 32, 31))
  })

  it("takes a root's records, its lifepath a single lifeseq", () => {
    const [car, voidEvents] = received(undefined, Shell.of(TH.RootScope))
    expect(voidEvents.map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(received(car, TH.rootBoxOf())[1].map(({ eventkind }) => eventkind)).to.deep.equal(['item', 'life'])
    expect(car.agerank).to.eq(`${TH.Life0}|${Revseq.padded(0)}|${Revseq.padded(0)}|${tcchunkOf(0)}`)
  })

  it("spells as an agerank's tcchunk the first eight hexadecimal digits of the read_tc, and puts the read_tc on each event", () => {
    const read_tc = readTcNow()
    const [, events] = received(undefined, TH.boxThingOf(), read_tc)
    expect(events.map((event) => event.read_tc)).to.deep.equal([read_tc, read_tc])
    expect(events[0]!.agerank).to.eq(`${lifepathOf(0, false)}|${Revseq.padded(0)}|${Revseq.padded(0)}|${read_tc.slice(0, 8)}`)
  })

  it("takes the newest revision seen again a chunk later, its agerank moved in its tcchunk alone", () => {
    const record  = TH.boxThingOf()
    const [car] = received(undefined, record)
    expect(car.receive(eventOf(record))).to.deep.equal([])
    const events = car.receive(eventOf(record, readTcOf(1)))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item'])
    expect([events[0]!.agerankWas, events[0]!.agerank]).to.deep.equal([agerankOf(0, 0, 0, 0), agerankOf(0, 0, 0, 1)])
  })
})

describe("car.agekind", () => {
  const whole2 = TH.boxThingOf('openai', { revseq: 2 })
  const AgekindCases = [
    [[],                                                                        "vacant",  'is vacant before any record'],
    [[whole2],                                                                  "here",    'is here once the newest revision is seen whole'],
    [[TH.boxSparseOf(whole2)],                                                  "bare",    'is bare while no revision of the life is seen whole'],
    [[whole2, TH.boxSparseOf(TH.boxThingOf('openai', { revseq: 4 }))],          "cold",    'is cold while an older revision of the life is seen whole'],
    [[whole2, TH.boxSparseOf(TH.boxThingOf('openai', { lifepath: lifepathOf(2, false), lifeseq: Lifeseq.ofLifenum(2), revseq: 0 }))], "bare", 'is bare for a later life seen only sparse, whatever was seen whole before'],
  ] as const
  for (const [seens, expected, blurb] of AgekindCases) {
    it(blurb, () => {
      const car = ThingCar.make(Thing.shellOf(seens[0] ?? whole2), { world: TH.PlainWorld })
      for (const seen of seens) { car.receive(eventOf(seen)) }
      expect(car.agekind).to.eq(expected)
    })
  }
})

describe("Thing's held record, the same object", () => {
  it("stays the record held for an equal one seen again a chunk later, while the agerank moves", () => {
    const record  = TH.boxThingOf('openai', { sidecar: { account: 'work' } })
    const [car] = received(undefined, record)
    const events  = car.receive(eventOf(structuredClone(record), readTcOf(1)))
    expect(events.map(({ eventkind }) => eventkind)).to.deep.equal(['item'])
    expect(car.thing.pickle()).to.equal(record)
    expect(car.agerank).to.eq(agerankOf(0, 0, 0, 1))
  })

})

describe("car refusals", () => {
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
      const [car] = received(undefined, TH.boxThingOf('openai', { revseq: 1 }))
      TH.expectSyncRefusal(() => car.receive({ ...eventOf(live), val } as never), 'bad_record')
      expect(car.agerank).to.eq(agerankOf(0, 1, 1))
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
      const [car] = received(undefined, TH.boxThingOf('openai', { revseq: 1 }))
      TH.expectSyncRefusal(() => car.receive({ ...eventOf(live), ...fields } as never), 'bad_record')
      expect(car.agerank).to.eq(agerankOf(0, 1, 1))
    })
  }

  it("refuses to be made from anything but the shell or an item event", () => {
    const shallowShell = { ...Thing.shellOf(live), lifepath: VoidLifeseq }
    for (const val of [undefined, 42, {}, live, shallowShell, { ...eventOf(live), val: { ...live, lifepath: TH.Life0, lifeseq: TH.Life0 } }, { ...eventOf(live), sourcelabel: undefined }]) {
      TH.expectSyncRefusal(() => TH.PlainThing.make(val as never), 'bad_record')
    }
  })
})

