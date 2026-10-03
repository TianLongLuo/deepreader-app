export type StudyAnchor = {left:number;right:number;top:number;bottom:number};
export type FloatingFrame = {left:number;top:number;width:number;height:number;crowded?:boolean};
export function floatingPanelLayout(width:number,height:number,requested:{width:number;height:number},side:'left'|'right',anchor?:StudyAnchor,mode:{flow?:'vertical'|'paginated';kind?:'word'|'paragraph'}={}):FloatingFrame {
  const gap=mode.flow==='vertical'&&mode.kind==='word'?20:12;
  const availableWidth=Math.max(0,width-gap*2),availableHeight=Math.max(0,height-gap*2);
  const wanted={width:Math.min(availableWidth,Math.max(280,Number.isFinite(requested.width)?requested.width:440)),height:Math.min(availableHeight,Math.max(180,Number.isFinite(requested.height)?requested.height:600))};
  if(mode.flow==='vertical'&&mode.kind==='word'){
    // A short card leaves the surrounding reading visible; no reserved layout space.
    wanted.height=Math.min(wanted.height,width<=600?Math.round(height*.38):360);
    if(width<=600){
      const margin=12,w=Math.min(width-24,wanted.width+16),h=Math.min(height-24,wanted.height);
      let top=height-margin-h;
      if(anchor&&anchor.bottom>top-gap&&anchor.top<height-margin){const above=anchor.top-gap-h;if(above>=margin)top=above;else if(anchor.bottom+gap+h<=height-margin)top=anchor.bottom+gap;}
      return {left:(width-w)/2,top:Math.max(margin,top),width:w,height:h,crowded:Boolean(anchor&&top<anchor.bottom&&top+h>anchor.top)};
    }
  }
  const base={left:side==='left'?gap:width-gap-wanted.width,top:gap,...wanted};
  if(!anchor||anchor.right<0||anchor.left>width||anchor.bottom<0||anchor.top>height)return base;
  // Four free rectangles around the selected content. Never change the reader's
  // dimensions: reduce the overlay only when the saved size does not fit.
  const left={left:gap,top:gap,width:Math.max(0,anchor.left-gap*2),height:availableHeight};
  const right={left:Math.max(gap,anchor.right+gap),top:gap,width:Math.max(0,width-Math.max(gap,anchor.right+gap)-gap),height:availableHeight};
  const above={left:gap,top:gap,width:availableWidth,height:Math.max(0,anchor.top-gap*2)};
  const below={left:gap,top:Math.max(gap,anchor.bottom+gap),width:availableWidth,height:Math.max(0,height-Math.max(gap,anchor.bottom+gap)-gap)};
  const candidates=side==='left'?[left,right,below,above]:[right,left,below,above];
  const fits=candidates.find(r=>r.width>=wanted.width&&r.height>=wanted.height);
  const usable=candidates.filter(r=>r.width>=Math.min(280,availableWidth)&&r.height>=Math.min(180,availableHeight));
  const region=fits??(usable.length?usable:candidates).reduce((best,r)=>Math.min(r.width,wanted.width)*Math.min(r.height,wanted.height)>Math.min(best.width,wanted.width)*Math.min(best.height,wanted.height)?r:best);
  if(region.width<Math.min(280,availableWidth)||region.height<Math.min(180,availableHeight)){
    // A viewport-filling paragraph leaves no usable free rectangle. Keep a
    // compact, draggable panel rather than clipping every control to a sliver.
    const compact={width:Math.min(wanted.width,360),height:Math.min(wanted.height,240)};
    const corners=[{left:gap,top:gap},{left:width-gap-compact.width,top:gap},{left:gap,top:height-gap-compact.height},{left:width-gap-compact.width,top:height-gap-compact.height}];
    const overlap=(r:{left:number;top:number})=>Math.max(0,Math.min(r.left+compact.width,anchor.right)-Math.max(r.left,anchor.left))*Math.max(0,Math.min(r.top+compact.height,anchor.bottom)-Math.max(r.top,anchor.top));
    const position=corners.reduce((best,r)=>overlap(r)<overlap(best)?r:best);
    return {...position,...compact,crowded:true};
  }
  const w=Math.min(region.width,wanted.width),h=Math.min(region.height,wanted.height);
  const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(v,max));
  // Position against the selection, not against a distant viewport corner.
  const x=region===left?anchor.left-gap-w:region===right?anchor.right+gap:anchor.left;
  const y=region===above?anchor.top-gap-h:region===below?anchor.bottom+gap:anchor.top;
  return {left:clamp(x,region.left,region.left+region.width-w),top:clamp(y,region.top,region.top+region.height-h),width:w,height:h};
}
export function viewportAnchor(rect:{left:number;right:number;top:number;bottom:number},frame?:{left:number;top:number}|null):StudyAnchor {
  return {left:rect.left+(frame?.left??0),right:rect.right+(frame?.left??0),top:rect.top+(frame?.top??0),bottom:rect.bottom+(frame?.top??0)};
}
