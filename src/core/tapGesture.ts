import {distance,type V2} from './math';
/** Two completed, undragged taps. Does not depend on OS/Chromium clickCount. */
export class TapGesture {
 private previous:{point:V2;at:number}|null=null;
 holdUntil=0;
 get pending(){return this.previous!==null;}
 cancel(){this.previous=null;this.holdUntil=0;}
 down(point:V2){if(this.previous&&distance(point,this.previous.point)>24)this.cancel();this.holdUntil=0;}
 move(point:V2){if(this.previous&&distance(point,this.previous.point)>24)this.cancel();}
 release(point:V2,at:number,moved:number){
  if(moved>=4){this.cancel();return false;}
  const p=this.previous;
  if(p&&at>=p.at&&at-p.at<=650&&distance(point,p.point)<=24){this.cancel();return true;}
  this.previous={point:{...point},at};this.holdUntil=at+650;return false;
 }
 expire(at:number){if(this.holdUntil&&at>=this.holdUntil)this.cancel();}
}
