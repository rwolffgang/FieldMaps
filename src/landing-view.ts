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
import { goToMap, mapUrl } from "./router.js";
import { daysUntil, formatSchedule, isRunning } from "./event-schedule.js";

/** Donations — the airsoft twist on "buy me a coffee". */
const SUPPORT_URL = "https://buymeacoffee.com/rwolffgang";

/** Feature requests. Prefilled subject so they are easy to triage in the inbox. */
const FEATURE_MAILTO =
	"mailto:info@fieldmaps.app?subject=" + encodeURIComponent("Field Maps — Feature-Wunsch");

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

	render() {
		return html`
			<div class="landing">
				<header class="landing-head">
					<h1 class="landing-title">Field Maps</h1>
					<p class="landing-tagline">Deine Position auf der Taktikkarte — offline, ohne Empfang.</p>
					<p class="landing-intro">
						Field Maps zeigt dir per GPS, wo du gerade auf dem Gelände stehst — auf der Taktikkarte
						des jeweiligen Events, mit allen Gebäuden, Zonen und Hauptquartieren. Karten und Daten
						sind komplett in der App gespeichert: einmal geladen, funktioniert alles ohne Netz. Zum
						Startbildschirm hinzufügen, dann läuft sie wie eine normale App.
					</p>
				</header>

				<h2 class="landing-section">Events</h2>
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
								? "Läuft jetzt"
								: map === upcoming
									? `In ${daysUntil(map.schedule!)} Tagen`
									: "";
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
														? html`<span class="event-dates">${formatSchedule(map.schedule)}</span>`
														: html`<span class="event-dates event-variant">Variante</span>`
												}
												${badge ? html`<span class="event-badge">${badge}</span>` : ""}
											</span>
											${map.blurb ? html`<span class="event-blurb">${map.blurb}</span>` : ""}
											<span class="event-meta">
												${count}
												Punkte${hqs ? html` · ${hqs} HQ` : ""}${
													zones ? html` · ${zones} ${zones === 1 ? "Zone" : "Zonen"}` : ""
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
					<p>
						Jede Karte hat ihren eigenen Link — Karte öffnen und die Adresse speichern, oder hier
						eine Karte lange antippen und den Link kopieren.
					</p>

					<div class="landing-actions">
						<a class="action action-support" href=${SUPPORT_URL} target="_blank" rel="noopener">
							<span class="action-icon" aria-hidden="true">🎯</span>
							<span class="action-text">
								<span class="action-label">Buy me a sniper</span>
								<span class="action-sub">Entwicklung unterstützen</span>
							</span>
						</a>
						<a class="action" href=${FEATURE_MAILTO}>
							<span class="action-icon" aria-hidden="true">✉</span>
							<span class="action-text">
								<span class="action-label">Feature vorschlagen</span>
								<span class="action-sub">info@fieldmaps.app</span>
							</span>
						</a>
						<a class="action" href=${REPO_URL} target="_blank" rel="noopener">
							<span class="action-icon" aria-hidden="true">&lt;/&gt;</span>
							<span class="action-text">
								<span class="action-label">Quellcode</span>
								<span class="action-sub">GitHub</span>
							</span>
						</a>
					</div>

					<p class="landing-fineprint">
						Taktikkarten und Fraktionslogos: Airsoft Helden. Kartendaten: OpenStreetMap-Mitwirkende.
						Spielfeldgrenzen sind von den gedruckten Karten abgezeichnet und nur ungefähr — vor Ort
						gilt das Flatterband.
					</p>
				</footer>
			</div>
		`;
	}
}
