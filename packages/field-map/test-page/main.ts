// -----------------------------------------------------------------------------
// The <field-map> test page: the element on its own, driven the way a host app
// drives it — no Field Maps code, no framework. It imports nothing but the two
// packages (`npm test` checks that), so whatever works here works in any app.
//
// Run it with `npm run dev:component` from the repository root.
// -----------------------------------------------------------------------------

import "@fieldmaps/field-map";
import type {
	FieldMapElement,
	MapMarker,
	NavigationChangeDetail,
	NavigationState,
} from "@fieldmaps/field-map";
import { THEMES, extendTheme, type OsmThemeName } from "@fieldmaps/core";
import { SCENARIOS, getMap, labelPointsOfInterest } from "@fieldmaps/core/mahlwinkel";

const map = document.querySelector("field-map") as FieldMapElement;
const header = document.querySelector("#controls") as HTMLElement;
const toggle = document.querySelector("#controls-toggle") as HTMLButtonElement;
const body = document.querySelector("#controls-body") as HTMLElement;

/** The middle of the airfield, where the simulated players walk. */
const CENTRE = { lat: 52.3808, lng: 11.8243 };
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
/** A point `east`/`north` metres from `from`. */
function offset(from: { lat: number; lng: number }, east: number, north: number) {
	return { lat: from.lat + north / M_PER_DEG_LAT, lng: from.lng + east / mPerDegLng(from.lat) };
}

// For Playwright and the console: the element, and every event it has fired.
const events: { type: string; detail: unknown; at: number }[] = [];
Object.assign(window, { fieldMap: map, testPage: { events } });

// --- Host chrome: the header above the map -----------------------------------------

/** The header covers the top of the screen, so the map is told to keep its rows below it. */
function syncInsets() {
	map.insets = { top: toggle.getBoundingClientRect().bottom };
}
syncInsets();
new ResizeObserver(syncInsets).observe(toggle);

toggle.addEventListener("click", () => {
	body.hidden = !body.hidden;
	toggle.setAttribute("aria-expanded", String(!body.hidden));
	toggle.textContent = `<field-map> test page ${body.hidden ? "▾" : "▴"}`;
});

document.querySelector("#host-button")?.addEventListener("click", () => {
	alert('A host button in the map\'s top row (slot="top-start").');
});

/** A labelled group of controls. */
function group(title: string, ...children: (Node | string)[]): HTMLFieldSetElement {
	const fieldset = document.createElement("fieldset");
	const legend = document.createElement("legend");
	legend.textContent = title;
	fieldset.append(legend, ...children);
	header.querySelector(".controls-body")?.append(fieldset);
	return fieldset;
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	const { dataset, ...rest } = props;
	Object.assign(element, rest);
	if (dataset) Object.assign(element.dataset, dataset);
	element.append(...children);
	return element;
}

function button(label: string, onClick: () => void, id?: string): HTMLButtonElement {
	const b = el("button", { type: "button", textContent: label });
	if (id) b.id = id;
	b.addEventListener("click", onClick);
	return b;
}

// --- Scenario and style ---------------------------------------------------------------

const scenarioSelect = el("select", { id: "scenario" });
for (const scenario of SCENARIOS) {
	scenarioSelect.append(
		el("option", { value: scenario.id, textContent: `${scenario.name} (${scenario.id})` }),
	);
}
scenarioSelect.value = map.scenario;
scenarioSelect.addEventListener("change", () => {
	map.scenario = scenarioSelect.value;
	fillPoiSelect();
});

const RED_ROADS = extendTheme(THEMES.de, {
	styles: {
		road_major: { color: "#ff3b30" },
		road_minor: { color: "#ff7a70" },
		track: { color: "#ff7a70" },
	},
});
const themeSelect = el("select", { id: "theme" });
themeSelect.append(el("option", { value: "", textContent: "theme: the scenario's own" }));
for (const name of Object.keys(THEMES))
	themeSelect.append(el("option", { value: name, textContent: `theme: ${name}` }));
themeSelect.append(
	el("option", { value: "red-roads", textContent: "theme: extendTheme demo (red roads)" }),
);
themeSelect.addEventListener("change", () => {
	const value = themeSelect.value;
	map.theme =
		value === "" ? undefined : value === "red-roads" ? RED_ROADS : (value as OsmThemeName);
});

