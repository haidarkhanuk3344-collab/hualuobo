import test from 'node:test';import assert from 'node:assert/strict';
import {worldPoint,desktopPoint,worldObject,worldSample,windowOrigin} from '../src/core/viewport';
test('size uses one coordinate transform for icon support, pointer and window, including negative displays',()=>{
 for(const scale of [.7,1,1.2]){
  const icon={id:'desktop:1',kind:'desktop' as const,name:'资料',bounds:{x:-1280,y:120,width:48,height:64}};
  const o=worldObject(icon,scale),mouse=worldSample({x:-1256,y:120,at:1,bounds:{x:-1400,y:0,width:340*scale,height:260*scale}},scale);
  assert.ok(Math.abs(mouse.x-(o.bounds.x+o.bounds.width/2))<1e-9);
  assert.equal(mouse.y,o.bounds.y);
  const foot={x:o.bounds.x+o.bounds.width/2,y:o.bounds.y},actual=desktopPoint(foot,scale),origin=windowOrigin(foot,scale);
  assert.ok(Math.abs(actual.x-(origin.x+170*scale))<=.5);
  assert.ok(Math.abs(actual.y-(origin.y+220*scale))<=.5);
  assert.deepEqual(desktopPoint(worldPoint({x:-1280,y:120},scale),scale),{x:-1280,y:120});
 }
});

import {CatController} from '../src/core/controller';
test('resizing a resting supported cat preserves support, posture and release after icon deletion',()=>{
 const area={x:0,y:0,width:1440,height:900},cat=new CatController(area,()=>.5,area);
 const icon={id:'desktop:1',kind:'desktop' as const,name:'资料',bounds:{x:650,y:480,width:64,height:64}};
 cat.place({x:530,y:550});cat.world.setObjects([icon]);assert.ok(cat.world.startPerch(icon.id,cat.position));
 for(let n=0;n<100;n++)cat.position=cat.world.resolve(cat.position,cat.position,.02);
 cat.pose='rest';cat.desiredPose='rest';
 const factor=1/.7;cat.rescaleWorld(factor);cat.world.setObjects([worldObject(icon,.7)]);
 cat.position=cat.world.resolve(cat.position,cat.position,.02);
 assert.equal(cat.world.supportId,icon.id);assert.equal(cat.pose,'rest');assert.ok(Math.abs(cat.position.y-icon.bounds.y/.7)<1e-8);
 cat.world.setObjects([]);cat.position=cat.world.resolve(cat.position,cat.position,.02);
 assert.equal(cat.world.supportId,null);assert.equal(cat.world.airborne,true);
});
test('resizing during a hop keeps its flight active and lands on the same transformed icon',()=>{
 const area={x:0,y:0,width:1440,height:900},cat=new CatController(area,()=>.5,area);
 const icon={id:'desktop:1',kind:'desktop' as const,name:'资料',bounds:{x:650,y:480,width:64,height:64}};
 cat.place({x:530,y:550});cat.world.setObjects([icon]);assert.ok(cat.world.startPerch(icon.id,cat.position));
 cat.position=cat.world.resolve(cat.position,cat.position,.3);cat.rescaleWorld(1/1.2);cat.world.setObjects([worldObject(icon,1.2)]);
 assert.equal(cat.world.airborne,true);
 for(let n=0;n<100;n++)cat.position=cat.world.resolve(cat.position,cat.position,.02);
 assert.equal(cat.world.supportId,icon.id);assert.ok(Math.abs(cat.position.y-400)<1e-8);assert.equal(cat.world.airborne,false);
});
