import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Argon2idWebV1, VaultError, argon2idDeriver, argon2idWebV1Deriver, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, openVault,
  type KeyDeriver, type KeyDeriverSpec,
} from 'safebyok'
import { anyPassphraseTest } from 'safebyok/testing'
import * as TH from 'safebyok/testing'
import { argon2idWasmDeriver, argon2idWasmWebV1Deriver } from '../src/wasm-deriver'

/** A spec of the host's own, cheap to derive under; no two of its counts alike, so a swap shows. */
const CheapSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

/** The deriver's fields without its function: the spec it carries. */
const specOf = ({ deriveKeyBytes: _dropped, ...spec }: { deriveKeyBytes: unknown }) => spec

/** Salt bytes that are not all alike, so a byte read out of place would show. */
const saltOf = (saltBytes: number): Uint8Array => Uint8Array.from({ length: saltBytes }, (_unused, ii) => ((ii * 37) + 11) % 256)

/** The message of the 'bad_option' refusal `attempt` throws. */
const refusalOf = (attempt: () => unknown): string => TH.expectSyncRefusal(attempt, 'bad_option').message

/** What `attempt` rejects with; throws if it resolves instead. */
const rejectionOf = async (attempt: Promise<unknown>): Promise<unknown> => {
  try {
    await attempt
  } catch (err) {
    return err
  }
  throw new Error('expected a rejection, but the promise resolved')
}

/** Bytes as lowercase hex, as test vectors are written. */
const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

/** A whisper, stored on one device and read on another; an obvious fake. */
const FakeApiKey = 'sk-fake-0000-not-a-real-key'

// The heart of the package: the same spec, passphrase and salt make the same bytes here as in the
// core's @noble/hashes deriver, or a vault made on one device would not open on another.
describe("argon2idWasmWebV1Deriver beside argon2idWebV1Deriver", () => {
  it("carries the supplied spec whole, frozen", () => {
    expect(specOf(argon2idWasmWebV1Deriver)).to.deep.equal(Argon2idWebV1)
    expect(specOf(argon2idWasmWebV1Deriver)).to.deep.equal(specOf(argon2idWebV1Deriver))
    expect(argon2idWasmWebV1Deriver).to.be.frozen
  })

  // Two full derivations at 64 MiB and three passes: the core's alone takes about half a second.
  it("derives byte for byte what the core's deriver derives, for one fixed passphrase and salt", { timeout: 60_000 }, async () => {
    const saltBytes = saltOf(Argon2idWebV1.salt_bytes)
    const wasmBytes = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    const nobleBytes = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    expect(wasmBytes).to.have.lengthOf(32)
    expect([...wasmBytes]).to.deep.equal([...nobleBytes])
  })

  it("derives 32 deterministic bytes, and a different salt lands somewhere else entirely", { timeout: 60_000 }, async () => {
    const once = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    const again = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    const elsewhere = await argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', new Uint8Array(16).fill(8))
    expect(once).to.have.lengthOf(32)
    expect(once).to.deep.equal(again)
    expect(once).to.not.deep.equal(elsewhere)
  })
})

// Argon2id's own test vector, from its reference implementation (phc-winner-argon2's test.c:
// version 0x13, 2 passes, 64 MiB, one lane, "password" and "somesalt"): both derivers must hit it,
// so neither can agree with the other by sharing a mistake.
describe("Argon2id's reference test vector", () => {
  const ReferenceSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'reference_vector', iterations: 2, salt_bytes: 8 }
  const ReferenceHex = '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7'

  it("is what the WebAssembly deriver derives", { timeout: 60_000 }, async () => {
    const derived = await argon2idWasmDeriver(ReferenceSpec).deriveKeyBytes('password', new TextEncoder().encode('somesalt'))
    expect(hexOf(derived)).to.eq(ReferenceHex)
  })

  it("is what the core's deriver derives", { timeout: 60_000 }, async () => {
    const derived = await argon2idDeriver(ReferenceSpec).deriveKeyBytes('password', new TextEncoder().encode('somesalt'))
    expect(hexOf(derived)).to.eq(ReferenceHex)
  })
})

