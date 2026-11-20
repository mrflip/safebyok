# Exemplar doc blocks

Doc blocks copied verbatim from five well-regarded state libraries, for setting the register of
our own doc blocks and the shape of the giver's public surface. Each block keeps its comment and
the member's signature line exactly as published, indentation included. The line above each
block gives the source path (package-relative) and what it corresponds to in safebyok. Nothing
here is our code or our rule.

Collected 2026-11-19. Versions read:

* `@tanstack/query-core` 5.107.1 and `@tanstack/react-query` 5.107.1 (installed in this repo)
* `xstate` 5.33.4; `@xstate/react` 5.0.5 (no doc comments, see its section)
* `valtio` 2.3.2
* `zustand` 5.1.0 (core has no doc comments, see its section)
* `react-redux` 9.3.1, `redux` 5.0.1 (the `Store` type `useStore` returns), `use-sync-external-store` 1.7.0 with `@types/use-sync-external-store` 1.7.0 (no doc comments)

## TanStack Query v5

**Verbs.** Named methods throughout: `queryClient.invalidateQueries()`, `resetQueries()`,
`observer.mutate()`, `observer.reset()`, `result.refetch()`. Each takes its own positional
arguments and options object, typed per method. Inside, a `Query` or `Mutation` updates itself by
dispatching tagged actions (`fetch`, `success`, `error`, ...) through a reducer, but that union is
not exported and no caller ever sends one.

`react-query@5.107.1 build/modern/useMutationState.d.ts` -- a hook returning a derived value; our hooks over a Bank's state.
````ts
/**
 * The `useIsMutating` hook returns the `number` of mutations that your application currently has `pending`
 * (useful for app-wide loading indicators).
 * @param filters - The {@link MutationFilters} to narrow down the matched mutations.
 * @param queryClient - Use this to use a custom `QueryClient`. Otherwise, the one from the nearest context will
 * be used.
 * @returns Will be the `number` of the mutations that your application currently has `pending`.
 * @example
 * ```tsx
 * import { useIsMutating } from '@tanstack/react-query'
 *
 * function PostsMutatingIndicator() {
 *   // How many mutations matching the posts prefix are in progress?
 *   const isMutatingPosts = useIsMutating({ mutationKey: ['posts'] })
 *
 *   return isMutatingPosts ? <span>Saving posts...</span> : null
 * }
 * ```
 */
export declare function useIsMutating(filters?: Omit<MutationFilters, 'status'>, queryClient?: QueryClient): number;
````

`query-core@5.107.1 build/modern/hydration-9_kOYxJM.d.ts`, `QueryObserver` -- `getSnapshot()` on a Device or Bank.
````ts
  /**
   * Returns the most recently computed `QueryObserverResult` for the
   * observed query. This is a point-in-time read; to be notified of updates
   * as they happen, subscribe to the observer instead (its inherited
   * `subscribe` method).
   * @returns The observer's latest result.
   * @example
   * ```ts
   * const result = observer.getCurrentResult()
   * console.log(result.status, result.data)
   * ```
   */
  getCurrentResult(): QueryObserverResult<TData, TError>;
````

`query-core@5.107.1 build/modern/subscribable-D2lAzdDi.d.ts`, `Subscribable` -- `subscribe(listener)` on a Device or Bank.
````ts
  /**
   * Registers a listener to be called on every update this object notifies about. Returns a function
   * that removes the listener again — call it to stop listening. The base class never drops a listener
   * on its own, though some subclasses clear all of theirs in `destroy()`.
   * @param listener - Called on each update, with whatever the subclass passes to its subscribers.
   * @returns A function that removes the listener.
   * @example
   * ```ts
   * const unsubscribe = subscribable.subscribe(() => {
   *   // react to the update
   * })
   *
   * unsubscribe()
   * ```
   */
  subscribe(listener: TListener): () => void;
````

`query-core@5.107.1 build/modern/hydration-9_kOYxJM.d.ts`, `MutationObserver` -- a lifecycle verb that says what it does not stop; `lock`, `vacate`.
````ts
  /**
   * Detaches the observer from the mutation it is currently observing (if
   * any) and resets the observed result back to its default, `idle` state.
   *
   * This does not cancel an in-flight mutation; the mutation itself keeps
   * running to completion and its own callbacks still fire, but this
   * observer stops reflecting its state and a subsequent `mutate()` call
   * will build a brand new mutation.
   * @see {@link MutationObserver#mutate}
   * @example
   * ```ts
   * observer.reset()
   * ```
   */
  reset(): void;
````

`query-core@5.107.1 build/modern/hydration-9_kOYxJM.d.ts`, `QueryObserverOptions` -- an option with a subtle default; our hook options.
````ts
  /**
   * If set, the component will only re-render if any of the listed properties change.
   * When set to `['data', 'error']`, the component will only re-render when the `data` or `error` properties change.
   * When set to `'all'`, the component will re-render whenever a query is updated.
   * When set to a function, the function will be executed to compute the list of properties.
   *
   * Defaults to `undefined`, in which case property access is tracked automatically, and the
   * component only re-renders when one of the tracked properties changes.
   */
  notifyOnChangeProps?: NotifyOnChangeProps;
