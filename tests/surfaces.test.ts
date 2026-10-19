import {test} from 'node:test';import assert from 'node:assert/strict';
import {SurfaceWorld,BODY_HALF_WIDTH} from '../src/core/surfaces';
import {CatController} from '../src/core/controller';
import type {DesktopObject} from '../src/shared';
const icon:DesktopObject={id:'desktop:test',name:'测试图标',kind:'desktop',bounds:{x:700,y:600,width:48,height:48}};
const world=()=>{const w=new SurfaceWorld({x:0,y:0,width:1512,height:982});w.setObjects([icon]);return w;};
test('lateral contact stops at both icon faces, even at a one-frame high speed',()=>{
 const w=world();assert.equal(w.resolve({x:550,y:665},{x:900,y:665},.05).x,700-BODY_HALF_WIDTH);assert.equal(w.blockedId,icon.id);
 assert.equal(w.resolve({x:900,y:665},{x:550,y:665},.05).x,748+BODY_HALF_WIDTH);assert.equal(w.blockedDirection,-1);
});
test('an icon below the feet or outside the body band does not block walking',()=>{
 const w=world();assert.deepEqual(w.resolve({x:550,y:599},{x:900,y:599},.05),{x:900,y:599});assert.equal(w.blockedId,null);
 assert.equal(w.resolve({x:550,y:800},{x:900,y:800},.05).x,900);
});
test('perching follows an arc and lands exactly on top without penetrating',()=>{
 const w=world(),start={x:652,y:665};assert(w.startPerch(icon.id,start));let p=start,minY=p.y;
 for(let i=0;i<70;i++){p=w.resolve(p,p,1/60);minY=Math.min(minY,p.y);}
 assert(minY<icon.bounds.y-10);assert.equal(w.supportId,icon.id);assert.equal(p.y,600);assert.equal(p.x,724);assert(!w.airborne);
});
test('supported cat follows a moved icon and falls after the icon disappears',()=>{
 const w=world();let p={x:652,y:665};w.startPerch(icon.id,p);for(let i=0;i<60;i++)p=w.resolve(p,p,1/60);
 w.setObjects([{...icon,bounds:{...icon.bounds,x:725,y:610}}]);p=w.resolve(p,p,1/60);assert.deepEqual(p,{x:749,y:610});
 w.setObjects([]);const original=p.y;p=w.resolve(p,p,1/60);assert.equal(w.supportId,null);assert(w.airborne);assert(p.y>original);
 for(let i=0;i<200;i++)p=w.resolve(p,p,1/60);assert.equal(p.y,974);assert(!w.airborne);
});
test('walking off a support edge releases it and a lower icon catches the fall',()=>{
 const w=world(),lower={...icon,id:'lower',bounds:{x:820,y:760,width:80,height:45}};let p={x:652,y:665};w.startPerch(icon.id,p);for(let i=0;i<60;i++)p=w.resolve(p,p,1/60);
 w.setObjects([icon,lower]);p=w.resolve(p,{x:860,y:p.y},1/60);assert(w.airborne);for(let i=0;i<120;i++)p=w.resolve(p,p,1/60);
 assert.equal(w.supportId,'lower');assert.equal(p.y,760);
});
test('a hidden target during a hop does not leave a phantom support',()=>{
 const w=world();let p={x:652,y:665};w.startPerch(icon.id,p);for(let i=0;i<20;i++)p=w.resolve(p,p,1/60);w.setObjects([]);
 for(let i=0;i<240;i++)p=w.resolve(p,p,1/60);assert.equal(w.supportId,null);assert.equal(p.y,974);assert(!w.airborne);
});
test('controller contact stops movement and freezes walking phase at the obstacle',()=>{
 const c=new CatController({x:0,y:0,width:1512,height:982},()=>.8);c.autonomy=false;c.place({x:550,y:665});c.world.setObjects([icon]);c.go({x:1000,y:665});
 for(let i=0;i<180&&c.mode!=='blocked';i++)c.update(1/60,null,c.position);assert.equal(c.mode,'blocked');assert.equal(c.position.x,700-BODY_HALF_WIDTH);assert.equal(c.speed,0);
 const phase=c.phase;for(let i=0;i<20;i++)c.update(1/60,null,c.position);assert.equal(c.phase,phase);
});