// Cheap specs, each pressing on a place two implementations could part: memory not a multiple of
// four lanes' worth, several lanes, the shortest and longest salts, and passphrases past ASCII and
// past one BLAKE2b block.
const SameBytesCases = [
  // regular usage:
  [{},                                                   "correct horse battery staple",  'a cheap spec of four lanes'],
  [{ parallelism: 1, iterations: 3 },                    "correct horse battery staple",  "one lane and three passes, the supplied spec's shape"],
  // where two implementations could part:
  [{ memory_kib: 100, parallelism: 3 },                  "correct horse battery staple",  'memory that does not divide into four segments a lane'],
  [{ memory_kib: 37, parallelism: 2, iterations: 1 },    "correct horse battery staple",  'an odd memory, two lanes and a single pass'],
  [{ memory_kib: 8, parallelism: 1, iterations: 1 },     "correct horse battery staple",  "Argon2id's least memory and one pass"],
  [{ memory_kib: 1024, parallelism: 8 },                 "correct horse battery staple",  'eight lanes'],
  [{ salt_bytes: 8 },                                    "correct horse battery staple",  "Argon2id's shortest salt"],
  [{ salt_bytes: 65_536 },                               "correct horse battery staple",  'the longest salt the platform hands out'],
  [{},                                                   "pässwörd mit Umlaut und 🔑",    'a passphrase past ASCII, encoded as UTF-8'],
  [{},                                                   "word ".repeat(40),              'a passphrase longer than one BLAKE2b block'],
  [{},                                                   " ",                             'a passphrase of one space, which a deriver takes as it is'],
  [{},                                                   "half a \u{D83D} key",           'a lone surrogate, which each encodes as U+FFFD'],
] as const

describe("argon2idWasmDeriver beside argon2idDeriver", () => {
  for (const [change, passphrase, blurb] of SameBytesCases) {
    it(`derives the same bytes under ${blurb}`, async () => {
      const spec = { ...CheapSpec, ...change }
      const saltBytes = saltOf(spec.salt_bytes)
      const wasmBytes = await argon2idWasmDeriver(spec).deriveKeyBytes(passphrase, saltBytes)
      const nobleBytes = await argon2idDeriver(spec).deriveKeyBytes(passphrase, saltBytes)
      expect(wasmBytes).to.have.lengthOf(32)
      expect([...wasmBytes]).to.deep.equal([...nobleBytes])
    })
  }

  it("derives differently under each parameter, so none is ignored", async () => {
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

  it("keeps none of the extra fields it was handed: a spec cannot smuggle in a function", async () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) } as KeyDeriverSpec
    const derived = await argon2idWasmDeriver(smuggled).deriveKeyBytes('pw', saltOf(16))
    expect(derived).to.not.deep.equal(new Uint8Array(32))
  })

  it("refuses a spec Argon2id cannot run, before deriving anything", () => {
    expect(() => argon2idWasmDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 }))
      .to.throw(/salt_bytes/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
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

  for (const length of [0, 15, 17]) {
    it(`refuses a salt of ${String(length)} bytes where the spec asks 16, as bad_option and as the core's deriver does, before deriving`, async () => {
      const wasmMessage = (await rejectionOf(argon2idWasmDeriver(CheapSpec).deriveKeyBytes('pw', saltOf(length))) as VaultError).message
      const coreMessage = (await rejectionOf(argon2idDeriver(CheapSpec).deriveKeyBytes('pw', saltOf(length))) as VaultError).message
      expect(wasmMessage).to.eq(coreMessage)
    })
  }

  it("refuses a misfit salt of the supplied spec too, with kind 'bad_option'", async () => {
    const err = await rejectionOf(argon2idWasmWebV1Deriver.deriveKeyBytes('pw', saltOf(8)))
    expect(isVaultError(err, 'bad_option')).to.be.true
  })
})

