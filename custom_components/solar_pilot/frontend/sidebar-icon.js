// Monochrome companion to the Strommanager brand image. HA supplies currentColor.
const path = "M474 150a38 38 0 0 1 76 0v82a38 38 0 0 1-76 0z M235 221a38 38 0 0 1 54 0l64 64a38 38 0 0 1-54 54l-64-64a38 38 0 0 1 0-54z M721 221a38 38 0 0 1 54 54l-64 64a38 38 0 0 1-54-54z M168 445h68a38 38 0 0 1 0 76h-68a38 38 0 0 1 0-76z M177 642l48-48a38 38 0 0 1 54 54l-48 48a38 38 0 0 1-54-54z M286 598a230 230 0 0 1 386-267L650 349z M319 1152q-15 0-15-30V772l-30 12q-34 12-54-18t10-57l398-316q32-25 62 0l128 101v-39q0-46 46-46h60q46 0 46 46v142l126 102q30 27 10 57t-54 18l-30-12v350q0 30-30 30z M552 1090L832 808Q852 782 821 782L697 782L800 610Q819 577 783 577L670 577Q649 577 637 598L477 842Q459 889 493 889L643 889L542 1065Q532 1094 552 1090Z";
async function getIcon(name) {
  return name === "energy" ? {path, viewBox: "0 0 1280 1280"} : undefined;
}
window.customIcons = window.customIcons || {};
window.customIcons.strommanager = {getIcon};
window.customIconsets = window.customIconsets || {};
window.customIconsets.strommanager = getIcon;