````

`query-core@5.107.1 build/modern/hydration-9_kOYxJM.d.ts`, `QueryObserverBaseResult` -- a status field listing its values; a snapshot's `stage`.
````ts
  /**
   * The status of the query.
   * - Will be:
   *   - `pending` if there's no cached data and no query attempt was finished yet.
   *   - `error` if the query attempt resulted in an error.
   *   - `success` if the query has received a response with no errors and is ready to display its data.
   */
  status: QueryStatus;
````

## XState v5

**Verbs.** Both. Lifecycle and reads are named methods on the actor (`start()`, `stop()`,
`getSnapshot()`, `subscribe()`); every domain verb is a dispatched tag, `actor.send({ type:
'submit', passphrase })`. Per-event arguments are typed as a discriminated union declared once in
`setup({ types: { events: {} as { type: 'submit'; passphrase: string } | { type: 'cancel' } } })`,
so `send` narrows the payload by `type`, and `snapshot.can(event)` asks whether an event would be
taken.

`@xstate/react@5.0.5` ships no doc comments on `useSelector`, `useActorRef` or `useActor`, in its
build or in `packages/xstate-react/src/` at the `@xstate/react@5.0.5` tag on GitHub; every block
below is from `xstate` itself.

`xstate@5.33.4 dist/declarations/src/createActor.d.ts`, `Actor` -- `getSnapshot()` on a Device or Bank.
````ts
    /**
     * Read an actor’s snapshot synchronously.
     *
     * @remarks
     * The snapshot represent an actor's last emitted value.
     *
     * When an actor receives an event, its internal state may change. An actor
     * may emit a snapshot when a state transition occurs.
     *
     * Note that some actors, such as callback actors generated with
     * `fromCallback`, will not emit snapshots.
     * @see {@link Actor.subscribe} to subscribe to an actor’s snapshot values.
     * @see {@link Actor.getPersistedSnapshot} to persist the internal state of an actor (which is more than just a snapshot).
     */
    getSnapshot(): SnapshotFrom<TLogic>;
````

`xstate@5.33.4 dist/declarations/src/createActor.d.ts`, `Actor` -- `subscribe(listener)`, including teardown on stop.
````ts
    /**
     * Subscribe an observer to an actor’s snapshot values.
     *
     * @remarks
     * The observer will receive the actor’s snapshot value when it is emitted.
     * The observer can be:
     *
     * - A plain function that receives the latest snapshot, or
     * - An observer object whose `.next(snapshot)` method receives the latest
     *   snapshot
     *
     * @example
     *
     * ```ts
     * // Observer as a plain function
     * const subscription = actor.subscribe((snapshot) => {
     *   console.log(snapshot);
     * });
     * ```
     *
     * @example
     *
     * ```ts
     * // Observer as an object
     * const subscription = actor.subscribe({
     *   next(snapshot) {
     *     console.log(snapshot);
     *   },
     *   error(err) {
     *     // ...
     *   },
     *   complete() {
     *     // ...
     *   }
     * });
     * ```
     *
     * The return value of `actor.subscribe(observer)` is a subscription object
     * that has an `.unsubscribe()` method. You can call
     * `subscription.unsubscribe()` to unsubscribe the observer:
     *
     * @example
     *
     * ```ts
     * const subscription = actor.subscribe((snapshot) => {
     *   // ...
     * });
     *
     * // Unsubscribe the observer
     * subscription.unsubscribe();
     * ```
     *
     * When the actor is stopped, all of its observers will automatically be
     * unsubscribed.
     *
     * @param observer - Either a plain function that receives the latest
     *   snapshot, or an observer object whose `.next(snapshot)` method receives
     *   the latest snapshot
     */
    subscribe(observer: Observer<SnapshotFrom<TLogic>>): Subscription;
    subscribe(nextListener?: (snapshot: SnapshotFrom<TLogic>) => void, errorListener?: (error: any) => void, completeListener?: () => void): Subscription;
````

`xstate@5.33.4 dist/declarations/src/createActor.d.ts`, `Actor` -- a dispatched-tag act; the alternative to `device.changePassphrase()`.
````ts
    /**
     * Sends an event to the running Actor to trigger a transition.
     *
     * @param event The event to send
     */
    send(event: EventFromLogic<TLogic>): void;
````

`xstate@5.33.4 dist/declarations/src/createActor.d.ts`, `Actor` -- a one-line teardown verb; `vacate`, `sweep`.
````ts
    /** Stops the Actor and unsubscribe all listeners. */
    stop(): this;
````

`xstate@5.33.4 dist/declarations/src/State.d.ts`, `MachineSnapshotBase` -- a snapshot predicate; flags like `isLocked`.
````ts
    /**
     * Determines whether sending the `event` will cause a non-forbidden
     * transition to be selected, even if the transitions have no actions nor
     * change the state value.
     *
     * @param event The event to test
     * @returns Whether the event will cause a transition
     */
    can: (event: TEvent) => boolean;
