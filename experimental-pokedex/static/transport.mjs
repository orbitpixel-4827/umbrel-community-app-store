export async function request(path,init={},options={}){
 const read=options.binary?'arrayBuffer':'json',attempts=(init.method||'GET')==='GET'?(options.retries??1)+1:1;
 for(let attempt=0;attempt<attempts;attempt++){
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},options.timeout??12000);
  try{
   const response=await fetch(path,{...init,signal:controller.signal});
   const mime=response.headers.get('Content-Type')||'';
   if(!options.binary&&(!mime.includes('application/json')||response.redirected)){
    const error=Error('El acceso web devolvió una pantalla de inicio de sesión. Abre Umbrel, inicia sesión y vuelve a Pokédex.');error.gateway=true;throw error;
   }
   let data;try{data=await response[response.ok?read:'json']();}catch(err){if(err.name==='AbortError')throw err;const error=Error('La respuesta de Pokédex llegó incompleta. Comprueba la conexión antes de repetir el escaneo.');error.connection=true;throw error;}
   return {response,data};
  }catch(err){
   if(options.signal?.aborted)throw Object.assign(Error('Operación cancelada.'),{name:'AbortError'});
   if(err.gateway)throw err;
   if(attempt+1<attempts)continue;
   const error=Error(timedOut?'Pokédex tardó demasiado en responder. El reconocimiento no se reenvió.':'No se pudo comunicar con Pokédex en esta dirección. Comprueba Tailscale y la conexión HTTPS; tus registros siguen en Umbrel.');error.connection=true;throw error;
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
 }
}

export async function pollJob(job,read,{signal,progress=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),attempts=240}={}){
 let lost=0;
 for(let i=0;i<attempts;i++){
  if(signal?.aborted)throw Object.assign(Error('Operación cancelada.'),{name:'AbortError'});
  let result;
  try{result=await read('/api/scan-jobs/'+job);lost=0;}
  catch(err){if(!err.connection)throw err;if(++lost>=4){err.job=job;throw err;}progress('Recuperando conexión · el análisis no se reenviará');await pause(1500);continue;}
  if(result.state==='done')return result.result;
  if(result.state==='failed'){const error=Error(result.error);error.status=result.status;throw error;}
  if(result.state!=='working')throw Error('No se pudo consultar el progreso del escaneo.');
  progress('Analizando…');await pause(1000);
 }
 const error=Error('El análisis sigue pendiente. Puedes consultar su resultado sin reenviar la imagen.');error.job=job;throw error;
}
