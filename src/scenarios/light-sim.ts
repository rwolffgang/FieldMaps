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
	dates: "17.–20. September",
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
		{ id: "parkplatz", name: "Parkplatz", lat: 52.377378, lng: 11.819751, color: "#e9edf2" },
	],
	playArea: [
		[52.3849, 11.812448],
		[52.384418, 11.835917],
		[52.376943, 11.835865],
		[52.376922, 11.833309],
		[52.37592, 11.833307],
		[52.375925, 11.826593],
		[52.377019, 11.826595],
		[52.377022, 11.822551],
		[52.378597, 11.821127],
		[52.379771, 11.820496],
		[52.379777, 11.812103],
	],
};
