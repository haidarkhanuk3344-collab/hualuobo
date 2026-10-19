import {test} from 'node:test';import assert from 'node:assert/strict';
import {loopFrame,clipFrame,timeSteps} from '../src/core/framePlayback';
test('distance driven full-body loop visits every source pose and wraps without resetting phase',()=>{
 assert.deepEqual(Array.from({length:8},(_,i)=>loopFrame(i/8,8)),[0,1,2,3,4,5,6,7]);
 for(let i=0;i<8;i++)assert.equal(loopFrame(3+i/8,8),i);
 assert.equal(loopFrame(.999,8),7);assert.equal(loopFrame(1,8),0);
});
test('entry and exit select real endpoint frames without extending the last hold',()=>{
 assert.deepEqual([0,.2,.4,.6,.8,1].map(p=>clipFrame(p,6)),[0,1,2,3,4,5]);
 assert.deepEqual([0,.2,.4,.6,.8,1].map(p=>clipFrame(1-p,6)),[5,4,3,2,1,0]);
 assert.equal(clipFrame(-1,6),0);assert.equal(clipFrame(2,6),5);
});
test('late render consumes elapsed time in bounded physics steps instead of slowing the animation clock',()=>{
 for(const dt of [1/120,1/60,.075,.14]){const steps=timeSteps(dt);assert(Math.abs(steps.reduce((a,b)=>a+b,0)-dt)<1e-10);assert(steps.every(t=>t<=1/60+1e-10));}
 assert(Math.abs(timeSteps(2).reduce((a,b)=>a+b,0)-.15)<1e-10);
});
