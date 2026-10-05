// -----------------------------------------------------------------------------
// dosimeter-view.ts
// A prop radiation meter for the Stalker scenarios, drawn as a battered Soviet
// ДП-5В field radiometer — a toy, not a sensor.
//
// It measures nothing. Four sources can move the needle, and a row of lamps says
// which one is doing it, because a needle that moves for reasons the player cannot
// see reads as broken:
//
//   ЗОНА     near or inside the scenario's irradiated (`biohazard`) zones — the only
//            source that reaches the alarm.
//   ОБЪЕКТ   near a radiating object: the faction headquarters and the scenario's
//            `radiatingPois`. Yellow at most.
//   ПЕЛЕНГ   while a navigation runs: direction finding. The reading lifts when the
//            phone points at the destination, at any distance — a game tool, not
//            physics. Objects are ignored meanwhile, so the sweep is not muddied.
//   СКАН     roleplay: holding the СКАН button ramps the counter up to red over a
//            few seconds, letting go lets it fall back — "scanning an artifact".
//
// The hottest source wins (see `radiation.ts` for the curves). Without a fix the
// field reads background, the panel says НЕТ GPS, and СКАН still works.
//
// The dial reads 0–5 and a range switch multiplies it (full scale 0.05–500 мР/ч).
// АВТО, the default, steps the range so the needle stays on the scale; a manual
// range pins the needle and lights ПЕРЕГРУЗ above full scale, like the real thing.
// ТРЕВОГА (alarm) blinks from 1 мР/ч, the dosimeter's 60.
//
// The Geiger clicks are synthesised with Web Audio — a few milliseconds of shaped
// noise per click at random (Poisson) intervals whose rate follows the reading —
// so there is no sound file to ship and it works offline. Sound is on when the
// device opens. Browsers only let audio start from a tap, so the map's trefoil
// button calls `primeDosimeterAudio` inside its own click handler. That tap is
// what opens the device, so it is also what unlocks the audio. The ЗВУК switch
// turns the clicks off and on, and the choice holds until the app reloads.
//
// The first time it opens, an in-world instruction slip (ИНСТРУКЦИЯ) explains it in
// the player's language; the "?" on the case brings it back. The device's own labels
// are Russian on purpose (it is a prop from the Zone); handwritten tape strips carry
// the player's words. Shadow DOM, system fonts only.
// -----------------------------------------------------------------------------

import { LitElement, css, html, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LatLng } from "./scenarios/scenario.js";
import {
	BACKGROUND_LEVEL,
	levelForBearing,
	radiationLevelAt,
	type RadiationPoint,
} from "./radiation.js";
import { strings } from "./i18n.js";
import { isIos } from "./install.js";

const t = strings();

/** The player's position as the map last had it, or null before the first fix. */
export interface DosimeterFix {
	lat: number;
	lng: number;
	accuracy: number;
}

/**
 * A running navigation, as the device needs it for direction finding: the target's
 * bearing relative to where the phone points (0 = dead ahead, clockwise, 0–360) and
 * its distance. Null when nothing is being navigated to or there is no compass.
 */
export interface DosimeterGuidance {
	relativeDeg: number;
	distanceM: number;
}

/** The range switch: full scale in мР/ч, and the label engraved on it. */
const RANGES = [
	{ full: 0.05, label: "×0,01" },
	{ full: 0.5, label: "×0,1" },
	{ full: 5, label: "×1" },
	{ full: 50, label: "×10" },
	{ full: 500, label: "×100" },
] as const;

/** `"auto"`, or the index of a manual range in `RANGES`. */
type RangeMode = "auto" | number;