const accent = el("input", {
	type: "color",
	value: "#38bdf8",
	id: "accent",
	title: "--field-map-accent",
});
const accentWarm = el("input", {
	type: "color",
	value: "#ffa201",
	id: "accent-warm",
	title: "--field-map-accent-warm",
});
const applyColours = () => {
	map.style.setProperty("--field-map-accent", accent.value);
	map.style.setProperty("--field-map-accent-warm", accentWarm.value);
	// The accuracy circle and the route line are drawn in JS, so they need telling.
	map.refreshStyle();
};
accent.addEventListener("input", applyColours);
accentWarm.addEventListener("input", applyColours);

const locale = el("select", { id: "locale" });
for (const [value, label] of [
	["", "language: browser"],
	["de", "Deutsch"],
	["en", "English"],
]) {
	locale.append(el("option", { value, textContent: label }));
}
locale.addEventListener("change", () => {
	map.locale = (locale.value || undefined) as "de" | "en" | undefined;
});

group(
	"Scenario & style",
	scenarioSelect,
	themeSelect,
	locale,
	el("label", {}, "accent ", accent),
	el("label", {}, "warm ", accentWarm),
);

// --- Position -----------------------------------------------------------------------

const source = el("select", { id: "position-source" });
source.append(
	el("option", { value: "device", textContent: "position: device GPS" }),
	el("option", { value: "external", textContent: "position: external (setPosition)" }),
);
source.addEventListener("change", () => {
	map.positionSource = source.value as "device" | "external";
});
const fixLat = el("input", {
	type: "number",
	step: "0.0001",
	value: String(CENTRE.lat),
	id: "fix-lat",
});
const fixLng = el("input", {
	type: "number",
	step: "0.0001",
	value: String(CENTRE.lng),
	id: "fix-lng",
});
const accuracy = el("input", {
	type: "range",
	min: "3",
	max: "60",
	value: "8",
	id: "fix-accuracy",
});
const heading = el("input", {
	type: "number",
	min: "0",
	max: "359",
	value: "",
	placeholder: "heading",
	id: "fix-heading",
});

function sendFix(lat = Number(fixLat.value), lng = Number(fixLng.value)) {
	if (map.positionSource !== "external") {
		map.positionSource = "external";
		source.value = "external";
	}
	const h = heading.value === "" ? null : Number(heading.value);
	map.setPosition({ lat, lng, accuracy: Number(accuracy.value) }, h);
}

let walkTimer = 0;
function toggleWalk() {
	if (walkTimer) {
		clearInterval(walkTimer);
		walkTimer = 0;
		walkButton.textContent = "Walk a loop";
		return;
	}
	walkButton.textContent = "Stop walking";
	const start = Date.now();
	walkTimer = window.setInterval(() => {
		// 60 m circle at walking pace (1.4 m/s), facing along it.
		const angle = ((Date.now() - start) / 1000) * (1.4 / 60);
		const p = offset(CENTRE, 60 * Math.sin(angle), 60 * Math.cos(angle));
		heading.value = String(Math.round(((angle * 180) / Math.PI + 90) % 360));
		fixLat.value = p.lat.toFixed(6);
		fixLng.value = p.lng.toFixed(6);
		sendFix(p.lat, p.lng);
	}, 1000);
}
const walkButton = button("Walk a loop", toggleWalk, "walk");

group(
	"Position",
	source,
	el("label", {}, "lat ", fixLat),
	el("label", {}, "lng ", fixLng),
	el("label", {}, "± ", accuracy),
	heading,
	button("Set fix", () => sendFix(), "set-fix"),
	walkButton,
);

// --- Navigation -------------------------------------------------------------------------

const poiSelect = el("select", { id: "poi" });
function fillPoiSelect() {
	const definition = getMap(map.scenario);
	poiSelect.replaceChildren(el("option", { value: "", textContent: "navigateToPoi…" }));
	for (const poi of definition ? labelPointsOfInterest(definition.poiNames) : []) {
		poiSelect.append(el("option", { value: poi.id, textContent: `${poi.id} · ${poi.name}` }));
	}
}
fillPoiSelect();
poiSelect.addEventListener("change", () => {
	if (poiSelect.value) map.navigateToPoi(poiSelect.value);
	poiSelect.value = "";
});
const wpLat = el("input", { type: "number", step: "0.0001", value: "52.3825", id: "wp-lat" });
const wpLng = el("input", { type: "number", step: "0.0001", value: "11.8180", id: "wp-lng" });
const wpName = el("input", { type: "text", value: "Rally point", id: "wp-name" });
const navState = el("pre", {
	className: "state",
	id: "nav-state",
	textContent: "navigation: null",
});
function showNavigation(state: NavigationState) {
	navState.textContent = `navigation: ${JSON.stringify(state, null, 1)}`;
}

