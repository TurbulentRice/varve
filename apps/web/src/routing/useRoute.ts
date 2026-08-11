/**
 * The browser half of routing: a hook over `window.location.hash`.
 *
 * Everything interesting lives in `route.ts`. This subscribes to the one event
 * the browser offers, and hands back a parsed {@link Route} plus a way to change
 * it. It is deliberately the boring part.
 *
 * ## Why a store rather than `useState` + `useEffect`
 *
 * The hash is external state that React does not own, which is exactly what
 * `useSyncExternalStore` exists for — it keeps every subscriber consistent
 * within a render and cannot tear.
 *
 * The store also solves a problem `hashchange` alone does not.
 * `history.replaceState` changes the URL *without* firing `hashchange`, so a
 * replacing navigation would update the address bar and leave the UI behind. A
 * listener set of our own means both kinds of navigation notify the same way.
 *
 * ## Push versus replace
 *
 * Opening an account or the editor **pushes**, so back returns where you came
 * from. Stepping between years inside the editor **replaces**, because a reader
 * paging through a decade should not have to press back fifteen times to escape
 * — those are refinements of one destination, not fifteen destinations.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { formatRoute, parseRoute, type Route } from './route.js';

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('hashchange', notify);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('hashchange', notify);
    }
  };
}

const getSnapshot = () => (typeof window === 'undefined' ? '' : window.location.hash);

export interface NavigateOptions {
  /** Overwrite the current history entry instead of adding one. */
  readonly replace?: boolean;
}

export function navigate(to: Route, options: NavigateOptions = {}): void {
  const hash = formatRoute(to);
  if (hash === window.location.hash) return;

  if (options.replace) {
    history.replaceState(null, '', hash);
    // replaceState is silent, so the subscribers have to be told.
    notify();
  } else {
    // Assigning the hash pushes a history entry and fires `hashchange` itself.
    window.location.hash = hash;
  }
}

/** The current route, re-rendering whenever it changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '');

  // Parsing is cheap, but a stable identity keeps it usable as a dependency.
  return useMemo(() => parseRoute(hash), [hash]);
}

/** `useRoute`, plus the navigator, for components that need both. */
export function useNavigation(): readonly [Route, (to: Route, options?: NavigateOptions) => void] {
  const route = useRoute();
  const go = useCallback((to: Route, options?: NavigateOptions) => navigate(to, options), []);
  return [route, go];
}
