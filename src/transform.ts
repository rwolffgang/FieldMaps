// -----------------------------------------------------------------------------
// transform.ts
// The heart of the app: convert GPS (lat/lng) -> image pixel coordinates.
//
// Model: a 2D *similarity* transform (uniform scale + rotation + a y-flip),
// solved by least squares from a handful of hardcoded control points.
// We deliberately do NOT use a full 6-parameter affine transform, because
// affine allows shear and independent axis scaling, which would let noisy
// control points distort the map. Similarity stays rigid.
//
// Convention: pixel coords are IMAGE pixels, origin top-left, y pointing DOWN.
// (The Leaflet CRS.Simple y-flip is handled later, in map-view.ts, not here.)
// -----------------------------------------------------------------------------

export interface ControlPoint {
	lat: number;
	lng: number;
	px: number; // image pixel x, from the left edge
	py: number; // image pixel y, from the TOP edge
}

export interface Transform {
	/** GPS -> image pixel. */
	toPixel(lat: number, lng: number): { px: number; py: number };
	/** Convert a ground distance in meters to a length in image pixels. */
	metersToPixels(m: number): number;
	/** Convert an image-pixel length back to meters. */
	pixelsToMeters(p: number): number;
	/**
	 * Given a compass bearing (degrees clockwise from true north), return the
	 * CSS rotation in degrees to apply to an upward-pointing triangle so that it
	 * points in that real-world direction ON the (possibly rotated) map image.
	 */
	bearingToScreenDeg(bearingDeg: number): number;
	/** Pixels per meter. */
	scale: number;
	/** Calibration residual (RMS) in meters — for dev sanity checking. */
	rmsMeters: number;
}

const R = 6378137; // WGS84 equatorial radius, meters
const DEG = Math.PI / 180;

/** Equirectangular projection to local East/North meters about a reference. */
function project(lat: number, lng: number, lat0: number, lng0: number) {
	const E = (lng - lng0) * Math.cos(lat0 * DEG) * R * DEG;
	const N = (lat - lat0) * R * DEG;
	return { E, N };
}

/** Solve a small linear system Mx = v via Gaussian elimination w/ partial pivot. */
function solveLinear(M: number[][], v: number[]): number[] {
	const n = v.length;
	// augmented matrix
	const a = M.map((row, i) => [...row, v[i]]);
	for (let col = 0; col < n; col++) {
		// pivot
		let piv = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
		}
		[a[col], a[piv]] = [a[piv], a[col]];
		const d = a[col][col];
		if (Math.abs(d) < 1e-12) throw new Error("Singular system (bad/duplicate control points?)");
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = a[r][col] / d;
			for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
		}
	}
	return a.map((row, i) => row[n] / row[i]);
}

/**
 * Solve the similarity transform.
 *
 * Forward model (reflection form — the y-flip between north-up and image-y-down
 * is baked into the sign pattern, so a plain "no rotation" map solves to b=0):
 *     px = a*E + b*N + c
 *     py = b*E - a*N + d
 *
 * Unknowns x = [a, b, c, d]. Each control point contributes two rows:
 *     [ E,  N, 1, 0] . x = px
 *     [-N,  E, 0, 1] . x = py
 */
export function solveTransform(points: ControlPoint[]): Transform {
	if (points.length < 2) throw new Error("Need at least 2 control points");

	const lat0 = points[0].lat;
	const lng0 = points[0].lng;

	// Accumulate normal equations (A^T A) x = A^T b for a least-squares fit.
	const ATA = Array.from({ length: 4 }, () => new Array(4).fill(0));
	const ATb = new Array(4).fill(0);
	const addRow = (row: number[], target: number) => {
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 4; j++) ATA[i][j] += row[i] * row[j];
			ATb[i] += row[i] * target;
		}
	};

	for (const p of points) {
		const { E, N } = project(p.lat, p.lng, lat0, lng0);
		addRow([E, N, 1, 0], p.px);
		addRow([-N, E, 0, 1], p.py);
	}

	const [a, b, c, d] = solveLinear(ATA, ATb);
	const scale = Math.hypot(a, b); // pixels per meter

	// Residual: reproject each control point and measure the miss.
	let sumSq = 0;
	for (const p of points) {
		const { E, N } = project(p.lat, p.lng, lat0, lng0);
		const px = a * E + b * N + c;
		const py = b * E - a * N + d;
		sumSq += (px - p.px) ** 2 + (py - p.py) ** 2;
	}
	const rmsMeters = Math.sqrt(sumSq / points.length) / scale;

	return {
		toPixel(lat, lng) {
			const { E, N } = project(lat, lng, lat0, lng0);
			return { px: a * E + b * N + c, py: b * E - a * N + d };
		},
		metersToPixels: (m) => m * scale,
		pixelsToMeters: (p) => p / scale,
		bearingToScreenDeg(bearingDeg) {
			const beta = bearingDeg * DEG;
			// Ground direction of the bearing: (E,N) = (sin, cos).
			// Map it through the linear part to get the on-image direction.
			const dpx = a * Math.sin(beta) + b * Math.cos(beta);
			const dpy = b * Math.sin(beta) - a * Math.cos(beta);
			// Screen angle (cw from +x, y-down). Triangle default points up (-90deg),
			// so add 90 to align it with the target direction.
			return (Math.atan2(dpy, dpx) * 180) / Math.PI + 90;
		},
		scale,
		rmsMeters,
	};
}
