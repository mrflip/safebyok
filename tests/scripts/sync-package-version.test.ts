import { describe, expect, it } from 'vitest'
import { withPackageVersion } from '../../scripts/sync-package-version'

describe("withPackageVersion", () => {
  it("sets the PackageVersion line and leaves the rest of the source", () => {
    const source = "const before = 1\nexport const PackageVersion = '0.5.0'\nconst after = '0.5.0'\n"
    expect(withPackageVersion(source, '0.6.1')).to.eq("const before = 1\nexport const PackageVersion = '0.6.1'\nconst after = '0.5.0'\n")
  })

  it("throws when the source has no PackageVersion line", () => {
    expect(() => withPackageVersion("const PackageVersion = '0.5.0'", '0.6.0')).to.throw('PackageVersion')
  })
})
