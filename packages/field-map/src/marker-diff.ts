// -----------------------------------------------------------------------------
// marker-diff.ts
// The pure half of the live markers (see markers.ts): what changed between two
// `markers` arrays, and whether a marker has gone stale. No Leaflet, no DOM, so
// it runs under `npm test`.
// -----------------------------------------------------------------------------

import type { MapMarker } from "./types.js";

/** What changes between two `markers` arrays, by id. */
export interface MarkerDiff {
	added: MapMarker[];
	/** Same id, new position, heading, ring or freshness — moved in place. */
	updated: MapMarker[];
	/** Same id, new icon, colour or label — the element is rebuilt. */
	restyled: MapMarker[];
	removed: string[];
}

/** The part of a marker that decides its markup. */
export function appearanceKey(marker: MapMarker): string {
	return `${marker.icon ?? ""}\u0000${marker.color ?? ""}\u0000${marker.label ?? ""}`;
}

function sameDynamics(a: MapMarker, b: MapMarker): boolean {
	return (
		a.lat === b.lat &&
		a.lng === b.lng &&
		(a.heading ?? null) === (b.heading ?? null) &&
		a.accuracyM === b.accuracyM &&
		a.seenAt === b.seenAt &&
		a.layer === b.layer &&
		Boolean(a.navigable) === Boolean(b.navigable)
	);
}

/**
 * Compare the markers on the map with the ones the host just set. A duplicate id in
 * `next` keeps its last occurrence, the way assigning into a map by id would.
 */
export function diffMarkers(
	previous: ReadonlyMap<string, MapMarker>,
	next: readonly MapMarker[],
): MarkerDiff {
	const incoming = new Map<string, MapMarker>();
	for (const marker of next) incoming.set(marker.id, marker);

	const diff: MarkerDiff = { added: [], updated: [], restyled: [], removed: [] };
	for (const [id, marker] of incoming) {
		const before = previous.get(id);
		if (!before) diff.added.push(marker);
		else if (appearanceKey(before) !== appearanceKey(marker)) diff.restyled.push(marker);
		else if (!sameDynamics(before, marker)) diff.updated.push(marker);
	}
	for (const id of previous.keys()) if (!incoming.has(id)) diff.removed.push(id);
	return diff;
}

/** Whether a marker's position is older than `staleAfterMs`. Never, without `seenAt`. */
export function isStale(marker: MapMarker, now: number, staleAfterMs: number): boolean {
	return marker.seenAt != null && staleAfterMs > 0 && now - marker.seenAt > staleAfterMs;
}

/** Whole minutes since the marker's position, rounded down. */
export function minutesSince(marker: MapMarker, now: number): number {
	return marker.seenAt == null ? 0 : Math.max(0, Math.floor((now - marker.seenAt) / 60000));
}

export function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"']/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
	);
}
