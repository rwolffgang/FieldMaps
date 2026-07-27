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

import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { mapsByDate, getPointsOfInterestForMap } from "./config.js";
import { goToMap, goToLegal, mapUrl, LEGAL_URL } from "./router.js";
import { daysUntil, formatSchedule, isRunning } from "./event-schedule.js";
import { currentLang, strings } from "./i18n.js";

/** Donations — the airsoft twist on "buy me a coffee". */
const SUPPORT_URL = "https://buymeacoffee.com/rwolffgang";

/** The app icon, reused from the PWA manifest set. */
const APP_ICON = "/icons/icon-192.png";

/** Feature requests. Prefilled subject so they are easy to triage in the inbox. */
function featureMailto(subject: string) {
	return "mailto:robert@wolffgang.de?subject=" + encodeURIComponent(subject);
}

/** TODO: update once the repository is renamed (see AGENTS.md). */
const REPO_URL = "https://github.com/rwolffgang/MahlwinkelMap";

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

	render() {
		const t = strings();
		const lang = currentLang();

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

				<!-- The one thing a first-time visitor should do. Hidden by CSS once the
				     app runs standalone, where it would only be telling them what they
				     have already done. -->
				<aside class="install-note">
					<span class="install-mark" aria-hidden="true">
						<img src=${APP_ICON} alt="" width="192" height="192" />
						<span class="install-plus">+</span>
					</span>
					<span class="install-text">
						<strong class="install-title">${t.installTitle}</strong>
						<span class="install-body">${t.installText}</span>
						<span class="install-hints">
							<span>${t.installHintIos}</span>
							<span>${t.installHintAndroid}</span>
						</span>
					</span>
				</aside>

				<h2 class="landing-section">${t.sectionEvents}</h2>
				<p class="landing-section-note">${t.sectionEventsNote}</p>
				<ul class="event-grid">
					${(() => {
						const ordered = mapsByDate();
						// Only the first scheduled event gets the "next up" badge — the list is
						// already sorted, so that is whichever one is soonest.
						const upcoming = ordered.find((map) => map.schedule != null);
						return ordered.map((map) => {
							const count = getPointsOfInterestForMap(map.id).length;
							const zones = map.zones?.length ?? 0;
							const hqs = map.headquarters?.length ?? 0;
							const running = map.schedule != null && isRunning(map.schedule);
							const badge = running
								? t.badgeRunning
								: map === upcoming
									? t.badgeInDays(daysUntil(map.schedule!))
									: "";
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
														? html`<span class="event-dates"
																>${formatSchedule(map.schedule, lang)}</span
															>`
														: html`<span class="event-dates event-variant">${t.variant}</span>`
												}
												${badge ? html`<span class="event-badge">${badge}</span>` : ""}
											</span>
											${blurb ? html`<span class="event-blurb">${blurb}</span>` : ""}
											<span class="event-meta">
												${t.points(count)}${hqs ? html` · ${hqs} HQ` : ""}${
													zones ? html` · ${t.zones(zones)}` : ""
												}
											</span>
										</span>
										<span class="event-go" aria-hidden="true">→</span>
									</a>
								</li>
							`;
						});
					})()}
				</ul>

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
				</footer>
			</div>
		`;
	}
}