````

`xstate@5.33.4 dist/declarations/src/waitFor.d.ts` -- waiting on a snapshot condition; a caller waiting on a gating.
````ts
/**
 * Subscribes to an actor ref and waits for its emitted value to satisfy a
 * predicate, and then resolves with that value. Will throw if the desired state
 * is not reached after an optional timeout. (defaults to Infinity).
 *
 * @example
 *
 * ```js
 * const state = await waitFor(someService, (state) => {
 *   return state.hasTag('loaded');
 * });
 *
 * state.hasTag('loaded'); // true
 * ```
 *
 * @param actorRef The actor ref to subscribe to
 * @param predicate Determines if a value matches the condition to wait for
 * @param options
 * @returns A promise that eventually resolves to the emitted value that matches
 *   the condition
 */
export declare function waitFor<TActorRef extends AnyActorRef>(actorRef: TActorRef, predicate: (emitted: SnapshotFrom<TActorRef>) => boolean, options?: Partial<WaitForOptions>): Promise<SnapshotFrom<TActorRef>>;
````

## Valtio v2

**Verbs.** None of its own. State is a mutable proxy and a change is a plain assignment
(`state.count++`); a host's "actions" are ordinary functions it writes, typed by their own
signatures. The library exposes only `proxy`, `snapshot`, `subscribe` and the React hooks.

Its core blocks (`proxy`, `snapshot`, `getVersion`) are one-line restatements of the name;
`subscribe` is kept below as the shortest example of that register. The block on `useSnapshot`
(`react.d.ts`, the hook that returns a snapshot) is left out for length: 74 lines, four examples
and a console transcript. Its opening lines, verbatim: "Create a local snapshot that catches
changes. This hook actually returns a wrapped snapshot in a proxy for render optimization instead
of a plain object compared to `snapshot()` method. Rule of thumb: read from snapshots, mutate the
source. The component will only re-render when the parts of the state you access have changed, it
is render-optimized."

`valtio@2.3.2 react/utils/useProxy.d.ts` -- a hook over a live object, usable in render and in callbacks; our hooks, without a selector.
````ts
/**
 * useProxy
 *
 * Takes a proxy and returns a new proxy which you can use in both react render
 * and in callbacks. The root reference is replaced on every render, but the
 * keys (and subkeys) below it are stable until they're intentionally mutated.
 * For the best ergonomics, you can export a custom hook from your store, so you
 * don't have to figure out a separate name for the hook reference. E.g.:
 *
 * @example
 * export const store = proxy(initialState)
 * export const useStore = () => useProxy(store)
 * // in the component file:
 * function Cmp() {
 *   const store = useStore()
 *   return <button onClick={() => {store.count++}}>{store.count}</button>
 * }
 *
 */
export declare function useProxy<T extends object>(proxy: T, options?: NonNullable<Parameters<typeof useSnapshot>[1]>): T;
````

`valtio@2.3.2 vanilla.d.ts` -- `subscribe`, in the terse register (note `notifyInSync` goes undescribed).
````ts
/**
 * Subscribes to changes in a proxy object
 */
export declare function subscribe<T extends object>(proxyObject: T, callback: (unstable_ops: Op[]) => void, notifyInSync?: boolean): () => void;
````

`valtio@2.3.2 vanilla/utils/subscribeKey.d.ts` -- subscribing to one field; a selector over a snapshot.
````ts
/**
 * subscribeKey
 *
 * The subscribeKey utility enables subscription to a primitive subproperty of a given state proxy.
 * Subscriptions created with subscribeKey will only fire when the specified property changes.
 * notifyInSync: same as the parameter to subscribe(); true disables batching of subscriptions.
 *
 * @example
 * import { subscribeKey } from 'valtio/utils'
 * subscribeKey(state, 'count', (v) => console.log('state.count has changed to', v))
 */
export declare function subscribeKey<T extends object, K extends keyof T>(proxyObject: T, key: K, callback: (value: T[K]) => void, notifyInSync?: boolean): () => void;
````

`valtio@2.3.2 vanilla.d.ts` -- marking what a snapshot keeps by reference rather than copying.
````ts
/**
 * Marks an object to be excluded from proxying
 *
 * Objects marked with ref will be kept as references in snapshots
 * instead of being deeply copied.
 */
export declare function ref<T extends object>(obj: T): T & {
    $$valtioSnapshot: T;
};
````

## Zustand v5

**Verbs.** Named. A host puts its actions in the state itself as functions (`increment: () =>
set(...)`) and calls them by name, often read through a selector; the store API is four named
methods. The optional `redux` middleware adds `dispatch({ type })` over a reducer, typed by the
action union the host writes.

The core (`create`, `createStore`, `useStore`, `StoreApi`) carries no doc comments in the 5.1.0
build, nor in `src/vanilla.ts`, `src/react.ts` or `src/traditional.ts` at the `v5.1.0` tag on
GitHub (the latest release); its documentation lives on the docs site. Only the `persist`
middleware's options are documented, and they are the best Zustand has for subtle option fields.
`StoreApi` follows, undocumented, for its shape.

