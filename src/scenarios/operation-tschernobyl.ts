import { scenarioPoiNames } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Operation Tschernobyl — Stalker/Chernobyl themed game on the OpenStreetMap
 * vector base (the aged-sepia style). The play area is limited: everything outside
 * the boundary below is masked out.
 *
 * Labels, HQ emblems and the southern boundary follow the official tactical map
 * TNO-39517-2026-9 (airsofthelden-events.com/op-tschernobyl/taktikkarte). Against
 * the 2024 edition it adds the irradiated block south of 601 (204, 213, 217 — the
 * "Verstrahlt" zone), takes Sierra's clearing into the field, splits 601/602 into
 * Garnison Süd/Nord, and swaps the trench names: 631 is now "Grabensystem" and 807
 * "Schützengräben".
 *
 * This map's "213 Altes Lagerhaus" is the building the site (and the Lost Airfield
 * map) numbers 211 — the site's own 213 is the long hall at the west end of the
 * same block — so it is labelled on 211 with the printed number alongside.
 *
 * The play area and zones are traced by hand off the printed maps, so their
 * edges are good to a few tens of metres only.
 */
export const operationTschernobyl: Scenario = {
	id: "opt",
	name: "Operation Tschernobyl",
	blurb: "Stalker-Szenario in der Zone: sieben Fraktionen, Sperrgebiet, Anomalien.",
	blurbEn: "Stalker scenario in the Zone: seven factions, an exclusion area, anomalies.",
	schedule: { start: [10, 8], end: [10, 11] },
	accent: "#e6c24d",
	base: { kind: "osm" },
	dosimeter: true,
	// Besides the six HQs: the buildings the story makes hot. 700 Kraftwerk already
	// carries the Freiheit HQ.
	radiatingPois: ["607", "616", "820"],
	poiNames: scenarioPoiNames(
		{
			"211": "Altes Lagerhaus (213)",
			"607": "Forschungskomplex",
			"610": "Stalker Bar",
			"616": "Forschungsbunker",
			"700": "Kraftwerk",
			"714": "Unterschlupf",
			"800": "Stützpunkt",
			"820": "Strahlenbunker",
		},
		// Not printed on the OP Tschernobyl map.
		["423", "500", "505", "508", "808", "825", "Tango"],
	),
	headquarters: [
		{
			id: "freiheit",
			name: "Freiheit — Kraftwerk",
			lat: 52.383773,
			lng: 11.814515,
			color: "#2f6fc4",
			logo: "logos/tno-freiheit.png",
		},
		{
			id: "militaer",
			name: "Militär — Stützpunkt",
			lat: 52.383492,
			lng: 11.834536,
			color: "#2f9d5e",
			logo: "logos/tno-militaer.png",
		},
		{
			id: "banditen",
			name: "Banditen — Unterschlupf",
			lat: 52.384138,
			lng: 11.823325,
			color: "#c8393f",
			logo: "logos/tno-banditen.png",
		},
		{
			id: "stalker",
			name: "Stalker Bar",
			lat: 52.380446,
			lng: 11.8267,
			color: "#e8c24d",
			logo: "logos/tno-stalker.png",
		},
		{
			// The blue-and-yellow radiation disc between the Stalker Bar and the
			// Forschungskomplex. It stands in the open rather than on a numbered
			// building, so it is drawn as its own marker.
			id: "baltische-brigade",
			name: "Baltische Brigade",
			lat: 52.380042,
			lng: 11.825784,
			color: "#1f9bd4",
			logo: "logos/tno-baltische-brigade.png",
		},
		{
			id: "wissenschaftler",
			name: "Wissenschaftler",
			lat: 52.379629,
			lng: 11.824478,
			color: "#e9edf2",
			logo: "logos/tno-wissenschaftler.png",
		},
		{
			// The triangle with three circles just south-west of 616. Like the Baltische
			// Brigade it stands in the open, so it gets its own marker; the emblem was
			// redrawn from the printed symbol.
			id: "sekte",
			name: "Die Sekte",
			lat: 52.380702,
			lng: 11.823755,
			color: "#9b6fd6",
			logo: "logos/tno-sekte.png",
		},
	],
	zones: [
		{
			// The biohazard-strewn block south of 601 (204/213/217), new on the 2026
			// map. Its west and south edges are the play-area boundary itself.
			id: "verstrahlt",
			name: "Verstrahlt",
			color: "#35c85a",
			style: "biohazard",
			points: [
				[52.378221, 11.821136],
				[52.379244, 11.825704],
				[52.377933, 11.82655],
				[52.376942, 11.822157],
			],
		},
		{
			// "LEBENSGEFAHR! MILITÄRISCHES SPERRGEBIET" — the fenced-off strip north-east
			// of Bravo. Traced off the printed map, so treat the edges as indicative.
			id: "sperrgebiet",
			name: "Militärisches<br>Sperrgebiet",
			color: "#d8433f",
			points: [
				[52.38482, 11.828657],
				[52.381452, 11.828633],
				[52.381378, 11.829737],
				[52.380042, 11.830387],
				[52.379167, 11.830698],
				[52.37894, 11.832106],
				[52.378856, 11.836383], //+
				[52.378521, 11.836506], //+
				[52.378561, 11.837226], //+
				[52.378965, 11.837173], //+
				[52.379566, 11.837329], //+
				[52.379647, 11.837889], //+
				[52.380346, 11.837774], //+
				[52.380313, 11.83712], //+
				[52.382147, 11.83683], //+
				[52.382187, 11.835487], //+
				[52.382065, 11.834826], // ?+
				[52.382877, 11.835234], //+
				[52.38372, 11.835203], //+
				[52.384805, 11.8327], //+
			],
		},
	],
	playArea: [
		[52.382453, 11.812863],
		[52.381952, 11.815219],
		[52.381497, 11.815253],
		[52.381497, 11.821035], //  52.380759, 11.821035
		[52.378493, 11.82101],
		// The 2026 map's southern extension: down the Verstrahlt block and round
		// Sierra's clearing, which the 2024 edition left outside.
		[52.376942, 11.822157],
		[52.377933, 11.82655],
		[52.378288, 11.828248],
		[52.379021, 11.828556],
		[52.37894, 11.832106],
		[52.378856, 11.836383], //+
		[52.378521, 11.836506], //+
		[52.378561, 11.837226], //+
		[52.378965, 11.837173], //+
		[52.379566, 11.837329], //+
		[52.379647, 11.837889], //+
		[52.380346, 11.837774], //+
		[52.380313, 11.83712], //+
		[52.382147, 11.83683], //+
		[52.382187, 11.835487], //+
		[52.382065, 11.834826], // ?+
		[52.382877, 11.835234], //+
		[52.38372, 11.835203], //+
		[52.384805, 11.8327], //+
		[52.38482, 11.812852],
	],
};
