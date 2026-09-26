// Read-only diagnostics. Keys come from the environment; output contains no keys.
import { mkdir, writeFile } from 'node:fs/promises';
const configs = [
  ['rapidapi', 'https://real-time-real-estate-data2.p.rapidapi.com/zillow/agent-properties-for-sale?encodedZuid=X1-ZUxs6j84n4ak95_3mmvm&page=1&include_team=false', {'x-rapidapi-host':'real-time-real-estate-data2.p.rapidapi.com', 'x-rapidapi-key':process.env.RAPIDAPI_KEY}],
  ['xai', 'https://api.x.ai/v1/models', {Authorization:`Bearer ${process.env.XAI_API_KEY}`}],
  ['gemini', 'https://generativelanguage.googleapis.com/v1beta/models', {'x-goog-api-key':process.env.GEMINI_API_KEY}],
];
await mkdir('tmp', {recursive:true});
await Promise.all(configs.map(async ([provider,url,headers])=>{
  try {
    const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(45000)});
    const json=await r.json();
    const result={provider,httpStatus:r.status,keys:Object.keys(json),code:json.error?.status || json.error?.code};
    if(r.ok){
      if(provider==='rapidapi') {
        await writeFile('tmp/rapidapi-sample.json',JSON.stringify(json,null,2),{mode:0o600});
        result.sampleSaved=true;
      } else result.models=(json.data||json.models||[]).map(x=>x.id||x.name);
    }
    console.log(JSON.stringify(result));
  } catch {console.log(JSON.stringify({provider,error:'request_failed'}));}
}));
