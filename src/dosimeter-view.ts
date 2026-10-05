// -----------------------------------------------------------------------------
// dosimeter-view.ts
// A prop radiation meter for the Stalker scenarios, drawn as a battered Soviet
// ДП-5В field radiometer — a toy, not a sensor.
//
// It measures nothing. The reading comes from the player's GPS fix through
// `radiation.ts`: it climbs near the scenario's irradiated (`biohazard`) zones and,
// a little, near its points of interest. The slider is the device's sensitivity
// (ЧУВСТВИТЕЛЬНОСТЬ) — 50 % reads the model as designed, 0 % always reads
// background, 100 % doubles everything above it — so the same field can be made to
// feel harmless or hot. Without a fix the needle rests on zero and the readout
// says so.
//
// Like the real thing the dial reads 0–5 and a range switch multiplies it: the
// five ranges are full scale 0.05 to 500 мР/ч. A reading above the selected range
// pins the needle and lights ПЕРЕГРУЗ (overload), so a player walking into the
// zone has to switch up. ТРЕВОГА (alarm) blinks from 1 мР/ч, the dosimeter's 60.
//
// The Geiger clicks are synthesised with Web Audio — a few milliseconds of shaped
// noise per click at random (Poisson) intervals whose rate follows the reading —
// so there is no sound file to ship and it works offline. Sound is on when the
// device opens. Browsers only let audio start from a tap, so the map's trefoil
// button calls `primeDosimeterAudio` inside its own click handler. That tap is
// what opens the device, so it is also what unlocks the audio. The ЗВУК switch
// turns the clicks off and on, and the choice holds until the app reloads.
//
// The device's own labels are Russian on purpose (it is a prop from the Zone); the
// handwritten tape strips carry the German a player needs. Shadow DOM, system
// fonts only.
// -----------------------------------------------------------------------------

import { LitElement, css, html, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LatLng } from "./scenarios/scenario.js";
import {
	NOMINAL_SENSITIVITY,
	applySensitivity,
	radiationLevelAt,
	type RadiationPoint,
} from "./radiation.js";
import { strings } from "./i18n.js";

const t = strings();

/** The player's position as the map last had it, or null before the first fix. */
export interface DosimeterFix {
	lat: number;
	lng: number;
	accuracy: number;
}

/** The range switch: full scale in мР/ч, and the label engraved on it. */
const RANGES = [
	{ full: 0.05, label: "×0,01" },
	{ full: 0.5, label: "×0,1" },
	{ full: 5, label: "×1" },
	{ full: 50, label: "×10" },
	{ full: 500, label: "×100" },
] as const;

/** Level (0–100, see `radiation.ts`) from which ТРЕВОГА blinks: 1 мР/ч. */
const ALARM_LEVEL = 60;
/** How often the needle twitches, ms. A real counter is never quite still. */
const JITTER_MS = 260;
/** Clicks per second never exceed this; above it a real tube is a steady crackle anyway. */
const MAX_CLICK_RATE = 160;

// Kept at module level so closing and reopening the device keeps its settings.
let lastSensitivity = NOMINAL_SENSITIVITY;
let lastRange = 1;
let lastSound = true;

// One audio context for the app's lifetime, created on the first tap that needs it
// and suspended while the device is put away. iOS caps how many a page may create,
// so making a fresh one per opening would eventually stop working.
let audio: AudioContext | null = null;
let clickNoise: AudioBuffer | null = null;

/**
 * Create or wake the dosimeter's audio. Call it synchronously from a tap handler:
 * that is the only place a browser lets audio start.
 */
export function primeDosimeterAudio() {
	if (!audio) {
		const Context =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Context) return;
		audio = new Context();
		// One click: 4 ms of noise with a fast decay, reused for every click.
		const length = Math.floor(audio.sampleRate * 0.004);
		clickNoise = audio.createBuffer(1, length, audio.sampleRate);
		const data = clickNoise.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
	}
	void audio.resume();
}

/** Dosimeter level (0–100, one decade per 20) → мР/ч. 10 is background, 3 µР/ч. */
function milliroentgenFor(level: number): number {
	return 0.001 * Math.pow(10, level / 20);
}

/** Geiger clicks per second for a level: under one a second at background. */
function clickRateFor(level: number): number {
	return Math.min(MAX_CLICK_RATE, 0.8 * Math.pow(10, (level - 10) / 30));
}

function formatReading(value: number, full: number): string {
	const digits = full < 1 ? 3 : full < 10 ? 2 : 1;
	return value.toFixed(digits).replace(".", ",");
}

