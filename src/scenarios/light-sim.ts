import { scenarioPoiNames } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * LIGHT-SIM — TERRA vs UCRF. The printed map (DE-39517-2026-7) is deliberately
 * sparse: no building numbers at all, just the two HQs, the car park, and the play
 * area. This scenario keeps the shared PoI set for navigation but matches that
 * map's cool, near-unstyled satellite look.
 *
 * It is the only event map with a real coordinate grid — UTM zone 32N, 100 m
 * spacing — so its georeference is exact rather than fitted: the grid lines were
 * detected in the image (192.4 px per 100 m at 4096 px wide) and converted through
 * UTM. Projecting the shared PoIs back onto it lands them squarely on their
 * buildings, which is the cross-check that validated the whole registry.
 *
 * The play area, both HQs and the car park below were re-read off that map through
 * its own grid, which put them within a few metres of the printed symbols. The
 * boundary is the drawn one traced at 8 m tolerance; it closes 120.3 ha.
 *
 * The map itself notes "Tatsächliche Spielfeldgrenzen werden durch Flatterband
 * markiert" — the drawn boundary is indicative; tape on the ground wins.
 *
 * One consequence of tracing it honestly: the south edge of the south-east lobe
 * drops up to 47 m below the shared OSM canvas, whose south edge is 52.376. That
 * 1.95 ha (1.6% of the field) is inside the play area but has no basemap under it,
 * so it draws as bare surround. Widening the canvas would re-cut every other
 * scenario's base for one thin strip, so the boundary is left correct instead.
 *
 * The 2026 operational guide adds seven scoring zones (RAVEN, TITAN, SPEAR,
 * SHIELD, FALCON, ORBIT, IRON). They are deliberately not mapped here: the guide
 * says their positions are unknown at kick-off and are revealed only by finding
 * and activating their control points, so printing them would give the game away.
 */
export const lightSim: Scenario = {
	id: "lso",
	name: "LIGHT-SIM",
	blurb: "TERRA gegen UCRF auf dem Airfield. Leichtes Regelwerk, volle Fläche.",
	blurbEn: "TERRA against UCRF on the airfield. Light rule set, the whole site.",
	schedule: { start: [9, 17], end: [9, 20] },
	accent: "#4aa3d6",
	base: { kind: "osm", theme: "lso" },
	poiNames: scenarioPoiNames({ "700": "UCRF HQ" }, ["Tango", "423", "505", "508"]),
	headquarters: [
		{
			id: "ucrf",
			name: "UCRF HQ",
			// Hangar, building 700. Kept on the shared PoI coordinate, which sits 7 m
			// from the centre of the printed marker.
			lat: 52.383771,
			lng: 11.814514,
			color: "#2f6fc4",
			logo: "logos/ucrf.png",
		},
		{
			id: "terra",
			name: "TERRA HQ",
			// Vehicle halls, building 120, in the south-east lobe.
			lat: 52.377223,
			lng: 11.833211,
			color: "#3f9d4a",
			logo: "logos/terra.png",
		},
		{ id: "parkplatz", name: "Parkplatz", lat: 52.37714, lng: 11.819389, color: "#e9edf2" },
	],
	playArea: [
		[52.384834, 11.812514],
		[52.383714, 11.835973],
		[52.376204, 11.834983],
		[52.376237, 11.834087],
		[52.375956, 11.833504],
		[52.375379, 11.833414],
		[52.375573, 11.82707],
		[52.377499, 11.826108],
		[52.376764, 11.822028],
		[52.378181, 11.82132],
		[52.378193, 11.820633],
		[52.379314, 11.820762],
		[52.379742, 11.811858],
	],
};
