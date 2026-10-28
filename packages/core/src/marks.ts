// -----------------------------------------------------------------------------
// marks.ts
// The player's own marks: spots they set down on a map themselves — a rally
// point, the corner a squad said it would hold, where the enemy was last seen.
//
// Kept per map, because the maps are per event and a mark set at one game means
// nothing at the next even on the same ground. Stored as lat/lng, never as
// pixels: the coordinates are what the player put down, and the calibration that
// turns them into pixels belongs to the map and may be refined later.
//
// On the device only (localStorage). Nothing about a mark leaves the phone.
// -----------------------------------------------------------------------------

export interface Mark {
	/** Unique within its map; also what the navigation keys on (see `markTargetId`). */
	id: string;
	name: string;
	lat: number;
	lng: number;
}

/** The storage key Field Maps has always used; `<field-map>` derives it from its `storagePrefix`. */
export const DEFAULT_MARKS_KEY = "field-map-marks";

/** The prefix a mark's id carries when it stands in as a navigation target. */
const MARK_TARGET_PREFIX = "__mark__:";

export function markTargetId(mark: Mark): string {
	return MARK_TARGET_PREFIX + mark.id;
}

/** The mark id inside a navigation target id, or null when it is not a mark's. */
export function markIdFromTarget(targetId: string): string | null {
	return targetId.startsWith(MARK_TARGET_PREFIX) ? targetId.slice(MARK_TARGET_PREFIX.length) : null;
}

type MarksByMap = Record<string, Mark[]>;

function isMark(value: unknown): value is Mark {
	const mark = value as Mark;
	return (
		typeof mark === "object" &&
		mark != null &&
		typeof mark.id === "string" &&
		typeof mark.name === "string" &&
		Number.isFinite(mark.lat) &&
		Number.isFinite(mark.lng)
	);
}

function readStore(key: string): MarksByMap {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const store: MarksByMap = {};
		for (const [mapId, marks] of Object.entries(parsed)) {
			if (Array.isArray(marks)) store[mapId] = marks.filter(isMark);
		}
		return store;
	} catch {
		return {};
	}
}

/** The marks on every map, kept under one storage key. */
export interface MarkStore {
	/** The marks on one map, oldest first. Treat the array as read-only. */
	load(mapId: string): readonly Mark[];
	add(mapId: string, mark: Omit<Mark, "id">): Mark;
	rename(mapId: string, markId: string, name: string): void;
	remove(mapId: string, markId: string): void;
}

/**
 * Held in memory per key as well, so a browser without storage (private mode) still
 * keeps the marks for the session instead of losing each one the moment it is set —
 * and two stores on the same key share one copy rather than overwriting each other.
 */
const stores = new Map<string, MarkStore>();

/** The mark store kept in `localStorage` under `key`. */
export function markStore(key = DEFAULT_MARKS_KEY): MarkStore {
	const existing = stores.get(key);
	if (existing) return existing;

	let all: MarksByMap | null = null;
	const marks = (): MarksByMap => (all ??= readStore(key));
	const write = () => {
		try {
			localStorage.setItem(key, JSON.stringify(marks()));
		} catch {
			// Storage unavailable or full — the marks still last the session.
		}
	};

	const store: MarkStore = {
		load: (mapId) => marks()[mapId] ?? [],
		add(mapId, mark) {
			const created: Mark = {
				...mark,
				id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
			};
			const byMap = marks();
			byMap[mapId] = [...(byMap[mapId] ?? []), created];
			write();
			return created;
		},
		rename(mapId, markId, name) {
			const byMap = marks();
			byMap[mapId] = (byMap[mapId] ?? []).map((mark) =>
				mark.id === markId ? { ...mark, name } : mark,
			);
			write();
		},
		remove(mapId, markId) {
			const byMap = marks();
			byMap[mapId] = (byMap[mapId] ?? []).filter((mark) => mark.id !== markId);
			if (byMap[mapId].length === 0) delete byMap[mapId];
			write();
		},
	};
	stores.set(key, store);
	return store;
}
