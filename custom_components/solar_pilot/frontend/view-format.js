export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const fmt = (value, unit = "", digits = 0) =>
  value == null || !Number.isFinite(Number(value))
    ? "—"
    : `${Number(value).toLocaleString("de-DE", { maximumFractionDigits: digits })}${unit ? " " + unit : ""}`;

// Formatting tag only: interpolation stays identical to ordinary template strings.
export function html(parts, ...values) {
  return parts.reduce(
    (text, part, i) =>
      text + part + (i < values.length ? String(values[i]) : ""),
    "",
  );
}