group(
	"Navigation",
	poiSelect,
	el("label", {}, "lat ", wpLat),
	el("label", {}, "lng ", wpLng),
	wpName,
	button(
		"navigateToCoordinates",
		() =>
			map.navigateToCoordinates(Number(wpLat.value), Number(wpLng.value), {
				name: wpName.value || undefined,
			}),
		"nav-coords",
	),
	button("stopNavigation", () => map.stopNavigation(), "nav-stop"),
	navState,
);

// --- Players: simulated, and other tabs ------------------------------------------------

interface SimPlayer {
	id: string;
	label: string;
	team: "red" | "blue";
	centre: { lat: number; lng: number };
	radius: number;
	speed: number;
	phase: number;
	frozen: boolean;
	marker: MapMarker;
}
const TEAMS = { red: "#ff5a4f", blue: "#4fa3ff" };
const players: SimPlayer[] = [];
/** Other tabs of this page, as markers. */
const peers = new Map<string, MapMarker>();

function publishMarkers() {
	map.markers = [...players.map((player) => player.marker), ...peers.values()];
}

function addPlayers(count: number) {
	for (let i = 0; i < count; i++) {
		const n = players.length + 1;
		const team = n % 2 ? "red" : "blue";
		const centre = offset(CENTRE, (Math.random() - 0.5) * 600, (Math.random() - 0.5) * 300);
		const player: SimPlayer = {
			id: `sim-${n}`,
			label: `${team === "red" ? "Red" : "Blue"} ${n}`,
			team,
			centre,
			radius: 20 + Math.random() * 80,
			speed: 1 + Math.random() * 2,
			phase: Math.random() * Math.PI * 2,
			frozen: false,
			marker: { id: `sim-${n}`, lat: centre.lat, lng: centre.lng },
		};
		players.push(player);
	}
	stepPlayers();
	renderPlayers();
}

function stepPlayers() {
	const now = Date.now();
	for (const player of players) {
		if (player.frozen) continue;
		const angle = player.phase + ((now / 1000) * player.speed) / player.radius;
		const p = offset(
			player.centre,
			player.radius * Math.sin(angle),
			player.radius * Math.cos(angle),
		);
		player.marker = {
			id: player.id,
			lat: p.lat,
			lng: p.lng,
			label: player.label,
			color: TEAMS[player.team],
			heading: ((angle * 180) / Math.PI + 90) % 360,
			accuracyM: 6,
			seenAt: now,
			layer: player.team,
			navigable: true,
		};
	}
	publishMarkers();
}
setInterval(stepPlayers, 1000);

const playerList = el("div", { className: "players", id: "players" });
function swatch(color: string): HTMLSpanElement {
	const dot = el("span", { className: "swatch" });
	dot.style.background = color;
	return dot;
}
function renderPlayers() {
	playerList.replaceChildren(
		...players.map((player) =>
			el(
				"div",
				{},
				swatch(TEAMS[player.team]),
				player.label,
				button(player.frozen ? "unfreeze" : "freeze (goes stale)", () => {
					player.frozen = !player.frozen;
					renderPlayers();
				}),
				button("navigate", () => map.navigateToMarker(player.id)),
				button("remove", () => {
					players.splice(players.indexOf(player), 1);
					publishMarkers();
					renderPlayers();
				}),
			),
		),
	);
}

map.markerLayers = [
	{ id: "red", label: "Team Red" },
	{ id: "blue", label: "Team Blue" },
	{ id: "tabs", label: "Other tabs" },
];
// Fade after 10 s here rather than 30, so "freeze" shows something in a test.
map.staleAfterMs = 10_000;

const countInput = el("input", {
	type: "number",
	min: "1",
	max: "200",
	value: "5",
	id: "player-count",
});
group(
	"Live markers",
	countInput,
	button("Add simulated players", () => addPlayers(Number(countInput.value) || 1), "add-players"),
	button(
		"Remove all",
		() => {
			players.length = 0;
			publishMarkers();
			renderPlayers();
		},
		"remove-players",
	),
	playerList,
);

