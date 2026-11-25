---
name: convex-create-component
description:
  Builds reusable Convex components with isolated tables and app-facing APIs.
  Use for new components, reusable backend modules, integrations, or component
  boundary work.
---

# Convex Create Component

> **Changed for safebyok-convex** from get-convex/agent-skills at `191a5c33` (Apache-2.0; the
> changes are listed in `../README.md`). Here the shape is settled: `safebyok-convex` is a
> **packaged** component (`winboard/20261014-convex/design.md`), whose host app authenticates
> through a `getUserId(ctx)` callback rather than `@convex-dev/auth`. Never run `npx convex dev`
> or push to a deployment; if codegen needs a Convex login or a deployment, stop and ask the
> Coach for that exact step.

Create reusable Convex components with clear boundaries and a small app-facing
API.

## When to Use

- Creating a new Convex component in an existing app
- Extracting reusable backend logic into a component
- Building a third-party integration that should own its own tables and
  workflows
- Packaging Convex functionality for reuse across multiple apps

## When Not to Use

- One-off business logic that belongs in the main app
- Thin utilities that do not need Convex tables or functions
- App-level orchestration that should stay in `convex/`
- Cases where a normal TypeScript library is enough

## Workflow

1. Confirm what you are building against `winboard/20261014-convex/design.md`
   and the sprint plan, rather than asking afresh.
2. Read `references/packaged-components.md`: the shape is settled (below).
3. Decide whether a component is justified. Prefer normal app code or a regular
   library if the feature does not need isolated tables, backend functions, or
   reusable persistent state.
4. Make a short plan for:
   - what tables the component owns
   - what public functions it exposes
   - what data must be passed in from the app (auth, env vars, parent IDs)
   - what stays in the app as wrappers or HTTP mounts
5. Create the component structure with `convex.config.ts`, `schema.ts`, and
   function files.
6. Implement functions using the component's own `./_generated/server` imports,
   not the app's generated files.
7. Wire the component into the app with `app.use(...)`. If the app does not
   already have `convex/convex.config.ts`, create it.
8. Call the component from the app through `components.<name>` using
   `ctx.runQuery`, `ctx.runMutation`, or `ctx.runAction`.
9. If React clients, HTTP callers, or public APIs need access, create wrapper
   functions in the app instead of exposing component functions directly.
10. Run codegen (see Validation) and `pnpm justify` inside
    `packages/safebyok-convex/`, and fix codegen, type, or boundary issues
    before shipping.

## Choose the Shape

| Goal                         | Shape    | Reference                           |
| ---------------------------- | -------- | ----------------------------------- |
| Publish or share across apps | Packaged | `references/packaged-components.md` |

This package is a packaged component. Upstream's local and hybrid references
were left out of this install.

## Default Approach

Upstream's default, a local component inside one app, does not apply here. The
skeleton below uses the local layout (`convex/components/<componentName>/`) only
to illustrate; the parts carry over to a package unchanged:

- Define it with `defineComponent(...)` in its own `convex.config.ts`
- The host installs it from its `convex/convex.config.ts` with `app.use(...)`
- Codegen generates the component's own `_generated/` files

## Component Skeleton

A minimal local component with a table and two functions, plus the app wiring.

```ts
// convex/components/notifications/convex.config.ts
import { defineComponent } from "convex/server";

export default defineComponent("notifications");
```

```ts
// convex/components/notifications/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  notifications: defineTable({
    userId: v.string(),
    message: v.string(),
    read: v.boolean(),
  }).index("by_user_read", ["userId", "read"]),
});
```

```ts
// convex/components/notifications/lib.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

export const send = mutation({
  args: { userId: v.string(), message: v.string() },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      message: args.message,
      read: false,
    });
  },
});

export const listUnread = query({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("notifications"),
      _creationTime: v.number(),
      userId: v.string(),
      message: v.string(),
      read: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", args.userId).eq("read", false),
      )
      .collect();
  },
});
```

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import notifications from "./components/notifications/convex.config.js";

const app = defineApp();
app.use(notifications);

export default app;
```

```ts
// convex/notifications.ts  (app-side wrapper)
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

export const sendNotification = mutation({
  args: { message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.runMutation(components.notifications.lib.send, {
      userId,
      message: args.message,
    });
    return null;
  },
});

