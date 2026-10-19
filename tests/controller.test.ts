import {test} from 'node:test';import assert from 'node:assert/strict';import {CatController,PAW_DURATION,pawFrameAt,STRIDE_DISTANCE} from '../src/core/controller';import {rng,distance} from '../src/core/math';
const make=()=>new CatController({x:0,y:33,width:1512,height:903},rng(22));
test('walking uses distance phase and stopping or reversing preserves it',()=>{const c=make();c.autonomy=false;c.go({x:1200,y:600});for(let i=0;i<120;i++)c.update(1/60,null,c.position);const phase=c.phase;assert(c.travel>80);assert(Math.abs(c.phase-c.travel/STRIDE_DISTANCE)<1e-8);c.go({x:250,y:600},40);for(let i=0;i<120;i++){c.update(1/60,null,c.position);assert(c.phase>=phase);}assert.equal(c.direction,-1);c.stop();for(let i=0;i<180;i++)c.update(1/60,null,c.position);assert(c.speed===0);});
test('slow near target elicits sniff then a paw and departure cancels it',()=>{const c=make();c.autonomy=false;const head={x:500,y:500},mouse={x:525,y:520};const modes=new Set<string>();for(let i=0;i<90;i++){c.update(1/60,mouse,head,0,0);modes.add(c.mode);}assert(modes.has('sniff')&&modes.has('paw'));c.update(1/60,{x:1000,y:1000},head);assert.notEqual(c.mode,'paw');});
test('quick closing retreats in the opposite direction, with a cooldown',()=>{const c=make();c.autonomy=false;const head={x:c.position.x,y:c.position.y-110};c.update(.016,{x:head.x+35,y:head.y},head,650,500);assert.equal(c.mode,'retreat');assert(c.goal!.x<c.position.x);assert(c.cooldown>3);});
test('drag placement stays put and does not fall to the bottom',()=>{const c=make();c.autonomy=false;c.place({x:500,y:300});for(let i=0;i<600;i++)c.update(1/60,null,{x:500,y:200});assert(distance(c.position,{x:500,y:300})<.01);});
test('autonomy changes pose and stays inside the work area for three minutes',()=>{const c=make();for(let i=0;i<10800;i++){c.update(1/60,null,c.position);assert.deepEqual(c.position,c.clamp(c.position));}assert(c.travel>700);assert(c.idleHistory.length>1);});
test('paw uses all six whole-body stages and keeps the same arm when the target crosses',()=>{for(const direction of [-1,1]){const c=make();c.autonomy=false;const head={x:c.position.x,y:c.position.y-126};const mouse={x:head.x+direction*24,y:head.y};for(let i=0;i<160&&c.mode!=='paw';i++)c.update(1/120,mouse,head);assert.equal(c.mode,'paw');assert.equal(c.pawDirection,direction);const stages=new Set<number>();while(c.mode==='paw'){stages.add(c.pawFrame);c.update(1/120,{x:head.x-direction*24,y:head.y},head);assert.equal(c.pawDirection,direction);}assert.deepEqual([...stages],[0,1,2,3,4,5]);assert.equal(c.mode,'recover');}assert.equal(pawFrameAt(-1),0);assert.equal(pawFrameAt(PAW_DURATION+1),5);});
test('default walk is moderately faster with distance-locked footsteps',()=>{const c=make();c.autonomy=false;c.go({x:1250,y:c.position.y});for(let i=0;i<120;i++)c.update(1/60,null,c.position);assert.equal(c.speedLimit,108);assert(c.speed>107&&c.speed<=108);assert(c.travel>150&&c.travel<185);assert(Math.abs(c.phase-c.travel/STRIDE_DISTANCE)<1e-8);});

test('sleep wakes through curl and settle transitions before walking',()=>{const c=make();c.autonomy=false;c.requestPose('sleep');const clips=new Set<string>();for(let i=0;i<240;i++){if(c.transition)clips.add(c.transition.clip);c.update(1/60,null,c.position);}assert.equal(c.pose,'sleep');assert.deepEqual([...clips],['settle','curl']);c.go({x:1200,y:c.position.y});assert(c.transition?.reverse);for(let i=0;i<240;i++)c.update(1/60,null,c.position);assert.equal(c.pose,'sit');assert(c.travel>50);});
test('weighted needs change idle choices and recent actions limit immediate repetition',()=>{const c=make();c.fatigue=.9;for(let i=0;i<22000;i++)c.update(1/60,null,c.position);assert(c.idleHistory.includes('rest')||c.idleHistory.includes('sleep'));assert(c.behaviorHistory.length<=6);assert(c.fatigue>=0&&c.fatigue<=1);assert(new Set(c.behaviorHistory).size>1);});

