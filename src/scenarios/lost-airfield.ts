import { LOST_AIRFIELD_ONLY_NAMES, scenarioPoiNames } from "../points-of-interest.js";
import type { Scenario } from "./scenario.js";

/**
 * Lost Airfield — the one-day game (PMC vs Rebellen), in a cool grey-green daytime
 * satellite style matching its printed map.
 *
 * Its map covers a different window of the site than the big events: it drops the
 * far west (Oskar/Tango) and reaches further south into the 200-series buildings,
 * and it numbers far more of the site than any other event — 31 buildings that no
 * other legend mentions. Those are in the shared registry now, georeferenced from
 * the 28 buildings this map shares with the others (9.8 m RMS).
 *
 * The map ships no legend, so the extra buildings are labelled by their site number
 * (see LOST_AIRFIELD_ONLY_NAMES) rather than a game name.
 */
export const lostAirfield: Scenario = {
	id: "laf",
	name: "Lost Airfield",
	blurb: "Das Airsoft-Tagesspiel in Mahlwinkel. PMC gegen Rebellen, ein Tag.",
	schedule: { start: [6, 20] },
	accent: "#d8b34a",
	base: { kind: "osm", theme: "laf" },
	poiNames: scenarioPoiNames(
		{ ...LOST_AIRFIELD_ONLY_NAMES, "204": "Gebäude 204", "217": "Gebäude 217" },
		// West and far-north of this map's window.
		[
			"Oskar",
			"Tango",
			"Lima",
			"700",
			"714",
			"720",
			"423",
			"500",
			"502",
			"505",
			"506",
			"508",
			"800",
			"808",
		],
	),
	headquarters: [
		{ id: "pmc", name: "PMC HQ", lat: 52.382822, lng: 11.82911, color: "#e8c24d" },
		{
			id: "rebellen",
			name: "Rebellen HQ",
			lat: 52.377605,
			lng: 11.826322,
			color: "#c8393f",
			logo: "logos/rebellen.png",
		},
	],
	playArea: [
		[52.383045, 11.821206],
		[52.383028, 11.825431],
		[52.38305, 11.828672],
		[52.38245, 11.828666],
		[52.382537, 11.833297],
		[52.382312, 11.836652],
		[52.380049, 11.836975],
		[52.37899, 11.836732],
		[52.378894, 11.834415],
		[52.378939, 11.831985],
		[52.379292, 11.831989],
		[52.379275, 11.827474],
		[52.37875, 11.826311],
		[52.378043, 11.826303],
		[52.377427, 11.821319],
		[52.3787, 11.821101],
	],
};
