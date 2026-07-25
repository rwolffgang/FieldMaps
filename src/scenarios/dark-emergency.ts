import { scenarioPoiNames } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Dark Emergency — GOF vs KGG vs Miliz, on the OSM vector base in the event's own
 * near-black tactical style.
 *
 * Everything here is read off the official tactical map DE-39517-2026-1
 * (airsofthelden-events.com/dark-emergency/taktikkarte). That map was georeferenced
 * from the five named wind turbines, which closed to 3.0 m RMS — the PoI positions
 * are that good. The play area and safe zones were traced by hand off the same
 * image and are only good to a few tens of metres.
 *
 * Note the 2026 legend renumbers a couple of things relative to Mission 24H: its
 * "612 Fahrzeughalle" is the building every other event calls 613, and it drops
 * 600/607 in favour of the named Enklave Base / Miliz HQ markers below.
 */
export const darkEmergency: Scenario = {
	id: "de",
	name: "Dark Emergency",
	base: { kind: "osm", theme: "de" },
	poiNames: scenarioPoiNames(
		{
			// The DE legend's own wording, where it differs from the M24 baseline.
			"601": "Bürokomplex",
			"608": "Krankenhaus",
			"610": "Laborkomplex",
			"613": "Fahrzeughalle (612)",
			"621": "Halle 1981",
			"631": "Schützengräben",
			"714": "Radarstation",
			"807": "Grabensystem",
			"817": "Bunker 19",
		},
		// Not printed on the DE map.
		["204", "217", "602", "700", "800", "820", "825"],
	),
	headquarters: [
		{
			id: "gof-hq",
			name: "GOF HQ",
			lat: 52.383729,
			lng: 11.814704,
			color: "#e8c24d",
			logo: "logos/gof.png",
		},
		{
			id: "kgg-hq",
			name: "KGG HQ",
			lat: 52.383429,
			lng: 11.834682,
			color: "#c8393f",
			logo: "logos/kgg.png",
		},
		{
			id: "miliz",
			name: "Miliz HQ",
			lat: 52.379664,
			lng: 11.82435,
			color: "#2f7fc4",
			logo: "logos/miliz.png",
		},
		{ id: "enklave", name: "Enklave Base", lat: 52.380065, lng: 11.822185, color: "#2f9d5e" },
		{
			id: "gof-vp",
			name: "GOF Vorposten",
			lat: 52.378902,
			lng: 11.836828,
			color: "#e8c24d",
			logo: "logos/gof.png",
		},
		{
			id: "kgg-vp",
			name: "KGG Vorposten",
			lat: 52.378063,
			lng: 11.817321,
			color: "#c8393f",
			logo: "logos/kgg.png",
		},
	],
	zones: [
		{
			id: "gof-hq-safe",
			name: "Safe Zone",
			color: "#e8c24d",
			points: [
				[52.384339, 11.81371],
				[52.385077, 11.815187],
				[52.384281, 11.816397],
				[52.383385, 11.814833],
			],
		},
		{
			id: "kgg-hq-safe",
			name: "Safe Zone",
			color: "#e8c24d",
			points: [
				[52.384515, 11.833734],
				[52.384591, 11.835988],
				[52.383347, 11.836199],
				[52.383139, 11.834117],
			],
		},
		{
			id: "kgg-vp-safe",
			name: "Safe Zone",
			color: "#e8c24d",
			points: [
				[52.378567, 11.81637],
				[52.378564, 11.818364],
				[52.377585, 11.818402],
				[52.377589, 11.816365],
			],
		},
		{
			id: "gof-vp-safe",
			name: "Safe Zone",
			color: "#e8c24d",
			points: [
				[52.379247, 11.836179],
				[52.379245, 11.83735],
				[52.378531, 11.837346],
				[52.378533, 11.836176],
			],
		},
	],
	playArea: [
		[52.385885, 11.812937],
		[52.385875, 11.818641],
		[52.385558, 11.818639],
		[52.385542, 11.827758],
		[52.385466, 11.828884],
		[52.384406, 11.835597],
		[52.383084, 11.835677],
		[52.382712, 11.836586],
		[52.381969, 11.837752],
		[52.380223, 11.837744],
		[52.380063, 11.83835],
		[52.379377, 11.83761],
		[52.378875, 11.837044],
		[52.379252, 11.833276],
		[52.379181, 11.828681],
		[52.379394, 11.827512],
		[52.379108, 11.825041],
		[52.3793, 11.821184],
		[52.379172, 11.818627],
		[52.378303, 11.816369],
		[52.377087, 11.81567],
		[52.377674, 11.812639],
		[52.378258, 11.811601],
		[52.381486, 11.811616],
		[52.382647, 11.812922],
	],
};
