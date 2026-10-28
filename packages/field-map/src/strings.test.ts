// The element's texts: both languages complete, and overrides merged. Run with `npm test`.
import { FIELD_MAP_STRINGS, fieldMapStrings } from "./strings.js";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		console.log(`  FAIL ${name} ${detail}`);
		failures++;
	}
}

const de = FIELD_MAP_STRINGS.de;
const en = FIELD_MAP_STRINGS.en;
const keys = (o: object) => Object.keys(o).sort().join(",");
check("German and English have the same keys", keys(de) === keys(en));
check("and the same turn hints", keys(de.navHints) === keys(en.navHints));
check(
	"no empty text",
	[de, en].every((table) => Object.values(table).every((value) => value !== "")),
);

const merged = fieldMapStrings("en", { navigateHere: "Go", navHints: { ahead: "Onward" } });
check(
	"an override replaces one text",
	merged.navigateHere === "Go" && merged.navStop === en.navStop,
);
check(
	"a partial navHints keeps the others",
	merged.navHints.ahead === "Onward" && merged.navHints.behind === en.navHints.behind,
);
check("German on request", fieldMapStrings("de").navigateHere === de.navigateHere);
check("functions format", de.gridSquare("C4") === "Feld C4" && en.lastSeen(3) === "3 min ago");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures) process.exit(1);
