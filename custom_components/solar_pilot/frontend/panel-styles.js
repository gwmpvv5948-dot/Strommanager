// Load once per module version; reuse the same CSS on every panel render.
const response = await fetch(new URL("./panel.css?v=0.1.49", import.meta.url));
if (!response.ok) throw new Error(`Panel stylesheet: HTTP ${response.status}`);
export const panelCSS = await response.text();
