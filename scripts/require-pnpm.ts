/**
 * Refuses to go on unless pnpm is the one running: a public package's `prepublishOnly` runs it
 * first. pnpm publishes `publishConfig.exports`, the dist-only entry points; npm would publish
 * `exports` as written, with the workspace's `@safebyok/source` condition pointing at a src/ the
 * tarball does not ship. The release workflow is untouched: it stages a tarball pnpm packed, and
 * npm runs no lifecycle script when it publishes a tarball.
 *
 *   node ../../scripts/require-pnpm.ts && pnpm justify
 */

/**
 * Why `userAgent` may not publish, or null when it is pnpm's.
 *
 * @param userAgent - `npm_config_user_agent`, as the package manager running the script sets it.
 * @returns The refusal to print, or null to go on.
 *
 * @example pnpmRefusal('pnpm/12.4.2 npm/? node/v24.21.0 linux x64')  // => null
 * @example pnpmRefusal('npm/11.19.0 node/v24.21.0 linux x64')        // => 'Publish this package with pnpm ...'
 */
export function pnpmRefusal(userAgent: string | undefined): string | null {
  if (userAgent?.startsWith('pnpm/')) { return null }
  return 'Publish this package with pnpm (`pnpm publish`), not npm: npm would ship the workspace-only `@safebyok/source` export condition, which points at a src/ the package does not include. Releases normally go through the release workflow (notes/releasing.md).'
}

if (import.meta.main) {
  const refusal = pnpmRefusal(process.env['npm_config_user_agent'])
  if (refusal !== null) {
    process.stderr.write(`${refusal}\n`)
    process.exitCode = 1
  }
}
