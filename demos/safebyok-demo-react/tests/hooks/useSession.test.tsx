// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSession } from '../../src/hooks/useSession'
import { createAuth } from '../../src/lib/auth'
import { memoryStorage } from '../test-helpers'

describe("useSession", () => {
  it("is null while signed out, and follows the fake auth in and out", async () => {
    const auth = createAuth({ applabel: 'acme', dbStorage: memoryStorage(), deviceStorage: memoryStorage() })
    const { result } = renderHook(() => useSession(auth))
    expect(result.current).to.be.null
    const session = await act(() => auth.signIn('margo'))
    expect(result.current).to.eq(session)
    act(() => { auth.signOut() })
    expect(result.current).to.be.null
  })
})
