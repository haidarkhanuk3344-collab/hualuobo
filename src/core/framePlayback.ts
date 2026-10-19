/** Frame selection never composites poses or reconstructs body parts. */
export function loopFrame(phase:number,count:number){
 if(count<1)throw new Error('Empty frame sequence');
 const cycle=((phase%1)+1)%1;
 return Math.min(count-1,Math.floor((cycle+1e-9)*count));
}
export function clipFrame(progress:number,count:number){
 if(count<1)throw new Error('Empty frame sequence');
 return Math.round(Math.max(0,Math.min(1,progress))*(count-1));
}
/** Bounded substeps preserve elapsed time on a late render without unstable physics. */
export function timeSteps(elapsed:number){
 const time=Math.max(0,Math.min(.15,elapsed)),n=Math.max(1,Math.ceil(time/(1/60)));
 return Array.from({length:n},()=>time/n);
}
