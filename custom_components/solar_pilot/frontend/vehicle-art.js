// Decorative side profile selected in the vehicle mockup. No device logic.
export function vehicleSilhouette(connected=false){
  return `<div class="tesla-art" role="img" aria-label="Tesla-inspirierte Fahrzeug-Silhouette${connected?', Ladekabel verbunden':''}">
    <div class="tesla-car">
      <div class="tesla-shadow"></div>
      <div class="tesla-bodywork"></div>
      <div class="tesla-glass"></div>
      <div class="tesla-belt"></div>
      <div class="tesla-wheel tesla-front-wheel"></div>
      <div class="tesla-wheel tesla-rear-wheel"></div>
      <div class="tesla-headlight"></div>
      <div class="tesla-taillight"></div>
      <div class="tesla-handle"></div>
      ${connected?'<div class="tesla-cable"></div>':''}
    </div>
  </div>`;
}
