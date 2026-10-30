import { esc, html } from "./view-format.js?v=0.1.41";

export function sourceSettings(panel) {
  const t = panel.status,
    s = t.source_entities || {},
    draft = panel.sourceDraft || {},
    states = panel._hass?.states || {};
  const groups = [
    ["entities", "Regelung und Tagesbilanz", t.entities, t.entity_labels],
    ["learning", "Lernende Verbrauchsprognose", s.learning, s.learning_labels],
    ["display", "PV-Anzeige und Tagesverbrauch", s.display, s.display_labels],
  ];
  const field = (group, key, value, label) => html`
    <label>
      ${esc(label || key)}
      <input
        data-source-group="${group}"
        data-source-key="${key}"
        list="source-entity-ids"
        value="${esc(draft[group]?.[key] ?? value)}"
        required
        spellcheck="false"
        autocomplete="off"
      />
      <small>
        ${esc(
          states[draft[group]?.[key] ?? value]?.attributes?.friendly_name ||
            value,
        )}
      </small>
    </label>
  `;
  return html`
    <section class="card full" style="margin-top:20px">
      <h2>Verwendete Entitäten</h2>
      <form id="source-settings">
        <p class="note">
          Zuordnungen für Regelung, Prognose und Diagramme. Änderungen werden
          dauerhaft gespeichert. Vor dem Wechsel steuerbarer Geräte die Regelung
          pausieren.
        </p>
        ${groups
          .map(
            ([group, title, values, labels]) => html`
              <details class="source-group">
                <summary>${title}</summary>
                <div class="formgrid">
                  ${Object.entries(values || {})
                    .map(([key, value]) =>
                      field(group, key, value, labels?.[key]),
                    )
                    .join("")}
                </div>
              </details>
            `,
          )
          .join("")}
        <details class="source-group">
          <summary>Temperaturhistorie · InfluxDB</summary>
          <label>
            Historische Temperatur-Entitäten, durch Komma getrennt
            <input
              name="historical_temperature"
              value="${esc(
                draft.historical_temperature ??
                  s.historical_temperature?.join(", ") ??
                  "",
              )}"
              spellcheck="false"
            />
            <small>Diese Reihen dürfen inzwischen aus HA entfernt sein.</small>
          </label>
        </details>
        <details class="source-group">
          <summary>Eigene Strommanager-Sensoren</summary>
          <p class="note">
            Automatisch erzeugte Ergebnisse; keine Eingangsquellen.
          </p>
          ${Object.values(s.outputs || {})
            .map(
              (id) => html`
                <div class="split">
                  <span>
                    ${esc(states[id]?.attributes?.friendly_name || id)}
                  </span>
                  <code>${esc(id)}</code>
                </div>
              `,
            )
            .join("")}
        </details>
        <p class="note">
          Der Sieben-Tage-Wetterausblick verwendet zusätzlich Open-Meteo für
          Dresden direkt und hat keine HA-Entität.
        </p>
        <datalist id="source-entity-ids">
          ${Object.entries(states)
            .map(
              ([id, state]) => html`
                <option value="${esc(id)}">
                  ${esc(state.attributes?.friendly_name || id)}
                </option>
              `,
            )
            .join("")}
        </datalist>
        <button type="submit" class="primary" ${panel.busy ? "disabled" : ""}>
          Entitäten speichern
        </button>
      </form>
    </section>
  `;
}

export function bindSourceSettings(panel) {
  const form = panel.shadowRoot.querySelector("#source-settings");
  if (!form) return;
  const read = () => {
    const sources = {};
    for (const input of form.querySelectorAll("[data-source-group]")) {
      (sources[input.dataset.sourceGroup] ??= {})[input.dataset.sourceKey] =
        input.value.trim();
    }
    sources.historical_temperature = form.elements.namedItem(
      "historical_temperature",
    ).value;
    return sources;
  };
  form.oninput = () => {
    panel.sourceDraft = read();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const sources = read();
    sources.historical_temperature = sources.historical_temperature
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    await panel.service("configure_sources", { sources });
    if (panel.message === "Änderung übernommen.") panel.sourceDraft = null;
  };
}