test('walking down toward an icon lands on its top instead of passing through',()=>{const w=world();const p=w.resolve({x:724,y:585},{x:724,y:620},.05);assert.equal(p.y,600);assert.equal(w.supportId,icon.id);assert(w.landed);});
test('a left-edge icon can support a visible overhanging cat',()=>{const w=world();const edge={...icon,id:'edge',bounds:{x:18,y:600,width:36,height:42}};w.setObjects([edge]);let p={x:145,y:650};assert(w.startPerch(edge.id,p));for(let i=0;i<70;i++)p=w.resolve(p,p,1/60);assert.equal(p.x,76);assert.equal(p.y,600);assert.equal(w.supportId,edge.id);p=w.resolve(p,p,1/60);assert.equal(w.supportId,edge.id);});
test('a newly visible full-width Dock does not trap the cat in oscillating contacts',()=>{const w=world(),dock=Array.from({length:28},(_,i)=>({...icon,id:'dock:'+i,kind:'dock' as const,bounds:{x:110+i*46,y:930,width:40,height:40}}));w.setObjects(dock);let p={x:750,y:974};for(let i=0;i<120;i++)p=w.resolve(p,p,1/60);assert(w.supportId);assert.equal(p.y,930);assert(Math.abs(p.x-750)<=46);});
test('a vanished support releases the cat even during a pose transition',()=>{const c=new CatController({x:0,y:0,width:1512,height:982},()=>.3);c.autonomy=false;c.place({x:588,y:665});c.world.setObjects([icon]);assert(c.perch(icon.id));for(let i=0;i<55;i++)c.update(1/60,null,c.position);assert(c.transition);const y=c.position.y;c.world.setObjects([]);c.update(1/60,null,c.position);assert(c.world.airborne);assert(c.position.y>y);});
test('hop takeoff and landing ease without a vertical speed impulse',()=>{const w=world(),start={x:588,y:665};w.startPerch(icon.id,start);const first=w.resolve(start,start,1/120);assert(Math.abs(first.y-start.y)<.15);let p=first;for(let i=0;i<102;i++)p=w.resolve(p,p,1/120);const before={...p};p=w.resolve(p,p,1/120);assert(Math.abs(p.y-before.y)<.15);assert.equal(p.y,600);});
test('supported rest wakes before a commanded departure and returns to walking',()=>{const c=new CatController({x:0,y:0,width:1512,height:982},()=>.1);c.autonomy=false;c.place({x:588,y:665});c.world.setObjects([icon]);c.perch(icon.id);for(let i=0;i<120;i++)c.update(1/60,null,c.headPosition);assert.equal(c.pose,'rest');c.go({x:1100,y:665});assert(c.transition);assert.equal(c.world.supportId,icon.id);let down=false,walk=false;for(let i=0;i<360;i++){c.update(1/60,null,c.headPosition);if(c.world.airborne){down=true;assert.equal(c.pose,'sit');}if(down&&c.walkingVisual)walk=true;}assert(down&&walk);assert.equal(c.world.supportId,null);assert.equal(c.position.y,665);assert(Math.abs(c.position.x-1100)<.5);});
test('departing into a dense icon row uses the next shelf instead of an occupied floor',()=>{const w=world(),neighbor={...icon,id:'neighbor',bounds:{x:820,y:600,width:48,height:48}};w.setObjects([icon,neighbor]);let p={x:588,y:665};w.startPerch(icon.id,p);for(let i=0;i<70;i++)p=w.resolve(p,p,1/60);assert(w.startLeave(p,1));for(let i=0;i<70;i++)p=w.resolve(p,p,1/60);assert.equal(w.supportId,neighbor.id);assert.equal(p.y,600);assert.equal(p.x,844);});
test('autonomous reachable contact climbs even when the old retreat coin would refuse it',()=>{const c=new CatController({x:0,y:0,width:1512,height:982},()=>.99);c.place({x:550,y:665});c.world.setObjects([icon]);c.go({x:1100,y:665});for(let i=0;i<240;i++)c.update(1/60,null,c.headPosition);assert.equal(c.world.supportId,icon.id);assert.equal(c.pose,'rest');assert(!c.world.airborne);});
