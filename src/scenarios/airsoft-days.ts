import { scenarioPoiNames } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Airsoft Days — Delta Unit vs Ghost Infantry, drawn in the event's bright green
 * house style (the printed map sits on an apple-green surround).
 *
 * Labels come from the ASD-39517-2024-7 tactical map legend. That map uses the same
 * building numbering as Mission 24H, so almost everything maps straight across; only
 * the handful of names below differ. The play area was traced off the same image.
 */
export const airsoftDays: Scenario = {
	id: "asd",
	name: "Airsoft Days",
	base: { kind: "osm", theme: "asd" },
	poiNames: scenarioPoiNames(
		{
			"601": "Garnison",
			"608": "Krankenhaus",
			"610": "Laborkomplex",
			"616": "Forschungsbunker",
			"631": "Niemandsland",
			"714": "Delta Unit",
			"800": "Stützpunkt",
			"807": "Grabensystem",
			"820": "Ghost Infantry",
		},
		// Not printed on the ASD map.
		["204", "217", "602", "423", "500", "505", "508", "808", "825", "Tango"],
	),
	headquarters: [
		{
			id: "delta",
			name: "Delta Unit",
			lat: 52.384138,
			lng: 11.823325,
			color: "#8cc63f",
			logo: "logos/delta.png",
		},
		{
			id: "ghost",
			name: "Ghost Infantry",
			lat: 52.378881,
			lng: 11.836845,
			color: "#e8c24d",
			logo: "logos/ghost.png",
		},
		{ id: "stuetzpunkt", name: "Stützpunkt", lat: 52.383492, lng: 11.834536, color: "#2f9d5e" },
	],
	playArea: [
		[52.3856, 11.812104],
		[52.385674, 11.82779],
		[52.385661, 11.831979],
		[52.384312, 11.834224],
		[52.382799, 11.836561],
		[52.379868, 11.837846],
		[52.379321, 11.837318],
		[52.379112, 11.834468],
		[52.37918, 11.830546],
		[52.379384, 11.827513],
		[52.379592, 11.825549],
		[52.378705, 11.821995],
		[52.378263, 11.820575],
		[52.379784, 11.820199],
		[52.381634, 11.820175],
		[52.383022, 11.814454],
		[52.383011, 11.812136],
	],
};
