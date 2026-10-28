# @fieldmaps/field-map

`<field-map>` — the [Field Maps](https://www.fieldmaps.app) map of the Mahlwinkel airfield as a custom element: the event's tactical map, the player's live GPS position, points of interest, navigation, the player's own marks, and live markers your app supplies (other players from your server, objectives).

```html
<field-map scenario="opt"></field-map>
<script type="module">
	import "@fieldmaps/field-map";
	document
		.querySelector("field-map")
		.addEventListener("fieldmap-fix", (e) => console.log(e.detail));
</script>
```

- **Integration guide:** [AGENTS.md](./AGENTS.md) — written to be enough on its own, for a developer or a coding agent.
- **Playground:** `test-page/` in the Field Maps repository (`npm run dev:component`) — every API, an event log, simulated players, two-tab sync.
- **Licence:** code MIT; map data © OpenStreetMap contributors (ODbL); faction emblems are their owners' — see LICENSE.
