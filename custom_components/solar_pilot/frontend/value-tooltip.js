// Shared display-only hover/focus values for both consumption chart variants.
export function bindValueTooltip(plot,previous,remember){
  if(!plot)return;
  const tip=plot.querySelector('[role="tooltip"]');if(!tip)return;
  tip.id='consumption-value-tooltip';
  plot.querySelectorAll('[data-consumption-info]').forEach(hit=>{hit.setAttribute('aria-label',hit.getAttribute('data-consumption-info'));hit.setAttribute('aria-describedby',tip.id);});
  const hide=()=>{tip.hidden=true;remember(null);};
  const show=(hit,clientX,clientY,keyboard=false)=>{
    if(!hit)return hide();
    const bounds=plot.getBoundingClientRect(),target=hit.getBoundingClientRect();
    const px=Number.isFinite(clientX)?clientX:target.left+target.width/2,py=Number.isFinite(clientY)?clientY:target.top;
    tip.textContent=hit.getAttribute('data-consumption-info');tip.hidden=false;
    const width=tip.offsetWidth,height=tip.offsetHeight;
    const left=Math.max(8,Math.min(plot.clientWidth-width-8,px-bounds.left-width/2));
    const top=Math.max(6,Math.min(plot.clientHeight-height-6,py-bounds.top-height-12));
    tip.style.left=`${plot.scrollLeft+left}px`;tip.style.top=`${plot.scrollTop+top}px`;
    remember({key:hit.getAttribute('data-consumption-info-key'),clientX:px,clientY:py,keyboard});
  };
  plot.onpointermove=event=>show(event.target.closest('[data-consumption-info]'),event.clientX,event.clientY);
  plot.onpointerleave=event=>{if(event.pointerType!=='touch')hide();};
  plot.onfocusin=event=>show(event.target.closest('[data-consumption-info]'),null,null,true);
  plot.onfocusout=hide;
  plot.onkeydown=event=>{if(event.key==='Escape')hide();};
  if(previous){
    const hit=[...plot.querySelectorAll('[data-consumption-info-key]')].find(el=>el.getAttribute('data-consumption-info-key')===previous.key);
    const r=plot.getBoundingClientRect();
    if(hit&&(previous.keyboard||previous.clientX>=r.left&&previous.clientX<=r.right&&previous.clientY>=r.top&&previous.clientY<=r.bottom))show(hit,previous.clientX,previous.clientY,previous.keyboard);
    else remember(null);
  }
}