// The core's parseKeyDeriverSpec is what both factories check with: these hold the two to the
// same refusals, word for word, rather than restating the bounds.
const UnworkableSpecs = [
  [{ salt_bytes: 7 },                     'a salt under 8 bytes'],
  [{ salt_bytes: 65_537 },                'a salt longer than getRandomValues hands out at once'],
  [{ memory_kib: 64, parallelism: 9 },    'under 8 KiB for each of nine lanes'],
  [{ memory_kib: 1_048_577 },             'more than 1 GiB'],
  [{ iterations: 0 },                     'no passes over memory'],
  [{ parallelism: 0 },                    'no lanes'],
  [{ output_bytes: 16 },                  'a 128-bit key'],
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
    const lavish = { ...CheapSpec, memory_kib: 1_048_576, iterations: (2 ** 32) - 1, parallelism: 131_072, salt_bytes: 65_536 }
    expect(specOf(argon2idWasmDeriver(lavish))).to.deep.equal(lavish)
  })
})

/** Two devices sharing one vault store: each opens the vault through its own key deriver. */
const twoDevices = (firstDeriver: KeyDeriver, secondDeriver: KeyDeriver) => {
  const vaultDB = localVaultDB({ store: memoryStore() })
  const deviceOf = (keyDeriver: KeyDeriver) => openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver, passphraseStrengthTest: anyPassphraseTest })
  return { first: () => deviceOf(firstDeriver), second: () => deviceOf(secondDeriver) }
}

// Each runs the real Argon2id at the supplied spec on both devices.
describe("a vault shared between the two derivers", () => {
  it("is accepted by openVault under the supplied label", async () => {
    const vault = await openVault({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: localVaultDB({ store: memoryStore() }), deviceDB: memoryDeviceDB(), keyDeriver: argon2idWasmWebV1Deriver, passphraseStrengthTest: anyPassphraseTest })
    expect(vault.getSnapshot().state).to.eq('absent')
    vault.close()
  })

  it("made through WebAssembly opens through the core's deriver", { timeout: 60_000 }, async () => {
    const devices = twoDevices(argon2idWasmWebV1Deriver, argon2idWebV1Deriver)
    const first = await devices.first()
    await first.unlock('correct horse battery staple')
    await first.storeBox('openai', FakeApiKey)
    const second = await devices.second()
    await second.unlock('correct horse battery staple')
    expect(await second.readBox('openai')).to.eq(FakeApiKey)
    first.close()
    second.close()
  })

  it("made through the core's deriver opens through WebAssembly, and refuses a wrong passphrase there", { timeout: 60_000 }, async () => {
    const devices = twoDevices(argon2idWebV1Deriver, argon2idWasmWebV1Deriver)
    const first = await devices.first()
    await first.unlock('correct horse battery staple')
    await first.storeBox('openai', FakeApiKey)
    const second = await devices.second()
    await expect(second.unlock('correct horse battery stapler')).rejects.toThrow(/didn't unlock/u)
    await second.unlock('correct horse battery staple')
    expect(await second.readBox('openai')).to.eq(FakeApiKey)
    first.close()
    second.close()
  })
})

describe("where WebAssembly cannot run", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('hash-wasm')
    vi.resetModules()
  })

  it("refuses with kind 'bad_option' on a platform with no WebAssembly, as React Native's Hermes is", async () => {
    vi.stubGlobal('WebAssembly', undefined)
    const attempt = argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))
    await expect(attempt).rejects.toThrow(VaultError)
    await expect(attempt).rejects.toThrow(/no WebAssembly/u)
  })

  it("refuses with kind 'bad_option', naming the fix, when a Content-Security-Policy forbids compiling it", async () => {
    vi.doMock('hash-wasm', () => ({
      argon2id: () => Promise.reject(new WebAssembly.CompileError("WebAssembly.compile(): Refused to compile or instantiate WebAssembly module because 'wasm-unsafe-eval' is not an allowed source of script")),
    }))
    vi.resetModules()
    const Fresh = await import('../src/wasm-deriver')
    // A fresh import brings a fresh safebyok, whose VaultError is the one thrown.
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

  it("passes along, as it came, a failure that is not WebAssembly's to compile", async () => {
    vi.doMock('hash-wasm', () => ({ argon2id: () => Promise.reject(new RangeError('WebAssembly.Memory.grow(): Maximum memory size exceeded')) }))
    vi.resetModules()
    const Fresh = await import('../src/wasm-deriver')
    await expect(Fresh.argon2idWasmWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltOf(16))).rejects.toThrow(RangeError)
  })
})
