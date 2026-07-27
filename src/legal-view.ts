// -----------------------------------------------------------------------------
// legal-view.ts
// The legal page at /?page=impressum — Impressum (§ 5 DDG) and privacy notice.
//
// German law wants this "leicht erkennbar, unmittelbar erreichbar und ständig
// verfügbar": its own URL, linked from the overview's footer, and — like every
// other screen here — served from the offline cache, so it is still there when
// the phone has no signal.
//
// The one thing to keep correct is OPERATOR below. An Impressum with a missing
// or wrong address is worse than none at all, so anything unfilled renders as a
// visible placeholder rather than quietly collapsing to an empty line.
// -----------------------------------------------------------------------------

import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { goHome } from "./router.js";
import { strings } from "./i18n.js";

/**
 * The operator, as § 5 DDG requires it: full name and a summonable postal
 * address (`ladungsfähige Anschrift` — a real street address; a PO box or a
 * "c/o" does not satisfy the law), plus a channel for direct contact.
 */
export const OPERATOR = {
	name: "Robert Wolffgang",
	street: "Bahlmannstraße 2",
	postalCode: "48147",
	city: "Münster",
	country: "Deutschland",
	email: "robert@wolffgang.de",
} as const;

/** Address lines, in postal order. Empty fields become visible placeholders. */
function addressLines(): { text: string; missing: boolean }[] {
	const { street, postalCode, city, country } = OPERATOR;
	const locality = [postalCode, city].filter(Boolean).join(" ");
	return [
		{ text: street || "[Straße und Hausnummer]", missing: !street },
		{ text: locality || "[PLZ und Ort]", missing: !postalCode || !city },
		{ text: country, missing: !country },
	];
}

@customElement("legal-view")
export class LegalView extends LitElement {
	// Light DOM, like the other two screens — the app's stylesheet is global.
	protected createRenderRoot() {
		return this;
	}

	private back(event: MouseEvent) {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		goHome();
	}

	render() {
		const t = strings().legal;

		return html`
			<div class="legal">
				<a class="legal-back" href="/" @click=${(e: MouseEvent) => this.back(e)}>
					<span aria-hidden="true">←</span> ${t.back}
				</a>

				<h1 class="legal-title">${t.impressumTitle}</h1>

				<section class="legal-section">
					<h2>${t.providerHeading}</h2>
					<address class="legal-address">
						<span>${OPERATOR.name}</span>
						${addressLines().map(
							(line) =>
								html`<span class=${line.missing ? "legal-missing" : ""}>${line.text}</span>`,
						)}
					</address>
				</section>

				<section class="legal-section">
					<h2>${t.contactHeading}</h2>
					<p>
						${t.contactEmailLabel}:
						<a href="mailto:${OPERATOR.email}">${OPERATOR.email}</a>
					</p>
				</section>

				<section class="legal-section">
					<h2>${t.responsibleHeading}</h2>
					<p>${OPERATOR.name} — ${t.sameAddress}</p>
				</section>

				${t.impressumSections.map(
					(section) => html`
						<section class="legal-section">
							<h2>${section.heading}</h2>
							${section.body.map((paragraph) => html`<p>${paragraph}</p>`)}
						</section>
					`,
				)}

				<h1 class="legal-title legal-title-second">${t.privacyTitle}</h1>

				${t.privacySections.map(
					(section) => html`
						<section class="legal-section">
							<h2>${section.heading}</h2>
							${section.body.map((paragraph) => html`<p>${paragraph}</p>`)}
						</section>
					`,
				)}
			</div>
		`;
	}
}