/** Level (0–100, see `radiation.ts`) from which ТРЕВОГА blinks: 1 мР/ч. */
const ALARM_LEVEL = 60;
/** A source's lamp lights once it lifts the reading this far above background. */
const LAMP_THRESHOLD = 6;
/**
 * СКАН, in two parts so a press answers at once and still builds for a while: a fast
 * attack up to `SCAN_ATTACK` of the way (yellow, ~0.1 мР/ч, within half a second),
 * then a steady build to the peak (red) — the alarm at ~4 s, the top at ~9 s.
 * Letting go falls back over `SCAN_FALL_S`.
 */
const SCAN_PEAK_LEVEL = 88;
const SCAN_ATTACK = 0.4;
const SCAN_ATTACK_S = 0.3;
const SCAN_BUILD_S = 8;
const SCAN_FALL_S = 2;
/** АВТО steps up above this share of full scale, and down below this share of the next range down. */
const AUTO_UP = 0.92;
const AUTO_DOWN = 0.6;
/** The device's clock: needle twitch, the СКАН ramp and АВТО all advance on it. */
const TICK_MS = 120;
/** Clicks per second never exceed this; above it a real tube is a steady crackle anyway. */
const MAX_CLICK_RATE = 160;
/** The click timer re-reads the rate at least this often, so a change is heard at once. */
const CLICK_RECHECK_MS = 50;
/** Set once the instruction slip has been read. */
const MANUAL_KEY = "field-map-dosimeter-manual-seen";

// Kept at module level so closing and reopening the device keeps its settings.
let lastRangeMode: RangeMode = "auto";
let lastSound = true;

function manualSeen(): boolean {
	try {
		return localStorage.getItem(MANUAL_KEY) === "1";
	} catch {
		return false;
	}
}

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
	// iOS puts Web Audio in the "ambient" category by default, so the ring/silent switch
	// mutes it outright — on a phone in a pocket on silent, which is most of them on a
	// game day, the device would never make a sound. "playback" is the category a music
	// player uses, which plays regardless of the switch. Safari 17+; elsewhere a no-op.
	const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
	if (session) session.type = "playback";
	// Before iOS 17 there is no such switch, but the same thing happens while a media
	// element is playing: the whole page moves to the media category, the one a video
	// plays in, and Web Audio goes with it. So a silent clip loops for as long as the
	// device is open. iOS only — elsewhere it would just put a media notification up.
	else if (isIos()) startSilentKeepalive();

	if (!audio) {
		const Context =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Context) return;
		audio = new Context();
		// One click: 6 ms of noise with a fast decay, reused for every click. Long and
		// loud enough to carry on a phone speaker, which drops most of a shorter one.
		const length = Math.floor(audio.sampleRate * 0.006);
		clickNoise = audio.createBuffer(1, length, audio.sampleRate);
		const data = clickNoise.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
	}
	void audio.resume();
}

/** Release the audio while the device is put away: no clicks, and no media session held. */
function releaseDosimeterAudio() {
	void audio?.suspend();
	keepalive?.pause();
}