// Dial geometry: pivot (180, 220), scale arc ±50°, radius 170. Fixed, so built once.
const TICKS = Array.from({ length: 51 }, (_, i) => {
	const angle = ((-50 + i * 2) * Math.PI) / 180;
	const major = i % 10 === 0;
	const mid = i % 5 === 0;
	const r1 = major ? 152 : mid ? 158 : 162;
	const r2 = 170;
	return svg`<line
		x1=${(180 + r1 * Math.sin(angle)).toFixed(1)}
		y1=${(220 - r1 * Math.cos(angle)).toFixed(1)}
		x2=${(180 + r2 * Math.sin(angle)).toFixed(1)}
		y2=${(220 - r2 * Math.cos(angle)).toFixed(1)}
		stroke-width=${major ? 2.4 : 1.2}
	></line>`;
});
const LABELS = [0, 1, 2, 3, 4, 5].map((n) => {
	const angle = ((-50 + n * 20) * Math.PI) / 180;
	return svg`<text
		x=${(180 + 132 * Math.sin(angle)).toFixed(1)}
		y=${(226 - 132 * Math.cos(angle)).toFixed(1)}
	>${n}</text>`;
});

@customElement("dosimeter-view")
export class DosimeterView extends LitElement {
	/** Set by the map on every moved fix, so the device follows the player. */
	@property({ attribute: false }) position: DosimeterFix | null = null;
	/** The scenario's irradiated zones (its `biohazard` zones). */
	@property({ attribute: false }) zones: LatLng[][] = [];
	/** The PoIs that lift the reading as the player approaches. */
	@property({ attribute: false }) points: readonly RadiationPoint[] = [];

	@state() private sensitivity = lastSensitivity;
	@state() private range = lastRange;
	@state() private sound = lastSound;
	@state() private jitter = 0;

	private jitterTimer = 0;
	private clickTimer = 0;

