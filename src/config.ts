import { labelPointsOfInterest, MAPS as ALL_MAPS } from "@fieldmaps/core/mahlwinkel";
import type { LabeledPointOfInterest, MapDefinition } from "@fieldmaps/core";
import { compareBySchedule, isRunning } from "./event-schedule.js";

// =============================================================================
//  The scenarios, the points of interest and the field's calibration live in the
//  `@fieldmaps/core` package (packages/core/src/mahlwinkel/) — the same data
//  `<field-map>` draws, so there is one copy of it. This file only orders the
//  events for the overview.
// =============================================================================

export type { LabeledPointOfInterest, MapDefinition };

/** All selectable maps, one per scenario, in registration order. */
export const MAPS: readonly MapDefinition[] = ALL_MAPS;

/**
 * The maps in the order a player wants them: the event that is running right now
 * first, then the next one, then this year's past events, then style variants
 * (no schedule).
 *
 * A function rather than a constant because the answer depends on today's date, and
 * this is a PWA that people leave open for a whole weekend. Cheap enough to call per
 * render; the list is single digits long.
 */
export function mapsByDate(now = new Date()): MapDefinition[] {
	return [...MAPS].sort((a, b) => compareBySchedule(a, b, now));
}

/**
 * The event that is on today, if exactly one is. Two overlapping events (none today)
 * would make "the" map a guess, so that case answers null and leaves the choice to
 * the overview.
 */
export function runningMap(now = new Date()): MapDefinition | null {
	const running = MAPS.filter((map) => map.schedule != null && isRunning(map.schedule, now));
	return running.length === 1 ? running[0] : null;
}

/** Which map loads on first visit (before any saved preference or URL). */
export const DEFAULT_MAP_ID = MAPS[0]?.id ?? "";

export function getMapById(id: string): MapDefinition {
	return MAPS.find((map) => map.id === id) ?? MAPS[0];
}

/** PoIs visible on a map: shared coordinates with that map's scenario labels. */
export function getPointsOfInterestForMap(mapId: string): LabeledPointOfInterest[] {
	return labelPointsOfInterest(getMapById(mapId).poiNames);
}
