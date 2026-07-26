// -----------------------------------------------------------------------------
// i18n.ts
// Two languages, German and English, picked from the browser.
//
// The events are German and so is everything printed on the tactical maps, so
// German stays the source text and English is the translation — but the players
// are not all German speakers, and the landing page is the one screen that has to
// explain the app to someone who has never seen it. Anything not "de" gets
// English; there is no in-app switcher, the browser already knows.
// -----------------------------------------------------------------------------

export type Lang = "de" | "en";

/** The browser's preferred language, as far as we care about it. */
export function currentLang(): Lang {
	const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
	for (const tag of preferred) {
		if (!tag) continue;
		const base = tag.toLowerCase().split("-")[0];
		if (base === "de") return "de";
		if (base === "en") return "en";
	}
	return "en";
}

const MONTHS: Record<Lang, string[]> = {
	de: [
		"Januar",
		"Februar",
		"März",
		"April",
		"Mai",
		"Juni",
		"Juli",
		"August",
		"September",
		"Oktober",
		"November",
		"Dezember",
	],
	en: [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	],
};

/** Month names for the date range on an event card. */
export function monthNames(lang: Lang = currentLang()): string[] {
	return MONTHS[lang];
}

interface Strings {
	tagline: string;
	intro: string;
	installTitle: string;
	installText: string;
	installHintIos: string;
	installHintAndroid: string;
	sectionEvents: string;
	badgeRunning: string;
	badgeInDays: (days: number) => string;
	variant: string;
	points: (count: number) => string;
	zones: (count: number) => string;
	linkHint: string;
	supportLabel: string;
	supportSub: string;
	featureLabel: string;
	featureSubject: string;
	sourceLabel: string;
	fineprint: string;
	metaDescription: string;
}

const STRINGS: Record<Lang, Strings> = {
	de: {
		tagline: "Deine Position auf der Taktikkarte — offline, ohne Empfang.",
		intro:
			"Field Maps zeigt dir per GPS, wo du gerade auf dem Gelände stehst — auf der Taktikkarte " +
			"des jeweiligen Events, mit allen Gebäuden, Zonen und Hauptquartieren. Karten und Daten " +
			"sind komplett in der App gespeichert: einmal geladen, funktioniert alles ohne Netz.",
		installTitle: "Zum Startbildschirm hinzufügen",
		installText: "Dann läuft Field Maps wie eine normale App — im Vollbild, ohne Browserleiste.",
		installHintIos: "iPhone: Teilen → „Zum Home-Bildschirm“",
		installHintAndroid: "Android: ⋮ → „App installieren“",
		sectionEvents: "Events",
		badgeRunning: "Läuft jetzt",
		badgeInDays: (days) => (days === 1 ? "Morgen" : `In ${days} Tagen`),
		variant: "Variante",
		points: (count) => `${count} Punkte`,
		zones: (count) => `${count} ${count === 1 ? "Zone" : "Zonen"}`,
		linkHint:
			"Jede Karte hat ihren eigenen Link — Karte öffnen und die Adresse speichern, oder hier " +
			"eine Karte lange antippen und den Link kopieren.",
		supportLabel: "Buy me a sniper",
		supportSub: "Entwicklung unterstützen",
		featureLabel: "Feature vorschlagen",
		featureSubject: "Field Maps — Feature-Wunsch",
		sourceLabel: "Quellcode",
		fineprint:
			"Taktikkarten und Fraktionslogos: Airsoft Helden. Kartendaten: OpenStreetMap-Mitwirkende. " +
			"Spielfeldgrenzen sind von den gedruckten Karten abgezeichnet und nur ungefähr — vor Ort " +
			"gilt das Flatterband.",
		metaDescription: "Deine GPS-Position auf der Taktikkarte des Events — offline, ohne Empfang.",
	},
	en: {
		tagline: "Your position on the tactical map — offline, no signal needed.",
		intro:
			"Field Maps uses GPS to show where you are standing on the site — on the tactical map of " +
			"the event itself, with every building, zone and headquarters. Maps and data are stored " +
			"inside the app: once loaded, everything works without a network.",
		installTitle: "Add it to your home screen",
		installText: "Then Field Maps runs like a normal app — full screen, no browser bar.",
		installHintIos: "iPhone: Share → “Add to Home Screen”",
		installHintAndroid: "Android: ⋮ → “Install app”",
		sectionEvents: "Events",
		badgeRunning: "Running now",
		badgeInDays: (days) => (days === 1 ? "Tomorrow" : `In ${days} days`),
		variant: "Variant",
		points: (count) => `${count} points`,
		zones: (count) => `${count} ${count === 1 ? "zone" : "zones"}`,
		linkHint:
			"Every map has its own link — open a map and save the address, or long-press a card here " +
			"and copy the link.",
		supportLabel: "Buy me a sniper",
		supportSub: "Support development",
		featureLabel: "Suggest a feature",
		featureSubject: "Field Maps — Feature request",
		sourceLabel: "Source code",
		fineprint:
			"Tactical maps and faction logos: Airsoft Helden. Map data: OpenStreetMap contributors. " +
			"Field boundaries are traced off the printed maps and approximate only — on site, the " +
			"tape is what counts.",
		metaDescription: "Your GPS position on the event's tactical map — offline, no signal needed.",
	},
};

export function strings(lang: Lang = currentLang()): Strings {
	return STRINGS[lang];
}

/** Tell the document (and anything reading it) which language it is in. */
export function applyDocumentLang(lang: Lang = currentLang()) {
	document.documentElement.lang = lang;
	const description = document.querySelector('meta[name="description"]');
	if (description) description.setAttribute("content", STRINGS[lang].metaDescription);
}
