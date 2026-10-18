/** Idempotent owned-fixture cleanup; injectable effects keep failure paths testable. */
export function ownedCleanup({closeServers,closePool,stopChildren,inspectLabel,removeContainer,name}) {
 let pending;
 return ()=>pending??=(async()=>{
  const failures=[];
  for(const effect of [closeServers,closePool,stopChildren,async()=>{
   if(await inspectLabel()!==name)throw Error('Refusing cleanup of container without matching fixture label');
   await removeContainer();
  }])try{await effect();}catch(error){failures.push(error);}
  if(failures.length)throw new AggregateError(failures,'Fixture cleanup failed');
 })();
}
