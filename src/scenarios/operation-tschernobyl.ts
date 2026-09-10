import { scenarioPoiNames } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Operation Tschernobyl — Stalker/Chernobyl themed game on the OpenStreetMap
 * vector base (the aged-sepia style). The play area is limited: everything outside
 * the boundary below is masked out.
 *
 * Labels and HQ emblems now follow the official tactical map TNO-39517-2024-9
 * (airsofthelden-events.com/op-tschernobyl/taktikkarte); the earlier hand-typed
 * names were close but not the legend's wording.
 *
 * NOTE: `playArea` is still a generated placeholder (the convex hull of the PoIs, a
 * bit expanded). Replace it with the real, walked boundary for this game.
 */
export const operationTschernobyl: Scenario = {
	id: "opt",
	name: "Operation Tschernobyl",
	blurb: "Stalker-Szenario in der Zone: fünf Fraktionen, Sperrgebiet, Anomalien.",
	blurbEn: "Stalker scenario in the Zone: five factions, an exclusion area, anomalies.",
	schedule: { start: [10, 8], end: [10, 11] },
	accent: "#e6c24d",
	base: { kind: "osm" },
	poiNames: scenarioPoiNames(
		{
			"601": "Garnison",
			"607": "Forschungskomplex",
			"608": "Funkstation",
			"610": "Stalker Bar",
			"616": "Forschungsbunker",
			"631": "No Man's Land",
			"700": "Kraftwerk",
			"714": "Unterschlupf",
			"800": "Stützpunkt",
			"807": "Grabensystem",
			"820": "Strahlenbunker",
		},
		// Not printed on the OP Tschernobyl map.
		["204", "217", "423", "500", "505", "508", "602", "808", "825", "Tango"],
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
			id: "wissenschaftler",
			name: "Wissenschaftler",
			lat: 52.379629,
			lng: 11.824478,
			color: "#e9edf2",
			logo: "logos/tno-wissenschaftler.png",
		},
	],
	zones: [
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
		[52.378485, 11.82179],
		[52.379361, 11.825745],
		[52.379952, 11.82718],
		[52.379176, 11.828867],
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
