import { mkdir, writeFile } from 'node:fs/promises';
const host='real-time-real-estate-data2.p.rapidapi.com';
const queries = [
  ['search',{location:'San Diego, CA',page:'1',home_status:'FOR_SALE'}],
  ['agent-search',{location:'san-diego-ca',name:'Julie Pierce Casey',page:'1'}],
  ['agent-properties-sold',{encodedZuid:'X1-ZUxs6j84n4ak95_3mmvm',page:'1'}],
  ['agent-properties-for-rent',{encodedZuid:'X1-ZU12j0quxoelgjt_uwi3',page:'1',include_team:'false'}],
];
await mkdir('tmp',{recursive:true});
for(const [path,params] of queries){
  try {
    const r=await fetch(`https://${host}/zillow/${path}?${new URLSearchParams(params)}`,{headers:{'x-rapidapi-host':host,'x-rapidapi-key':process.env.RAPIDAPI_KEY},redirect:'error',signal:AbortSignal.timeout(45000)});
    const j=await r.json();
    if(r.ok) await writeFile(`tmp/rapidapi-${path}.json`,JSON.stringify(j,null,2),{mode:0o600});
    console.log(JSON.stringify({path,httpStatus:r.status,status:j.status,dataKeys:Object.keys(j.data||{}),sample:JSON.stringify(j.data).slice(0,3500)}));
  }catch { console.log(JSON.stringify({path,error:'request_failed'})); }
}