`zustand@5.1.0 vanilla.d.ts` -- (no doc comment) the store type carrying `getState` and `subscribe`; a Device or Bank.
````ts
export interface StoreApi<T> {
    setState: SetStateInternal<T>;
    getState: () => T;
    getInitialState: () => T;
    subscribe: (listener: (state: T, prevState: T) => void) => () => void;
}
````

`zustand@5.1.0 middleware/persist.d.ts`, `PersistOptions` -- a callback option around a lifecycle step.
````ts
    /**
     * A function returning another (optional) function.
     * The main function will be called before the state rehydration.
     * The returned function will be called after the state rehydration or when an error occurred.
     */
    onRehydrateStorage?: (state: S) => ((state?: S, error?: unknown) => void) | void;
````

`zustand@5.1.0 middleware/persist.d.ts`, `PersistOptions` -- a stored-shape version; a stored vault's shape.
````ts
    /**
     * If the stored state's version mismatch the one specified here, the storage will not be used.
     * This is useful when adding a breaking change to your store.
     */
    version?: number;
````

`zustand@5.1.0 middleware/persist.d.ts`, `PersistOptions` -- reading older stored shapes (which we refuse before 1.0).
````ts
    /**
     * A function to perform persisted state migration.
     * This function will be called when persisted state versions mismatch with the one specified here.
     */
    migrate?: (persistedState: unknown, version: number) => PersistedState | PromiseLike<PersistedState>;
````

`zustand@5.1.0 middleware/persist.d.ts`, `PersistOptions` -- an opt-out with its use case; deferred opening.
````ts
    /**
     * An optional boolean that will prevent the persist middleware from triggering hydration on initialization,
     * This allows you to call `rehydrate()` at a specific point in your apps rendering life-cycle.
     *
     * This is useful in SSR application.
     *
     * @default false
     */
    skipHydration?: boolean;
````

## React-Redux v9 and use-sync-external-store

**Verbs.** Dispatched tags only: `dispatch({ type: 'todos/added', payload })` is the one way to
change state. Per-verb arguments are typed as a union of action objects, discriminated by `type`;
Redux Toolkit generates a named action creator per case (`todoAdded(payload)`), a named-function
veneer that still produces a tagged object.

`use-sync-external-store` 1.7.0 ships JavaScript with only license headers, and its types come
from `@types/use-sync-external-store` 1.7.0, which has no doc comments. The source at React's
`v19.3.1` tag (the latest release) carries a single line comment above
`useSyncExternalStoreWithSelector`: `// Same as useSyncExternalStore, but supports selector and
isEqual arguments.` The two `redux` blocks are the `Store` that react-redux's `useStore` returns,
included because it is the canonical `getState`/`subscribe` pair.

`react-redux@9.3.1 dist/react-redux.d.ts` -- a hook with a selector and an equality function; our hooks, with a selector.
````ts
/**
 * A hook to access the redux store's state. This hook takes a selector function
 * as an argument. The selector is called with the store state.
 *
 * This hook takes an optional equality comparison function as the second parameter
 * that allows you to customize the way the selected state is compared to determine
 * whether the component needs to be re-rendered.
 *
 * @param {Function} selector the selector function
 * @param {Function=} equalityFn the function that will be used to determine equality
 *
 * @returns {any} the selected state
 *
 * @example
 *
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const counter = useSelector(state => state.counter)
 *   return <div>{counter}</div>
 * }
 */
declare const useSelector: UseSelector<unknown>;
````

`react-redux@9.3.1 dist/react-redux.d.ts` -- a hook returning the live store itself; a hook returning a Device or Bank.
````ts
/**
 * A hook to access the redux store.
 *
 * @returns {any} the redux store
 *
 * @example
 *
 * import React from 'react'
 * import { useStore } from 'react-redux'
 *
 * export const ExampleComponent = () => {
 *   const store = useStore()
 *   return <div>{store.getState()}</div>
 * }
 */
declare const useStore: UseStore<Store<unknown, Action, unknown>>;
````

`redux@5.0.1 dist/redux.d.ts`, `Store` -- the dispatched-tag act, with what the caller may get wrong.
````ts
    /**
     * Dispatches an action. It is the only way to trigger a state change.
     *
     * The `reducer` function, used to create the store, will be called with the
     * current state tree and the given `action`. Its return value will be
     * considered the **next** state of the tree, and the change listeners will
     * be notified.
     *
     * The base implementation only supports plain object actions. If you want
     * to dispatch a Promise, an Observable, a thunk, or something else, you
     * need to wrap your store creating function into the corresponding
     * middleware. For example, see the documentation for the `redux-thunk`
     * package. Even the middleware will eventually dispatch plain object
     * actions using this method.
     *
     * @param action A plain object representing “what changed”. It is a good
     *   idea to keep actions serializable so you can record and replay user
     *   sessions, or use the time travelling `redux-devtools`. An action must
     *   have a `type` property which may not be `undefined`. It is a good idea
     *   to use string constants for action types.
     *
     * @returns For convenience, the same action object you dispatched.
     *
     * Note that, if you use a custom middleware, it may wrap `dispatch()` to
     * return something else (for example, a Promise you can await).
     */
    dispatch: Dispatch<A>;
