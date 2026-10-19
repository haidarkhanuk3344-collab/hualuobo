import {distance,type V2} from './math';
import {BODY_HALF_WIDTH} from './surfaces';
import type {DesktopObject} from '../shared';
import type {CatController} from './controller';
export class IconInterest {
 active:DesktopObject|null=null;delay=4;stage:'approach'|'inspect'|'perch'|'rest'|'leave'='approach';private age=0;private restFor=24;
 constructor(private random:()=>number=Math.random){}
 clear(){this.active=null;this.delay=10;this.age=0;this.stage='approach';}
 private rest(cat:CatController,o:DesktopObject){this.active=o;this.stage='rest';this.age=0;this.restFor=20+this.random()*18;cat.requestPose('rest');cat.cooldown=1.3;cat.idleFor=this.restFor+3;}
 private select(cat:CatController,o:DesktopObject){
  this.active=o;this.stage='approach';this.age=0;const b=o.bounds,left=cat.position.x<b.x+b.width/2;
  cat.go({x:left?b.x-BODY_HALF_WIDTH:b.x+b.width+BODY_HALF_WIDTH,y:Math.min(cat.clamp({x:cat.position.x,y:b.y+b.height+12}).y,b.y+b.height+12)},108,'icon');
 }
 choose(cat:CatController,objects:DesktopObject[],mouse:V2|null,dt:number,enabled:boolean){
  this.delay=Math.max(0,this.delay-dt);
  if(!enabled||cat.dragging||cat.paused||!cat.autonomy){if(this.active&&cat.goalKind==='icon')cat.stop();this.clear();return null;}
  if(mouse&&distance(mouse,cat.headPosition)<150&&this.stage!=='perch'){
   if(this.active&&cat.goalKind==='icon')cat.stop();this.clear();return null;
  }
  // Contacts and newly revealed Dock supports join the same restful behavior.
  if(!this.active&&cat.world.support)this.rest(cat,cat.world.support);
  if(this.active){
   const current=objects.find(o=>o.id===this.active!.id);if(!current){if(cat.goalKind==='icon')cat.stop();this.clear();return null;}this.active=current;
   if(this.stage==='leave'){if(!cat.world.airborne&&cat.world.support&&!cat.transition)this.rest(cat,cat.world.support);else if(!cat.world.airborne&&!cat.world.supportId&&!cat.transition){this.clear();this.delay=16;}return null;}
   if(this.stage==='approach'&&cat.blockedIconId&&cat.blockedIconId!==current.id){const touched=objects.find(o=>o.id===cat.blockedIconId);if(touched)this.active=touched;}
   const b=this.active.bounds;
   if((this.stage==='approach'||this.stage==='inspect')&&cat.world.airborne)this.stage='perch';
   if(this.stage!=='rest'&&cat.world.supportId===this.active.id)this.rest(cat,this.active);
   const contactX=cat.position.x<b.x+b.width/2?b.x-BODY_HALF_WIDTH:b.x+b.width+BODY_HALF_WIDTH;
   const contactY=cat.clamp({x:cat.position.x,y:b.y+b.height+12}).y;
   if(this.stage==='approach'&&((cat.blockedIconId===this.active.id)||(!cat.goal&&cat.speed<2&&distance(cat.position,{x:contactX,y:contactY})<2))){this.stage='inspect';this.age=0;cat.stop();cat.cooldown=0;}
   if(this.stage==='inspect'){
    this.age+=dt;
    if(this.age>.28&&cat.speed<3&&!cat.transition&&cat.mode!=='paw'){if(cat.perch(this.active.id)){this.stage='perch';this.age=0;}else if(this.age>1.2){this.clear();return null;}}
    return null;
   }else if(this.stage==='rest'){
    this.age+=dt;
    if(cat.world.supportId!==this.active.id){this.clear();this.delay=16;return null;}
    // Reserve this rest from the ground wandering timer, but allow real input to wake it.
    cat.idleFor=Math.max(cat.idleFor,2);
    if(this.age>this.restFor&&!cat.transition){const direction=cat.position.x>cat.area.x+cat.area.width*.7?-1:cat.position.x<cat.area.x+cat.area.width*.3?1:this.random()<.5?-1:1;this.stage='leave';cat.go({x:cat.position.x+direction*260,y:Math.min(cat.screenArea.y+cat.screenArea.height-8,b.y+b.height+12)},98,'icon');}
    return null;
   }
  }
  if(!this.active&&!cat.goal&&cat.speed<1&&cat.mode==='idle'&&!cat.transition&&cat.pose==='sit'&&this.delay<=0){
   const eligible=objects.filter(o=>distance(center(o),cat.position)<900).sort((a,b)=>distance(center(a),cat.position)-distance(center(b),cat.position));
   if(eligible.length)this.select(cat,eligible[Math.floor(this.random()*Math.min(4,eligible.length))]);else this.delay=5;
  }
  return this.active&&this.stage==='approach'?center(this.active):null;
 }
 inspect(cat:CatController,objects:DesktopObject[]){
  if(cat.world.support){this.rest(cat,cat.world.support);return true;}
  const selected=[...objects].sort((a,b)=>distance(center(a),cat.position)-distance(center(b),cat.position))[0];
  if(!selected)return false;this.select(cat,selected);this.delay=0;return true;
 }
}
export const center=(o:DesktopObject):V2=>({x:o.bounds.x+o.bounds.width/2,y:o.bounds.y+o.bounds.height/2});
