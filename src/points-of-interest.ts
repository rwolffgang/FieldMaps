// -----------------------------------------------------------------------------
// points-of-interest.ts
// The shared registry of physical field locations. GPS coordinates are the same
// no matter which scenario you play — only the *labels* change per scenario (see
// src/scenarios/). Add a point here once; reference it by id from a scenario.
// -----------------------------------------------------------------------------

/** A physical location on the field. Coordinates are shared across all scenarios. */
export interface PointOfInterest {
	id: string;
	lat: number;
	lng: number;
}

/** A point of interest with the display label for a specific scenario. */
export interface LabeledPointOfInterest extends PointOfInterest {
	name: string;
}

/** Every physical point of interest on the field, keyed by a stable id. */
export const POINTS_OF_INTEREST: PointOfInterest[] = [
	{ id: "204", lat: 52.379127, lng: 11.823623 },
	{ id: "217", lat: 52.378079, lng: 11.824319 },
	{ id: "502", lat: 52.381657, lng: 11.817742 },
	{ id: "506", lat: 52.381947, lng: 11.815984 },
	{ id: "600", lat: 52.380306, lng: 11.822275 },
	{ id: "601", lat: 52.379104, lng: 11.821979 },
	{ id: "602", lat: 52.379554, lng: 11.822012 },
	{ id: "606", lat: 52.380646, lng: 11.822381 },
	{ id: "607", lat: 52.379629, lng: 11.824478 },
	{ id: "608", lat: 52.379608, lng: 11.825613 },
	{ id: "610", lat: 52.380446, lng: 11.8267 },
	{ id: "611", lat: 52.380818, lng: 11.825109 },
	{ id: "613", lat: 52.381097, lng: 11.824952 },
	{ id: "616", lat: 52.381067, lng: 11.824132 },
	{ id: "617", lat: 52.381305, lng: 11.822999 },
	{ id: "620", lat: 52.381803, lng: 11.82322 },
	{ id: "621", lat: 52.381709, lng: 11.825221 },
	{ id: "622", lat: 52.381925, lng: 11.82594 },
	{ id: "623", lat: 52.381934, lng: 11.826573 },
	{ id: "624", lat: 52.382006, lng: 11.827198 },
	{ id: "630", lat: 52.381482, lng: 11.827873 },
	{ id: "631", lat: 52.381183, lng: 11.827608 },
	{ id: "632", lat: 52.38037, lng: 11.828291 },
	{ id: "635", lat: 52.381097, lng: 11.826379 },
	{ id: "638", lat: 52.382532, lng: 11.826579 },
	{ id: "700", lat: 52.383773, lng: 11.814515 },
	{ id: "714", lat: 52.384138, lng: 11.823325 },
	{ id: "720", lat: 52.384282, lng: 11.828191 },
	{ id: "800", lat: 52.383492, lng: 11.834536 },
	{ id: "803", lat: 52.380874, lng: 11.834534 },
	{ id: "807", lat: 52.383058, lng: 11.833218 },
	{ id: "810", lat: 52.380613, lng: 11.830516 },
	{ id: "813", lat: 52.380005, lng: 11.830943 },
	{ id: "814", lat: 52.379919, lng: 11.832244 },
	{ id: "817", lat: 52.379373, lng: 11.834199 },
	{ id: "820", lat: 52.378881, lng: 11.836845 },
	{ id: "821", lat: 52.380013, lng: 11.837379 },
	{ id: "825", lat: 52.381444, lng: 11.82986 },
	{ id: "826", lat: 52.381162, lng: 11.831821 },
	{ id: "Lima", lat: 52.382866, lng: 11.821249 },
	{ id: "Oskar", lat: 52.382876, lng: 11.81352 },
	{ id: "Bravo", lat: 52.38252, lng: 11.827808 },
	{ id: "Sierra", lat: 52.379219, lng: 11.827421 },
	{ id: "Echo", lat: 52.381784, lng: 11.833683 },
];

/**
 * Canonical labels for the Mission 24 layout — the default naming most scenarios
 * start from. A scenario spreads these and overrides only what differs.
 */
export const DEFAULT_POI_NAMES: Record<string, string> = {
	"204": "Vorratslager",
	"217": "Offiziersquartiere",
	"502": "Alter Bahnhof",
	"506": "Rampe",
	"600": "Roter Platz",
	"601": "Garnison Süd",
	"602": "Garnison Nord",
	"606": "Garage",
	"607": "Dorf",
	"608": "Funkstation",
	"610": "Esco Bar",
	"611": "Gefängnis",
	"613": "Fahrzeughalle",
	"616": "Forschungskeller",
	"617": "Heizwerk",
	"620": "MP Station",
	"621": "Gebäude 1981",
	"622": "Munitionslager",
	"623": "Frachtlager",
	"624": "Werkstatt",
	"630": "Tower",
	"631": "Grabensystem",
	"632": "Fort",
	"635": "Schießstand",
	"638": "Hangar",
	"700": "Kaserne",
	"714": "Hacienda El Mojito",
	"720": "Zollhaus",
	"800": "Task Force HQ",
	"803": "Kirche",
	"807": "Schützengräben",
	"810": "Verladeplatz",
	"813": "Kommandobunker",
	"814": "Testgelände",
	"817": "Depot",
	"820": "Asservatenkammer",
	"821": "Grenzposten",
	"825": "Markt",
	"826": "Checkpoint A",
	Lima: "Turbine Lima",
	Oskar: "Turbine Oskar",
	Bravo: "Turbine Bravo",
	Sierra: "Turbine Sierra",
	Echo: "Turbine Echo",
};

/**
 * Resolve a scenario's `poiNames` map into displayable points of interest: only
 * the ids present in `poiNames` are shown, each with its scenario label.
 */
export function labelPointsOfInterest(poiNames: Record<string, string>): LabeledPointOfInterest[] {
	return POINTS_OF_INTEREST.flatMap((poi) => {
		const name = poiNames[poi.id];
		return name == null ? [] : [{ ...poi, name }];
	});
}
