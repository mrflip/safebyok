import { argon2id } from 'hash-wasm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Bank, type BankOpts, VaultError, isVaultError } from 'safebyok'
import { Argon2idWebV1, argon2idDeriver, argon2idWebV1Deriver, type KeyDeriver, type KeyDeriverSpec } from 'safebyok/browser'
import * as TH from 'safebyok/testing'
import { argon2idWasmDeriver, argon2idWasmWebV1Deriver } from '../src/wasm-deriver'

/** A host's own spec that is cheap to derive under. Its three counts all differ, so a test catches two of them being swapped. */
const CheapSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

/** The deriver's spec: its fields without `deriveKeyBytes`. */
const specOf = ({ deriveKeyBytes: _dropped, ...spec }: { deriveKeyBytes: unknown }) => spec

/** Make `saltBytes` bytes of varied salt, so a test catches a byte read from the wrong position. */
const saltOf = (saltBytes: number): Uint8Array => Uint8Array.from({ length: saltBytes }, (_unused, ii) => ((ii * 37) + 11) % 256)

/** The message of the `bad_option` refusal that `attempt` throws. */
const refusalOf = (attempt: () => unknown): string => TH.expectSyncRefusal(attempt, 'bad_option').message

/** Return what `attempt` rejects with. Throws if it resolves instead. */
const rejectionOf = async (attempt: Promise<unknown>): Promise<unknown> => {
  try {
    await attempt
  } catch (err) {
    return err
  }
  throw new Error('expected a rejection, but the promise resolved')
}

/** Format bytes as lowercase hex, the way test vectors are written. */
const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

/** An obviously fake whisper, stored on one device and read on another. */
const FakeWhisper = { apiKey: 'sk-fake-0000-not-a-real-key' }

/** Argon2id's output for 'correct horse battery staple' and `saltOf(16)` under the supplied spec. */
const SavedHex = 'efb4ef4c091ec9dacc4f1284c439742b414394599ffe4bbefc4dc300e4a4301b'

TH.useBankWorlds()

// The point of the package: the same spec, passphrase and salt must give the same bytes here as in the
// core's @noble/hashes deriver. Otherwise a vault made on one device would not open on another.
describe("argon2idWasmWebV1Deriver beside argon2idWebV1Deriver", () => {
  it("carries the supplied spec whole, frozen", () => {
    expect(specOf(argon2idWasmWebV1Deriver)).to.deep.equal(Argon2idWebV1)
    expect(specOf(argon2idWasmWebV1Deriver)).to.deep.equal(specOf(argon2idWebV1Deriver))
    expect(argon2idWasmWebV1Deriver).to.be.frozen
  })

  // Slow: two full derivations at 64 MiB and three passes. The core's deriver alone takes about half a second.
  it("derives byte for byte what the core's deriver derives, for one fixed passphrase and salt", { timeout: 60_000 }, async () => {
    const saltBytes = saltOf(Argon2idWebV1.salt_size)
    const wasmBytes = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    const nobleBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    expect(wasmBytes).to.have.lengthOf(32)
    expect([...wasmBytes]).to.deep.equal([...nobleBytes])
  })

  // The saved value came from calling hash-wasm's argon2id directly, and agrees with noble's argon2idAsync. Its parameters are the spec's:
  // memorySize 65_536, 3 iterations, 1 lane and 32 bytes, with the passphrase and saltOf(16) below. The core's browser.test.ts checks its own deriver against the same value.
  it("derives the saved value for one fixed passphrase and salt, at the supplied spec's cost", { timeout: 60_000 }, async () => {
    const wasmBytes = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    expect(hexOf(wasmBytes)).to.eq(SavedHex)
  })

  it("derives 32 deterministic bytes that change with the salt", { timeout: 60_000 }, async () => {
    const once = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    const again = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    const elsewhere = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', new Uint8Array(16).fill(8))
    expect(once).to.have.lengthOf(32)
    expect(once).to.deep.equal(again)
    expect(once).to.not.deep.equal(elsewhere)
  })
})

