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

// Type-only import: erased at build time, so this does not create a runtime cycle
// with geo -> config -> event-schedule -> i18n.
import type { NavigationHint } from "./geo.js";

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

/** One `<h2>` plus its paragraphs, on the legal page. */
interface LegalSection {
	heading: string;
	body: string[];
}

/**
 * Impressum and privacy notice. German is the operative version — the events,
 * the operator and the audience are German — and the English one is the same
 * text for players who read the app in English.
 */
interface LegalStrings {
	linkLabel: string;
	back: string;
	impressumTitle: string;
	providerHeading: string;
	contactHeading: string;
	contactEmailLabel: string;
	responsibleHeading: string;
	sameAddress: string;
	impressumSections: LegalSection[];
	privacyTitle: string;
	privacySections: LegalSection[];
}

interface Strings {
	tagline: string;
	site: string;
	intro: string;
	installTitle: string;
	installText: string;
	installHintIos: string;
	installHintAndroid: string;
	sectionEvents: string;
	sectionEventsNote: string;
	sectionPastEvents: string;
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
	legal: LegalStrings;

	// --- The map screen. The HUD goes through here too: a player who gets a German
	// overview must not then land on a half-English map. ---
	waitingForGps: string;
	gpsError: (message: string) => string;
	offMap: string;
	mapLoading: string;
	mapLoadFailed: string;
	/** Only ever seen over a live map — off the map an update applies itself. */
	updateReady: string;
	enableCompass: string;
	compassDenied: string;
	backToOverview: string;
	navigateTo: string;
	navigateHere: string;
	navStop: string;
	navArrived: string;
	navEnableCompass: string;
	navOffField: string;
	navHints: Record<NavigationHint, string>;
	scale: string;
	layers: string;
	layerPoiIds: string;
	layerGrid: string;
	layerMask: string;
	layerZones: string;
	layerHqs: string;
}

