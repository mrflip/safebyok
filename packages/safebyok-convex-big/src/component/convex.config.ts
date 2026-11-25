import { defineComponent } from 'convex/server'

/** The safebyok component, for a host app to install in its `convex/convex.config.ts`.
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
