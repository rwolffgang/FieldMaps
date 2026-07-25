// -----------------------------------------------------------------------------
// router.ts
// The whole app is two screens — the event overview and one map — so the "router"
// is a single query parameter:
//
//     /            -> the landing page
//     /?map=de     -> Dark Emergency, opened directly
//
// A query parameter (rather than a path or a hash) is what makes a bookmarked map
// work on any static host without rewrite rules, which matters because this ships
// as an offline PWA: a saved link has to resolve from the service worker cache with
// no server in reach. It also leaves room to deep-link further later (&poi=630).
// -----------------------------------------------------------------------------

import { MAPS } from "./config.js";

const MAP_PARAM = "map";

/** The map id in the current URL, or null for the landing page. Unknown ids are null. */
export function routedMapId(): string | null {
	const id = new URLSearchParams(location.search).get(MAP_PARAM);
	return id && MAPS.some((map) => map.id === id) ? id : null;
}

/** The shareable URL for a map — what the landing page puts in its `href`. */
export function mapUrl(id: string): string {
	return `?${MAP_PARAM}=${encodeURIComponent(id)}`;
}

/** Open a map, adding a history entry so Back returns to the overview. */
export function goToMap(id: string) {
	if (routedMapId() === id) return;
	history.pushState({ [MAP_PARAM]: id }, "", mapUrl(id));
	notify();
}

/** Return to the overview. */
export function goHome() {
	if (routedMapId() === null) return;
	history.pushState({}, "", location.pathname);
	notify();
}

const listeners = new Set<() => void>();

/** Subscribe to route changes, from either navigation or the Back button. */
export function onRouteChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notify() {
	for (const listener of listeners) listener();
}

window.addEventListener("popstate", notify);
