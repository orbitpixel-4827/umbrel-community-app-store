// Same-origin streaming audio: never expose a provider credential to the browser.
export async function narrationStream(body,csrf,{signal,onPCM,fetcher=fetch}={}){
 const response=await fetcher('/api/voice-stream',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Pokedex-CSRF':csrf},body:JSON.stringify(body),signal});
 if(!response.ok){let value;try{value=await response.json();}catch{}throw Error(value?.error||'No se pudo iniciar la narración.');}
 if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')||!response.body)throw Error('El servidor no devolvió audio compatible. Actualiza Pokédex.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',done=false,total=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   total+=part.value.byteLength;if(total>5*1024*1024)throw Error('La narración excedió la duración permitida.');
   pending+=decoder.decode(part.value,{stream:true});
   let end;
   while((end=pending.indexOf('\n'))>=0){
    const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='error')throw Error(event.message||'La narración se interrumpió.');
    if(event.type==='done'){done=true;return;}
    if(event.type!=='audio'||event.rate!==24000||typeof event.pcm!=='string')throw Error('Audio no compatible.');
    const raw=atob(event.pcm);if(raw.length%2)throw Error('Audio incompleto.');
    const data=new Float32Array(raw.length/2);
    for(let i=0;i<data.length;i++){const n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);data[i]=(n>32767?n-65536:n)/32768;}
    await onPCM(data,event.rate);
   }
  }
  if(!done)throw Error('Se cortó la narración. Puedes volver a probar con Voz.');
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
