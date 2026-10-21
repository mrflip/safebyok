import { defineComponent } from 'convex/server'

/** The safebyok component, as a host app installs it from its `convex/convex.config.ts`.
 *
 * @example
 *   import { defineApp } from 'convex/server'
 *   import safebyok from 'safebyok-convex/convex.config'
 *
 *   const app = defineApp()
 *   app.use(safebyok)
 *   export default app
 */
export default defineComponent('safebyok')
