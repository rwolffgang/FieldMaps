// -----------------------------------------------------------------------------
// brand.ts
// The two colours the app is built around, read straight off the app icon: the
// blue of the map linework and the orange of the position dot.
//
// Leaflet takes its colours as JavaScript strings (layer options), the rest of
// the chrome takes them from CSS. That is the only reason this file exists —
// `styles.css` mirrors these as `--brand-blue` / `--brand-blue-deep` /
// `--brand-orange` at the top of `:root`. Change a value here, change it there.
// -----------------------------------------------------------------------------

/** The icon's brightest map line (#2ab5fd), nudged up for contrast on dark chrome. */
export const BRAND_BLUE = "#38bdf8";

/** The icon's body linework — quieter, for fills, borders and hairlines. */
export const BRAND_BLUE_DEEP = "#1a88c5";

/** The icon's position dot. The app's warm accent: PoIs, navigation, install prompt. */
export const BRAND_ORANGE = "#ffa201";
