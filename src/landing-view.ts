// -----------------------------------------------------------------------------
// landing-view.ts
// The overview screen: what Field Maps is, then one card per event.
//
// Each card is a real <a href="?map=…">, not a button. That is the point of the
// screen — a player should be able to long-press a card, copy the link, and keep it
// somewhere useful (or bookmark it, or send it to their team). Clicks are
// intercepted for in-app navigation, but the href stays honest so every native
// browser affordance keeps working.
// -----------------------------------------------------------------------------

import { LitElement, html, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { mapsByDate, getPointsOfInterestForMap, type MapDefinition } from "./config.js";
import { goToMap, goToLegal, mapUrl, LEGAL_URL } from "./router.js";
import { daysUntil, formatSchedule, hasEnded, isRunning } from "./event-schedule.js";
import { currentLang, strings, type Lang } from "./i18n.js";
import { BUILD_ID } from "./update.js";
import { installMethod, onInstallChange, promptInstall, type InstallMethod } from "./install.js";

/** Donations — the airsoft twist on "buy me a coffee". */
const SUPPORT_URL = "https://buymeacoffee.com/rwolffgang";

/** The app icon, reused from the PWA manifest set. */
const APP_ICON = "/icons/icon-192.png";

/** Feature requests. Prefilled subject so they are easy to triage in the inbox. */
function featureMailto(subject: string) {
	return "mailto:robert@wolffgang.de?subject=" + encodeURIComponent(subject);
}

const REPO_URL = "https://github.com/rwolffgang/FieldMaps";

/**
 * What the share sheet hands out, and what the QR code resolves to.
 *
 * Written out rather than read from `location`: a player may well be looking at
 * this page on a tunnel URL, a preview deploy, or a bare IP on the local network,
 * and the link they pass to someone else has to be the real one.
 */
const SITE_URL = "https://www.fieldmaps.app";

/**
 * iOS's Share glyph, drawn rather than named.
 *
 * On Android the control says "Share"; on iOS it is this symbol and no word at
 * all, so an instruction that only writes the word is asking someone to find
 * something they cannot see. Traced to match the system icon closely enough to be
 * recognised in a toolbar: a box open at the top, with an arrow leaving it.
 */
const SHARE_GLYPH = svg`<svg viewBox="0 0 24 24" width="18" height="18" fill="none"
	stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
	<path d="M12 3.5v11" />
	<path d="M8.4 7 12 3.4 15.6 7" />
	<path d="M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
</svg>`;

/** A browser window, for the "you are in a webview, get out of it" card. */
const BROWSER_GLYPH = svg`<svg viewBox="0 0 24 24" width="30" height="30" fill="none"
	stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
	<rect x="2.5" y="4" width="19" height="16" rx="2.5" />
	<path d="M2.5 8.5h19" />
	<circle cx="6" cy="6.25" r="0.9" fill="currentColor" stroke="none" />
	<circle cx="9" cy="6.25" r="0.9" fill="currentColor" stroke="none" />
</svg>`;

/**
 * A QR code, abbreviated to its three finder patterns.
 *
 * Those corners are the part everyone reads as "code to scan" — drawing plausible
 * data modules between them would only make a small glyph noisy.
 */
const QR_GLYPH = svg`<svg viewBox="0 0 24 24" width="26" height="26" fill="none"
	stroke="currentColor" stroke-width="1.8">
	<rect x="3" y="3" width="7" height="7" rx="1.2" />
	<rect x="14" y="3" width="7" height="7" rx="1.2" />
	<rect x="3" y="14" width="7" height="7" rx="1.2" />
	<path d="M6.2 6.2h.6v.6h-.6zM17.2 6.2h.6v.6h-.6zM6.2 17.2h.6v.6h-.6z"
		stroke-width="2.4" stroke-linecap="round" />
	<path d="M14 14h3M20 14v3M17 17h4M14 19.5h2.5M19.5 19.5H21" stroke-linecap="round" />
</svg>`;

/** The QR code, baked once by `scripts/make-qr.mjs` and precached like any asset. */
const SITE_QR = "/qr-fieldmaps.svg";

@customElement("landing-view")
export class LandingView extends LitElement {
	// Light DOM, like map-view — the app's stylesheet is global.
	protected createRenderRoot() {
		return this;
	}

	private open(event: MouseEvent, id: string) {
		// Leave modified clicks (new tab, download, …) to the browser.
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		goToMap(id);
	}

	private openLegal(event: MouseEvent) {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		goToLegal();
	}

	/** What this device can do about installing. Kept in state: Chromium decides
	 * a site is installable on its own schedule, often after first paint, and the
	 * card has to become a button the moment it does. */
	@state() private install: InstallMethod = installMethod();

	@state() private shareOpen = false;

	/** Briefly true after a successful copy, so the button can confirm it. */
	@state() private copied = false;

	private stopWatchingInstall?: () => void;
	private copiedTimer?: number;

	connectedCallback() {
		super.connectedCallback();
		this.stopWatchingInstall = onInstallChange(() => (this.install = installMethod()));
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.stopWatchingInstall?.();
		clearTimeout(this.copiedTimer);
	}

	/** Drive the native <dialog> from `shareOpen`, so state stays the single truth. */
	updated() {
		const dialog = this.querySelector("dialog.share-sheet") as HTMLDialogElement | null;
		if (!dialog) return;
		if (this.shareOpen && !dialog.open) dialog.showModal();
		if (!this.shareOpen && dialog.open) dialog.close();
	}

	private async onInstallClick() {
		await promptInstall();
		// Whatever the answer, the prompt is spent; `install.ts` has already told us.
	}

	private async onCopyLink() {
		try {
			await navigator.clipboard.writeText(SITE_URL);
			this.copied = true;
			clearTimeout(this.copiedTimer);
			this.copiedTimer = setTimeout(() => (this.copied = false), 2000) as unknown as number;
		} catch {
			// Denied, or no clipboard in this context. The URL is on screen right
			// above the button, so there is still a way through.
		}
	}

	private async onSendLink() {
		try {
			await navigator.share({ title: "Field Maps", text: strings().shareMessage, url: SITE_URL });
		} catch {
			// A cancelled share sheet rejects, and so does a browser without one.
		}
	}

	/** Closed until the player opens it; remembered so a re-render does not shut it. */
	private pastEventsOpen = false;

	private onPastEventsToggle(event: Event) {
		this.pastEventsOpen = (event.currentTarget as HTMLDetailsElement).open;
	}

	private eventCard(map: MapDefinition, lang: Lang, badge: string) {
		const t = strings();
		const count = getPointsOfInterestForMap(map.id).length;
		const zones = map.zones?.length ?? 0;
		const headquarters = map.headquarters?.length ?? 0;
		const running = map.schedule != null && isRunning(map.schedule);
		// German is the source text; fall back to it if a scenario has no
		// translation yet, rather than showing the card with a hole in it.
		const blurb = (lang === "en" ? map.blurbEn : map.blurb) ?? map.blurb;
		return html`
			<li>
				<a
					class="event-card ${running ? "is-running" : ""}"
					href=${mapUrl(map.id)}
					style="--event-accent:${map.accent ?? "#8aa0b4"}"
					@click=${(e: MouseEvent) => this.open(e, map.id)}
				>
					<span class="event-rule"></span>
					<span class="event-body">
						<span class="event-name">${map.name}</span>
						<span class="event-when">
							${
								map.schedule
									? html`<span class="event-dates">${formatSchedule(map.schedule, lang)}</span>`
									: html`<span class="event-dates event-variant">${t.variant}</span>`
							}
							${badge ? html`<span class="event-badge">${badge}</span>` : nothing}
						</span>
						${blurb ? html`<span class="event-blurb">${blurb}</span>` : nothing}
						<span class="event-meta">
							${t.points(count)}${headquarters ? html` · ${headquarters} HQ` : nothing}${
								zones ? html` · ${t.zones(zones)}` : nothing
							}
						</span>
					</span>
					<span class="event-go" aria-hidden="true">→</span>
				</a>
			</li>
		`;
	}

	/**
	 * The install card: one answer, for this device.
	 *
	 * The old card printed the iPhone gesture and the Android gesture together and
	 * left the reader to work out which was theirs — which is most of why test users
	 * missed it. Every branch below is the same card with the one instruction that
	 * applies, and on Chromium there is no instruction at all, just the button.
	 */
	private renderInstall() {
		const t = strings();
		const method = this.install;

		// Already installed. Saying "add this to your home screen" to someone reading
		// it *from* their home screen is how a prompt loses its credibility.
		if (method.kind === "installed") return nothing;

		// A webview cannot install, and its Share menu has no "Add to Home Screen"
		// to point at, so this is the one branch that asks for something else first.
		if (method.kind === "in-app-browser") {
			return html`
				<aside class="install-note is-blocked">
					<span class="install-mark" aria-hidden="true">${BROWSER_GLYPH}</span>
					<span class="install-text">
						<strong class="install-title">${t.installInAppTitle}</strong>
						<span class="install-body">${t.installInAppText(method.app)}</span>
						<span class="install-hints"><span>${t.installInAppHint}</span></span>
					</span>
				</aside>
			`;
		}

		return html`
			<aside class="install-note">
				<span class="install-mark" aria-hidden="true">
					<img src=${APP_ICON} alt="" width="192" height="192" />
					<span class="install-plus">+</span>
				</span>
				<span class="install-text">
					<strong class="install-title">${t.installTitle}</strong>
					<span class="install-body">${t.installText}</span>
					${this.renderInstallAction(method)}
				</span>
			</aside>
		`;
	}

	/** The part of the card that differs: a button, two steps, or a menu hint. */
	private renderInstallAction(method: InstallMethod) {
		const t = strings();

		// The good case. The browser has already decided the site is installable and
		// handed us its prompt, so there is nothing to explain.
		if (method.kind === "prompt") {
			return html`
				<button type="button" class="install-btn" @click=${this.onInstallClick}>
					${t.installButton}
				</button>
			`;
		}

		// iOS has no prompt to fire, so the gesture has to be described — with the
		// Share glyph drawn rather than named, because "Share" is a word on Android
		// and a symbol on iOS, and the symbol is what they are looking for.
		if (method.kind === "ios") {
			return html`
				<span class="install-steps">
					<span class="install-steps-lead">${t.installIosLead}</span>
					<ol>
						<li><span class="install-step-glyph">${SHARE_GLYPH}</span>${t.installIosStep1}</li>
						<li>${t.installIosStep2}</li>
					</ol>
				</span>
			`;
		}

		return html`<span class="install-hints"><span>${t.installManualLead}</span></span>`;
	}

	/**
	 * The share sheet: a QR code and a link.
	 *
	 * The QR is the half that earns its place. Sharing happens at the field, where
	 * the two people involved are standing next to each other with no signal between
	 * them — holding up a code someone points a camera at beats spelling out a URL,
	 * and beats a messaging app that has nothing to send over.
	 */
	private renderShare() {
		const t = strings();
		return html`
			<div class="share-cta">
				<button type="button" class="share-btn" @click=${() => (this.shareOpen = true)}>
					<span class="share-btn-glyph" aria-hidden="true">${QR_GLYPH}</span>
					<span class="share-btn-text">
						<span class="share-btn-label">${t.shareTitle}</span>
						<span class="share-btn-sub">${t.shareIntro}</span>
					</span>
				</button>
			</div>

			<!-- A real <dialog>: the browser gives us the backdrop, the focus trap and
			     dismissal on Escape, none of which is worth reimplementing. -->
			<dialog class="share-sheet" @close=${() => (this.shareOpen = false)}>
				<h2 class="share-sheet-title">${t.shareTitle}</h2>
				<p class="share-sheet-hint">${t.shareScanHint}</p>
				<!-- Static, generated once by scripts/make-qr.mjs. It carries its own
				     white ground, because a QR needs one and the page is near-black. -->
				<img class="share-qr" src=${SITE_QR} alt=${SITE_URL} width="264" height="264" />
				<p class="share-url">${SITE_URL.replace("https://", "")}</p>
				<div class="share-sheet-actions">
					${
						"share" in navigator
							? html`<button type="button" class="share-action" @click=${this.onSendLink}>
									${t.shareSend}
								</button>`
							: nothing
					}
					<button type="button" class="share-action" @click=${this.onCopyLink}>
						${this.copied ? t.shareCopied : t.shareCopy}
					</button>
				</div>
				<button
					type="button"
					class="share-close"
					aria-label=${t.shareClose}
					@click=${() => (this.shareOpen = false)}
				>
					×
				</button>
			</dialog>
		`;
	}

	render() {
		const t = strings();
		const lang = currentLang();
		const ordered = mapsByDate();
		const upcomingMaps = ordered.filter((map) => map.schedule == null || !hasEnded(map.schedule));
		const pastMaps = ordered.filter((map) => map.schedule != null && hasEnded(map.schedule));
		// Only the soonest still-upcoming event gets the "next up" badge.
		const soonest = upcomingMaps.find((map) => map.schedule != null);

		const badgeFor = (map: MapDefinition): string => {
			if (map.schedule != null && isRunning(map.schedule)) return t.badgeRunning;
			if (map === soonest) return t.badgeInDays(daysUntil(map.schedule!));
			return "";
		};

		return html`
			<div class="landing">
				<header class="landing-head">
					<div class="landing-brand">
						<img class="landing-icon" src=${APP_ICON} alt="" width="192" height="192" />
						<h1 class="landing-title">Field Maps</h1>
					</div>
					<p class="landing-tagline">${t.tagline}</p>
					<!-- The app covers one field and one field only. Say so above the fold,
					     before someone installs it expecting their own event. -->
					<p class="landing-site">
						<span class="landing-site-pin" aria-hidden="true">📍</span>${t.site}
					</p>
					<p class="landing-intro">${t.intro}</p>
				</header>

				${this.renderInstall()} ${this.renderShare()}

				<h2 class="landing-section">${t.sectionEvents}</h2>
				<p class="landing-section-note">${t.sectionEventsNote}</p>
				${
					upcomingMaps.length
						? html`<ul class="event-grid">
								${upcomingMaps.map((map) => this.eventCard(map, lang, badgeFor(map)))}
							</ul>`
						: nothing
				}
				${
					pastMaps.length
						? html`
								<details
									class="past-events"
									?open=${this.pastEventsOpen}
									@toggle=${this.onPastEventsToggle}
								>
									<summary class="past-events-summary">
										<h2 class="landing-section">${t.sectionPastEvents}</h2>
										<span class="past-events-chevron" aria-hidden="true"></span>
									</summary>
									<ul class="event-grid">
										${pastMaps.map((map) => this.eventCard(map, lang, ""))}
									</ul>
								</details>
							`
						: nothing
				}

				<footer class="landing-foot">
					<p>${t.linkHint}</p>

					<div class="landing-actions">
						<a class="action action-support" href=${SUPPORT_URL} target="_blank" rel="noopener">
							<span class="action-icon" aria-hidden="true">🎯</span>
							<span class="action-text">
								<span class="action-label">${t.supportLabel}</span>
								<span class="action-sub">${t.supportSub}</span>
							</span>
						</a>
						<a class="action" href=${featureMailto(t.featureSubject)}>
							<span class="action-icon" aria-hidden="true">✉</span>
							<span class="action-text">
								<span class="action-label">${t.featureLabel}</span>
								<span class="action-sub">robert@wolffgang.de</span>
							</span>
						</a>
						<a class="action" href=${REPO_URL} target="_blank" rel="noopener">
							<span class="action-icon" aria-hidden="true">&lt;/&gt;</span>
							<span class="action-text">
								<span class="action-label">${t.sourceLabel}</span>
								<span class="action-sub">GitHub</span>
							</span>
						</a>
					</div>

					<p class="landing-fineprint">${t.fineprint}</p>

					<!-- § 5 DDG: the Impressum has to be easy to spot and reachable from
					     anywhere in the app. Its own link, in the footer where people look
					     for it, and a real href so it can be opened in a tab or shared. -->
					<p class="landing-legal">
						<a href=${LEGAL_URL} @click=${(e: MouseEvent) => this.openLegal(e)}
							>${t.legal.linkLabel}</a
						>
					</p>

					<!-- Which build this phone is on. The app updates itself (see
					     src/update.ts), and this is how you check that it did. -->
					<p class="landing-version">${BUILD_ID}</p>
				</footer>
			</div>
		`;
	}
}
