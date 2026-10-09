// -----------------------------------------------------------------------------
// whats-new.ts
// "What's new" after an update: a short list of what changed, shown once.
//
// Updates install themselves (see update.ts), which is the point — but it also
// means a player never learns that the map gained a barrier or that the app now
// opens on the running event. So after a build with something worth saying, the
// next launch shows it once, in a native <dialog> (backdrop, focus trap and Escape
// from the browser, as with the share sheet).
//
// "Once" is tracked by the id of the newest entry the player has dismissed, in
// localStorage. Someone opening the app for the first time is not shown a list of
// changes to a version they never had: with no record at all, and no other trace
// of this app in storage, the newest entry is simply marked seen. A player who used
// the app before this dialog existed does have such traces (a remembered map, the
// layer toggles, …), and gets the newest entry.
//
// To announce something: add an entry at the top of CHANGES with a new, later id.
// -----------------------------------------------------------------------------

import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { currentLang, strings } from "./i18n.js";
import { CHECKPOINT_GLYPH } from "./glyphs.js";

interface Change {
	de: string;
	en: string;
	/** Optional pictogram before the text — SVG markup, ours, never user input. */
	glyph?: string;
}

interface Release {
	/** Sortable and unique; the date it shipped is the obvious choice. */
	id: string;
	changes: Change[];
}

/** Newest first. Only the releases a player has not dismissed are shown. */
const CHANGES: Release[] = [
	{
		id: "2026-10-09",
		changes: [
			{
				glyph: CHECKPOINT_GLYPH,
				de: "Neu auf der OP-Tschernobyl-Karte: die Schranke an der Straße nördlich von Windrad Bravo. Antippen, um hinzunavigieren.",
				en: "New on the OP Tschernobyl map: the barrier (Schranke) on the road north of turbine Bravo. Tap it to navigate there.",
			},
			{
				glyph: `<svg class="whats-new-cal" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
					<rect x="3" y="5" width="18" height="16" rx="2.5" />
					<path d="M3 10h18M8 3v4M16 3v4" />
					<circle cx="12" cy="15.5" r="2.2" />
				</svg>`,
				de: "Läuft gerade ein Event, öffnet die App direkt dessen Karte. Mit ‹ kommst du weiterhin zur Übersicht.",
				en: "While an event is running, the app opens straight on its map. ‹ still takes you to the overview.",
			},
		],
	},
];

const SEEN_KEY = "field-map-whats-new-seen";
/** Every key this app stores starts with this — how a returning player is told apart. */
const APP_KEY_PREFIX = "field-map-";

/**
 * The releases this player has not seen yet, newest first.
 *
 * Worked out once, when this module loads — before routing opens a map, which
 * itself writes to storage (the remembered map) and would make every first-time
 * visitor look like a returning one.
 */
const UNSEEN: Release[] = (() => {
	const newest = CHANGES[0]?.id;
	if (!newest) return [];
	try {
		const seen = localStorage.getItem(SEEN_KEY);
		if (seen != null) return CHANGES.filter((release) => release.id > seen);
		const returning = Object.keys(localStorage).some((key) => key.startsWith(APP_KEY_PREFIX));
		if (returning) return CHANGES.slice(0, 1);
		localStorage.setItem(SEEN_KEY, newest);
		return [];
	} catch {
		// No storage, no memory of having shown it: better silent than every launch.
		return [];
	}
})();

function markSeen() {
	try {
		if (CHANGES[0]) localStorage.setItem(SEEN_KEY, CHANGES[0].id);
	} catch {
		// Nothing to do; it will be offered again next time.
	}
}

@customElement("whats-new-view")
export class WhatsNewView extends LitElement {
	// Light DOM, like the other views — the app's stylesheet is global.
	protected createRenderRoot() {
		return this;
	}

	@state() private releases: Release[] = [];

	/** Show the dialog if there is anything this player has not seen. Call once. */
	showIfDue() {
		this.releases = UNSEEN;
		if (this.releases.length === 0) return;
		void this.updateComplete.then(() => {
			this.querySelector("dialog")?.showModal();
		});
	}

	private close() {
		this.querySelector("dialog")?.close();
	}

	render() {
		if (this.releases.length === 0) return nothing;
		const t = strings();
		const lang = currentLang();
		const changes = this.releases.flatMap((release) => release.changes);
		return html`
			<dialog class="whats-new" @close=${markSeen}>
				<h2 class="whats-new-title">${t.whatsNewTitle}</h2>
				<ul class="whats-new-list">
					${changes.map(
						(change) => html`
							<li>
								<span class="whats-new-glyph"
									>${change.glyph ? unsafeHTML(change.glyph) : nothing}</span
								>
								<span>${lang === "en" ? change.en : change.de}</span>
							</li>
						`,
					)}
				</ul>
				<button type="button" class="whats-new-ok" @click=${this.close}>${t.whatsNewOk}</button>
			</dialog>
		`;
	}
}
