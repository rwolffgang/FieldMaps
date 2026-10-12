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

const MARKS_KEY = "field-map-marks";

/** The prefix a mark's id carries when it stands in as a navigation target. */
const MARK_TARGET_PREFIX = "__mark__:";

export function markTargetId(mark: Mark): string {
	return MARK_TARGET_PREFIX + mark.id;
}

/** The mark id inside a navigation target id, or null when it is not a mark's. */
export function markIdFromTarget(targetId: string): string | null {
	return targetId.startsWith(MARK_TARGET_PREFIX) ? targetId.slice(MARK_TARGET_PREFIX.length) : null;
}

type MarkStore = Record<string, Mark[]>;

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

function readStore(): MarkStore {
	try {
		const raw = localStorage.getItem(MARKS_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const store: MarkStore = {};
		for (const [mapId, marks] of Object.entries(parsed)) {
			if (Array.isArray(marks)) store[mapId] = marks.filter(isMark);
		}
		return store;
	} catch {
		return {};
	}
}

/**
 * Held in memory as well, so a browser without storage (private mode) still keeps
 * the marks for the session instead of losing each one the moment it is set.
 */
let store: MarkStore | null = null;

function marksStore(): MarkStore {
	store ??= readStore();
	return store;
}

function writeStore() {
	try {
		localStorage.setItem(MARKS_KEY, JSON.stringify(marksStore()));
	} catch {
		// Storage unavailable or full — the marks still last the session.
	}
}

/** The marks on one map, oldest first. Treat the array as read-only. */
export function loadMarks(mapId: string): readonly Mark[] {
	return marksStore()[mapId] ?? [];
}

export function addMark(mapId: string, mark: Omit<Mark, "id">): Mark {
	const created: Mark = {
		...mark,
		id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
	};
	const all = marksStore();
	all[mapId] = [...(all[mapId] ?? []), created];
	writeStore();
	return created;
}

export function renameMark(mapId: string, markId: string, name: string) {
	const all = marksStore();
	all[mapId] = (all[mapId] ?? []).map((mark) => (mark.id === markId ? { ...mark, name } : mark));
	writeStore();
}

export function deleteMark(mapId: string, markId: string) {
	const all = marksStore();
	all[mapId] = (all[mapId] ?? []).filter((mark) => mark.id !== markId);
	if (all[mapId].length === 0) delete all[mapId];
	writeStore();
}