````

`redux@5.0.1 dist/redux.d.ts`, `Store` -- `subscribe(listener)`, with its ordering guarantees spelled out.
````ts
    /**
     * Adds a change listener. It will be called any time an action is
     * dispatched, and some part of the state tree may potentially have changed.
     * You may then call `getState()` to read the current state tree inside the
     * callback.
     *
     * You may call `dispatch()` from a change listener, with the following
     * caveats:
     *
     * 1. The subscriptions are snapshotted just before every `dispatch()` call.
     * If you subscribe or unsubscribe while the listeners are being invoked,
     * this will not have any effect on the `dispatch()` that is currently in
     * progress. However, the next `dispatch()` call, whether nested or not,
     * will use a more recent snapshot of the subscription list.
     *
     * 2. The listener should not expect to see all states changes, as the state
     * might have been updated multiple times during a nested `dispatch()` before
     * the listener is called. It is, however, guaranteed that all subscribers
     * registered before the `dispatch()` started will be called with the latest
     * state by the time it exits.
     *
     * @param listener A callback to be invoked on every dispatch.
     * @returns A function to remove this change listener.
     */
    subscribe(listener: ListenerCallback): Unsubscribe;
````

## urql v6 (@urql/core)

Blocks from `@urql/core` 6.0.3, `dist/urql-core-chunk.d.ts` and `dist/urql-core.d.ts` (installed in this repo).

`@urql/core@6.0.3 dist/urql-core-chunk.d.ts`, `Client` -- the class that owns state and runs operations; a Bank or Device.
````ts
/** The `Client` is the central hub for your GraphQL operations and holds `urql`'s state.
 *
 * @remarks
 * The `Client` manages your active GraphQL operations and their state, and contains the
 * {@link Exchange} pipeline to execute your GraphQL operations.
 *
 * It contains methods that allow you to execute GraphQL operations manually, but the `Client`
 * is also interacted with by bindings (for React, Preact, Vue, Svelte, etc) to execute GraphQL
 * operations.
 *
 * While {@link Exchange | Exchanges} are ultimately responsible for the control flow of operations,
 * sending API requests, and caching, the `Client` still has the important responsibility for
 * creating operations, managing consumers of active operations, sharing results for operations,
 * and more tasks as a “central hub”.
 *
 * @see {@link https://urql.dev/goto/docs/architecture/#requests-and-operations-on-the-client} for more information
 * on what the `Client` is and does.
 */
