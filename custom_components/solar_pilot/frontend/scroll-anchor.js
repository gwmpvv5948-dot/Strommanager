// Repeated summaries must be scoped to their card, otherwise a refresh can
// restore the viewport to a different "Berechnung und Datenquellen" above it.
export function scrollAnchorKey(element, tab) {
  const card = element.closest('.card')?.querySelector('h2')?.textContent || tab;
  if(element.matches('.card'))return `${card}|CARD`;
  const local = element.matches('.split')
    ? `${element.closest('.source-group')?.querySelector('h3')?.textContent}|${element.querySelector('code')?.textContent}`
    : `${element.tagName}|${element.textContent.trim()}`;
  return `${card}|${local}`;
}