const STRINGS: Record<Lang, Strings> = {
	de: {
		tagline: "Deine Position auf der Taktikkarte — offline, ohne Empfang.",
		site: "Flugplatz Mahlwinkel · Sachsen-Anhalt",
		intro:
			"Field Maps ist für ein einziges Gelände gemacht: den ehemaligen Militärflugplatz " +
			"Mahlwinkel. Die App zeigt dir per GPS, wo du dort gerade stehst — auf der Taktikkarte " +
			"des jeweiligen Events, mit allen Gebäuden, Zonen und Hauptquartieren. Karten und Daten " +
			"sind komplett in der App gespeichert: einmal geladen, funktioniert alles ohne Netz.",
		installTitle: "Zum Startbildschirm hinzufügen",
		installText: "Dann läuft Field Maps wie eine normale App — im Vollbild, ohne Browserleiste.",
		installHintIos: "iPhone: Teilen → „Zum Home-Bildschirm“",
		installHintAndroid: "Android: ⋮ → „App installieren“",
		sectionEvents: "Events in Mahlwinkel",
		sectionEventsNote:
			"Alle Karten zeigen dasselbe Gelände — pro Event wechseln nur Beschriftungen, Zonen und " +
			"Fraktionen. Andere Spielfelder sind nicht enthalten.",
		sectionPastEvents: "Vergangene Events",
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
		metaDescription:
			"Deine GPS-Position auf der Taktikkarte der Airsoft-Events auf dem Flugplatz Mahlwinkel — " +
			"offline, ohne Empfang.",
		waitingForGps: "Warte auf GPS…",
		gpsError: (message) => `GPS-Fehler: ${message}`,
		offMap: "⚠ Außerhalb der Karte — Position in der Kartenmitte angezeigt",
		mapLoading: "Karte wird geladen…",
		mapLoadFailed: "⚠ Karte konnte nicht geladen werden — tippen zum Wiederholen",
		updateReady: "Neue Version verfügbar — tippen zum Aktualisieren",
		enableCompass: "Kompass aktivieren",
		compassDenied: "Kompass-Freigabe abgelehnt",
		backToOverview: "Zur Übersicht",
		navigateTo: "Navigieren zu…",
		navigateHere: "Hierhin navigieren",
		navStop: "Navigation beenden",
		navArrived: "Du bist da",
		navEnableCompass: "Kompass aktivieren für Richtungshinweise",
		navOffField: "Du stehst außerhalb dieses Spielfelds",
		navHints: {
			ahead: "Geradeaus",
			bearRight: "Halb rechts",
			turnRight: "Rechts abbiegen",
			behind: "Hinter dir",
			turnLeft: "Links abbiegen",
			bearLeft: "Halb links",
		},
		scale: "Maßstab",
		layers: "Kartenebenen",
		layerPoiIds: "PoI-Nummern",
		layerGrid: "Gitternetz",
		layerMask: "Spielfeldgrenze",
		layerZones: "Zonen",
		layerHqs: "Hauptquartiere",
		legal: {
			linkLabel: "Impressum & Datenschutz",
			back: "Zurück zur Übersicht",
			impressumTitle: "Impressum",
			providerHeading: "Angaben gemäß § 5 DDG",
			contactHeading: "Kontakt",
			contactEmailLabel: "E-Mail",
			responsibleHeading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
			sameAddress: "Anschrift wie oben",
			impressumSections: [
				{
					heading: "Art des Angebots",
					body: [
						"Field Maps ist ein privates, nicht-kommerzielles Projekt ohne Gewinnerzielungs" +
							"absicht. Es wird kein Gewerbe betrieben; eine Umsatzsteuer-Identifikationsnummer " +
							"nach § 27a UStG liegt nicht vor. Spenden über den Unterstützungs-Link sind " +
							"freiwillig und begründen keinen Anspruch auf eine Gegenleistung.",
					],
				},
				{
					heading: "Verbraucherstreitbeilegung",
					body: [
						"Ich bin nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer " +
							"Verbraucherschlichtungsstelle teilzunehmen.",
					],
				},
				{
					heading: "Inhalte Dritter",
					body: [
						"Die Taktikkarten und Fraktionslogos stammen von Airsoft Helden und werden hier zur " +
							"Orientierung auf dem jeweiligen Event verwendet; die Rechte verbleiben beim " +
							"jeweiligen Rechteinhaber. Die Daten der Vektorkarten stammen von OpenStreetMap-" +
							"Mitwirkenden und stehen unter der Open Database License (ODbL).",
						"Für die Inhalte verlinkter externer Seiten ist deren jeweiliger Betreiber " +
							"verantwortlich. Zum Zeitpunkt der Verlinkung waren dort keine Rechtsverstöße " +
							"erkennbar.",
					],
				},
				{
					heading: "Haftung für die angezeigten Karten",
					body: [
						"Spielfeldgrenzen, Zonen und Gebäudepositionen sind von den gedruckten Taktikkarten " +
							"abgezeichnet und nur ungefähr; die angezeigte Position hängt zusätzlich von der " +
							"GPS-Genauigkeit des Geräts ab. Die App ersetzt weder die Einweisung durch den " +
							"Veranstalter noch die Markierung vor Ort — es gilt das Flatterband. Für Schäden, " +
							"die aus dem Vertrauen auf die angezeigte Position oder Grenze entstehen, wird " +
							"keine Haftung übernommen.",
					],
				},
			],
			privacyTitle: "Datenschutzerklärung",
			privacySections: [
				{
					heading: "Verantwortlicher",
					body: [
						"Verantwortlicher im Sinne der DSGVO ist der oben genannte Betreiber; die " +
							"Kontaktdaten stehen im Impressum.",
					],
				},
				{
					heading: "Standort- und Kompassdaten",
					body: [
						"Die App fragt die Standortfreigabe deines Geräts ab, um deine Position auf der " +
							"Karte zu zeichnen, und bei iOS zusätzlich den Kompass für die Blickrichtung. " +
							"Diese Daten werden ausschließlich im Browser auf deinem Gerät verarbeitet: sie " +
							"werden weder an mich noch an den Hoster oder Dritte übertragen und nirgends " +
							"gespeichert.",
						"Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du " +
							"jederzeit in den Einstellungen deines Browsers oder Geräts widerrufen kannst. " +
							"Ohne Freigabe funktioniert die Karte weiterhin, nur ohne eigene Position.",
					],
				},
				{
					heading: "Lokale Speicherung",
					body: [
						"Die zuletzt geöffnete Karte und die Einstellungen der Kartenebenen liegen im " +
							"lokalen Speicher (localStorage) deines Browsers, damit die App sie beim nächsten " +
							"Start kennt. Der Service Worker legt außerdem Karten, Bilder und Programmdateien " +
							"in einem Cache ab — nur dadurch funktioniert die App offline.",
						"Beides bleibt auf deinem Gerät und lässt sich jederzeit über die Website-Daten " +
							"deines Browsers löschen. Cookies, Tracking oder Reichweitenmessung setzt die App " +
							"nicht ein.",
					],
				},
				{
					heading: "Hosting und Server-Logfiles",
					body: [
						"Die Seite wird von Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA, " +
							"bzw. der Cloudflare Germany GmbH, Rosental 7, 80331 München, ausgeliefert. Beim " +
							"Abruf verarbeitet der Hoster technisch notwendige Zugriffsdaten — insbesondere " +
							"IP-Adresse, Zeitpunkt, angeforderte Datei, übertragene Datenmenge, Referrer und " +
							"Browserkennung — zur Auslieferung, Stabilität und Abwehr von Angriffen.",
						"Rechtsgrundlage ist das berechtigte Interesse an einem sicheren und funktions" +
							"fähigen Angebot (Art. 6 Abs. 1 lit. f DSGVO). Mit dem Hoster besteht ein Vertrag " +
							"zur Auftragsverarbeitung nach Art. 28 DSGVO; eine Übermittlung in die USA ist " +
							"durch die Standardvertragsklauseln der EU-Kommission abgesichert. Diese Daten " +
							"fallen beim Hoster an; ich habe darauf keinen Zugriff.",
					],
				},
				{
					heading: "Externe Links",
					body: [
						"Die Übersichtsseite verlinkt auf Buy Me a Coffee und GitHub. Die Verbindung zu " +
							"diesen Anbietern entsteht erst, wenn du den jeweiligen Link anklickst — die App " +
							"selbst lädt keine Schriften, Skripte oder Inhalte von Dritten nach. Danach gelten " +
							"deren Datenschutzhinweise.",
					],
				},
				{
					heading: "Deine Rechte",
					body: [
						"Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der " +
							"Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO) sowie " +
							"das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Da ich " +
							"selbst keine personenbezogenen Daten von dir speichere, betreffen solche " +
							"Ansprüche in der Regel nur die Logdaten des Hosters.",
					],
				},
			],
		},
	},
	en: {
		tagline: "Your position on the tactical map — offline, no signal needed.",
		site: "Mahlwinkel airfield · Saxony-Anhalt, Germany",
		intro:
			"Field Maps is built for a single site: the former military airfield at Mahlwinkel. It " +
			"uses GPS to show where you are standing there — on the tactical map of the event " +
			"itself, with every building, zone and headquarters. Maps and data are stored inside " +
			"the app: once loaded, everything works without a network.",
		installTitle: "Add it to your home screen",
		installText: "Then Field Maps runs like a normal app — full screen, no browser bar.",
		installHintIos: "iPhone: Share → “Add to Home Screen”",
		installHintAndroid: "Android: ⋮ → “Install app”",
		sectionEvents: "Events at Mahlwinkel",
		sectionEventsNote:
			"Every map covers the same ground — only the labels, zones and factions change per " +
			"event. Other fields are not included.",
		sectionPastEvents: "Past Events",
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
		metaDescription:
			"Your GPS position on the tactical map of the airsoft events at Mahlwinkel airfield, " +
			"Germany — offline, no signal needed.",
		waitingForGps: "Waiting for GPS…",
		gpsError: (message) => `GPS error: ${message}`,
		offMap: "⚠ Off map — outside this field; position shown at map center",
		mapLoading: "Loading map…",
		mapLoadFailed: "⚠ Map could not be loaded — tap to retry",
		updateReady: "New version available — tap to update",
		enableCompass: "Enable compass",
		compassDenied: "Compass permission denied",
		backToOverview: "Back to the overview",
		navigateTo: "Navigate to…",
		navigateHere: "Navigate here",
		navStop: "End navigation",
		navArrived: "You have arrived",
		navEnableCompass: "Enable compass for turn hints",
		navOffField: "You are outside this field",
		navHints: {
			ahead: "Straight ahead",
			bearRight: "Bear right",
			turnRight: "Turn right",
			behind: "Behind you",
			turnLeft: "Turn left",
			bearLeft: "Bear left",
		},
		scale: "Scale",
		layers: "Map layers",
		layerPoiIds: "PoI numbers",
		layerGrid: "Grid",
		layerMask: "Boundary mask",
		layerZones: "Zones",
		layerHqs: "Headquarters",
		legal: {
			linkLabel: "Legal notice & privacy",
			back: "Back to the overview",
			impressumTitle: "Legal notice (Impressum)",
			providerHeading: "Information pursuant to § 5 DDG",
			contactHeading: "Contact",
			contactEmailLabel: "Email",
			responsibleHeading: "Responsible for the content under § 18 (2) MStV",
			sameAddress: "address as above",
			impressumSections: [
				{
					heading: "Nature of this service",
					body: [
						"Field Maps is a private, non-commercial project run without intent to make a " +
							"profit. No business is operated and there is no VAT identification number under " +
							"§ 27a UStG. Donations through the support link are voluntary and do not entitle " +
							"the donor to anything in return.",
					],
				},
				{
					heading: "Consumer dispute resolution",
					body: [
						"I am neither willing nor obliged to take part in dispute resolution proceedings " +
							"before a consumer arbitration board.",
					],
				},
				{
					heading: "Third-party content",
					body: [
						"The tactical maps and faction logos come from Airsoft Helden and are used here for " +
							"orientation at the respective event; all rights remain with their owner. The " +
							"vector map data comes from OpenStreetMap contributors and is licensed under the " +
							"Open Database License (ODbL).",
						"The operators of linked external sites are responsible for their content. No " +
							"infringements were apparent at the time the links were added.",
					],
				},
				{
					heading: "Accuracy of the maps",
					body: [
						"Field boundaries, zones and building positions are traced off the printed tactical " +
							"maps and are approximate only; the position shown also depends on the GPS " +
							"accuracy of your device. The app replaces neither the organiser's briefing nor " +
							"the markings on the ground — the tape is what counts. No liability is accepted " +
							"for damage arising from relying on the position or boundary displayed.",
					],
				},
			],
			privacyTitle: "Privacy notice",
			privacySections: [
				{
					heading: "Controller",
					body: [
						"The controller within the meaning of the GDPR is the operator named above; the " +
							"contact details are in the legal notice.",
					],
				},
				{
					heading: "Location and compass data",
					body: [
						"The app asks for your device's location permission in order to draw your position " +
							"on the map, and on iOS additionally for the compass to show your facing. This " +
							"data is processed exclusively in the browser on your device: it is not " +
							"transmitted to me, to the host or to any third party, and it is not stored " +
							"anywhere.",
						"The legal basis is your consent (Art. 6(1)(a) GDPR), which you can withdraw at any " +
							"time in your browser or device settings. Without the permission the map still " +
							"works, only without your own position.",
					],
				},
				{
					heading: "Local storage",
					body: [
						"The map you last opened and your map-layer settings are kept in your browser's " +
							"local storage so the app remembers them next time. The service worker also keeps " +
							"maps, images and program files in a cache — that is what makes the app work " +
							"offline.",
						"Both stay on your device and can be deleted at any time through your browser's " +
							"site data. The app uses no cookies, no tracking and no analytics.",
					],
				},
				{
					heading: "Hosting and server logs",
					body: [
						"The site is served by Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, " +
							"USA, and Cloudflare Germany GmbH, Rosental 7, 80331 Munich, Germany. When the " +
							"page is requested, the host processes technically necessary access data — in " +
							"particular IP address, time, file requested, amount of data transferred, " +
							"referrer and browser identification — for delivery, stability and defence " +
							"against attacks.",
						"The legal basis is the legitimate interest in a secure and functioning service " +
							"(Art. 6(1)(f) GDPR). A data processing agreement under Art. 28 GDPR is in place " +
							"with the host; transfers to the USA are covered by the European Commission's " +
							"standard contractual clauses. This data arises at the host; I have no access to " +
							"it.",
					],
				},
				{
					heading: "External links",
					body: [
						"The overview links to Buy Me a Coffee and GitHub. A connection to those providers " +
							"is only made once you click the link — the app itself loads no fonts, scripts or " +
							"content from third parties. Their own privacy notices apply from that point on.",
					],
				},
				{
					heading: "Your rights",
					body: [
						"You have the right of access, rectification, erasure, restriction of processing, " +
							"data portability and objection (Art. 15 to 21 GDPR), as well as the right to " +
							"lodge a complaint with a supervisory authority. As I store no personal data " +
							"about you myself, such requests will usually concern the host's log data only.",
					],
				},
			],
		},
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
