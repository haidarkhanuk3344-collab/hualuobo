export type V2={x:number,y:number};
export type V3={x:number,y:number,z:number};
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export const smooth=(x:number)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export const distance=(a:V2,b:V2)=>Math.hypot(a.x-b.x,a.y-b.y);
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const rotate=(p:V2,h:number):V2=>({x:p.x*Math.cos(h)+p.y*Math.sin(h),y:-p.x*Math.sin(h)+p.y*Math.cos(h)});
export function rng(seed:number){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
export const add=(a:V2,b:V2):V2=>({x:a.x+b.x,y:a.y+b.y});
export function moveToward(a:V2,b:V2,max:number):V2{const d=distance(a,b),t=d?Math.min(1,max/d):1;return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};}

