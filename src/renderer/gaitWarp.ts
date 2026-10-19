import {footTarget,limbsFor,solveLimb,type Limb} from '../core/gait';
import {type V2} from '../core/math';
type Parts={body:HTMLCanvasElement,upper:HTMLCanvasElement[],lower:HTMLCanvasElement[],paws:HTMLCanvasElement[],roots:HTMLCanvasElement};
/** Cached runtime cutouts retain original RGB; overlapping joints keep the four legs connected. */
export class GaitWarp {
 canvas=document.createElement('canvas');private ctx=this.canvas.getContext('2d')!;private parts=new Map<HTMLImageElement,Parts>();feet:V2[]=[];
 get available(){return !!this.ctx;}
 private polygon(ctx:CanvasRenderingContext2D,points:V2[]){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();}
 private make(image:HTMLImageElement,direction:number){
  const limbs=limbsFor(direction),create=()=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;return c;},body=create(),roots=create(),upper:HTMLCanvasElement[]=[],lower:HTMLCanvasElement[]=[],paws:HTMLCanvasElement[]=[];
  const b=body.getContext('2d')!;
  const belly=(direction<0?[[0,0],[504,0],[504,384],[365,384],[365,310],[355,288],[336,276],[318,272],[293,278],[272,284],[244,279],[217,277],[196,281],[175,282],[156,281],[142,265],[124,248],[108,240],[0,240]]:[[0,0],[504,0],[504,260],[415,260],[399,279],[383,290],[357,296],[326,283],[290,283],[266,280],[241,285],[213,289],[188,285],[165,270],[136,291],[136,384],[0,384]]).map(([x,y])=>({x,y}));
  this.polygon(b,belly);b.clip();b.drawImage(image,0,0);
  for(const limb of limbs){
   const source=create(),s=source.getContext('2d')!;this.polygon(s,limb.polygon);s.clip();s.drawImage(image,0,0);
   const index=limbs.indexOf(limb);if(index===1||index===3){s.globalCompositeOperation='destination-out';s.save();s.beginPath();s.rect(0,limb.root.y+30,image.width,image.height);s.clip();this.polygon(s,limbs[index===1?0:2].polygon);s.fill();s.restore();}
   const paw=create(),pc=paw.getContext('2d')!;pc.beginPath();pc.ellipse(limb.foot.x,limb.foot.y+2,24,15,0,0,Math.PI*2);pc.clip();pc.drawImage(source,0,0);paws.push(paw);
   for(const [isLower,collection] of [[false,upper],[true,lower]] as const){const c=create(),ctx=c.getContext('2d')!,a=isLower?limb.root:limb.joint,z=isLower?limb.joint:limb.foot,dx=z.x-a.x,dy=z.y-a.y,n=Math.hypot(dx,dy),nx=dx/n,ny=dy/n;
    const overlap=isLower?-14:14,origin={x:limb.joint.x+nx*overlap,y:limb.joint.y+ny*overlap},side=isLower?1:-1;
    this.polygon(ctx,[{x:origin.x-ny*900,y:origin.y+nx*900},{x:origin.x+ny*900,y:origin.y-nx*900},{x:origin.x+ny*900+nx*side*900,y:origin.y-nx*900+ny*side*900},{x:origin.x-ny*900+nx*side*900,y:origin.y+nx*900+ny*side*900}]);ctx.clip();ctx.drawImage(source,0,0);if(isLower){ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.ellipse(limb.foot.x,limb.foot.y+4,23,10,0,0,Math.PI*2);ctx.fill();}collection.push(c);
   }
  }
  const r=roots.getContext('2d')!;r.beginPath();for(const l of limbs){r.moveTo(l.root.x+42,l.root.y+5);r.ellipse(l.root.x,l.root.y+5,42,34,0,0,Math.PI*2);}r.clip();r.drawImage(body,0,0);
  const parts={body,upper,lower,paws,roots};this.parts.set(image,parts);return parts;
 }
 private bone(image:HTMLCanvasElement,a:V2,b:V2,c:V2,d:V2){
  const sx=b.x-a.x,sy=b.y-a.y,dx=d.x-c.x,dy=d.y-c.y,n=sx*sx+sy*sy,q=Math.hypot(dx,dy)*Math.sqrt(n),aa=dx*sx/n+dy*sy/q,bb=dy*sx/n-dx*sy/q,cc=dx*sy/n-dy*sx/q,dd=dy*sy/n+dx*sx/q;
  this.ctx.save();this.ctx.transform(aa,bb,cc,dd,c.x-aa*a.x-cc*a.y,c.y-bb*a.x-dd*a.y);this.ctx.drawImage(image,0,0);this.ctx.restore();
 }
 render(image:HTMLImageElement,phase:number,direction:number,intensity=1):HTMLCanvasElement|HTMLImageElement{
  if(intensity<.003)return image;
  if(this.canvas.width!==image.width||this.canvas.height!==image.height){this.canvas.width=image.width;this.canvas.height=image.height;}
  this.ctx.clearRect(0,0,image.width,image.height);const parts=this.parts.get(image)||this.make(image,direction),limbs=limbsFor(direction);
  this.feet=limbs.map((l,i)=>footTarget(l,i,phase,direction,intensity));const bob=Math.sin(phase*Math.PI*4)*1.3*intensity,solved=limbs.map((l,i)=>solveLimb({...l,root:{x:l.root.x,y:l.root.y+bob}},this.feet[i]));
  const drawLeg=(i:number)=>{const source=i===3?2:i,l=limbs[source],s=solved[i];this.ctx.save();if(i===1||i===3)this.ctx.filter='brightness(.88)';this.bone(parts.lower[source],l.joint,l.foot,s.joint,s.foot);this.bone(parts.upper[source],l.root,l.joint,s.root,s.joint);this.ctx.drawImage(parts.paws[source],s.foot.x-l.foot.x,s.foot.y-l.foot.y);this.ctx.restore();};
  drawLeg(1);drawLeg(3);this.ctx.drawImage(parts.body,0,bob);drawLeg(2);drawLeg(0);this.ctx.drawImage(parts.roots,0,bob);return this.canvas;
 }
}