// Argon2id's own test vector, from its reference implementation (phc-winner-argon2's test.c:
// version 0x13, 2 passes, 64 MiB, one lane, "password" and "somesalt"). Its salt is 8 bytes, fewer than the
// 16 a keyDeriverSpec requires, so this test calls hash-wasm directly with the vector's parameters. The core's
// tests check noble against the same vector, so the two implementations cannot agree with each other merely by
// sharing a mistake.
describe("Argon2id's reference test vector", () => {
  const ReferenceHex = '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7'

  it("is what hash-wasm derives", { timeout: 60_000 }, async () => {
    const derived = await argon2id({
      password: 'password', salt: new TextEncoder().encode('somesalt'), iterations: 2, parallelism: 1, memorySize: 65_536, hashLength: 32, outputType: 'binary',
    })
    expect(hexOf(derived)).to.eq(ReferenceHex)
  })
})

// Cheap specs, each aimed at a place where two implementations could differ: memory that is not a multiple of
// four lanes' worth, several lanes, non-ASCII passphrases, and passphrases longer than one BLAKE2b block.
const SameBytesCases = [
  // regular usage:
  [{},                                                   "correct horse battery staple",  'a cheap spec of four lanes'],
  [{ parallelism: 1, iterations: 3 },                    "correct horse battery staple",  "one lane and three passes, the supplied spec's shape"],
  // where two implementations could differ:
  [{ memory_kib: 100, parallelism: 3 },                  "correct horse battery staple",  'memory that does not divide into four segments a lane'],
  [{ memory_kib: 37, parallelism: 2, iterations: 1 },    "correct horse battery staple",  'an odd memory, two lanes and a single pass'],
  [{ memory_kib: 8, parallelism: 1, iterations: 1 },     "correct horse battery staple",  "Argon2id's least memory and one pass"],
  [{ memory_kib: 1024, parallelism: 8 },                 "correct horse battery staple",  'eight lanes'],
  [{},                                                   "pässwörd mit Umlaut und 🔑",    'a passphrase past ASCII, encoded as UTF-8'],
  [{},                                                   "word ".repeat(40),              'a passphrase longer than one BLAKE2b block'],
  [{},                                                   " ",                             'a passphrase of one space, which a deriver takes as it is'],
  [{},                                                   "half a \u{D83D} key",           'a lone surrogate, which each encodes as U+FFFD'],
] as const

describe("argon2idWasmDeriver beside argon2idDeriver", () => {
  for (const [change, passphrase, blurb] of SameBytesCases) {
    it(`derives the same bytes under ${blurb}`, async () => {
      const spec = { ...CheapSpec, ...change }
      const saltBytes = saltOf(spec.salt_size)
      const wasmBytes = await argon2idWasmDeriver(spec).deriveKeyBytes(passphrase, saltBytes)
      const nobleBytes = await argon2idDeriver(spec).deriveKeyBytes(passphrase, saltBytes)
      expect(wasmBytes).to.have.lengthOf(32)
      expect([...wasmBytes]).to.deep.equal([...nobleBytes])
    })
  }

  it("derives differently under each parameter", async () => {
    const variants = [CheapSpec, { ...CheapSpec, memory_kib: 128 }, { ...CheapSpec, iterations: 3 }, { ...CheapSpec, parallelism: 2 }]
    const derived = await Promise.all(variants.map((spec) => argon2idWasmDeriver(spec).deriveKeyBytes('pw', saltOf(16))))
    const distinct = new Set(derived.map((bytes) => bytes.join(',')))
    expect(distinct.size).to.eq(variants.length)
  })
})

