import {clamp,lerp,smooth,type V2} from './math';
import type {DesktopObject,Area} from '../shared';

export const BODY_HALF_WIDTH=112;
const BODY_HEIGHT=122;
const SUPPORT_REACH=48;
type Flight={id:string|null;from:V2;to?:V2;age:number;duration:number;height:number};
/** Contact geometry lives in desktop coordinates. It never changes a system icon. */
export class SurfaceWorld {
 objects:DesktopObject[]=[];
 supportId:string|null=null;
 blockedId:string|null=null;
 blockedDirection=0;
 airborne=false;
 landed=false;
 private supportBounds:Area|null=null;
 private flight:Flight|null=null;
 private falling=false;
 private verticalSpeed=0;
 private entryY:number|null=null;
 constructor(public screen:Area){}
 rescaleWorld(factor:number){
  const point=(p:V2)=>({x:p.x*factor,y:p.y*factor});
  if(this.supportBounds)this.supportBounds={...point(this.supportBounds),width:this.supportBounds.width*factor,height:this.supportBounds.height*factor};
  if(this.entryY!==null)this.entryY*=factor;
  this.verticalSpeed*=factor;
  if(this.flight){this.flight.from=point(this.flight.from);if(this.flight.to)this.flight.to=point(this.flight.to);this.flight.height*=factor;}
 }
 setObjects(objects:DesktopObject[],enabled=true){this.objects=enabled?objects.filter(o=>o.bounds.width>=16&&o.bounds.height>=16):[];}
 clear(){this.supportId=null;this.supportBounds=null;this.flight=null;this.falling=false;this.airborne=false;this.blockedId=null;this.verticalSpeed=0;this.entryY=null;}
 get support(){return this.objects.find(o=>o.id===this.supportId)||null;}
 get contact(){return this.objects.find(o=>o.id===this.blockedId)||null;}
 private perchX(o:DesktopObject){return clamp(o.bounds.x+o.bounds.width/2,this.screen.x+76,this.screen.x+this.screen.width-76);}
 startPerch(id:string,from:V2){
  const o=this.objects.find(o=>o.id===id);if(!o||this.airborne)return false;
  const b=o.bounds,to={x:this.perchX(o),y:b.y};
  if(to.x<b.x-SUPPORT_REACH||to.x>b.x+b.width+SUPPORT_REACH)return false;
  if(Math.abs(to.x-from.x)>190||from.y-to.y>180||from.y-to.y< -8)return false;
  this.entryY=from.y;
  this.flight={id,from:{...from},age:0,duration:.86,height:Math.max(48,(from.y-to.y)*.35)};
  this.supportId=null;this.supportBounds=null;this.airborne=true;this.blockedId=null;return true;
 }
 startLeave(from:V2,direction:number){
  const o=this.support;if(!o||this.airborne)return false;const b=o.bounds;
  const to={x:clamp(direction<0?b.x-BODY_HALF_WIDTH-12:b.x+b.width+BODY_HALF_WIDTH+12,this.screen.x+145,this.screen.x+this.screen.width-145),y:Math.min(this.screen.y+this.screen.height-8,Math.max(b.y+b.height+12,this.entryY??0))};
  // In a dense Dock, the adjacent icon is another shelf, not an occupied landing floor.
  const neighbor=this.objects.filter(n=>n.id!==o.id&&to.x>n.bounds.x-BODY_HALF_WIDTH&&to.x<n.bounds.x+n.bounds.width+BODY_HALF_WIDTH&&to.y>n.bounds.y+1&&to.y-BODY_HEIGHT<n.bounds.y+n.bounds.height&&Math.abs(this.perchX(n)-from.x)<=190&&Math.abs(n.bounds.y-from.y)<=180).sort((a,b)=>Math.abs(this.perchX(a)-to.x)-Math.abs(this.perchX(b)-to.x))[0];
  this.flight={id:neighbor?.id||null,from:{...from},to,age:0,duration:.76,height:26};
  this.supportId=null;this.supportBounds=null;this.airborne=true;this.blockedId=null;return true;
 }
 get takeoffProgress(){return this.flight?clamp(this.flight.age/.18,0,1):1;}
 get flightProgress(){return this.flight?clamp((this.flight.age-.18)/(this.flight.duration-.18),0,1):0;}
 resolve(previous:V2,proposed:V2,dt:number):V2{
  this.landed=false;this.blockedId=null;this.blockedDirection=0;
  const floor=this.screen.y+this.screen.height-8;
  if(this.flight){
   const f=this.flight,o=f.id?this.objects.find(o=>o.id===f.id):null;
   if(f.id&&!o){this.flight=null;this.falling=true;this.verticalSpeed=0;proposed={...previous};}
   else {
    f.age+=dt;const t=clamp((f.age-.18)/(f.duration-.18),0,1),to=o?{x:this.perchX(o),y:o.bounds.y}:f.to!;
    // Both the path and lift have zero velocity at takeoff and landing.
    const lift=16*t*t*(1-t)*(1-t)*f.height;
    const p={x:lerp(f.from.x,to.x,smooth(t)),y:lerp(f.from.y,to.y,smooth(t))-lift};
    if(t===1){this.flight=null;this.supportId=o?.id||null;this.supportBounds=o?{...o.bounds}:null;this.airborne=false;this.landed=true;}

    return p;
   }
  }
  if(this.supportId){
   const o=this.support;
   if(o&&this.supportBounds){
    const b=o.bounds,dx=b.x-this.supportBounds.x,dy=b.y-this.supportBounds.y;
    const x=proposed.x+dx;
    if(Math.abs(dx)<=120&&Math.abs(dy)<=90&&x>=b.x-SUPPORT_REACH&&x<=b.x+b.width+SUPPORT_REACH){
     this.supportBounds={...b};return this.sides({...previous,x:previous.x+dx,y:b.y},{x,y:b.y},o.id);
    }
   }
   this.supportId=null;this.supportBounds=null;this.falling=true;this.airborne=true;this.verticalSpeed=0;
  }
  if(this.falling){
   this.verticalSpeed+=620*dt;const nextY=previous.y+this.verticalSpeed*dt;
   let landY=floor,land:DesktopObject|null=null;
   for(const o of this.objects){const b=o.bounds;if(proposed.x>=b.x+2&&proposed.x<=b.x+b.width-2&&previous.y<=b.y+1&&nextY>=b.y&&b.y<landY){landY=b.y;land=o;}}
   proposed={x:proposed.x,y:Math.min(nextY,landY)};
   if(nextY>=landY){this.falling=false;this.airborne=false;this.verticalSpeed=0;this.landed=true;this.supportId=land?.id||null;this.supportBounds=land?{...land.bounds}:null;}
   return proposed;
  }
  if(proposed.y>previous.y){
   const landing=this.objects.filter(o=>proposed.x>=o.bounds.x+2&&proposed.x<=o.bounds.x+o.bounds.width-2&&previous.y<=o.bounds.y&&proposed.y>=o.bounds.y).sort((a,b)=>a.bounds.y-b.bounds.y)[0];
   if(landing){this.supportId=landing.id;this.supportBounds={...landing.bounds};this.landed=true;return{x:proposed.x,y:landing.bounds.y};}
  }
  return this.sides(previous,proposed,this.supportId);
 }
 private sides(previous:V2,proposed:V2,ignore:string|null):V2{
  let x=proposed.x;const dx=proposed.x-previous.x;
  const band=this.objects.filter(o=>o.id!==ignore&&Math.min(previous.y,proposed.y)>o.bounds.y+1&&Math.max(previous.y,proposed.y)-BODY_HEIGHT<o.bounds.y+o.bounds.height);
  const overlapping=band.filter(o=>previous.x>o.bounds.x-BODY_HALF_WIDTH+.5&&previous.x<o.bounds.x+o.bounds.width+BODY_HALF_WIDTH-.5);
  if(overlapping.length&&!this.airborne){
   // Dense Dock icons form one obstacle band. Resolve the union, not each icon
   // independently (which would push the body backwards and forwards each tick).
   let left=Math.min(...overlapping.map(o=>o.bounds.x-BODY_HALF_WIDTH)),right=Math.max(...overlapping.map(o=>o.bounds.x+o.bounds.width+BODY_HALF_WIDTH));
   for(let pass=0;pass<band.length;pass++)for(const o of band){const lo=o.bounds.x-BODY_HALF_WIDTH,hi=o.bounds.x+o.bounds.width+BODY_HALF_WIDTH;if(lo<=right&&hi>=left){left=Math.min(left,lo);right=Math.max(right,hi);}}
   if(left<this.screen.x+130&&right>this.screen.x+this.screen.width-130){
    // A revealed Dock can occupy the entire floor band. Place the feet on its
    // nearest visible support instead of oscillating or hiding the pet offscreen.
    const o=band.sort((a,b)=>Math.abs(a.bounds.x+a.bounds.width/2-previous.x)-Math.abs(b.bounds.x+b.bounds.width/2-previous.x))[0];
    if(this.startPerch(o.id,previous))return {...previous};
   }
   const exit=dx>0?left:dx<0?right:previous.x-left<right-previous.x?left:right;
   const o=overlapping[0];this.blockedId=o.id;this.blockedDirection=exit===left?1:-1;return{x:exit,y:proposed.y};
  }
  for(const o of this.objects){
   if(o.id===ignore)continue;const b=o.bounds;
   if(Math.min(previous.y,proposed.y)<=b.y+1||Math.max(previous.y,proposed.y)-BODY_HEIGHT>=b.y+b.height)continue;
   const left=b.x-BODY_HALF_WIDTH,right=b.x+b.width+BODY_HALF_WIDTH;
   if(dx>0&&previous.x<=left+.5&&x>=left){x=Math.min(x,left);this.blockedId=o.id;this.blockedDirection=1;}
   else if(dx<0&&previous.x>=right-.5&&x<=right){x=Math.max(x,right);this.blockedId=o.id;this.blockedDirection=-1;}
  }
  return{x,y:proposed.y};
 }
}
