// -----------------------------------------------------------------------------
// glyphs.ts
// Pictograms drawn in more than one place. Plain SVG markup strings, because the
// map hands them to Leaflet as divIcon HTML while the chrome renders them through
// Lit — one drawing, so a symbol looks the same on the map as in the text about it.
// -----------------------------------------------------------------------------

/**
 * A road barrier: a red-and-white boom on a post (styled by `.checkpoint-glyph` in
 * `styles.css`). 44×26 units; the arm spans the road, so the drawing's centre is the
 * barrier's coordinate.
 */
export const CHECKPOINT_GLYPH = `<svg class="checkpoint-glyph" viewBox="0 0 44 26" width="38" height="22" aria-hidden="true">
	<rect class="checkpoint-post" x="3" y="6" width="6" height="19" rx="1" />
	<rect class="checkpoint-arm" x="6" y="7" width="36" height="6" rx="1.5" />
	<path class="checkpoint-stripes" d="M14 7h5l-3 6h-5zM24 7h5l-3 6h-5zM34 7h5l-3 6h-5z" />
	<circle class="checkpoint-post" cx="6" cy="10" r="3.2" />
</svg>`;
