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
			name: "Militärisches Sperrgebiet",
			color: "#d8433f",
			points: [
				[52.385466, 11.828884],
				[52.384406, 11.835597],
				[52.383084, 11.835677],
				[52.382712, 11.83271],
				[52.383404, 11.829],
			],
		},
	],
	playArea: [
		[52.383026, 11.812014],
		[52.378801, 11.821488],
		[52.377653, 11.824109],
		[52.378552, 11.838138],
		[52.379819, 11.838736],
		[52.383716, 11.835552],
		[52.384601, 11.828446],
		[52.384439, 11.822996],
		[52.384031, 11.813129],
	],
};
