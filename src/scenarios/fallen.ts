import type { Scenario } from "./scenario.js";

const OT_RED = "#c0392b";

/**
 * FALLEN — Bad Lands, the post-apocalyptic LARP by Lost Ideas (fallen-larp.de), on
 * the same Mahlwinkel airfield as the airsoft events. One a year, four to seven days
 * in spring: 2026 ran 29.04.–03.05., FALLEN 2027 ("Piccadilly Returns", the 20th)
 * runs 17.–23.05.2027. **The dates move every year** — update `schedule` once the
 * next one is announced.
 *
 * Its map ("Die Bad Lands", IT-Karte v03, in reference/tactical-maps/) is a
 * hand-drawn bird's-eye view, not to scale, and Lost Ideas numbers the field its own
 * way — 230 is the city, 42.0x the turbines. So every place below was matched by
 * hand to a building in the registry from the drawing's layout and building shapes
 * (the hangar row, the tower, the heating plant's chimneys, the turbines), and is
 * shown under FALLEN's number via `poiNumbers`. Trust the building, not the metres.
 *
 * Left out because the drawing does not pin them to a building: the OT area at the
 * map's bottom-left (2 Hotelruine, 4 Orgaplex, 6 Zeltplatz & Duschen), and the
 * numbered buildings without a legend entry (244, 246, 261). 5 Autofriedhof, the OT
 * car park, is placed where LIGHT-SIM's map puts the usual car park.
 */
const PLACES: [id: string, number: string, name: string][] = [
	["508", "1", "Angel Falls Ruine"],
	["fallen-5", "5", "Autofriedhof (OT-Parkplatz)"],
	["fallen-200", "200", "Wagenplatz Ost Vegas"],
	["213", "210", "Charlies"],
	["207", "211", "OT gesperrt"],
	["212", "212", "5th Division"],
	["211", "213", "Med Corps"],
	["206", "214", "Der rote Pakt / Texaco Rangers"],
	["210", "215", "Alte Farm"],
	["fallen-217", "217", "Zoner Depot"],
	["605", "220", "Ordensfestung"],
	["603", "221", "Die letzte Instanz"],
	["604", "222", "Hotel + White Stars"],
	["fallen-222.I", "222.I", "Bayerisches Garde Regiment"],
	["601", "223", "OT gesperrt"],
	["602", "224", "OT gesperrt"],
	["606", "225", "Rover Crew"],
	["607", "230", "Die Stadt „Lost Vegas“"],
	["609", "230.I", "Die Slums"],
	["608", "231", "Lolas + Armee d. befreiten Zone"],
	["610", "232", "Linie 8 + Fighting School"],
	["611", "234", "Akademie + Surfer + LK Pioniere"],
	["617", "240", "Altes Kraftwerk"],
	["616", "241", "AMF 202"],
	["613", "243", "Iron Wolves"],
	["634", "245", "Einsamer Hangar"],
	["636", "247", "Grabenhalle"],
	["620", "250", "OT gesperrt"],
	["637", "251", "Verfallener Hangar"],
	["638", "252", "Letzter Hangar"],
	["621", "253", "Trümmertrupp"],
	["622", "254", "Dunkler Hangar"],
	["623", "255", "Große Halle"],
	["624", "256", "Drifter"],
	["fallen-258", "258", "Worlds End"],
	["630", "259", "Die Scrapper am „Tower“"],
	["823", "260", "Außenposten Kolchose"],
	["fallen-T", "T", "Tankstelle"],
	["600", "X", "Rusty Henchmen"],
	// The turbines carry the wind park's numbers on this map. Oskar is off its edge.
	["Lima", "42.03", "Rand der Welt (OT-Parkplatz rot)"],
	["Bravo", "42.04", "Windrad"],
	["Echo", "42.05", "Windrad"],
	["Sierra", "42.07", "Lichtung (OT-Parkplatz gelb)"],
	["Tango", "42.08", "Windrad"],
];

export const fallen: Scenario = {
	id: "fallen",
	name: "FALLEN – Bad Lands",
	blurb: "Endzeit-LARP von Lost Ideas. Lost Vegas, die Zone und die Bad Lands, eine Woche lang.",
	blurbEn:
		"Post-apocalyptic LARP by Lost Ideas. Lost Vegas, the Zone and the Bad Lands, for a week.",
	schedule: { start: [5, 17], end: [5, 23] },
	accent: "#b5562b",
	base: { kind: "osm", theme: "fallen" },
	poiNames: Object.fromEntries(PLACES.map(([id, , name]) => [id, name])),
	poiNumbers: Object.fromEntries(PLACES.map(([id, number]) => [id, number])),
	// The one border the drawing makes explicit is its northern wall, and it runs
	// along the roads: the east–west road past 42.03 and 42.04 (bulging round Lima's
	// clearing, which the wall keeps inside), north up the Schranke road at the
	// junction, then the diagonal track down to 42.05 and on east past it. West, south
	// and east the drawing just runs to its edge — "Die Zone" south of the fence is
	// played, not off limits — so the mask covers only what lies north of the wall.
	// Points are the OSM road vertices; out-of-bounds on the ground is red marking and
	// barrier tape.
	playArea: [
		[52.382749, 11.809],
		[52.382749, 11.812782],
		[52.38274, 11.814812],
		[52.38273, 11.817168],
		[52.38273, 11.820857],
		[52.383231, 11.820857],
		[52.383231, 11.822097],
		[52.38273, 11.822097],
		[52.382721, 11.827972],
		[52.382863, 11.828421],
		[52.382957, 11.828514],
		[52.383997, 11.828545],
		[52.384252, 11.828561],
		[52.384148, 11.828731],
		[52.383345, 11.83039],
		[52.382674, 11.831971],
		[52.38221, 11.833025],
		[52.381908, 11.833428],
		[52.381917, 11.833707],
		[52.381946, 11.834203],
		[52.381776, 11.834544],
		[52.381917, 11.835381],
		[52.382106, 11.836047],
		[52.38204, 11.836667],
		[52.38204, 11.84],
		[52.376, 11.84],
		[52.376, 11.809],
	],
	// The buildings the legend marks "OT gesperrt", hatched from their OSM footprints.
	zones: [
		{
			id: "ot-211",
			name: "OT",
			color: OT_RED,
			points: [
				[52.378494, 11.823288],
				[52.378022, 11.823596],
				[52.377968, 11.823375],
				[52.37844, 11.823065],
			],
		},
		{
			id: "ot-223",
			name: "OT",
			color: OT_RED,
			points: [
				[52.379189, 11.821622],
				[52.379045, 11.821624],
				[52.379046, 11.822384],
				[52.37919, 11.822382],
			],
		},
		{
			id: "ot-224",
			name: "OT",
			color: OT_RED,
			points: [
				[52.379659, 11.822386],
				[52.379515, 11.822387],
				[52.379514, 11.821621],
				[52.379657, 11.82162],
			],
		},
		{
			id: "ot-250",
			name: "OT",
			color: OT_RED,
			points: [
				[52.381759, 11.823018],
				[52.381869, 11.823011],
				[52.381879, 11.82346],
				[52.38177, 11.823467],
			],
		},
	],
};