export const myUnread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.runQuery(components.notifications.lib.listUnread, {
      userId,
    });
  },
});
```

Note the reference path shape: a function in
`convex/components/notifications/lib.ts` is called as
`components.notifications.lib.send` from the app.

## Critical Rules

- Keep authentication in the app, because `ctx.auth` is not available inside
  components.
- Keep environment access in the app, because component functions cannot read
  `process.env`.
- Pass parent app IDs across the boundary as strings, because `Id` types become
  plain strings in the app-facing `ComponentApi`.
- Do not use `v.id("parentTable")` for app-owned tables inside component args or
  schema, because the component has no access to the app's table namespace.
- Import `query`, `mutation`, and `action` from the component's own
  `./_generated/server`, not the app's generated files.
- Do not expose component functions directly to clients. Create app wrappers
  when client access is needed, because components are internal and need
  auth/env wiring the app provides.
- If the component defines HTTP handlers, mount the routes in the app's
  `convex/http.ts`, because components cannot register their own HTTP routes.
- If the component needs pagination, use `paginator` from `convex-helpers`
  instead of built-in `.paginate()`, because `.paginate()` does not work across
  the component boundary. (`convex-helpers` is not a dependency of this
  package, and adding it needs the Coach's yes.)
- Define indexes for queried fields instead of using Convex `.filter()` after a
  database query.
- Add `args` and `returns` validators to all public component functions, because
  the component boundary requires explicit type contracts.

## Patterns

### Authentication and environment access

```ts
// Bad: component code cannot rely on app auth or env
const identity = await ctx.auth.getUserIdentity();
const apiKey = process.env.OPENAI_API_KEY;
```

```ts
// Good: the app resolves auth and env, then passes explicit values
const userId = await getAuthUserId(ctx);
if (!userId) throw new Error("Not authenticated");

await ctx.runAction(components.translator.translate, {
  userId,
  apiKey: process.env.OPENAI_API_KEY,
  text: args.text,
});
```

### Client-facing API

```ts
// Bad: assuming a component function is directly callable by clients
export const send = components.notifications.send;
```

```ts
// Good: re-export through an app mutation or query
export const sendNotification = mutation({
  args: { message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.runMutation(components.notifications.lib.send, {
      userId,
      message: args.message,
    });
    return null;
  },
});
```

### IDs across the boundary

```ts
// Bad: parent app table IDs are not valid component validators
args: {
  userId: v.id("users"),
}
```

```ts
// Good: treat parent-owned IDs as strings at the boundary
args: {
  userId: v.string(),
}
```

### Advanced Patterns

For additional patterns including function handles for callbacks, deriving
validators from schema, static configuration with a globals table, and
class-based client wrappers, see `references/advanced-patterns.md`.

## Validation

Try validation in this order:

1. `npx convex codegen --component-dir <path to the component>`
2. `npx convex codegen`

Never `npx convex dev` here: it provisions or pushes to a deployment.

Important:

- Fresh repos may fail these commands until `CONVEX_DEPLOYMENT` is configured.
- Until codegen runs, component-local `./_generated/*` imports and app-side
  `components.<name>...` references will not typecheck.
- If validation blocks on Convex login or deployment setup, stop and ask the
  user for that exact step instead of guessing.

## Reference Files

- `references/packaged-components.md`: the package layout, build order, exports
  and testing
- `references/advanced-patterns.md`: function handles, validators derived from
  the schema, and class-based client wrappers

Official docs:
[Authoring Components](https://docs.convex.dev/components/authoring)

## Checklist

- [ ] Confirmed the plan against the design
- [ ] Read `references/packaged-components.md`
- [ ] Confirmed a component is the right abstraction
- [ ] Planned tables, public API, boundaries, and app wrappers
- [ ] Component lives under `convex/components/<name>/` (or package layout if
      publishing)
- [ ] Component imports from its own `./_generated/server`
- [ ] Auth, env access, and HTTP routes stay in the app
- [ ] Parent app IDs cross the boundary as `v.string()`
- [ ] Public functions have `args` and `returns` validators
- [ ] Ran codegen and `pnpm justify`, and fixed codegen or type issues