// --- A stand-in for a server: other tabs of this page, over BroadcastChannel ----------
//
// The shape a real backend would have: every client sends its own fix (throttled) and
// the navigations its player starts; every client shows the others' fixes as markers
// and applies the navigations it receives with source "host", which is how it knows
// not to send them back.

const tabId = Math.random().toString(36).slice(2, 7);
const channel = "BroadcastChannel" in window ? new BroadcastChannel("field-map-test-page") : null;
let lastSent = 0;

type Message =
	| {
			type: "fix";
			from: string;
			lat: number;
			lng: number;
			accuracy: number;
			heading: number | null;
			at: number;
	  }
	| { type: "navigation"; from: string; state: NavigationState };

channel?.addEventListener("message", (event: MessageEvent<Message>) => {
	const message = event.data;
	if (message.type === "fix") {
		peers.set(message.from, {
			id: `tab-${message.from}`,
			lat: message.lat,
			lng: message.lng,
			label: `Tab ${message.from}`,
			color: "#c084fc",
			heading: message.heading,
			accuracyM: message.accuracy,
			seenAt: message.at,
			layer: "tabs",
			navigable: true,
		});
		publishMarkers();
	} else if (message.type === "navigation") {
		applyRemoteNavigation(message.state);
	}
});

function applyRemoteNavigation(state: NavigationState) {
	if (!state) {
		map.stopNavigation({ source: "host" });
		return;
	}
	const { target } = state;
	// A PoI id means the same building on every client; anything else is sent as a
	// coordinate, since marks and markers are per client.
	if (target.kind === "poi") map.navigateToPoi(target.id, { source: "host" });
	else map.navigateToCoordinates(target.lat, target.lng, { name: target.name, source: "host" });
}

map.addEventListener("fieldmap-fix", (event) => {
	if (!channel) return;
	const fix = event.detail;
	if (fix.at - lastSent < 1000) return;
	lastSent = fix.at;
	channel.postMessage({
		type: "fix",
		from: tabId,
		lat: fix.lat,
		lng: fix.lng,
		accuracy: fix.accuracy,
		heading: fix.heading,
		at: fix.at,
	} satisfies Message);
});

map.addEventListener("fieldmap-navigation", (event) => {
	const detail: NavigationChangeDetail = event.detail;
	showNavigation(detail.state);
	// Only what this player did goes out; what arrived from elsewhere is "host".
	if (channel && detail.source === "user") {
		channel.postMessage({ type: "navigation", from: tabId, state: detail.state } satisfies Message);
	}
});

group(
	"Sync (other tabs)",
	channel
		? `This tab is "${tabId}". Open the page in a second tab: each shows the other as a marker, and a navigation started by hand in one starts in the other.`
		: "BroadcastChannel is not available in this browser.",
);

// --- Event log ---------------------------------------------------------------------------

const EVENT_TYPES = [
	"fieldmap-ready",
	"fieldmap-fix",
	"fieldmap-navigation",
	"fieldmap-arrived",
	"fieldmap-guidance",
	"fieldmap-marker-click",
	"fieldmap-marks-change",
	"fieldmap-permission",
] as const;
/** Fired up to once per frame; logged only on request. */
const FREQUENT = new Set<string>(["fieldmap-fix", "fieldmap-guidance"]);

const showFrequent = el("input", { type: "checkbox", id: "log-frequent" });
const filter = el("input", { type: "search", placeholder: "filter", id: "log-filter" });
const log = el("ul", { className: "log", id: "log" });

for (const type of EVENT_TYPES) {
	map.addEventListener(type, (event: Event) => {
		const detail = (event as CustomEvent).detail;
		events.push({ type, detail, at: Date.now() });
		if (events.length > 500) events.shift();
		if (FREQUENT.has(type) && !showFrequent.checked) return;
		if (filter.value && !type.includes(filter.value)) return;
		const item = el("li", {}, el("b", { textContent: type }), " ", JSON.stringify(detail));
		log.prepend(item);
		while (log.childElementCount > 200) log.lastElementChild?.remove();
	});
}

group(
	"Events",
	el("label", {}, showFrequent, " include fix / guidance (per frame)"),
	filter,
	button("clear", () => log.replaceChildren()),
	log,
);
