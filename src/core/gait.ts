import {clamp,type V2} from './math';
export const STANCE=.62;
export const STRIDE=82;
export const WALK_SCALE=.5;
/** Constant backward speed while planted. The return matches its velocity at both ends. */
export function footOffset(phase:number){
 const t=((phase%1)+1)%1;
 if(t<STANCE)return{x:1-2*t/STANCE,y:0,planted:true};
 const s=(t-STANCE)/(1-STANCE),m=-2*(1-STANCE)/STANCE;
 const x=(2*s*s*s-3*s*s+1)*-1+(s*s*s-2*s*s+s)*m+(-2*s*s*s+3*s*s)+(s*s*s-s*s)*m;
 return{x,y:-16*s*s*(1-s)*(1-s),planted:false};
}
export const LEG_PHASES=[0,.5,.25,.75];
export type Limb={root:V2,joint:V2,foot:V2,polygon:V2[],bend:number};
const p=(x:number,y:number)=>({x,y});
const polygon=(a:number[][])=>a.map(v=>p(v[0],v[1]));
const left:Limb[]=[
 {root:p(147,233),joint:p(137,294),foot:p(105,357),bend:-1,polygon:polygon([[120,224],[169,227],[183,267],[158,308],[135,342],[126,379],[77,379],[76,349],[103,317],[109,274]])},
 {root:p(187,239),joint:p(179,306),foot:p(166,364),bend:-1,polygon:polygon([[156,229],[211,237],[218,283],[201,335],[196,382],[142,382],[143,352],[158,321],[151,275]])},
 {root:p(313,244),joint:p(337,307),foot:p(296,364),bend:1,polygon:polygon([[286,240],[324,239],[345,267],[351,294],[343,319],[344,340],[323,380],[266,380],[264,356],[281,337],[310,320],[313,300],[285,281]])},
 {root:p(323,243),joint:p(354,308),foot:p(322,358),bend:1,polygon:polygon([[309,237],[341,232],[365,266],[372,318],[352,356],[336,380],[304,374],[313,341],[334,309],[309,276]])},
];
const right:Limb[]=[
 {root:p(368,235),joint:p(396,298),foot:p(416,363),bend:1,polygon:polygon([[344,226],[392,227],[410,268],[421,310],[446,350],[447,383],[398,383],[387,348],[367,315],[348,273]])},
 {root:p(315,239),joint:p(310,308),foot:p(314,364),bend:1,polygon:polygon([[289,231],[339,232],[355,279],[336,329],[337,383],[286,383],[283,347],[297,316],[282,276]])},
 {root:p(185,247),joint:p(159,310),foot:p(180,362),bend:-1,polygon:polygon([[164,239],[205,239],[217,268],[217,290],[202,314],[198,339],[219,356],[216,383],[153,383],[145,354],[138,331],[146,300],[146,268]])},
 {root:p(167,245),joint:p(137,307),foot:p(162,361),bend:-1,polygon:polygon([[132,232],[174,235],[190,276],[173,314],[188,348],[185,383],[139,383],[124,348],[119,302]])},
];
export function limbsFor(direction:number){return direction<0?left:right;}
export function solveLimb(limb:Limb,target:V2){
 const {root,joint,foot,bend}=limb;let a=Math.hypot(joint.x-root.x,joint.y-root.y),b=Math.hypot(foot.x-joint.x,foot.y-joint.y);
 const dx=target.x-root.x,dy=target.y-root.y,n=Math.hypot(dx,dy);
 const stretch=Math.max(1,n/(a+b-.2));a*=stretch;b*=stretch;
 const r=clamp(n,Math.abs(a-b)+.01,a+b-.01),angle=Math.atan2(dy,dx)+bend*Math.acos(clamp((a*a+r*r-b*b)/(2*a*r),-1,1));
 return{root,joint:p(root.x+Math.cos(angle)*a,root.y+Math.sin(angle)*a),foot:target};
}
export function footTarget(limb:Limb,index:number,phase:number,direction:number,intensity=1){
 const f=footOffset(phase+LEG_PHASES[index]),amplitude=STANCE*STRIDE/(2*WALK_SCALE);
 const x=limb.root.x+direction*(index<2?0:12)+direction*amplitude*f.x,y=364+f.y*28;
 return{x:limb.foot.x+(x-limb.foot.x)*intensity,y:limb.foot.y+(y-limb.foot.y)*intensity};
}
