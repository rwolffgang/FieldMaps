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
 * detected in the image (192.7 px per 100 m) and converted through UTM. Projecting
 * the shared PoIs back onto it lands them squarely on their buildings, which is the
 * cross-check that validated the whole registry.
 *
 * The map itself notes "Tatsächliche Spielfeldgrenzen werden durch Flatterband
 * markiert" — the drawn boundary is indicative; tape on the ground wins.
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
			lat: 52.383771,
			lng: 11.814514,
			color: "#2f6fc4",
			logo: "logos/ucrf.png",
		},
		{
			id: "terra",
			name: "TERRA HQ",
			lat: 52.377802,
			lng: 11.83373,
			color: "#3f9d4a",
			logo: "logos/terra.png",
		},
		{ id: "parkplatz", name: "Parkplatz", lat: 52.377182, lng: 11.820089, color: "#e9edf2" },
	],
	playArea: [
		[52.384334, 11.812221],
		[52.384334, 11.835691],
		[52.376732, 11.835691],
		[52.376732, 11.834553],
		[52.376553, 11.834155],
		[52.376112, 11.834094],
		[52.37599, 11.828017],
		[52.377846, 11.826542],
		[52.376955, 11.822622],
		[52.378331, 11.821752],
		[52.378181, 11.821139],
		[52.379327, 11.821141],
		[52.379424, 11.812275],
	],
};
