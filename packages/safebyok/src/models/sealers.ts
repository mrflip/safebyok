import { BX, CX, Clock, Crypto, SX, StableJsonify, Throwers } from 'safebyok-big/internals'

// == [The Sealer]: Sealed, SealPurposes, Sealer, isSealer

/** One sealed part's ciphertexts: its fresh key, wrapped under the bankKey, and the cleartext, ciphered under that key. */
export interface Sealed {
  keyWrapped: CX.Ciphered
  ciphered:   CX.Ciphered
}

/** The ctx purposes a sealed part's two ciphertexts are bound to. */
export interface SealPurposes {
  key:    string
  cipher: string
}

/** What a lease needs to know to seal one part of a record, so that the lease itself knows nothing of the record.
 * `AnteT` is the record without its sealed fields, `RecordT` the record with them.
 */
export interface Sealer<AnteT, RecordT, CleartextsT> {
  /** The next revision of `ante`, still without its sealed fields. */
  nextRevisionOf(ante: AnteT): AnteT
  /** What the seal of `record` is bound to, after the bank's stamp. A change to any of it refuses the unseal. */
  stampsOf(record: AnteT | RecordT): readonly Crypto.CipherCtxRecord[]
  /** The ctx purposes of the wrapped key and of the ciphertext. */
  readonly purposes: SealPurposes
  /** `cleartexts` as the text to cipher. */
  encode(cleartexts: CleartextsT): string
  /** The cleartexts in `text`, refusing as damaged when it will not parse or check. */
  decode(text: string): CleartextsT
  /** The ciphertexts in `record`. */
  sealedOf(record: RecordT): Sealed
  /** `next` with `sealed` laid in, checked and branded. */
  recordOf(next: AnteT, sealed: Sealed): RecordT
}

/** True for one of the sealers in this module, and nothing else. */
export function isSealer(val: unknown): val is Sealer<unknown, unknown, unknown> { return (val === BoxWhisperSealer) }
// --

// == [A box's whisper]: BoxAnte, BoxCleartexts, BoxWhisperSealer

/** A box's record without its sealed fields, live or a tombstone: what {@link BoxWhisperSealer} seals the next revision of. */
export type BoxAnte = Omit<BX.BoxRecord, 'box_key_wrapped' | 'whisper_ciphered' | 'am'> & { am: 'a' | 'x' }

/** What a box seals: its whisper. */
export interface BoxCleartexts {
  whisper: CX.Whisper
}

/** The checks of a box's ante. */
const boxAnte = BX.boxRecord.omit({ box_key_wrapped: true, whisper_ciphered: true, am: true }).extend({ am: SX.am.exclude(['d']) })

/** Seals a box's whisper, bound to every sparse field of the box: its scope, its life and its revision. Its sidecar stays in the clear. */
export const BoxWhisperSealer: Sealer<BoxAnte, BX.BoxRecord, BoxCleartexts> = Object.freeze({
  nextRevisionOf(ante: BoxAnte): BoxAnte {
    const parsed = boxAnte.parse(ante)
    const written_at = Clock.nowMillis()
    const next = { ...parsed, ...SX.nextRevisionOf(parsed, written_at), am: 'a' as const }
    // A box put over its tombstone starts a new life.
    return (parsed.am === 'x') ? { ...next, registered_at: written_at, box_tok: Crypto.makeLifeTok() } : next
  },

  stampsOf(record: BoxAnte | BX.BoxRecord): readonly Crypto.CipherCtxRecord[] { return [BX.boxSparse.parse(record)] },

  purposes: Object.freeze({ key: 'box_key_wrapped', cipher: 'whisper_ciphered' }),

  encode({ whisper }: BoxCleartexts): string { return StableJsonify.stableJsonify(CX.whisper.parse(whisper)) },

  decode(text: string): BoxCleartexts { return { whisper: deserializeWhisper(text) } },

  sealedOf(record: BX.BoxRecord): Sealed {
    const { box_key_wrapped, whisper_ciphered } = BX.boxRecord.parse(record)
    return { keyWrapped: box_key_wrapped, ciphered: whisper_ciphered }
  },

  recordOf(next: BoxAnte, { keyWrapped, ciphered }: Sealed): BX.BoxRecord {
    return BX.boxRecord.parse({ ...next, box_key_wrapped: keyWrapped, whisper_ciphered: ciphered })
  },
})
// --

// == [Helpers]: deserializeWhisper

// What JSON.parse throws is replaced, never kept as a cause: a SyntaxError can quote the text it failed on.
/** The whisper in the JSON `text`, or throw `damaged_whisper` */
function deserializeWhisper(text: string): CX.Whisper {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Throwers.undecodedWhisper()
  }
  const checked = CX.whisper.safeParse(parsed)
  if (! checked.success) { throw Throwers.undecodedWhisper() }
  return checked.data
}
// --