describe("argon2idWasmDeriver", () => {
  it("carries the whole spec beside its function, frozen", () => {
    const deriver = argon2idWasmDeriver(CheapSpec)
    expect(specOf(deriver)).to.deep.equal(CheapSpec)
    expect(deriver).to.be.frozen
  })

  it("takes a spec of the host's own, under its own label", () => {
    const deriver = argon2idWasmDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
    expect(deriver.key_deriver_label).to.eq('acme_argon2id_v1')
    expect(deriver.memory_kib).to.eq(131_072)
  })

  it("makes a deriver of the supplied spec too, the same one argon2idWasmWebV1Deriver is", () => {
    expect(specOf(argon2idWasmDeriver(Argon2idWebV1))).to.deep.equal(specOf(argon2idWasmWebV1Deriver))
  })

  it("ignores extra fields in the spec", async () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) } as KeyDeriverSpec
    const derived = await argon2idWasmDeriver(smuggled).deriveKeyBytes('pw', saltOf(16))
    expect(derived).to.not.deep.equal(new Uint8Array(32))
  })

  it("refuses a spec Argon2id cannot run, before deriving anything", () => {
    expect(() => argon2idWasmDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_size: 4 } as unknown as KeyDeriverSpec))
      .to.throw(/salt_size/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("refuses the supplied spec's label on other parameters", () => {
    expect(() => argon2idWasmDeriver({ ...Argon2idWebV1, iterations: 4 }))
      .to.throw(/argon2id_web_v1/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("refuses an empty passphrase as unlock() does, rather than with hash-wasm's plain Error", async () => {
    await expect(argon2idWasmDeriver(CheapSpec).deriveKeyBytes('', saltOf(16))).rejects.toThrow(VaultError)
    await expect(argon2idWasmDeriver(CheapSpec).deriveKeyBytes('', saltOf(16))).rejects.toThrow(/empty/u)
  })

  it("refuses a label safebyok reserves, as the core's deriver does, in the same words", () => {
    const spec = { ...CheapSpec, key_deriver_label: 'argon2id_web_v2' }
    expect(refusalOf(() => argon2idWasmDeriver(spec))).to.eq(refusalOf(() => argon2idDeriver(spec)))
    expect(refusalOf(() => argon2idWasmDeriver(spec))).to.include('reserved')
  })
})

// This package's factory and the core's `argon2idDeriver` both validate with the core's parseKeyDeriverSpec.
// These tests compare their refusal messages word for word, instead of restating the bounds.
const UnworkableSpecs = [
  [{ salt_size: 15 },                    'a salt of 15 bytes'],
  [{ salt_size: 32 },                    'a salt of 32 bytes'],
  [{ memory_kib: 64, parallelism: 9 },    'under 8 KiB for each of nine lanes'],
  [{ memory_kib: 1_048_577 },             'more than 1 GiB'],
  [{ iterations: 0 },                     'no passes over memory'],
  [{ parallelism: 0 },                    'no lanes'],
  [{ output_size: 16 },                  'a 128-bit key'],
  [{ algorithm: 'scrypt' },               'another key derivation function'],
  [{ key_deriver_label: '' },             'no label for a vault to record'],
] as const

describe("argon2idWasmDeriver's bounds", () => {
  for (const [change, blurb] of UnworkableSpecs) {
    it(`refuses ${blurb} in the core's own words`, () => {
      const spec = { ...CheapSpec, ...change } as unknown as KeyDeriverSpec
      expect(refusalOf(() => argon2idWasmDeriver(spec))).to.eq(refusalOf(() => argon2idDeriver(spec)))
    })
  }

  it("refuses what is not a spec at all", () => {
    for (const notSpec of [undefined, null, 'argon2id_web_v1', 65_536]) {
      expect(refusalOf(() => argon2idWasmDeriver(notSpec as unknown as KeyDeriverSpec))).to.include('memory_kib')
    }
  })

  it("allows the largest of each bound", () => {
    const lavish = { ...CheapSpec, memory_kib: 1_048_576, iterations: (2 ** 32) - 1, parallelism: 131_072 }
    expect(specOf(argon2idWasmDeriver(lavish))).to.deep.equal(lavish)
  })
})

/** Make two banks on one vaultDB, each on its own device with its own key deriver. */
const twoDevices = (firstDeriver: KeyDeriver, secondDeriver: KeyDeriver) => {
  const world = TH.makeBankWorld()
  return {
    world,
    first:  () => world.bankOn({ keyDeriver: firstDeriver }),
    second: (overrides: Partial<BankOpts> = {}) => world.bankOnAnotherDevice({ keyDeriver: secondDeriver, ...overrides }),
  }
}

/** Build and unlock the vault on `bank`, then store {@link FakeWhisper} in one of its boxes. */
const putFakeBox = async (bank: Bank): Promise<void> => {
  await bank.hello()
  const vault = await bank.ensureVault(TH.VaultScopeGiven)
  await vault.putBox({ boxlabel: 'openai', whisper: FakeWhisper })
}

/** Unlock the vault on `bank` (the test world's dialog types the passphrase), and check that the box the other device stored is there. */
const expectWhisperOpens = async (bank: Bank): Promise<void> => {
  const vault = await bank.ensureVault(TH.VaultScopeGiven)
  await vault.ensureUnlocked()
  const box = (await vault.getBox('openai'))!
  await box.expose()
  expect(box.whisper).to.deep.equal(FakeWhisper)
}

// Each test runs the real Argon2id at the supplied spec on both devices.
describe("a vault shared between the two derivers", () => {
  it("is accepted by Bank.make under the supplied label", async () => {
    const bank = TH.makeBankWorld().bankOn({ keyDeriver: argon2idWasmWebV1Deriver })
    await bank.hello()
    const vault = await bank.ensureVault(TH.VaultScopeGiven)
    expect(vault.isUnlocked).to.be.true
  })

  it("made through WebAssembly opens through the core's deriver", { timeout: 60_000 }, async () => {
    const devices = twoDevices(argon2idWasmWebV1Deriver, argon2idWebV1Deriver)
    const first = devices.first()
    await putFakeBox(first)
    const second = devices.second()
    await second.hello()
    await expectWhisperOpens(second)
  })

  it("made through the core's deriver opens through WebAssembly, and refuses a wrong passphrase there", { timeout: 60_000 }, async () => {
    const devices = twoDevices(argon2idWebV1Deriver, argon2idWasmWebV1Deriver)
    const first = devices.first()
    await putFakeBox(first)
    const mistyped = devices.second({
      requestCleartext: async (gating) => { await TH.expectBad(gating.attempt(TH.byPassphrase('correct horse battery stapler')), 'wrong_passphrase') },
    })
    await mistyped.hello()
    const vault = await mistyped.ensureVault(TH.VaultScopeGiven)
    await expect(vault.ensureUnlocked()).rejects.toThrow(/dismissed/u)
    const second = devices.second()
    await second.hello()
    await expectWhisperOpens(second)
  })
})

describe("where WebAssembly cannot run", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('hash-wasm')
    vi.resetModules()
  })

  it("refuses on a platform with no WebAssembly", async () => {
    vi.stubGlobal('WebAssembly', undefined)
    const attempt = argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    await expect(attempt).rejects.toThrow(VaultError)
    await expect(attempt).rejects.toThrow(/no WebAssembly/u)
  })

  it("refuses, naming the fix, when a Content-Security-Policy forbids compiling it", async () => {
    vi.doMock('hash-wasm', () => ({
      argon2id: () => Promise.reject(new WebAssembly.CompileError("WebAssembly.compile(): Refused to compile or instantiate WebAssembly module because 'wasm-unsafe-eval' is not an allowed source of script")),
    }))
    vi.resetModules()
    const Fresh = await import('../src/wasm-deriver')
    // A fresh import also loads a fresh copy of safebyok, and the error thrown is that copy's VaultError.
    const FreshCore = await import('safebyok')
    const refusal = await rejectionOf(Fresh.argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16)))
    expect(FreshCore.isVaultError(refusal, 'bad_option')).to.be.true
    expect((refusal as VaultError).message).to.include("'wasm-unsafe-eval'")
    expect((refusal as VaultError).cause).to.be.instanceOf(WebAssembly.CompileError)
  })

  it("never carries the passphrase in its refusal, nor in the refusal's cause", async () => {
    vi.doMock('hash-wasm', () => ({ argon2id: () => Promise.reject(new WebAssembly.CompileError('refused')) }))
    vi.resetModules()
    const Fresh = await import('../src/wasm-deriver')
    const refusal = await rejectionOf(Fresh.argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16)))
    const told = `${String(refusal)} ${String((refusal as VaultError).cause)} ${JSON.stringify(refusal)}`
    expect(told).to.not.include('correct horse')
  })

  it("rethrows unchanged a failure that is not a WebAssembly compile error", async () => {
    vi.doMock('hash-wasm', () => ({ argon2id: () => Promise.reject(new RangeError('WebAssembly.Memory.grow(): Maximum memory size exceeded')) }))
    vi.resetModules()
    const Fresh = await import('../src/wasm-deriver')
    await expect(Fresh.argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))).rejects.toThrow(RangeError)
  })
})
