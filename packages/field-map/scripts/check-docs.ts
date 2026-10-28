// Fails when AGENTS.md leaves out a public property, method or event of <field-map>.
// The guide is the contract another app (or its coding agent) builds against, so a
// new public member that it does not mention is a bug in the guide. Run by `npm test`.
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const element = read("../src/field-map.ts");
const types = read("../src/types.ts");
const guide = read("../AGENTS.md");

// Up to "Internals": the public properties are declared above that line.
const publicPart = element.slice(0, element.indexOf("// --- Internals"));
const properties = [
	...publicPart.matchAll(/@property\([^)]*(?:\([^)]*\)[^)]*)*\)\s*(?:\n\s*)?(\w+)/g),
].map((match) => match[1]);
const api = element.slice(
	element.indexOf("// --- Public API"),
	element.indexOf("// --- Navigation internals"),
);
const methods = [...api.matchAll(/^\t(?:get )?(\w+)\(/gm)]
	.map((match) => match[1])
	.filter((name) => !["addEventListener", "removeEventListener"].includes(name));
const events = [
	...types.slice(types.indexOf("interface FieldMapEventMap")).matchAll(/"(fieldmap-[\w-]+)"/g),
].map((match) => match[1]);

let failures = 0;
for (const [kind, names] of [
	["property", properties],
	["method", methods],
	["event", events],
] as const) {
	if (names.length === 0) {
		console.log(`  FAIL found no ${kind}s — has the source layout changed?`);
		failures++;
	}
	for (const name of names) {
		if (guide.includes(`\`${name}`)) console.log(`  ok   ${kind} ${name}`);
		else {
			console.log(`  FAIL ${kind} ${name} is not in AGENTS.md`);
			failures++;
		}
	}
}
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
if (failures) process.exit(1);