interface Client {
````

`@urql/core@6.0.3 dist/urql-core-chunk.d.ts`, `Client.readQuery` -- a synchronous, cache-only read that answers `null` for none; reading what a Bank holds.
````ts
    /** Returns the first synchronous result a `Client` provides for a given operation.
     *
     * @param query - a GraphQL document containing the query operation that will be executed.
     * @param variables - the variables used to execute the operation.
     * @param opts - {@link OperationContext} options that'll override and be merged with options from the {@link ClientOptions}.
     * @returns An {@link OperationResult} if one became available synchronously or `null`.
     *
     * @remarks
     * The `Client.readQuery` method returns a result synchronously or defaults to `null`. This is useful
     * as it limits the result for a query operation to whatever the cache {@link Exchange} of a {@link Client}
     * had stored and available at that moment.
     *
     * In `urql`, it's expected that cache exchanges return their results synchronously. The bindings
     * and this method exploit this by using synchronous results, like these, to check what data is already
     * in the cache.
     *
     * This method is similar to what all bindings do to synchronously provide the initial state for queries,
     * regardless of whether effects afterwards that subscribe to the query operation update this state synchronously
     * or asynchronously.
     */
    readQuery<Data = any, Variables extends AnyVariables = AnyVariables>(query: DocumentInput<Data, Variables>, variables: Variables, context?: Partial<OperationContext>): OperationResult<Data, Variables> | null;
````

`@urql/core@6.0.3 dist/urql-core-chunk.d.ts`, `Client.executeQuery` -- the lower-level twin of `query`, with a `@see` to the convenience method.
````ts
    /** Creates a `Source` that executes the GraphQL query operation for the passed `GraphQLRequest`.
     *
     * @param query - a {@link GraphQLRequest}
     * @param opts - {@link OperationContext} options that'll override and be merged with options from the {@link ClientOptions}.
     * @returns A {@link PromisifiedSource} issuing the {@link OperationResult | OperationResults} for the GraphQL operation.
     *
     * @remarks
     * The `Client.executeQuery` method is used to programmatically issue a GraphQL query operation.
     * It automatically calls {@link client.createRequestOperation} and {@link client.executeRequestOperation} for you,
     * but requires you to create a {@link GraphQLRequest} using {@link createRequest} yourself first.
     *
     * @see {@link Client.query} for a method that doesn't require calling {@link createRequest} yourself.
     */
    executeQuery<Data = any, Variables extends AnyVariables = AnyVariables>(query: GraphQLRequest<Data, Variables>, opts?: Partial<OperationContext> | undefined): OperationResultSource<OperationResult<Data, Variables>>;
````

`@urql/core@6.0.3 dist/urql-core-chunk.d.ts`, `Client.mutation` -- a write verb with an `@example` that checks `result.error`; `putBox`.
````ts
    /** Creates a `Source` that executes the GraphQL mutation operation created from the passed parameters.
     *
     * @param query - a GraphQL document containing the mutation operation that will be executed.
     * @param variables - the variables used to execute the operation.
     * @param opts - {@link OperationContext} options that'll override and be merged with options from the {@link ClientOptions}.
     * @returns A {@link PromisifiedSource} issuing the {@link OperationResult | OperationResults} for the GraphQL operation.
     *
     * @remarks
     * The `Client.mutation` method is useful to programmatically create and issue a GraphQL mutation operation.
     * It automatically calls {@link createRequest}, {@link client.createRequestOperation}, and
     * {@link client.executeRequestOperation} for you, and is a convenience method.
     *
     * Since it returns a {@link PromisifiedSource} it may be chained with a `toPromise()` call to only
     * await a single result in an async function. Since mutations will only typically issue one result,
     * using this method is recommended.
     *
     * Hint: This is the recommended way to create mutations programmatically when not using the bindings,
     * or when you’re trying to get a single, promisified result.
     *
     * @example
     * ```ts
     * const createPostMutation = gql`
     *   mutation CreatePost($text: String!) {
     *     createPost(text: $text) {
     *       id
     *       text
     *     }
     *   }
     * `;
     *
     * async function createPost(text) {
     *   const result = await client.mutation(createPostMutation, {
     *     text,
     *   }).toPromise();
     *   if (result.error) {
     *     throw result.error;
     *   }
     *
     *   return result.data.createPost;
     * }
     * ```
     */
    mutation<Data = any, Variables extends AnyVariables = AnyVariables>(query: DocumentInput<Data, Variables>, variables: Variables, context?: Partial<OperationContext>): OperationResultSource<OperationResult<Data, Variables>>;
````

`@urql/core@6.0.3 dist/urql-core-chunk.d.ts`, `OperationResult.stale` -- a state flag explained by when it is set; a stale-cache marker.
````ts
    /** Indicates that an `OperationResult` is not fresh and a new result will follow.
     *
     * @remarks
     * The `stale` flag indicates whether a result is expected to be superseded by a new result soon.
     * This flag is set whenever a new result is being awaited and will be deliverd as soon as the API responds.
     *
     * It may be set by the {@link Client} when the `Operation` was already active, at which point
     * the {@link Client} asks the {@link Exchange | Exchanges} to request a new API response, or
     * by cache exchanges when a temporary, incomplete, or initial cache result has been deliverd, and
     * a new API request has been started in the background. (For partial cache results)
     *
     * Most commonly, this flag is set for a cached result when the operation is executed using the
     * `cache-and-network` {@link RequestPolicy}.
     */
    stale: boolean;
````

`@urql/core@6.0.3 dist/urql-core-chunk.d.ts`, `RequestPolicy` -- a menu of choices, each explained in a list.
````ts
/** The request and caching strategy that is used by exchanges to retrive cached results.
 *
 * @remarks
 * The `RequestPolicy` is used by cache exchanges to decide how a query operation may be resolved with cached results.h
 * A cache exchange may behave differently depending on which policy is returned.
 *
 * - `cache-first` (the default) prefers cached results and falls back to sending an API request.
 * - `cache-and-network` returns cached results but also always sends an API request in the background.
 * - `network-only` will ignore any cached results and send an API request.
 * - `cache-only` will always return cached results and prevent API requests.
 */
type RequestPolicy = 'cache-first' | 'cache-and-network' | 'network-only' | 'cache-only';
````

`@urql/core@6.0.3 dist/urql-core.d.ts`, `makeOperation` -- a constructor-and-copier with an `@example`; building a request record.
````ts
/** Creates a {@link Operation} from the given parameters.
 *
 * @param kind - The {@link OperationType} of GraphQL operation, i.e. `query`, `mutation`, or `subscription`.
 * @param request - The {@link GraphQLRequest} or {@link Operation} used as a template for the new `Operation`.
 * @param context - The {@link OperationContext} `context` data for the `Operation`.
 * @returns A new {@link Operation}.
 *
 * @remarks
 * This method is both used to create new {@link Operation | Operations} as well as copy and modify existing
 * operations. While it’s not required to use this function to copy an `Operation`, it is recommended, in case
 * additional dynamic logic is added to them in the future.
 *
 * Hint: When an {@link Operation} is passed to the `request` argument, the `context` argument does not have to be
 * a complete {@link OperationContext} and will instead be combined with passed {@link Operation.context}.
 *
 * @example
 * An example of copying an existing `Operation` to modify its `context`:
 *
 * ```ts
 * makeOperation(
 *   operation.kind,
 *   operation,
 *   { requestPolicy: 'cache-first' },
 * );
 * ```
 */
declare function makeOperation<Data = any, Variables extends AnyVariables = AnyVariables>(kind: OperationType, request: GraphQLRequest<Data, Variables>, context: OperationContext): Operation<Data, Variables>;
````

## Zod v4

Blocks from `zod` 4.6.7, `v4/core/compile.d.ts`, `v4/core/to-json-schema.d.ts`, `v4/core/api.d.ts` and `v4/classic/schemas.d.ts` (installed in this repo). Most of Zod's public methods (`parse`, `safeParse`, `refine`, `transform`, `brand`) carry no doc comment in the d.ts, so these are the ones that do.

`zod@4.6.7 v4/core/compile.d.ts`, `compile` -- a bulleted list of what the call promises, including that it never throws.
````ts
/**
 * AOT-compile a Zod schema. Returns a clone whose `_zod.run` calls a generated
 * fast path first and falls back to the original runtime parser on failure.
 *
 * - Forward direction only. Backward (encode), async, and `skipChecks` paths
 *   bypass the fast path and use the runtime directly.
 * - Never throws. A schema the fast path can't model is returned unchanged and
 *   keeps using the runtime parser. Pass `{ strict: true }` to get the refusal
 *   as a thrown `ZodCompileUnsupportedError` / `ZodCompileAsyncError` instead.
 * - The original schema is unchanged. The clone shares children by reference.
 */
export declare function compile<T extends SomeType>(schema: T, options?: CompileOptions): T;
````

`zod@4.6.7 v4/core/compile.d.ts`, `withParser` -- a caller-supplied function with the contract it must keep stated.
````ts
/**
 * Install an already-generated parser as a schema's fast path. Returns a clone; the original is
 * unchanged.
 *
 * The parser takes the input and returns the parsed value, or `INVALID` to hand the parse to the
 * runtime. It must be synchronous and forward-direction, and it must build fresh output rather than
 * return its input — Zod cannot check either, and a wrong *success* is returned to the caller as-is.
 *
 * `compile()` is the ordinary entry point. This is for a build-time or native compiler that produces
 * a parser where `new Function` is unavailable.
 */
export declare function withParser<T extends SomeType>(schema: T, parser: (input: unknown) => core.output<T> | INVALID): T;
````

`zod@4.6.7 v4/core/compile.d.ts`, `ZodCompileUnsupportedError` -- a refusal class, saying when it is raised and when it surfaces.
````ts
/**
 * Raised when the schema contains a feature whose semantics the fast path
 * can't fully model. Both the shim in `zod/compile` and the default
 * `compile()` fall back to the runtime parser for that schema; only
 * `compile(schema, { strict: true })` lets it surface.
 */
export declare class ZodCompileUnsupportedError extends Error {
````

`zod@4.6.7 v4/core/to-json-schema.d.ts`, `UnrepresentableHandler` -- a callback type whose return values each get a meaning.
````ts
/**
 * Called for each schema that has no JSON Schema equivalent. Return a JSON Schema to use in its
 * place, `"any"` to fall back to the `unrepresentable: "any"` behavior, or `"throw"`/`undefined` to
 * throw the default error. Throwing from the handler propagates, so custom errors work too.
 */
export type UnrepresentableHandler<T extends schemas.$ZodType = schemas.$ZodType> = (ctx: {
    zodSchema: T;
    path: (string | number)[];
    /** The error Zod would throw. Distinguishes sites that share a `zodSchema`, e.g. an `undefined`
     *  vs a `bigint` member of the same literal. */
    message: string;
}) => JSONSchema.BaseSchema | "throw" | "any" | undefined;
````

`zod@4.6.7 v4/classic/schemas.d.ts`, `ZodType.isOptional` -- a deprecation that shows the replacement as an `@example`.
````ts
    /** @deprecated Try safe-parsing `undefined` (this is what `isOptional` does internally):
     *
     * ```ts
     * const schema = z.string().optional();
     * const isOptional = schema.safeParse(undefined).success; // true
     * ```
     */
    isOptional(): boolean;
````

`zod@4.6.7 v4/classic/schemas.d.ts`, `xor` -- a two-line block contrasting the function with its sibling.
````ts
/** Creates an exclusive union (XOR) where exactly one option must match.
 * Unlike regular unions that succeed when any option matches, xor fails if
 * zero or more than one option matches the input. */
export declare function xor<const T extends readonly core.SomeType[]>(options: T, params?: string | core.$ZodXorParams): ZodXor<T>;
````

`zod@4.6.7 v4/core/api.d.ts`, `$ZodSuperRefineParams` -- a one-line option comment with its default behaviour.
````ts
    /** If provided, the refinement runs only when this returns `true`. By default, it is skipped if prior parsing produced aborting issues. */
    when?: ((payload: schemas.ParsePayload) => boolean) | undefined;
````

## Vue 3

Blocks from `vuejs/core` at tag `v3.5.13` (not installed; fetched from `https://raw.githubusercontent.com/vuejs/core/v3.5.13/packages/`): `reactivity/src/ref.ts`, `computed.ts`, `reactive.ts` and `watch.ts`. The `watch`, `watchEffect` and `nextTick` entry points carry no doc comment at that tag.

`vue@3.5.13 packages/reactivity/src/ref.ts`, `ref` -- the basic state holder; a short block with `@param` and `@see`.
````ts
/**
 * Takes an inner value and returns a reactive and mutable ref object, which
 * has a single property `.value` that points to the inner value.
 *
 * @param value - The object to wrap in the ref.
 * @see {@link https://vuejs.org/api/reactivity-core.html#ref}
 */
export function ref<T>(
  value: T,
): [T] extends [Ref] ? IfAny<T, Ref<T>, T> : Ref<UnwrapRef<T>, UnwrapRef<T> | T>
````

`vue@3.5.13 packages/reactivity/src/ref.ts`, `shallowRef` -- a variant defined against its sibling, with an `@example` of what does and does not notify.
````ts
/**
 * Shallow version of {@link ref()}.
 *
 * @example
 * ```js
 * const state = shallowRef({ count: 1 })
 *
 * // does NOT trigger change
 * state.value.count = 2
 *
 * // does trigger change
 * state.value = { count: 2 }
 * ```
 *
 * @param value - The "inner value" for the shallow ref.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowref}
 */
export function shallowRef<T>(
  value: T,
): Ref extends T
  ? T extends Ref
    ? IfAny<T, ShallowRef<T>, T>
    : ShallowRef<T>
  : ShallowRef<T>
````

`vue@3.5.13 packages/reactivity/src/ref.ts`, `triggerRef` -- a manual notify for a mutation the library cannot see.
````ts
/**
 * Force trigger effects that depends on a shallow ref. This is typically used
 * after making deep mutations to the inner value of a shallow ref.
 *
 * @example
 * ```js
 * const shallow = shallowRef({
 *   greet: 'Hello, world'
 * })
 *
 * // Logs "Hello, world" once for the first run-through
 * watchEffect(() => {
 *   console.log(shallow.value.greet)
 * })
 *
 * // This won't trigger the effect because the ref is shallow
 * shallow.value.greet = 'Hello, universe'
 *
 * // Logs "Hello, universe"
 * triggerRef(shallow)
 * ```
 *
 * @param ref - The ref whose tied effects shall be executed.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#triggerref}
 */
export function triggerRef(ref: Ref): void {
````

`vue@3.5.13 packages/reactivity/src/computed.ts`, `computed` -- a derived value, with two `@example`s for its two forms.
````ts
/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value.
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
````

`vue@3.5.13 packages/reactivity/src/reactive.ts`, `readonly` -- a view that rejects writes, with an `@example` of the warning.
````ts
/**
 * Takes an object (reactive or plain) or a ref and returns a readonly proxy to
 * the original.
 *
 * A readonly proxy is deep: any nested property accessed will be readonly as
 * well. It also has the same ref-unwrapping behavior as {@link reactive()},
 * except the unwrapped values will also be made readonly.
 *
 * @example
 * ```js
 * const original = reactive({ count: 0 })
 *
 * const copy = readonly(original)
 *
 * watchEffect(() => {
 *   // works for reactivity tracking
 *   console.log(copy.count)
 * })
 *
 * // mutating original will trigger watchers relying on the copy
 * original.count++
 *
 * // mutating the copy will fail and result in a warning
 * copy.count++ // warning!
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#readonly}
 */
export function readonly<T extends object>(
  target: T,
): DeepReadonly<UnwrapNestedRefs<T>> {
````

`vue@3.5.13 packages/reactivity/src/reactive.ts`, `toRaw` -- an escape hatch, with its caution stated.
````ts
/**
 * Returns the raw, original object of a Vue-created proxy.
 *
 * `toRaw()` can return the original object from proxies created by
 * {@link reactive()}, {@link readonly()}, {@link shallowReactive()} or
 * {@link shallowReadonly()}.
 *
 * This is an escape hatch that can be used to temporarily read without
 * incurring proxy access / tracking overhead or write without triggering
 * changes. It is **not** recommended to hold a persistent reference to the
 * original object. Use with caution.
 *
 * @example
 * ```js
 * const foo = {}
 * const reactiveFoo = reactive(foo)
 *
 * console.log(toRaw(reactiveFoo) === foo) // true
 * ```
 *
 * @param observed - The object for which the "raw" value is requested.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#toraw}
 */
export function toRaw<T>(observed: T): T {
````

`vue@3.5.13 packages/reactivity/src/watch.ts`, `onWatcherCleanup` -- a registered callback, saying when it runs.
````ts
/**
 * Registers a cleanup callback on the current active effect. This
 * registered cleanup callback will be invoked right before the
 * associated effect re-runs.
 *
 * @param cleanupFn - The callback function to attach to the effect's cleanup.
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 * @param owner - The effect that this cleanup function should be attached to.
 * By default, the current active effect.
 */
export function onWatcherCleanup(
  cleanupFn: () => void,
  failSilently = false,
  owner: ReactiveEffect | undefined = activeWatcher,
): void {
````