	connectedCallback() {
		super.connectedCallback();
		if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
			this.jitterTimer = window.setInterval(() => {
				this.jitter = (Math.random() - 0.5) * 1.6;
			}, JITTER_MS);
		}
		if (this.sound) this.scheduleClick();
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		window.clearInterval(this.jitterTimer);
		window.clearTimeout(this.clickTimer);
		void audio?.suspend();
	}

	/** The level the needle shows now, or null without a fix. */
	private currentLevel(): number | null {
		const fix = this.position;
		if (!fix) return null;
		const modelled = radiationLevelAt(fix.lat, fix.lng, this.zones, this.points);
		const scaled = applySensitivity(modelled, this.sensitivity);
		return Math.min(100, Math.max(0, scaled + this.jitter));
	}

	private onSlide(event: Event) {
		this.sensitivity = lastSensitivity = Number((event.target as HTMLInputElement).value);
	}

	private calibrate() {
		this.sensitivity = lastSensitivity = NOMINAL_SENSITIVITY;
	}

	private pickRange(index: number) {
		this.range = lastRange = index;
	}

	private toggleSound() {
		primeDosimeterAudio();
		this.sound = lastSound = !this.sound;
		window.clearTimeout(this.clickTimer);
		if (this.sound) this.scheduleClick();
	}

	private playClick() {
		if (!audio || !clickNoise) return;
		const source = audio.createBufferSource();
		source.buffer = clickNoise;
		const filter = audio.createBiquadFilter();
		filter.type = "highpass";
		filter.frequency.value = 1800 + Math.random() * 1200;
		const gain = audio.createGain();
		gain.gain.value = 0.5;
		source.connect(filter).connect(gain).connect(audio.destination);
		source.start();
	}

	/** Next click after an exponentially distributed wait: that is what decay sounds like. */
	private scheduleClick() {
		if (!this.sound) return;
		const level = this.currentLevel();
		// No fix, no reading — and no clicks, so silence never pretends to be a measurement.
		const rate = level == null ? 0 : clickRateFor(level);
		const waitMs = rate > 0 ? (-Math.log(1 - Math.random()) / rate) * 1000 : 500;
		this.clickTimer = window.setTimeout(
			() => {
				if (rate > 0) this.playClick();
				this.scheduleClick();
			},
			Math.max(5, waitMs),
		);
	}

	private close() {
		this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
	}

	render() {
		const level = this.currentLevel();
		const range = RANGES[this.range];
		const dose = level == null ? 0 : milliroentgenFor(level);
		const fraction = dose / range.full;
		const over = fraction > 1;
		const alarm = level != null && level >= ALARM_LEVEL;
		const angle = over ? 51 + this.jitter * 0.8 : -50 + fraction * 100;
		const readout =
			level == null
				? "НЕТ GPS"
				: over
					? `> ${formatReading(range.full, range.full)} мР/ч`
					: `${formatReading(dose, range.full)} мР/ч`;

		return html`
			<div class="case">
				<span class="screw tl"></span><span class="screw tr"></span> <span class="screw bl"></span
				><span class="screw br"></span>

				<header>
					<div class="title">
						<h2>ДП-5В</h2>
						<div class="subtitle">ИЗМЕРИТЕЛЬ МОЩНОСТИ ДОЗЫ</div>
					</div>
					<div class="plate">№ 048172<br />СДЕЛАНО В СССР</div>
					<button type="button" class="close" aria-label=${t.dosimeterClose} @click=${this.close}>
						×
					</button>
				</header>

				<div class="meter">
					<div class="face">
						<svg viewBox="0 0 360 230" role="img" aria-label=${t.dosimeterDial}>
							<path class="rim" d="M49.8 120.1 A170 170 0 0 1 310.2 120.1"></path>
							<path class="mirror" d="M64.6 132.6 A150 150 0 0 1 295.4 132.6"></path>
							<path class="redline" d="M248.6 79.6 A170 170 0 0 1 310.2 120.1"></path>
							<g class="ticks">${TICKS}</g>
							<g class="labels">${LABELS}</g>
							<text class="unit" x="180" y="150">мР/ч</text>
							<text class="range" x="180" y="170">${range.label}</text>
							<g class="needle" style="transform:rotate(${angle.toFixed(2)}deg)">
								<line x1="180" y1="220" x2="180" y2="44"></line>
							</g>
							<rect x="140" y="196" width="80" height="34" fill="#1f201b"></rect>
							<circle
								cx="180"
								cy="220"
								r="14"
								fill="#2b2b24"
								stroke="#57554a"
								stroke-width="2"
							></circle>
						</svg>
					</div>
					<div class="tape tape-meter" aria-hidden="true">пров. 04.86</div>
				</div>

				<div class="lamps">
					<div class="lamp-wrap">
						<span class="lamp alarm ${alarm ? "on" : ""}"></span>
						<span>ТРЕВОГА</span>
					</div>
					<div class="lamp-wrap">
						<span class="lamp over ${over ? "on" : ""}"></span>
						<span>ПЕРЕГРУЗ</span>
					</div>
					<button
						type="button"
						class="switch"
						aria-pressed=${this.sound ? "true" : "false"}
						aria-label=${t.dosimeterSound}
						@click=${this.toggleSound}
					>
						<span class="lever ${this.sound ? "up" : ""}"><span></span></span>
						<span class="tape tape-sound" aria-hidden="true">Ton</span>
						<span>ЗВУК ${this.sound ? "ВКЛ" : "ВЫКЛ"}</span>
					</button>
				</div>

				<div class="panel">
					<div class="panel-head">
						<span>ПОДДИАПАЗОН</span>
						<span class="mono">${readout}</span>
					</div>
					<div class="ranges" role="group" aria-label=${t.dosimeterRange}>
						${RANGES.map(
							(r, i) => html`
								<button
									type="button"
									class=${i === this.range ? "picked" : ""}
									aria-pressed=${i === this.range ? "true" : "false"}
									@click=${() => this.pickRange(i)}
								>
									${r.label}
								</button>
							`,
						)}
					</div>
				</div>

				<div class="sensitivity">
					<label for="sensitivity">
						<span>ЧУВСТВИТЕЛЬНОСТЬ</span>
						<span class="mono">${this.sensitivity} %</span>
					</label>
					<span class="tape tape-sensitivity" aria-hidden="true">Empfindlichkeit</span>
					<input
						id="sensitivity"
						type="range"
						min="0"
						max="100"
						step="1"
						aria-label=${t.dosimeterSensitivity}
						.value=${String(this.sensitivity)}
						@input=${this.onSlide}
					/>
					<button type="button" class="calibrate" @click=${this.calibrate}>
						КАЛИБРОВКА · 50 %
					</button>
				</div>

				<footer>
					<span>РЕКВИЗИТ · НЕ ИЗМЕРЯЕТ</span>
					<span class="mono">☢ ЗОНА</span>
				</footer>
			</div>
		`;
	}

	static styles = css`
		:host {
			--mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
			--narrow:
				"PT Sans Narrow", "Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", system-ui,
				sans-serif;
			--hand: "Marker Felt", "Bradley Hand", "Segoe Print", cursive;
			display: block;
			width: min(400px, 100%);
			color: #d8d2bb;
			font-family: var(--narrow);
		}
		* {
			box-sizing: border-box;
		}
		button {
			font: inherit;
			color: inherit;
			cursor: pointer;
		}
		button:focus-visible,
		input:focus-visible {
			outline: 3px solid #e0b33a;
			outline-offset: 2px;
		}
		button:active {
			transform: translateY(1px);
		}
		.mono {
			font-family: var(--mono);
			font-weight: 400;
		}

		.case {
			position: relative;
			display: flex;
			flex-direction: column;
			gap: 14px;
			padding: 18px 16px 14px;
			/* Rust and grime on olive enamel. */
			background:
				radial-gradient(circle at 12% 8%, rgba(120, 90, 50, 0.45) 0 5%, transparent 18%),
				radial-gradient(circle at 92% 70%, rgba(90, 60, 30, 0.5) 0 4%, transparent 14%),
				radial-gradient(circle at 30% 96%, rgba(20, 20, 15, 0.6) 0 6%, transparent 20%), #4d5442;
			border: 4px solid #23261c;
			border-radius: 10px;
			box-shadow:
				inset 0 0 0 3px #5f6650,
				inset 0 0 40px rgba(0, 0, 0, 0.55),
				0 16px 34px rgba(0, 0, 0, 0.7);
		}
		.screw {
			position: absolute;
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: #8c8a78;
			box-shadow: inset -2px -2px 0 #3a3a30;
		}
		.tl {
			top: 8px;
			left: 8px;
		}
		.tr {
			top: 8px;
			right: 8px;
		}
		.bl {
			bottom: 8px;
			left: 8px;
		}
		.br {
			bottom: 8px;
			right: 8px;
		}

		header {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 0 4px;
		}
		.title {
			flex: 1 1 auto;
			min-width: 0;
		}
		h2 {
			margin: 0;
			font-size: 30px;
			font-weight: 700;
			letter-spacing: 4px;
			color: #e2d9b8;
			text-shadow: 0 1px 0 #000;
		}
		.subtitle {
			font-size: 13px;
			letter-spacing: 1.5px;
			color: #bdb594;
		}
		.plate {
			font-family: var(--mono);
			font-size: 11px;
			line-height: 1.3;
			text-align: right;
			color: #a49d7e;
		}
		.close {
			width: 44px;
			height: 44px;
			flex: 0 0 auto;
			padding: 0 0 3px;
			border: 2px solid #0e0f0b;
			border-radius: 50%;
			background: #2c2f25;
			color: #e2d9b8;
			font-size: 26px;
			line-height: 1;
		}

		.meter {
			position: relative;
			padding: 10px;
			background: #1f201b;
			border: 3px solid #121310;
			border-radius: 8px;
			box-shadow: inset 0 3px 10px rgba(0, 0, 0, 0.9);
		}
		.face {
			padding: 6px 4px 0;
			border-radius: 4px;
			/* Yellowed paper with a glare and a stain. */
			background:
				radial-gradient(ellipse at 70% 30%, rgba(255, 250, 225, 0.5), transparent 60%),
				radial-gradient(circle at 18% 82%, rgba(120, 90, 40, 0.35), transparent 30%), #ddd0a6;
			box-shadow: inset 0 0 18px rgba(80, 60, 20, 0.55);
		}
		svg {
			display: block;
			width: 100%;
			height: auto;
		}
		.rim {
			fill: none;
			stroke: #2a261b;
			stroke-width: 1.5;
		}
		.mirror {
			fill: none;
			stroke: #b9ab80;
			stroke-width: 10;
			opacity: 0.9;
		}
		.redline {
			fill: none;
			stroke: #a8281f;
			stroke-width: 7;
		}
		.ticks line {
			stroke: #2a261b;
		}
		.labels text {
			font-family: var(--mono);
			font-size: 17px;
			fill: #2a261b;
			text-anchor: middle;
		}
		.unit {
			font-size: 16px;
			letter-spacing: 2px;
			fill: #4a4230;
			text-anchor: middle;
		}
		.range {
			font-family: var(--mono);
			font-size: 13px;
			fill: #6a5f44;
			text-anchor: middle;
		}
		.needle {
			transform-origin: 180px 220px;
			transition: transform 0.18s ease-out;
		}
		.needle line {
			stroke: #151510;
			stroke-width: 2.5;
			stroke-linecap: round;
		}

		.tape {
			background: #c9b98a;
			color: #3a2f1c;
			font-family: var(--hand);
			font-size: 15px;
			padding: 3px 10px;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
			opacity: 0.93;
			white-space: nowrap;
		}
		.tape-meter {
			position: absolute;
			right: -6px;
			top: 18px;
			transform: rotate(4deg);
		}

		.lamps {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 10px;
			font-size: 13px;
			font-weight: 700;
			letter-spacing: 1px;
			color: #e2d9b8;
		}
		.lamp-wrap,
		.switch {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 4px;
		}
		.lamp {
			width: 22px;
			height: 22px;
			border-radius: 50%;
			border: 3px solid #1a1b15;
		}
		.lamp.alarm {
			background: #4a1d17;
		}
		.lamp.alarm.on {
			background: #ff3b26;
			box-shadow: 0 0 12px rgba(255, 59, 38, 0.85);
			animation: blink 0.5s steps(1) infinite;
		}
		.lamp.over {
			background: #4a3a17;
		}
		.lamp.over.on {
			background: #ffb02e;
			box-shadow: 0 0 12px rgba(255, 176, 46, 0.8);
		}
		@keyframes blink {
			50% {
				opacity: 0.15;
			}
		}
		.switch {
			position: relative;
			min-height: 44px;
			padding: 0;
			border: 0;
			background: transparent;
			font-weight: 700;
			letter-spacing: 1px;
		}
		.lever {
			position: relative;
			display: block;
			width: 26px;
			height: 40px;
			border-radius: 6px;
			background: #1a1b15;
			border: 2px solid #0e0f0b;
		}
		.lever span {
			position: absolute;
			left: 4px;
			top: 18px;
			width: 14px;
			height: 16px;
			border-radius: 4px;
			background: #b9b5a2;
			box-shadow: inset 0 -3px 0 #6c6a5c;
			transition: top 0.08s;
		}
		.lever.up span {
			top: 2px;
		}

		.panel {
			display: flex;
			flex-direction: column;
			gap: 6px;
			padding: 8px 8px 10px;
			background: #2c2f25;
			border: 2px solid #1a1b15;
			border-radius: 6px;
		}
		.panel-head,
		label {
			display: flex;
			justify-content: space-between;
			padding: 0 2px;
			font-size: 13px;
			font-weight: 700;
			letter-spacing: 2px;
			color: #cfc6a2;
		}
		.ranges {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: 6px;
		}
		.ranges button {
			height: 46px;
			border: 2px solid #0e0f0b;
			border-radius: 4px;
			background: #55594a;
			color: #e2d9b8;
			font-family: var(--mono);
			font-size: 14px;
			box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.4);
		}
		.ranges button.picked {
			background: #b8a46a;
			color: #1a1b15;
		}

		.sensitivity {
			position: relative;
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 8px 12px 10px;
			background: #3a3e31;
			border: 2px dashed #23261c;
			border-radius: 6px;
		}
		.sensitivity label {
			color: #d8cfaa;
		}
		.tape-sound {
			position: absolute;
			top: 4px;
			left: calc(50% + 18px);
			padding: 2px 8px;
			font-size: 14px;
			font-weight: 400;
			letter-spacing: 0;
			transform: rotate(6deg);
		}
		.tape-sensitivity {
			position: absolute;
			right: 64px;
			top: -18px;
			transform: rotate(-3deg);
		}
		input[type="range"] {
			width: 100%;
			height: 44px;
			margin: 0;
			accent-color: #b8a46a;
			cursor: pointer;
		}
		.calibrate {
			align-self: flex-end;
			min-height: 36px;
			padding: 0 12px;
			border: 2px solid #0e0f0b;
			border-radius: 4px;
			background: #55594a;
			color: #e2d9b8;
			font-size: 13px;
			font-weight: 700;
			letter-spacing: 1px;
		}

		footer {
			display: flex;
			justify-content: space-between;
			padding: 0 6px;
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 1px;
			color: #1c1e16;
		}

		@media (prefers-reduced-motion: reduce) {
			.needle,
			.lever span {
				transition: none;
			}
			.lamp.alarm.on {
				animation: none;
			}
		}
	`;
}

declare global {
	interface HTMLElementTagNameMap {
		"dosimeter-view": DosimeterView;
	}
}
