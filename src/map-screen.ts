// -----------------------------------------------------------------------------
// map-screen.ts
// `<map-screen>`: Field Maps' map screen — the `<field-map>` element from
// packages/field-map, plus the parts of the screen that are this app's and not the
// map's: the ‹ back to the overview, the install bar, the prop dosimeter on the
// Stalker maps, and the "new version" banner `main.ts` drives.
//
// Everything here talks to the map the way any other host would: properties in,
// `fieldmap-*` events out, and the chrome handed over through the element's
// `topStart` / `topEnd` / `topNotice` / `bottomNotice` hooks so it lands in the
// map's own rows and stacks with them.
// -----------------------------------------------------------------------------

import { LitElement, html, render, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "@fieldmaps/field-map";
import type { FieldMapElement, GuidanceDetail, PositionFix } from "@fieldmaps/field-map";
import type { LatLng } from "@fieldmaps/core";
import { getMap, labelPointsOfInterest } from "@fieldmaps/core/mahlwinkel";
import "./dosimeter-view.js";
import { primeDosimeterAudio, type DosimeterView } from "./dosimeter-view.js";
import { BUILDING_LEVEL, POI_LEVEL, type RadiationPoint } from "./radiation.js";
import { goHome } from "./router.js";
import { strings } from "./i18n.js";
import {
	installMethod,
	installNudgeSnoozed,
	onInstallChange,
	promptInstall,
	snoozeInstallNudge,
	type InstallMethod,
} from "./install.js";

// There is no in-app language switcher — the browser's choice is fixed for the
// session — so resolving the strings once at module load is enough.
const t = strings();

/** Set once the "navigate with the Geiger counter" hint has been shown. */
const DOSIMETER_HINT_KEY = "field-map-dosimeter-hint-seen";
/** How long that hint stays up before it gets out of the way by itself. */
const DOSIMETER_HINT_MS = 10_000;

function dosimeterHintSeen(): boolean {
	try {
		return localStorage.getItem(DOSIMETER_HINT_KEY) === "1";
	} catch {
		return false;
	}
}

/** A container for chrome handed to the map: invisible to layout, so its children are the map's rows. */
function slotContainer(): HTMLDivElement {
	const element = document.createElement("div");
	element.style.display = "contents";
	return element;
}

@customElement("map-screen")
export class MapScreen extends LitElement {
	// Light DOM: the app's stylesheet is global, and `<field-map>` needs Leaflet's.
	protected createRenderRoot() {
		return this;
	}

	/** The scenario on screen. */
	@property() scenario = "";

	/**
	 * "A new build is ready." Lives under the map's top row, with the map's own notices;
	 * `main.ts` decides when it shows and what tapping it does (see `update.ts`).
	 */
	readonly updateBanner: HTMLButtonElement = (() => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "update-banner";
		button.hidden = true;
		return button;
	})();

	// The containers handed to `<field-map>`. Each is rendered into by Lit (see
	// `updated`), so the map can place them wherever its layout wants.
	private readonly startSlot = slotContainer();
	private readonly endSlot = slotContainer();
	private readonly noticeSlot = slotContainer();
	private readonly hintSlot = slotContainer();
	private readonly bottomSlot = slotContainer();

	constructor() {
		super();
		this.noticeSlot.append(this.hintSlot, this.updateBanner);
	}

	/** The map element. */
	get map(): FieldMapElement | null {
		return this.querySelector("field-map");
	}

	/**
	 * Whether a navigation is running. The one piece of map state a reload would
	 * destroy and the player would have to re-enter by hand — `main.ts` holds an app
	 * update back over it.
	 */
	get navigating(): boolean {
		return this.map?.navigating ?? false;
	}

	/** Mirrors `navigating`, as state, for the install bar. */
	@state() private navigationRunning = false;

	// --- The install nudge. The landing page's card is the real pitch; this is the
	// backstop for everyone who arrived on a shared ?map= link and so has never seen
	// that page. It covers part of a live map, which buys it two obligations: it
	// waits until the app has actually proved useful, and "Später" means it. ---
	@state() private install: InstallMethod = installMethod();
	/** True once a fix has been drawn: the app has just shown them where they are. */
	@state() private locatedOnce = false;
	@state() private installBarDismissed = installNudgeSnoozed();
	/** iOS has no prompt to fire, so its bar unfolds into the gesture instead. */
	@state() private installStepsOpen = false;

	/** The prop dosimeter's dialog, on a map whose scenario offers one. */
	@state() private dosimeterOpen = false;
	/**
	 * The one-time callout under the trefoil, shown on the first navigation started on
	 * a map with a dosimeter: the direction finder is otherwise invisible until someone
	 * happens to open the device mid-route. `dosimeterHintDone` is the remembered flag,
	 * kept here too so a browser without storage still shows it only once a session.
	 */
	@state() private dosimeterHint = false;
	private dosimeterHintDone = dosimeterHintSeen();
	/** The newest fix and guidance, for a dosimeter opened after they arrived. */
	private lastFix: PositionFix | null = null;
	private guidance: GuidanceDetail | null = null;

	private stopWatchingInstall?: () => void;

	connectedCallback() {
		super.connectedCallback();
		this.stopWatchingInstall = onInstallChange(() => (this.install = installMethod()));
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.stopWatchingInstall?.();
	}

	protected willUpdate(changed: PropertyValues<this>) {
		// The dosimeter belongs to the map it was opened on, and the next one may not have one.
		if (changed.has("scenario")) {
			this.dosimeterOpen = false;
			this.dosimeterHint = false;
		}
	}

	private get hasDosimeter(): boolean {
		return Boolean(getMap(this.scenario)?.dosimeter);
	}

	render() {
		// No on-map credit: Field Maps credits OpenStreetMap on the overview and in the
		// Impressum (see i18n.ts), where its data licence is spelled out.
		return html`
			<field-map
				.scenario=${this.scenario}
				.attribution=${false}
				.topStart=${this.startSlot}
				.topEnd=${this.endSlot}
				.topNotice=${this.noticeSlot}
				.bottomNotice=${this.bottomSlot}
				@fieldmap-fix=${this.onFix}
				@fieldmap-guidance=${this.onGuidance}
				@fieldmap-navigation=${this.onNavigation}
			></field-map>
			${this.renderDosimeter()}
		`;
	}

	protected updated() {
		// The chrome handed to the map is rendered into its containers here, on every
		// update of this element — the containers themselves sit wherever the map put them.
		render(
			html`<button
				type="button"
				class="fm-round-button home-btn"
				aria-label=${t.backToOverview}
				@click=${() => goHome()}
			>
				‹
			</button>`,
			this.startSlot,
		);
		render(this.renderDosimeterButton(), this.endSlot);
		render(this.renderDosimeterHint(), this.hintSlot);
		render(this.renderInstallBar(), this.bottomSlot);
		this.syncDosimeterDialog();
	}

	private onFix = (event: CustomEvent<PositionFix>) => {
		this.lastFix = event.detail;
		this.locatedOnce = true;
		// Handed straight to the device rather than through a render of this element: a
		// moved fix changes nothing else here that a render would redraw.
		const dosimeter = this.querySelector<DosimeterView>("dosimeter-view");
		if (dosimeter) {
			const { lat, lng, accuracy } = event.detail;
			const position = dosimeter.position;
			if (!position || position.lat !== lat || position.lng !== lng) {
				dosimeter.position = { lat, lng, accuracy };
			}
		}
	};

	/**
	 * The running navigation, for the dosimeter's direction finder. Written straight
	 * onto the device rather than through a render of this element: it changes with
	 * every compass reading, which is far more often than anything else here.
	 */
	private onGuidance = (event: CustomEvent<GuidanceDetail | null>) => {
		this.guidance = event.detail;
		const dosimeter = this.querySelector<DosimeterView>("dosimeter-view");
		if (dosimeter) dosimeter.guidance = event.detail;
	};

	private onNavigation = () => {
		const running = this.navigating;
		const started = running && !this.navigationRunning;
		this.navigationRunning = running;
		if (started) this.offerDosimeterHint();
		if (!running) this.dosimeterHint = false;
	};

	/**
	 * The install bar, for players who never saw the landing page.
	 *
	 * Event links get passed around directly — `?map=de` in a group chat — so a good
	 * share of players land straight on a map and never read the page that explains
	 * any of this. This is the same offer, at the point it starts to matter, and it
	 * holds itself to three rules: it waits for the first GPS fix, so it is asking
	 * someone who has just watched the app work rather than someone still staring at
	 * a blank map; it never appears while a navigation is running, because it would
	 * be covering the one thing they are walking towards; and dismissing it is
	 * remembered for a fortnight, which covers a whole event weekend.
	 */
	private renderInstallBar() {
		if (this.installBarDismissed || !this.locatedOnce) return "";
		if (this.navigationRunning) return "";
		// "manual" is a desktop browser's menu and "in-app-browser" needs a paragraph
		// to explain itself: both belong on the landing page, not over a live map.
		if (this.install.kind !== "prompt" && this.install.kind !== "ios") return "";

		const dismiss = () => {
			snoozeInstallNudge();
			this.installBarDismissed = true;
		};

		const act = async () => {
			if (this.install.kind === "prompt") {
				await promptInstall();
				return;
			}
			// iOS: nothing to fire, so the bar unfolds into the gesture instead of
			// sending them back to the overview and losing the map they are on.
			this.installStepsOpen = !this.installStepsOpen;
		};

		return html`
			<div class="install-bar">
				<span class="install-bar-text">
					${t.installBarText}
					${
						this.installStepsOpen
							? html`
									<span class="install-bar-steps">
										<span>1. ${t.installIosStep1}</span>
										<span>2. ${t.installIosStep2}</span>
									</span>
								`
							: ""
					}
				</span>
				<button type="button" class="install-bar-go" @click=${act}>
					${this.install.kind === "prompt" ? t.installBarAction : t.installBarShow}
				</button>
				<button
					type="button"
					class="install-bar-later"
					aria-label=${t.installBarLater}
					@click=${dismiss}
				>
					×
				</button>
			</div>
		`;
	}

	/** Show the Geiger-counter callout, the first time a navigation starts on a dosimeter map. */
	private offerDosimeterHint() {
		if (this.dosimeterHintDone || this.dosimeterOpen || !this.hasDosimeter) return;
		this.dosimeterHint = true;
		this.dosimeterHintDone = true;
		// It sits under the top row, where on iOS the compass prompt the direction finder
		// needs comes next, so it does not stay there for long.
		window.setTimeout(() => (this.dosimeterHint = false), DOSIMETER_HINT_MS);
		try {
			localStorage.setItem(DOSIMETER_HINT_KEY, "1");
		} catch {
			// Storage unavailable — it still shows only once this session.
		}
	}

	/**
	 * The prop dosimeter, on the scenarios that ask for one (OP Tschernobyl). A real
	 * <dialog> like the landing page's share sheet, so the backdrop, the focus trap and
	 * Escape come from the browser. The device itself is only in the DOM while the
	 * dialog is open, which is what starts and stops its needle twitching.
	 */
	private renderDosimeterButton() {
		if (!this.hasDosimeter) return html``;
		return html`
			<button
				type="button"
				class="fm-round-button dosimeter-btn ${this.dosimeterOpen ? "on" : ""}"
				aria-label=${t.dosimeter}
				title=${t.dosimeter}
				@click=${() => this.openDosimeter()}
			>
				<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
					<circle cx="12" cy="12" r="2" fill="currentColor"></circle>
					<path
						fill="currentColor"
						d="M12 12 L7.5 4.2 A9 9 0 0 1 16.5 4.2 Z M12 12 L21 12 A9 9 0 0 1 16.5 19.8 Z M12 12 L7.5 19.8 A9 9 0 0 1 3 12 Z"
					></path>
					<circle
						cx="12"
						cy="12"
						r="3.2"
						fill="none"
						stroke="rgba(22,29,38,0.95)"
						stroke-width="1.6"
					></circle>
				</svg>
			</button>
		`;
	}

	private openDosimeter() {
		// Inside the tap, the one place a browser lets audio start: the device opens
		// with its Geiger clicks already running.
		primeDosimeterAudio();
		this.dosimeterHint = false;
		this.dosimeterOpen = true;
	}

	private renderDosimeterHint() {
		if (!this.dosimeterHint) return html``;
		return html`
			<div class="dosimeter-hint" role="status">
				<button type="button" class="dosimeter-hint-go" @click=${() => this.openDosimeter()}>
					${t.dosimeterHint}
				</button>
				<button
					type="button"
					class="dosimeter-hint-close"
					aria-label=${t.dosimeterHintDismiss}
					@click=${() => (this.dosimeterHint = false)}
				>
					×
				</button>
			</div>
		`;
	}

	private renderDosimeter() {
		if (!this.hasDosimeter) return "";
		const sources = this.dosimeterSources();
		return html`
			<dialog
				class="dosimeter-sheet"
				@close=${() => (this.dosimeterOpen = false)}
				@click=${this.onDosimeterBackdrop}
			>
				${
					this.dosimeterOpen
						? html`<dosimeter-view
								.position=${this.lastFix}
								.zones=${sources.zones}
								.points=${sources.points}
								.guidance=${this.guidance}
								@close=${() => (this.dosimeterOpen = false)}
							></dosimeter-view>`
						: ""
				}
			</dialog>
		`;
	}

	/**
	 * What the dosimeter's GPS reading is computed from: the map's `biohazard` zones,
	 * and its radiating objects — every headquarters and `radiatingPois` at full
	 * strength, and every other building weaker. Turbines and road barriers are not
	 * buildings and stay out. Memoised on the scenario, so the device is handed the same
	 * arrays and does not re-render on a render of this element that changed neither.
	 */
	private dosimeterSources(): { zones: LatLng[][]; points: RadiationPoint[] } {
		if (this.dosimeterSourcesFor?.scenario !== this.scenario) {
			const definition = getMap(this.scenario);
			const radiating = new Set(definition?.radiatingPois ?? []);
			this.dosimeterSourcesFor = {
				scenario: this.scenario,
				zones: (definition?.zones ?? [])
					.filter((zone) => zone.style === "biohazard")
					.map((zone) => zone.points),
				points: [
					...(definition?.headquarters ?? []),
					...(definition ? labelPointsOfInterest(definition.poiNames) : [])
						.filter((poi) => poi.kind == null)
						.map((poi) => ({
							lat: poi.lat,
							lng: poi.lng,
							level: radiating.has(poi.id) ? POI_LEVEL : BUILDING_LEVEL,
						})),
				],
			};
		}
		return this.dosimeterSourcesFor;
	}
	private dosimeterSourcesFor: {
		scenario: string;
		zones: LatLng[][];
		points: RadiationPoint[];
	} | null = null;

	/** A tap on the backdrop (the dialog itself, not the device inside it) closes it. */
	private onDosimeterBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) this.dosimeterOpen = false;
	}

	/** Drive the native <dialog> from `dosimeterOpen`, so state stays the single truth. */
	private syncDosimeterDialog() {
		const dialog = this.querySelector<HTMLDialogElement>("dialog.dosimeter-sheet");
		if (!dialog) return;
		if (this.dosimeterOpen && !dialog.open) dialog.showModal();
		if (!this.dosimeterOpen && dialog.open) dialog.close();
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"map-screen": MapScreen;
	}
}
