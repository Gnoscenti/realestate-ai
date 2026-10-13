// Explicit operator task. Default is read-only; --apply writes production env/settings.
// Never print response bodies, credentials, or environment values.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PROJECT = "prj_iTHheNQygwNcQGy20gfWS5uAKOUj";
const TEAM = "team_5dxP6z6Zgv8qgjjSzKByZ9w1";
const ORIGIN = "https://cloud-realtor.vercel.app";
const PROVIDER_KEYS = ["XAI_API_KEY","OPENAI_API_KEY","PERPLEXITY_API_KEY","GEMINI_API_KEY","RAPIDAPI_KEY"];
const OPTIONAL_KEYS = ["STRIPE_SECRET_KEY","BETA_ACCESS_CODES","GROK_AUTH_CLIENT_ID","GROK_AUTH_CLIENT_SECRET"];
const REQUIRED = ["DATABASE_URL","BETTER_AUTH_SECRET","BETTER_AUTH_URL"];
const SETTINGS = { framework:null, rootDirectory:null, outputDirectory:null, nodeVersion:"22.x",
  installCommand:"npx --yes npm@12.0.0 ci",buildCommand:"npx --yes npm@12.0.0 run build" };
const apply = process.argv.includes("--apply");
async function fileEnv(name) {
  try { return parseEnv(await readFile(path.join(ROOT,name),"utf8")); }
  catch (error) { if (error.code==="ENOENT") return {}; throw new Error("Could not read local environment file."); }
}
async function cliToken() {
  if (process.env.VERCEL_TOKEN?.trim()) return process.env.VERCEL_TOKEN.trim();
  const candidates = process.platform==="win32" ? [
    path.join(process.env.LOCALAPPDATA || homedir(),"com.vercel.cli","Data","auth.json"),
    path.join(process.env.APPDATA || homedir(),"com.vercel.cli","auth.json"),
  ] : [path.join(process.env.XDG_DATA_HOME || path.join(homedir(),".local","share"),"com.vercel.cli","auth.json")];
  for (const candidate of candidates) {
    try { const data=JSON.parse(await readFile(candidate,"utf8")); if(typeof data.token==="string" && data.token) return data.token; }
    catch(error) { if(error.code!=="ENOENT") throw new Error("Vercel CLI authentication file is unreadable."); }
  }
  return "";
}
async function main() {
  const local={...await fileEnv(".env"),...await fileEnv(".env.local")};
  const token=await cliToken();
  const keys=[...PROVIDER_KEYS,...OPTIONAL_KEYS].filter(key=>local[key]?.trim());
  console.log(JSON.stringify({project:"cloud-realtor",projectId:PROJECT,teamId:TEAM,
    mode:apply?"apply":"read-only",localKeys:keys,ignoredLocalKeys:Object.keys(local).filter(key=>!keys.includes(key) && !REQUIRED.includes(key)),settings:SETTINGS}));
  if (!token) throw new Error("Vercel write authentication is unavailable. Run npx vercel login in this terminal, or set VERCEL_TOKEN privately, then rerun. No remote changes made.");
  async function api(endpoint, method="GET", body) {
    const u=new URL("https://api.vercel.com"+endpoint);u.searchParams.set("teamId",TEAM);
    const response=await fetch(u,{method,redirect:"error",signal:AbortSignal.timeout(30000),
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok) throw new Error("Vercel "+method+" failed with HTTP "+response.status+". Response body intentionally withheld.");
    try{return await response.json();}catch{throw new Error("Vercel returned an invalid JSON response.");}
  }
  const project=await api("/v9/projects/"+PROJECT);
  if(project.id!==PROJECT || project.name!=="cloud-realtor" || project.link?.type!=="github" ||
     project.link?.org!=="Gnoscenti" || project.link?.repo!=="realestate-ai")
    throw new Error("Project Git linkage did not match Gnoscenti/realestate-ai. No changes made.");
  const remote=await api("/v10/projects/"+PROJECT+"/env?decrypt=false");
  if(!Array.isArray(remote.envs)) throw new Error("Unexpected Vercel environment-list shape; refusing changes.");
  const production=remote.envs.filter(e=>e.target?.includes("production"));
  const present=new Set(production.map(e=>e.key));
  console.log(JSON.stringify({gitRepository:"Gnoscenti/realestate-ai",productionEnvironmentKeys:[...present].sort(),
    settingsChanges:Object.keys(SETTINGS).filter(key=>project[key]!==SETTINGS[key])}));
  // Do not overwrite database connections, encryption secrets or an existing canonical origin.
  // Supply missing required values privately; changing existing auth secrets is a separate rotation.
  const missing=REQUIRED.filter(key=>!present.has(key) && !local[key]?.trim());
  if(missing.length) throw new Error("Missing required production configuration: "+missing.join(", ")+". No changes made.");
  if(!present.has("BETTER_AUTH_URL") && local.BETTER_AUTH_URL!==ORIGIN)
    throw new Error("A new BETTER_AUTH_URL must match "+ORIGIN+". No changes made.");
  if(!present.has("BETTER_AUTH_SECRET") && local.BETTER_AUTH_SECRET.trim().length<32)
    throw new Error("The missing production auth secret needs at least 32 random characters. No changes made.");
  if(!present.has("DATABASE_URL")) {
    let u;try{u=new URL(local.DATABASE_URL);}catch{throw new Error("Invalid production DATABASE_URL.");}
    if(!["postgres:","postgresql:"].includes(u.protocol) || /^(localhost|127\.|\[?::1\]?)/.test(u.hostname) || /_tests?$/.test(u.pathname))
      throw new Error("Refusing a local/test database for production.");
  }
  if(local.STRIPE_SECRET_KEY && !local.STRIPE_SECRET_KEY.startsWith("sk_live_"))
    throw new Error("Refusing a non-live Stripe key for production. Keep test credentials in a separate file/environment.");
  const additions=REQUIRED.filter(key=>!present.has(key));
  const payload=[...keys,...additions].map(key=>({key,value:local[key],type:"sensitive",target:["production"]}));
  payload.push({key:"VITE_AUTH_ENABLED",value:"true",type:"plain",target:["production"]});
  console.log(JSON.stringify({environmentKeysToWrite:payload.map(e=>e.key),requiredKeysPreserved:REQUIRED.filter(key=>present.has(key)),
    paidAccessConfigured:present.has("STRIPE_SECRET_KEY") || present.has("BETA_ACCESS_CODES") || keys.includes("STRIPE_SECRET_KEY") || keys.includes("BETA_ACCESS_CODES")}));
  if(!apply) {console.log("Read-only preflight complete. Use --apply to write these keys/settings; this command never deploys, migrates, commits or pushes.");return;}
  const result=await api("/v10/projects/"+PROJECT+"/env?upsert=true","POST",payload);
  if(result.error || (Array.isArray(result.failed) && result.failed.length)) throw new Error("Vercel reported an environment write failure; recheck before release.");
  await api("/v9/projects/"+PROJECT,"PATCH",SETTINGS);
  const verified=await api("/v9/projects/"+PROJECT);
  if(Object.keys(SETTINGS).some(key=>verified[key]!==SETTINGS[key])) throw new Error("Project settings read-back differed. Do not release yet.");
  const check=await api("/v10/projects/"+PROJECT+"/env?decrypt=false");
  if(!Array.isArray(check.envs) || payload.some(p=>!check.envs.some(e=>e.key===p.key && e.target?.includes("production"))))
    throw new Error("Environment key read-back failed. Do not release yet.");
  console.log("Production environment key presence and project settings verified. Values were never printed. Database migration/backup and hosted smoke checks remain separate release steps.");
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Production setup failed.");process.exitCode=1;});