// The silent clip behind the pre-iOS-17 route above: half a second of 8 kHz silence,
// written as a WAV in memory so there is still no sound file to ship.
let keepalive: HTMLAudioElement | null = null;
function startSilentKeepalive() {
	if (!keepalive) {
		const samples = 4000;
		const wav = new DataView(new ArrayBuffer(44 + samples));
		const text = (offset: number, value: string) =>
			[...value].forEach((char, i) => wav.setUint8(offset + i, char.charCodeAt(0)));
		text(0, "RIFF");
		wav.setUint32(4, 36 + samples, true);
		text(8, "WAVEfmt ");
		wav.setUint32(16, 16, true); // fmt chunk size
		wav.setUint16(20, 1, true); // PCM
		wav.setUint16(22, 1, true); // mono
		wav.setUint32(24, 8000, true); // sample rate
		wav.setUint32(28, 8000, true); // byte rate
		wav.setUint16(32, 1, true); // block align
		wav.setUint16(34, 8, true); // 8-bit
		text(36, "data");
		wav.setUint32(40, samples, true);
		for (let i = 0; i < samples; i++) wav.setUint8(44 + i, 128); // 8-bit silence is 128
		keepalive = new Audio(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
		keepalive.loop = true;
		keepalive.setAttribute("playsinline", "");
	}
	void keepalive.play().catch(() => {
		// Refused (no gesture, Low Power Mode): the clicks still play, just not through the switch.
	});
}

/** Dosimeter level (0–100, one decade per 20) → мР/ч. 10 is background, 3 µР/ч. */
function milliroentgenFor(level: number): number {
	return 0.001 * Math.pow(10, level / 20);
}

/** Geiger clicks per second for a level: under one a second at background. */
function clickRateFor(level: number): number {
	return Math.min(MAX_CLICK_RATE, 0.8 * Math.pow(10, (level - 10) / 30));
}

/** The lowest range that shows a dose on the scale, for АВТО to start from. */
function autoRangeFor(dose: number): number {
	const index = RANGES.findIndex((range) => dose <= range.full * AUTO_UP);
	return index === -1 ? RANGES.length - 1 : index;
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

/** What is lifting the reading right now, one entry per source lamp. */
interface Sources {
	zone: number;
	object: number;
	guide: number;
	scan: number;
}

@customElement("dosimeter-view")
export class DosimeterView extends LitElement {
	/** Set by the map on every moved fix, so the device follows the player. */
	@property({ attribute: false }) position: DosimeterFix | null = null;
	/** The scenario's irradiated zones (its `biohazard` zones). */
	@property({ attribute: false }) zones: LatLng[][] = [];
	/** The radiating objects: headquarters and `radiatingPois`. */
	@property({ attribute: false }) points: readonly RadiationPoint[] = [];
	/** Set by the map while a navigation runs, on every compass or position change. */
	@property({ attribute: false }) guidance: DosimeterGuidance | null = null;

	@state() private rangeMode: RangeMode = lastRangeMode;
	/** The range АВТО has settled on; only meaningful while `rangeMode` is "auto". */
	@state() private autoRange = 0;
	@state() private sound = lastSound;
	@state() private jitter = 0;
	/** How far the СКАН ramp has got, 0–1 of the way to its peak, and whether the button is held. */
	@state() private scan = 0;
	private scanning = false;
	@state() private manualOpen = !manualSeen();

	private tickTimer = 0;
	private clickTimer = 0;
	private lastTick = 0;
	private readonly twitch = !matchMedia("(prefers-reduced-motion: reduce)").matches;

	connectedCallback() {
		super.connectedCallback();
		this.autoRange = autoRangeFor(milliroentgenFor(this.currentLevel()));
		this.lastTick = performance.now();
		this.tickTimer = window.setInterval(() => this.tick(), TICK_MS);
		if (this.sound) this.scheduleClick();
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		window.clearInterval(this.tickTimer);
		window.clearTimeout(this.clickTimer);
		this.scanning = false;
		releaseDosimeterAudio();
	}

	protected updated(changed: PropertyValues<this>) {
		// The slip is a dialog of its own: put the focus on its button, so a keyboard or
		// screen-reader user lands on it rather than behind it.
		if (changed.has("manualOpen" as keyof DosimeterView) && this.manualOpen) {
			this.renderRoot.querySelector<HTMLButtonElement>(".manual-ok")?.focus();
		}
	}

	/** One step of the device's clock: twitch, СКАН ramp, АВТО. */
	private tick() {
		const now = performance.now();
		const dt = Math.min(0.5, (now - this.lastTick) / 1000);
		this.lastTick = now;

		if (this.twitch) this.jitter = (Math.random() - 0.5) * 1.6;

		// Held: close in on the attack level fast, and build steadily on top. Written as a
		// rate rather than a curve over time, so a press that catches the fall halfway
		// picks up from wherever the needle is.
		if (this.scanning && this.scan < 1) {
			const attack = Math.max(0, SCAN_ATTACK - this.scan) / SCAN_ATTACK_S;
			const build = (1 - SCAN_ATTACK) / SCAN_BUILD_S;
			this.scan = Math.min(1, this.scan + (attack + build) * dt);
		} else if (!this.scanning && this.scan > 0) {
			this.scan = Math.max(0, this.scan - dt / SCAN_FALL_S);
		}

		// One range step per tick at most, with a gap between the up and down
		// thresholds so a reading sitting on a boundary does not flap.
		if (this.rangeMode === "auto") {
			const dose = milliroentgenFor(this.currentLevel());
			const index = this.autoRange;
			if (index < RANGES.length - 1 && dose > RANGES[index].full * AUTO_UP) this.autoRange++;
			else if (index > 0 && dose < RANGES[index - 1].full * AUTO_DOWN) this.autoRange--;
		}
	}

	private sources(): Sources {
		const fix = this.position;
		const guide = this.guidance;
		return {
			zone: fix ? radiationLevelAt(fix.lat, fix.lng, this.zones) : BACKGROUND_LEVEL,
			// Ignored while direction finding, so only the way and real danger move the needle.
			object:
				fix && !guide ? radiationLevelAt(fix.lat, fix.lng, [], this.points) : BACKGROUND_LEVEL,
			guide: guide ? levelForBearing(guide.relativeDeg) : BACKGROUND_LEVEL,
			scan: BACKGROUND_LEVEL + (SCAN_PEAK_LEVEL - BACKGROUND_LEVEL) * this.scan,
		};
	}

	/** The level the needle shows now: the hottest source, plus the twitch. */
	private currentLevel(sources = this.sources()): number {
		const hottest = Math.max(sources.zone, sources.object, sources.guide, sources.scan);
		return Math.min(100, Math.max(0, hottest + this.jitter));
	}

	private pickRange(mode: RangeMode) {
		this.rangeMode = lastRangeMode = mode;
		if (mode === "auto") this.autoRange = autoRangeFor(milliroentgenFor(this.currentLevel()));
	}

	private toggleSound() {
		primeDosimeterAudio();
		this.sound = lastSound = !this.sound;
		window.clearTimeout(this.clickTimer);
		if (this.sound) this.scheduleClick();
	}

	private startScan(event: PointerEvent) {
		// Keep the press ours even if the finger slides off the button, and stop iOS
		// from turning a long press into a text selection or callout.
		try {
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
		} catch {
			// No live pointer to capture (a synthetic event): the press still counts.
		}
		event.preventDefault();
		this.beginScan();
	}

	/**
	 * Start the СКАН ramp, with a click on the instant: random clicks can leave a gap of
	 * half a second at the start, which on a button reads as lag. The click timer then
	 * restarts so the rising rate is heard straight away.
	 */
	private beginScan() {
		if (this.scanning) return;
		this.scanning = true;
		if (!this.sound) return;
		this.playClick();
		window.clearTimeout(this.clickTimer);
		this.scheduleClick();
	}

	private stopScan() {
		this.scanning = false;
	}

	private onScanKey(event: KeyboardEvent) {
		if (event.key !== " " && event.key !== "Enter") return;
		event.preventDefault();
		if (event.type === "keydown") this.beginScan();
		else this.scanning = false;
	}

	private openManual() {
		this.manualOpen = true;
	}

	private closeManual() {
		this.manualOpen = false;
		try {
			localStorage.setItem(MANUAL_KEY, "1");
		} catch {
			// Storage unavailable — it shows again next time, which is harmless.
		}
	}

	private playClick() {
		if (!audio || !clickNoise) return;
		const source = audio.createBufferSource();
		source.buffer = clickNoise;
		const filter = audio.createBiquadFilter();
		filter.type = "highpass";
		filter.frequency.value = 1200 + Math.random() * 800;
		const gain = audio.createGain();
		gain.gain.value = 0.9;
		source.connect(filter).connect(gain).connect(audio.destination);
		source.start();
	}

	/**
	 * Next click after an exponentially distributed wait: that is what decay sounds like.
	 *
	 * The wait is cut off at `CLICK_RECHECK_MS` and re-rolled at the rate of that moment.
	 * At background the mean wait is over a second, and an uncut one would hold the old
	 * rate for all of it — pressing СКАН or walking into the zone would go unheard until
	 * that quiet stretch ran out. An exponential wait has no memory, so cutting it short
	 * and rolling again is statistically the same thing, just responsive.
	 */
	private scheduleClick() {
		if (!this.sound) return;
		const rate = clickRateFor(this.currentLevel());
		const waitMs = Math.max(5, (-Math.log(1 - Math.random()) / rate) * 1000);
		const due = waitMs <= CLICK_RECHECK_MS;
		this.clickTimer = window.setTimeout(
			() => {
				if (due) this.playClick();
				this.scheduleClick();
			},
			due ? waitMs : CLICK_RECHECK_MS,
		);
	}

	private close() {
		this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
	}

	render() {
		const sources = this.sources();
		const level = this.currentLevel(sources);
		const auto = this.rangeMode === "auto";
		const rangeIndex = auto ? this.autoRange : (this.rangeMode as number);
		const range = RANGES[rangeIndex];
		const dose = milliroentgenFor(level);
		const fraction = dose / range.full;
		const over = fraction > 1;
		const alarm = level >= ALARM_LEVEL;
		const angle = over ? 51 + this.jitter * 0.8 : -50 + fraction * 100;
		const readout = over
			? `> ${formatReading(range.full, range.full)} мР/ч`
			: `${formatReading(dose, range.full)} мР/ч`;
		const panelLabel = this.guidance
			? `ПЕЛЕНГ · ${Math.round(this.guidance.distanceM)} м`
			: this.position
				? "ПОДДИАПАЗОН"
				: "НЕТ GPS";

		const lamps = [
			{
				label: "ЗОНА",
				tape: t.dosimeterTapes.zone,
				on: sources.zone > BACKGROUND_LEVEL + LAMP_THRESHOLD,
			},
			{
				label: "ОБЪЕКТ",
				tape: t.dosimeterTapes.object,
				on: sources.object > BACKGROUND_LEVEL + LAMP_THRESHOLD,
			},
			{ label: "ПЕЛЕНГ", tape: t.dosimeterTapes.guide, on: this.guidance != null },
			{ label: "СКАН", tape: t.dosimeterTapes.scan, on: this.scan > 0.02 },
		];

		return html`
			<div class="case">
				<span class="screw tl"></span><span class="screw tr"></span> <span class="screw bl"></span
				><span class="screw br"></span>

				<header>
					<div class="title">
						<h2>ДП-5В</h2>
						<div class="subtitle">ИЗМЕРИТЕЛЬ МОЩНОСТИ ДОЗЫ</div>
					</div>
					<button
						type="button"
						class="round"
						aria-label=${t.dosimeterManualOpen}
						@click=${this.openManual}
					>
						?
					</button>
					<button type="button" class="round" aria-label=${t.dosimeterClose} @click=${this.close}>
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
							<text class="range" x="180" y="170">${auto ? "АВТО " : ""}${range.label}</text>
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
						<span class="tape tape-sound" aria-hidden="true">${t.dosimeterTapes.sound}</span>
						<span>ЗВУК ${this.sound ? "ВКЛ" : "ВЫКЛ"}</span>
					</button>
				</div>

				<div class="sources" role="group" aria-label=${t.dosimeterSources}>
					${lamps.map(
						(lamp) => html`
							<div
								class="source"
								role="img"
								aria-label="${lamp.tape}${lamp.on ? ` · ${t.dosimeterLampOn}` : ""}"
							>
								<span class="lamp source-lamp ${lamp.on ? "on" : ""}"></span>
								<span class="source-label">${lamp.label}</span>
								<span class="tape tape-source" aria-hidden="true">${lamp.tape}</span>
							</div>
						`,
					)}
				</div>

				<div class="panel">
					<div class="panel-head">
						<span>${panelLabel}</span>
						<span class="mono">${readout}</span>
					</div>
					<div class="ranges" role="group" aria-label=${t.dosimeterRange}>
						<button
							type="button"
							class="auto ${auto ? "picked" : ""}"
							aria-pressed=${auto ? "true" : "false"}
							@click=${() => this.pickRange("auto")}
						>
							АВТО
						</button>
						${RANGES.map(
							(r, i) => html`
								<button
									type="button"
									class="${!auto && i === this.rangeMode ? "picked" : ""} ${
										auto && i === this.autoRange ? "auto-on" : ""
									}"
									aria-pressed=${!auto && i === this.rangeMode ? "true" : "false"}
									@click=${() => this.pickRange(i)}
								>
									${r.label}
								</button>
							`,
						)}
					</div>
				</div>

				<button
					type="button"
					class="scan ${this.scanning ? "held" : ""}"
					aria-label=${t.dosimeterScan}
					@pointerdown=${this.startScan}
					@pointerup=${this.stopScan}
					@pointercancel=${this.stopScan}
					@lostpointercapture=${this.stopScan}
					@keydown=${this.onScanKey}
					@keyup=${this.onScanKey}
					@blur=${this.stopScan}
					@contextmenu=${(event: Event) => event.preventDefault()}
				>
					<span>СКАН</span>
					<span class="tape tape-scan" aria-hidden="true">${t.dosimeterTapes.hold}</span>
				</button>

				<footer>
					<span class="mono">№ 048172 · СДЕЛАНО В СССР</span>
					<span>☢ РЕКВИЗИТ</span>
				</footer>

				${this.manualOpen ? this.renderManual() : ""}
			</div>
		`;
	}

	/** The instruction slip: in-world paper, in the player's language. */
	private renderManual() {
		return html`
			<div class="manual-backdrop">
				<div class="manual" role="dialog" aria-modal="true" aria-labelledby="manual-title">
					<div class="manual-head">
						<span class="manual-ru">ИНСТРУКЦИЯ</span>
						<h3 id="manual-title">${t.dosimeterManualTitle}</h3>
					</div>
					<ol>
						${t.dosimeterManualLines.map((line) => html`<li>${line}</li>`)}
					</ol>
					<button type="button" class="manual-ok" @click=${this.closeManual}>
						${t.dosimeterManualOk}
					</button>
				</div>
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
		button:focus-visible {
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
			gap: 12px;
			padding: 16px 16px 14px;
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
			gap: 8px;
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
		.round {
			width: 44px;
			height: 44px;
			flex: 0 0 auto;
			padding: 0 0 2px;
			border: 2px solid #0e0f0b;
			border-radius: 50%;
			background: #2c2f25;
			color: #e2d9b8;
			font-size: 24px;
			font-weight: 700;
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
			font-weight: 400;
			letter-spacing: 0;
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
		.tape-sound {
			position: absolute;
			top: 4px;
			left: calc(50% + 18px);
			padding: 2px 8px;
			font-size: 14px;
			transform: rotate(6deg);
		}

		/* The source lamps: which of the four is moving the needle. Green glass, so they
		   read apart from the red alarm and amber overload above them. */
		.sources {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 6px;
			padding: 8px 4px 6px;
			background: #2c2f25;
			border: 2px solid #1a1b15;
			border-radius: 6px;
		}
		.source {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 3px;
		}
		.source-lamp {
			width: 16px;
			height: 16px;
			border-width: 2px;
			background: #1f3a1c;
			transition:
				background 0.15s,
				box-shadow 0.15s;
		}
		.source-lamp.on {
			background: #8cff5a;
			box-shadow: 0 0 10px rgba(140, 255, 90, 0.85);
		}
		.source-label {
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 1px;
			color: #cfc6a2;
		}
		.tape-source {
			padding: 1px 6px;
			font-size: 13px;
			transform: rotate(-2deg);
		}
		.source:nth-child(even) .tape-source {
			transform: rotate(2deg);
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
		.panel-head {
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
			grid-template-columns: 1.3fr repeat(5, minmax(0, 1fr));
			gap: 5px;
		}
		.ranges button {
			height: 44px;
			padding: 0;
			border: 2px solid #0e0f0b;
			border-radius: 4px;
			background: #55594a;
			color: #e2d9b8;
			font-family: var(--mono);
			font-size: 12px;
			box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.4);
		}
		.ranges button.auto {
			font-family: var(--narrow);
			font-size: 14px;
			font-weight: 700;
			letter-spacing: 1px;
		}
		.ranges button.picked {
			background: #b8a46a;
			color: #1a1b15;
		}
		/* The range АВТО has picked: marked, but quieter than a chosen one. */
		.ranges button.auto-on {
			box-shadow:
				inset 0 0 0 2px #b8a46a,
				inset 0 -3px 0 rgba(0, 0, 0, 0.4);
		}

		.scan {
			position: relative;
			height: 56px;
			border: 2px solid #0e0f0b;
			border-radius: 8px;
			background: #7a2a1f;
			color: #f1e6c4;
			font-size: 22px;
			font-weight: 700;
			letter-spacing: 6px;
			box-shadow:
				inset 0 -5px 0 rgba(0, 0, 0, 0.45),
				0 2px 0 #1a1b15;
			touch-action: none;
			user-select: none;
			-webkit-user-select: none;
			-webkit-touch-callout: none;
		}
		.scan.held {
			background: #a3362a;
			transform: translateY(2px);
			box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.45);
		}
		.tape-scan {
			position: absolute;
			right: 10px;
			top: -10px;
			padding: 2px 8px;
			font-size: 13px;
			transform: rotate(3deg);
		}

		footer {
			display: flex;
			justify-content: space-between;
			padding: 0 6px;
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 1px;
			color: #1c1e16;
		}

		/* The instruction slip: a folded sheet of yellowed paper over the device. */
		.manual-backdrop {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			padding: 14px;
			border-radius: 6px;
			background: rgba(10, 11, 8, 0.55);
		}
		.manual {
			width: 100%;
			padding: 16px 18px 14px;
			background:
				linear-gradient(180deg, transparent 49.6%, rgba(90, 70, 30, 0.18) 50%, transparent 50.4%),
				radial-gradient(circle at 85% 15%, rgba(120, 90, 40, 0.25), transparent 35%), #e6dab4;
			color: #2a2418;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
			transform: rotate(-1deg);
		}
		.manual-head {
			display: flex;
			flex-direction: column;
			gap: 2px;
			border-bottom: 2px solid #2a2418;
			padding-bottom: 6px;
		}
		.manual-ru {
			font-family: var(--mono);
			font-size: 12px;
			letter-spacing: 3px;
		}
		h3 {
			margin: 0;
			font-size: 22px;
			font-weight: 700;
		}
		ol {
			margin: 10px 0 12px;
			padding-left: 20px;
			display: flex;
			flex-direction: column;
			gap: 8px;
			font-family: system-ui, sans-serif;
			font-size: 15px;
			line-height: 1.35;
		}
		.manual-ok {
			width: 100%;
			min-height: 44px;
			border: 2px solid #2a2418;
			border-radius: 4px;
			background: #2c2f25;
			color: #e6dab4;
			font-size: 16px;
			font-weight: 700;
			letter-spacing: 1px;
		}

		@media (prefers-reduced-motion: reduce) {
			.needle,
			.lever span,
			.source-lamp {
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
