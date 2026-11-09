/** Each stored row's validator, held to the committed snapshot of its format number. */

import { describe, expect, it } from 'vitest'
import * as Zod from 'zod'
import * as SX from '../../src/shapes/shapes-storage'

// When a case here fails, a row's validator no longer says what its format number promised.
// A change to what a stored row may hold bumps `BoxFormat` or `VaultFormat` in shapes-storage.ts;
// `pnpm --filter safebyok test row-formats -u` then writes the new number's file, to be committed.
// Only a change that leaves the rows it accepts alone may rewrite a file under the same number.
describe("the row validators against their format numbers", () => {
  it.each([
    ['boxRow',   SX.boxRow,   SX.BoxFormat],
    ['vaultRow', SX.vaultRow, SX.VaultFormat],
  ] as const)("%s is the shape its format number names", async (rowname, rowCheck, format) => {
    const schema = Zod.toJSONSchema(rowCheck, { unrepresentable: 'any' })
    await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot(`../.snapshots/shapes/row-formats/${rowname}-fmt${String(format)}.schema.json`)
  })
})
