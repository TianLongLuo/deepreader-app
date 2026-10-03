import type {ReadingProgressSnapshot} from './progress-sync';
export type RestoreReason='initial'|'flow'|'typography'|'resize'|'projection';
export type RestorePhase='loading'|'restoring'|'ready'|'error';
export type RestoreProof='displayed'|'projection-rebound'|'geometry-stable'|'rendered';
export function createReadingRestoreController(){
 let phase:RestorePhase='loading',generation=0,confirmed:ReadingProgressSnapshot|null=null,anchor:ReadingProgressSnapshot|null=null,contained=false;
 const proofs=new Set<RestoreProof>();
 const ready=()=>{if(phase==='restoring'&&contained&&proofs.size===4){phase='ready';confirmed=anchor?{...anchor}:confirmed;}};
 return {
  phase:()=>phase,generation:()=>generation,
  seedConfirmed(snapshot:ReadingProgressSnapshot){if(!confirmed&&snapshot.location)confirmed={...snapshot};},
  begin(snapshot:ReadingProgressSnapshot,_reason:RestoreReason){generation++;anchor={...snapshot};phase='restoring';contained=false;proofs.clear();return generation;},
  mark(gen:number,proof:RestoreProof){if(gen!==generation||phase!=='restoring')return;proofs.add(proof);ready();},
  relocated(gen:number,range:{start:string;end:string},contains:(range:{start:string;end:string},anchor:string)=>boolean){if(gen!==generation||phase!=='restoring'||!anchor?.location)return;contained=contains(range,anchor.location);ready();},
  confirmProgress(gen:number,snapshot:ReadingProgressSnapshot){if(gen!==generation||phase!=='ready'||!snapshot.location)return false;confirmed={...snapshot};return true;},
  lastConfirmed:()=>confirmed?{...confirmed}:null,
  fail(gen:number,_error:unknown){if(gen===generation)phase='error';},
 };
}
