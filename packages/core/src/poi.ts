// -----------------------------------------------------------------------------
// poi.ts
// What a point of interest is, independent of any one field. The registry of the
// Mahlwinkel airfield's points lives in mahlwinkel/points-of-interest.ts.
// -----------------------------------------------------------------------------

/**
 * How a point is drawn. Most are buildings and get a plain dot; a wind turbine or
 * a road barrier is recognisable on its own, so it is drawn as a glyph instead.
 */
export type PoiKind = "turbine" | "checkpoint";

/** A physical location on the field. Coordinates are shared across all scenarios. */
export interface PointOfInterest {
	id: string;
	lat: number;
	lng: number;
	/** Omitted for an ordinary building. */
	kind?: PoiKind;
}

/** A point of interest with the display label for a specific scenario. */
export interface LabeledPointOfInterest extends PointOfInterest {
	name: string;
}

/**
 * Order for a list a player scans by eye: the numbered buildings in ascending
 * numeric order, then the other named places (the checkpoints), then the wind
 * turbines grouped at the end — each named group alphabetically.
 */
export function comparePointsOfInterest(a: PointOfInterest, b: PointOfInterest): number {
	const group = (poi: PointOfInterest) =>
		poi.kind === "turbine" ? 2 : /^\d+$/.test(poi.id) ? 0 : 1;
	const byGroup = group(a) - group(b);
	if (byGroup) return byGroup;
	if (group(a) === 0) return Number(a.id) - Number(b.id);
	return a.id.localeCompare(b.id);
}
