import type {Area,Point,Sample,DesktopObject} from '../shared';
/** Keep animation and contact geometry in one space; scale only at the desktop boundary. */
export const worldPoint=(p:Point,scale:number):Point=>({x:p.x/scale,y:p.y/scale});
export const desktopPoint=(p:Point,scale:number):Point=>({x:p.x*scale,y:p.y*scale});
export const worldArea=(a:Area,scale:number):Area=>({...worldPoint(a,scale),width:a.width/scale,height:a.height/scale});
export const worldObject=(o:DesktopObject,scale:number):DesktopObject=>({...o,bounds:worldArea(o.bounds,scale)});
export const worldSample=(s:Sample,scale:number):Sample=>({...s,...worldPoint(s,scale),bounds:worldArea(s.bounds,scale)});
export const windowOrigin=(p:Point,scale:number):Point=>({x:Math.round((p.x-170)*scale),y:Math.round((p.y-220)*scale)});