test('head proximity follows the lowered head while prone and wakes before a paw',()=>{const c=make();c.autonomy=false;c.pose='rest';c.desiredPose='rest';c.cooldown=0;const mouse={x:c.headPosition.x+20,y:c.headPosition.y};const modes=new Set<string>();for(let i=0;i<250;i++){c.update(1/60,mouse,c.headPosition);modes.add(c.mode);}assert(modes.has('transition'));assert.equal(c.pose,'sit');});

test('starting prepares the standing pose before the first desktop displacement',()=>{const c=make();c.autonomy=false;const p={...c.position};c.go({x:p.x-200,y:p.y});assert.equal(c.direction,-1);for(let i=0;i<18;i++)c.update(1/60,null,c.headPosition);assert.deepEqual(c.position,p);for(let i=0;i<12;i++)c.update(1/60,null,c.headPosition);assert(c.position.x<p.x);});

test('groom recovery begins at the currently rendered gesture phase',()=>{const c=make();c.autonomy=false;c.pose='groom';c.desiredPose='groom';c.age=.47;const before=(c.age*3)%5;c.requestPose('sit');assert(c.transition?.reverse);assert(Math.abs((1-c.transitionProgress)*5-before)<1e-8);});

test('arrival decelerates without crossing the goal or reversing the facing',()=>{for(const direction of [-1,1])for(const dt of [1/120,1/60,.05])for(const speed of [60,108,123]){const c=make();c.autonomy=false;c.place({x:756,y:500});const target={x:756+direction*240,y:500};c.go(target,speed);let previous=c.position.x;for(let i=0;i<Math.ceil(10/dt);i++){c.update(dt,null,c.headPosition);assert((c.position.x-previous)*direction>=-1e-8);assert((target.x-c.position.x)*direction>=-1e-8);assert.equal(c.direction,direction);previous=c.position.x;}assert.equal(c.goal,null);assert.equal(c.speed,0);assert(distance(c.position,target)<.5);}});

test('blocked stationary cat uses seated head/idle presentation even with residual commanded velocity',()=>{
 const c=make();c.autonomy=false;c.velocity={x:90,y:0};c.mode='blocked';
 assert.equal(c.walkingVisual,false);assert.deepEqual(c.headPosition,{x:c.position.x,y:c.position.y-126});
});
test('actual resolved travel drives walk presentation and arrivals return to idle in both directions',()=>{
 for(const direction of [-1,1]){
  const c=make();c.autonomy=false;c.go({x:c.position.x+direction*140,y:c.position.y});assert(c.walkingVisual);
  let walked=false;for(let i=0;i<600;i++){c.update(1/120,null,c.headPosition);if(c.motionSpeed>20)walked=walked||c.walkingVisual;}
  assert(walked);assert.equal(c.goal,null);assert.equal(c.walkingVisual,false);assert.equal(c.pose,'sit');
 }
});
test('pausing a moving cat stops presentation immediately and a later goal can walk again',()=>{
 const c=make();c.autonomy=false;c.go({x:c.position.x+250,y:c.position.y});for(let i=0;i<90;i++)c.update(1/60,null,c.headPosition);assert(c.walkingVisual);
 c.paused=true;c.stop(true);const p={...c.position};for(let i=0;i<90;i++)c.update(1/60,null,c.headPosition);
 assert.equal(c.walkingVisual,false);assert.equal(c.speed,0);assert.deepEqual(c.position,p);
 c.paused=false;c.go({x:p.x-150,y:p.y});for(let i=0;i<90;i++)c.update(1/60,null,c.headPosition);assert(c.walkingVisual);assert(c.position.x<p.x);
});
test('a blocked obstacle cannot leave the stationary cat displaying a step',()=>{
 const c=make();c.autonomy=false;c.place({x:400,y:550});const o={id:'stop:icon',kind:'desktop' as const,name:'icon',bounds:{x:590,y:500,width:48,height:48}};c.world.setObjects([o]);c.go({x:850,y:550});
 for(let i=0;i<120;i++)c.update(1/60,null,c.headPosition);
 assert.equal(c.mode,'blocked');assert.equal(c.speed,0);assert.equal(c.walkingVisual,false);
});
test('moving an icon supporting a prone cat does not turn its resting head into a walking head',()=>{
 const c=make();c.pose='rest';c.desiredPose='rest';c.motionSpeed=45;
 assert.equal(c.walkingVisual,false);assert.deepEqual(c.headPosition,{x:c.position.x,y:c.position.y-62});
});
