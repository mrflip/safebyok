/** Writes safebyok's package.json version into the `PackageVersion` constant the deviceDB stamps on each device row.
 * `pnpm release:version` runs it after `changeset version`, so the Version PR carries both.
 *
 *   node scripts/sync-package-version.ts
 */

import fs from 'node:fs'

const ConstsPath = 'packages/safebyok/src/helpers/consts.ts'
const ManifestPath = 'packages/safebyok/package.json'

/** `source` with its `PackageVersion` line set to `version`.
 *
 * @param source - The text of `helpers/consts.ts`.
 * @param version - The version to write.
 * @returns The new text; throws when `source` has no `PackageVersion` line.
 *
 * @example withPackageVersion("export const PackageVersion = '0.5.0'", '0.6.0')  // => "export const PackageVersion = '0.6.0'"
 */
export function withPackageVersion(source: string, version: string): string {
  const pattern = /^export const PackageVersion = '[^']*'$/m
  if (! pattern.test(source)) { throw new Error(`No \`export const PackageVersion = '…'\` line in ${ConstsPath}`) }
  return source.replace(pattern, () => `export const PackageVersion = '${version}'`)
}

if (import.meta.main) {
  const { version } = JSON.parse(fs.readFileSync(ManifestPath, 'utf8')) as { version: string }
  fs.writeFileSync(ConstsPath, withPackageVersion(fs.readFileSync(ConstsPath, 'utf8'), version))
}
