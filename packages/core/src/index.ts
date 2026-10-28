// -----------------------------------------------------------------------------
// @fieldmaps/core
// The parts of Field Maps that need no UI: the GPS ↔ map-pixel fit, the GPS and
// compass watchers, navigation math, the OSM basemap's themes and painter, the
// scenario data model and the player's mark store. The Mahlwinkel airfield's
// content is the separate entry point `@fieldmaps/core/mahlwinkel`.
// -----------------------------------------------------------------------------

export { solveTransform, type ControlPoint, type Transform } from "./transform.js";
export {
	distanceMeters,
	bearingDegrees,
	relativeBearingDegrees,
	navigationHint,
	watch,
	POSITION_SMOOTHING,
	SNAP_DISTANCE_M,
	type Fix,
	type NavigationHint,
	type WatchOptions,
} from "./geo.js";
export { watchHeading, needsPermission, requestPermission, HEADING_SMOOTHING } from "./heading.js";
export {
	THEMES,
	resolveTheme,
	extendTheme,
	osmSurroundColor,
	bakeOsm,
	bakeShape,
	paintTile,
	gridColumnLabel,
	GRID_STEP_M,
	type OsmTheme,
	type OsmThemeName,
	type ThemeOverrides,
	type OutOfBoundsStyle,
	type FeatureClass,
	type AreaStyle,
	type LineStyle,
	type ClassStyle,
	type OsmFeatureCollection,
	type BakedGeometry,
	type BakedShape,
	type BakedZone,
	type BakedLine,
	type TileScene,
	type TileView,
} from "./osm-map.js";
export type {
	Scenario,
	ScenarioBase,
	LatLng,
	Zone,
	ZoneStyle,
	Headquarters,
	BoundaryLine,
	EventSchedule,
	MonthDay,
} from "./scenario.js";
export type { MapDefinition } from "./map-definition.js";
export {
	comparePointsOfInterest,
	type PointOfInterest,
	type LabeledPointOfInterest,
	type PoiKind,
} from "./poi.js";
export {
	markStore,
	markTargetId,
	markIdFromTarget,
	DEFAULT_MARKS_KEY,
	type Mark,
	type MarkStore,
} from "./marks.js";
export { CHECKPOINT_GLYPH } from "./glyphs.js";
export { BRAND_BLUE, BRAND_BLUE_DEEP, BRAND_ORANGE } from "./brand.js";
