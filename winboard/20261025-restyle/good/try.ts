// A playground: `npx tsc -p .` here typechecks good/, and `NODE_PATH=../../../packages/safebyok/node_modules npx tsx --tsconfig tsconfig.json try.ts` runs this.
import * as CX from './checks/core-checks'
import { Validator } from './checks/validator'

const { boxRecord } = Validator('bad_record', ({ boxscope, uint, user_id }) => {
  const boxRecord = boxscope.extend({ written_at: uint, owner: user_id }).strict()
  return { boxRecord }
}, [CX, { uint: 'shadowed by the kit' }])
type BoxRecordT = ReturnType<typeof boxRecord.parse>
const typed: BoxRecordT = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', boxlabel: 'openai', written_at: 1, owner: 'u2' }
console.log(boxRecord.parse(typed))
try { boxRecord.parse({ ...typed, written_at: -1 }) } catch (err) { console.log((err as { refusalkind?: string }).refusalkind, (err as Error).message) }
try { boxRecord.parse({ ...typed, extra: 'no' }) } catch (err) { console.log((err as { refusalkind?: string }).refusalkind, (err as Error).message) }
try { CX.vaultScopepath.parse('vault^acme^u1') } catch (err) { console.log((err as Error).message) }
console.log(CX.vaultScopepath.parse('vault^acme^auth0|x^main'))

// Every failure named, and a key that could be the caller's data not repeated.
try {
  boxRecord.parse({ applabel: 'Acme', user_id: 'a/b', vaultlabel: 'main', boxlabel: 'x', written_at: -1, owner: 'u2', vault_key: 1, 'sk-live 0xSECRET': 2 })
} catch (err) { console.log((err as Error).message) }
