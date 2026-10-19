import {clamp,distance,lerp,type V2} from './math';
import {SurfaceWorld} from './surfaces';
import {STRIDE} from './gait';
export type Pose='sit'|'rest'|'sleep'|'groom';
export type TransitionClip='settle'|'curl'|'groom';
export type Transition={clip:TransitionClip;reverse:boolean;age:number;duration:number;from:Pose;to:Pose};
export const PAW_DURATION=.96;
export const STRIDE_DISTANCE=STRIDE;
export function pawFrameAt(age:number){const t=clamp(age,0,PAW_DURATION);return t<.10?0:t<.25?1:t<.40?2:t<.52?3:t<.78?4:5;}
export class CatController {
 position:V2;velocity:V2={x:0,y:0};goal:V2|null=null;direction=-1;pawDirection=1;phase=0;travel=0;
 pose:Pose='sit';mode='idle';age=0;dwell=0;cooldown=0;idleFor=3;attention=0;dragging=false;paused=false;autonomy=true;speedLimit=108;near=false;
 idleHistory:Pose[]=[];behaviorHistory:string[]=[];lastMouse:V2|null=null;mouseVelocity:V2={x:0,y:0};goalKind:'mouse'|'icon'='mouse';
 fatigue=.25;curiosity=.65;affinity=.5;blockedIconId:string|null=null;blockedFor=0;world:SurfaceWorld;
 transition:Transition|null=null;desiredPose:Pose='sit';private afterFlight:{p:V2;speed:number;kind:'mouse'|'icon'}|null=null;private pendingGo:{p:V2;speed:number;kind:'mouse'|'icon'}|null=null;
 walkPreparation=0;motionSpeed=0;
 constructor(public area:{x:number,y:number,width:number,height:number},private random:()=>number=Math.random,public screenArea=area){
  this.position={x:area.x+area.width*.5,y:area.y+area.height*.65};this.world=new SurfaceWorld(screenArea);
 }
 rescaleWorld(factor:number){
  const point=(p:V2)=>({x:p.x*factor,y:p.y*factor});
  this.position=point(this.position);this.velocity=point(this.velocity);this.motionSpeed*=factor;this.travel*=factor;
  if(this.goal)this.goal=point(this.goal);
  if(this.pendingGo)this.pendingGo.p=point(this.pendingGo.p);
  if(this.afterFlight)this.afterFlight.p=point(this.afterFlight.p);
  if(this.lastMouse)this.lastMouse=point(this.lastMouse);
  this.world.rescaleWorld(factor);
 }
 clamp(p:V2){const a=this.area,padding=this.world.supportId||this.world.airborne||this.pose==='rest'||this.pose==='sleep'?76:145;return{x:clamp(p.x,a.x+padding,a.x+a.width-padding),y:clamp(p.y,a.y+185,Math.max(a.y+a.height-55,this.screenArea.y+this.screenArea.height-(this.screenArea===a?55:8)))};}
 place(p:V2){this.motionSpeed=0;this.walkPreparation=0;this.position=this.clamp(p);this.velocity={x:0,y:0};this.goal=null;this.pendingGo=null;this.afterFlight=null;this.mode='idle';this.age=0;this.idleFor=5;this.dwell=0;this.cooldown=1.5;this.pose='sit';this.desiredPose='sit';this.transition=null;this.blockedIconId=null;this.world.clear();}
 requestPose(p:Pose){
  this.desiredPose=p;this.goal=null;this.pendingGo=null;this.afterFlight=null;
  if(this.transition||this.speed>2)return;
  this.beginPoseStep();
 }
 private beginPoseStep(){
  if(this.pose===this.desiredPose){this.transition=null;this.mode='idle';return;}
  let next:Pose,clip:TransitionClip,reverse=false,duration:number,startAge=0;
  if(this.pose==='sleep'){next='rest';clip='curl';reverse=true;duration=.70;}
  else if(this.pose==='groom'){next='sit';clip='groom';reverse=true;duration=.9;startAge=(1-((this.age*3)%5)/5)*duration;}
  else if(this.pose==='rest'&&this.desiredPose!=='sleep'){next='sit';clip='settle';reverse=true;duration=.65;}
  else if(this.pose==='rest'){next='sleep';clip='curl';duration=.85;}
  else if(this.desiredPose==='groom'){next='groom';clip='groom';duration=.70;}
  else {next='rest';clip='settle';duration=.70;}
  this.transition={clip,reverse,age:startAge,duration,from:this.pose,to:next};this.mode='transition';this.age=0;
 }
 go(p:V2,speed=108,kind:'mouse'|'icon'='mouse'){
  this.goalKind=kind;this.blockedIconId=null;this.blockedFor=0;
  if(this.pose!=='sit'||this.transition){const pending={p:this.clamp(p),speed,kind};this.requestPose('sit');this.pendingGo=pending;return;}
  if(this.world.supportId){this.direction=p.x<this.position.x?-1:1;if(this.world.startLeave(this.position,this.direction)){this.afterFlight={p:this.clamp(p),speed,kind};this.stop();this.mode='hop';return;}}
  if(this.speed<3){this.walkPreparation=.32;this.direction=p.x<this.position.x?-1:1;}
  this.desiredPose='sit';this.goal=this.clamp(p);this.speedLimit=speed;this.mode='walk';this.age=0;
 }
 stop(immediate=false){this.goal=null;this.pendingGo=null;if(immediate)this.afterFlight=null;this.walkPreparation=0;if(immediate){this.velocity={x:0,y:0};this.motionSpeed=0;if(['walk','retreat'].includes(this.mode))this.mode='idle';}}
 get walkingVisual(){return this.pose==='sit'&&!this.transition&&!this.paused&&!this.dragging&&!this.world.airborne&&this.mode!=='blocked'&&(this.motionSpeed>3||!!this.goal&&this.walkPreparation>0);}
 get speed(){return Math.hypot(this.velocity.x,this.velocity.y);}
 get pawFrame(){return pawFrameAt(this.age);}
 get headPosition(){
  const moving=this.walkingVisual,height=(p:Pose)=>p==='rest'?62:p==='sleep'?38:126;
  const y=this.transition?lerp(height(this.transition.from),height(this.transition.to),this.transitionProgress):moving?109:height(this.pose);
  return{x:this.position.x+(moving?this.direction*72:0),y:this.position.y-y};
 }
 get transitionProgress(){return this.transition?clamp(this.transition.age/this.transition.duration,0,1):0;}
 perch(id:string){if(this.transition||this.speed>3)return false;if(!this.world.startPerch(id,this.position))return false;this.stop();this.mode='hop';this.age=0;this.pose='sit';this.desiredPose='sit';this.blockedIconId=null;return true;}
 private remember(action:string){this.behaviorHistory.push(action);if(this.behaviorHistory.length>6)this.behaviorHistory.shift();}
 private decide(mouse:V2|null,head:V2){
  const options=[{action:'walk',weight:.45+this.curiosity*.7},{action:'rest',weight:.18+this.fatigue*.9},{action:'sleep',weight:this.fatigue>.45?.15+this.fatigue*.65:.02},{action:'sit',weight:.18},{action:'groom',weight:.2}];
  if(mouse&&distance(mouse,head)<360)options.push({action:'follow',weight:.35+this.affinity*.5});
  for(const o of options){const repeats=this.behaviorHistory.filter(h=>h===o.action).length;o.weight*=Math.pow(.35,repeats);if(o.action===this.behaviorHistory.at(-1))o.weight*=.2;}
  let ticket=this.random()*options.reduce((n,o)=>n+o.weight,0);const action=options.find(o=>(ticket-=o.weight)<=0)?.action||'sit';this.remember(action);
  if(action==='walk'||action==='follow'){
   const sign=this.position.x>this.area.x+this.area.width*.7?-1:this.position.x<this.area.x+this.area.width*.3?1:this.random()<.5?-1:1;
   const target=action==='follow'&&mouse?{x:mouse.x+(mouse.x>head.x?-74:74),y:this.position.y+clamp(mouse.y-head.y,-20,20)}:{x:this.position.x+sign*(95+this.random()*280),y:this.position.y+(this.random()-.5)*24};
   this.go(target,action==='follow'?80:85+this.random()*38);this.cooldown=1.2;
  }else{
   this.requestPose(action as Pose);this.idleHistory.push(action as Pose);this.idleFor=action==='sleep'?14+this.random()*24:action==='rest'?8+this.random()*13:4+this.random()*8;
  }
 }
 update(dt:number,mouse:V2|null,head:V2,pointerSpeed=0,closing=0,targetKind:'mouse'|'icon'='mouse'){
  dt=clamp(dt,0,.05);this.motionSpeed=0;if(this.paused||this.dragging)return;this.age+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
  const d=mouse?distance(mouse,head):Infinity,contactRange=targetKind==='icon'?108:70;
  this.attention=lerp(this.attention,d<310?1:0,1-Math.exp(-dt*6));this.near=d<contactRange;
  this.fatigue=clamp(this.fatigue+dt*(this.speed>4?.013:this.pose==='sleep'?-.024:this.pose==='rest'?-.010:.001),0,1);
  this.curiosity=clamp(this.curiosity+dt*(d<300?.013:-.003),.2,1);this.affinity=clamp(this.affinity+dt*(d<90&&pointerSpeed<110?.008:-.0008),.2,1);
  if(mouse){this.lastMouse={...mouse};}
  if(this.transition&&this.world.supportId){this.position=this.world.resolve(this.position,this.position,dt);}
  if(this.transition){
   this.velocity.x*=Math.exp(-dt*10);this.velocity.y*=Math.exp(-dt*10);this.transition.age+=dt;
   if(this.transition.age>=this.transition.duration){this.pose=this.transition.to;this.transition=null;this.beginPoseStep();if(!this.transition&&this.pendingGo){const g=this.pendingGo;this.pendingGo=null;this.go(g.p,g.speed,g.kind);}}
  }else if(this.pose!==this.desiredPose&&this.speed<2)this.beginPoseStep();
  if(this.world.airborne){
   const before={...this.position};this.position=this.world.resolve(before,before,dt);this.velocity={x:0,y:0};this.mode=this.world.airborne?'hop':'idle';
   if(this.world.landed){this.idleFor=8+this.random()*8;if(this.world.supportId){this.afterFlight=null;this.requestPose('rest');}else if(this.afterFlight){const g=this.afterFlight;this.afterFlight=null;this.go(g.p,g.speed,g.kind);}}return;
  }
  if(this.transition)return;
  if(d>contactRange+35){this.dwell=0;if(this.mode==='sniff'||this.mode==='paw'){this.mode='recover';this.age=0;this.cooldown=2;}}
  if(mouse&&d<100&&pointerSpeed>350&&closing>150&&this.cooldown<=0){const dx=this.position.x-mouse.x;this.go({x:this.position.x+(dx<0?-1:1)*clamp(pointerSpeed*.18,95,160),y:this.position.y},115);if(!this.transition)this.mode='retreat';this.cooldown=4;this.dwell=0;}
  // A resting cat wakes before reaching, instead of instantly exchanging its whole pose.
  if(mouse&&d<contactRange&&pointerSpeed<110&&this.cooldown<=0&&!['retreat','recover','blocked','hop'].includes(this.mode)){
   this.dwell+=dt;if(this.dwell>.25){this.stop();if(this.pose!=='sit')this.requestPose('sit');else{if(this.speed<5&&this.mode!=='sniff'&&this.mode!=='paw'){this.mode='sniff';this.age=0;}if(this.mode==='sniff'&&this.age>.6){this.mode='paw';this.age=0;this.pawDirection=mouse.x<head.x?-1:1;}}}
  }
  if(this.mode==='paw'&&this.age>PAW_DURATION){this.mode='recover';this.age=0;this.cooldown=3+this.random()*3;this.dwell=0;}
  if(this.mode==='recover'&&this.age>.45){this.mode='idle';this.age=0;this.idleFor=2+this.random()*4;}
  if(this.goal&&this.walkPreparation>0){this.walkPreparation=Math.max(0,this.walkPreparation-dt);return;}
  if(this.goal){
   const dx=this.goal.x-this.position.x,dy=this.goal.y-this.position.y,n=Math.hypot(dx,dy),speed=Math.min(this.speedLimit,Math.sqrt(Math.max(0,n-2)*340));
   if(n<.5&&this.speed<4){this.goal=null;this.velocity={x:0,y:0};this.mode='idle';this.idleFor=2+this.random()*5;this.age=0;}
   else{const k=1-Math.exp(-dt*7);this.velocity.x=lerp(this.velocity.x,dx/Math.max(1,n)*speed,k);this.velocity.y=lerp(this.velocity.y,dy/Math.max(1,n)*speed,k);
    // Bound the remaining travel after easing so arrival cannot overshoot and reverse the facing.
    const limit=n*6,v=this.speed;if(v>limit){this.velocity.x*=limit/v;this.velocity.y*=limit/v;}
   }
  }else{const k=Math.exp(-dt*10);this.velocity.x*=k;this.velocity.y*=k;if(this.speed<.6)this.velocity={x:0,y:0};}
  const before={...this.position},desired=this.clamp({x:before.x+this.velocity.x*dt,y:before.y+this.velocity.y*dt});
  this.position=this.world.resolve(before,desired,dt);
  if(this.world.blockedId){this.blockedIconId=this.world.blockedId;this.blockedFor+=dt;this.velocity={x:0,y:0};this.goal=null;this.mode='blocked';this.age=0;}
  else if(this.mode==='blocked'){
   this.blockedFor+=dt;if(this.autonomy&&this.blockedFor>.35&&!this.world.supportId){
    const o=this.world.objects.find(o=>o.id===this.blockedIconId);
    if(o&&this.perch(o.id))return;
    this.go({x:this.position.x-this.direction*(90+this.random()*75),y:this.position.y},80);this.cooldown=2;
   }
  }
  const moved=distance(before,this.position);this.motionSpeed=dt>0?moved/dt:0;if(!this.world.airborne){this.travel+=moved;this.phase+=moved/STRIDE_DISTANCE;}if(Math.abs(this.velocity.x)>4)this.direction=this.velocity.x<0?-1:1;
  if(this.world.landed){this.mode='idle';this.idleFor=7;if(this.world.supportId)this.requestPose('rest');}
  if(!this.goal&&this.speed<1&&this.mode==='walk')this.mode='idle';
  if(!this.goal&&this.speed<1&&this.mode==='idle'&&this.autonomy){
   this.idleFor-=dt;if(this.idleFor<=0)this.decide(mouse,head);
   else if(targetKind==='mouse'&&mouse&&d>95&&d<310&&this.pose==='sit'&&this.age>1.5&&this.cooldown<=0&&this.random()<dt*(.2+this.curiosity*.25)){
    this.go({x:this.position.x+clamp(mouse.x-this.position.x,-180,180),y:this.position.y+clamp(mouse.y-head.y,-18,18)},80);this.cooldown=5;this.remember('follow');
   }
  }
 }
}
