import {test} from 'node:test';import assert from 'node:assert/strict';import {footOffset,LEG_PHASES,footTarget,limbsFor,solveLimb,STRIDE,WALK_SCALE} from '../src/core/gait';
test('all four limbs have a planted push and a lifted return, with independent phases',()=>{
 assert.equal(new Set(LEG_PHASES).size,4);
 for(const offset of LEG_PHASES){let planted=0,lifted=0,minX=1,maxX=-1,minY=0;
  for(let i=0;i<100;i++){const f=footOffset(i/100+offset);if(f.planted){planted++;assert.equal(f.y,0);}else lifted++;minX=Math.min(minX,f.x);maxX=Math.max(maxX,f.x);minY=Math.min(minY,f.y);}
  assert(planted>55&&lifted>30);assert(maxX-minX>1.9);assert(minY<-.95);
 }
});
test('paw path has no discontinuity at the loop or lift boundaries',()=>{for(const t of [0,.62,1]){const a=footOffset(t-1e-5),b=footOffset(t+1e-5);assert(Math.abs(a.x-b.x)<.001);assert(Math.abs(a.y-b.y)<.001);}});

test('planted paws stay fixed in desktop coordinates at either speed and direction',()=>{
 for(const direction of [-1,1])for(const speed of [60,108,123])for(const [i,limb] of limbsFor(direction).entries()){
  const phase=.2-LEG_PHASES[i],dt=1/120,a=footTarget(limb,i,phase,direction),b=footTarget(limb,i,phase+speed*dt/STRIDE,direction);
  assert(Math.abs((b.x-a.x)*WALK_SCALE+direction*speed*dt)<1e-8);
  assert.equal(a.y,b.y);
 }
});
test('swing and stance join with continuous velocity and flat landing',()=>{
 const epsilon=1e-5;
 for(const t of [0,.62,1]){const a=footOffset(t-epsilon),b=footOffset(t),c=footOffset(t+epsilon);
  assert(Math.abs((b.x-a.x)/epsilon-(c.x-b.x)/epsilon)<.004);
  assert(Math.abs((b.y-a.y)/epsilon-(c.y-b.y)/epsilon)<.004);
 }
});
test('joint solution keeps all four roots attached and reaches every foot target',()=>{
 for(const direction of [-1,1])for(const [i,limb] of limbsFor(direction).entries())for(let n=0;n<100;n++){
  const target=footTarget(limb,i,n/100,direction),solved=solveLimb(limb,target);
  assert.deepEqual(solved.root,limb.root);assert.deepEqual(solved.foot,target);
  assert(Number.isFinite(solved.joint.x)&&Number.isFinite(solved.joint.y));
  assert(Math.hypot(solved.joint.x-limb.root.x,solved.joint.y-limb.root.y)>20);
 }
});

test('neutral gait returns to the canonical standing contact anchors',()=>{for(const direction of [-1,1])for(const [i,l] of limbsFor(direction).entries())assert.deepEqual(footTarget(l,i,.37,direction,0),l.foot);});
