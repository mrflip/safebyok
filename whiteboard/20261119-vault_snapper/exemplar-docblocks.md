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
