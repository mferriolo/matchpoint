import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}
const SU=Deno.env.get("SUPABASE_URL")!,SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb=createClient(SU,SK);
const CB="https://app.crelate.com/api3",BO=Deno.env.get("CRELATE_OPPORTUNITY_TYPE_ID")||"91835d38-fcfd-4128-10d3-f959ef60dc08",SL=Deno.env.get("CRELATE_SALES_WORKFLOW_STATUS_ID")||"05bdf87b-cdde-48d2-bfe7-aa6a0126d947",DL=400;
const W=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const UI=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok=(v:any)=>typeof v==='string'&&UI.test(v);
const N=(s:string)=>(s||'').toLowerCase().trim().replace(/[,.\-&()'"""''\/\\]/g,' ').replace(/\s+/g,' ').trim();
const bad=(s:string)=>{const n=(s||'').trim().toLowerCase();return!n||n==='undefined'||n==='null'||n==='n/a'||n.length<2;};
const sm=(a:string,b:string)=>{const na=N(a),nb=N(b);if(!na||!nb)return false;if(na===nb)return true;if(nb.startsWith(na+' ')||na.startsWith(nb+' '))return true;const s=na.length<=nb.length?na:nb,l=na.length<=nb.length?nb:na;return s.length>=4&&l.includes(s);};
async function G(p:string,k:string,q:Record<string,string>={}){const u=new URL(`${CB}${p}`);for(const[a,b]of Object.entries(q))u.searchParams.set(a,b);for(let i=0;i<=2;i++){try{const r=await fetch(u.toString(),{method:'GET',headers:{'X-Api-Key':k,'Accept':'application/json'}});if(r.status===429){await W(3000*(i+1));continue;}if(!r.ok){console.log(`[v55] GET ${p} failed: HTTP ${r.status}`);return null;}return await r.json();}catch(e){console.log(`[v55] GET ${p} exception: ${(e as Error).message}`);await W(2000);}}return null;}
async function Po(p:string,k:string,e:any){for(let i=0;i<=2;i++){try{const r=await fetch(`${CB}${p}`,{method:'POST',headers:{'X-Api-Key':k,'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({entity:e})});if(r.status===429){await W(3000*(i+1));continue;}const t=await r.text();let d:any;try{d=JSON.parse(t);}catch{d=t;}return{ok:r.ok,data:d,status:r.status,err:r.ok?undefined:(d?.Errors?.[0]?.Message||`HTTP ${r.status}`),rawBody:t};}catch{await W(2000);}}return{ok:false,err:'retry',status:0,rawBody:''};}
async function Pa(p:string,k:string,e:any){for(let i=0;i<=2;i++){try{const r=await fetch(`${CB}${p}`,{method:'PATCH',headers:{'X-Api-Key':k,'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({entity:e})});if(r.status===429){await W(3000*(i+1));continue;}if(!r.ok){await r.text();return{ok:false};}return{ok:true};}catch{await W(2000);}}return{ok:false};}
const xI=(d:any)=>{if(!d)return'';if(typeof d==='string'&&ok(d))return d;if(typeof d.Data==='string'&&ok(d.Data))return d.Data;if(d.Data?.Id&&ok(d.Data.Id))return d.Data.Id;if(d.Id&&ok(d.Id))return d.Id;return'';};
async function safeDbUpdate(table:string,updates:Record<string,any>,col:string,val:string){try{const{error}=await sb.from(table).update(updates).eq(col,val);if(error)console.log(`[v55] DB update error (${table}): ${error.message}`);}catch(e){console.log(`[v55] DB update exception (${table}): ${(e as Error).message}`);}}
const CC:Record<string,string>={};
let allCrelateCompanies:Array<{id:string;name:string;n:string}>=[];
let companiesLoadedAt=0;
let companyCacheLoading=false;
const COMPANY_CACHE_TTL=10*60*1000;
async function loadAllCrelateCompanies(k:string):Promise<void>{
  if(allCrelateCompanies.length>0&&(Date.now()-companiesLoadedAt)<COMPANY_CACHE_TTL)return;
  companyCacheLoading=true;
  const seen=new Set<string>();const companies:typeof allCrelateCompanies=[];
  for(let skip=0;skip<2000;skip+=50){
    const r=await G('/companies',k,{limit:'50',offset:String(skip)});
    await W(DL);
    if(!r?.Data||!Array.isArray(r.Data)||r.Data.length===0)break;
    let newInPage=0;
    for(const c of r.Data){
      if(!c.Id||!ok(c.Id)||!c.Name||seen.has(c.Id))continue;
      seen.add(c.Id);
      companies.push({id:c.Id,name:c.Name,n:N(c.Name)});
      newInPage++;
    }
    if(newInPage===0)break;
  }
  allCrelateCompanies=companies;
  companiesLoadedAt=Date.now();
  companyCacheLoading=false;
  console.log(`[v54] Loaded ${allCrelateCompanies.length} Crelate companies into cache`);
}
async function lCC(){const{data}=await sb.from('marketing_companies').select('company_name,crelate_id').not('crelate_id','is',null);if(data)for(const r of data)if(r.crelate_id&&ok(r.crelate_id)&&r.company_name)CC[r.company_name.toLowerCase().trim()]=r.crelate_id;}

async function rC(n:string,k:string):Promise<{id:string|null;log:string;error?:string;_409Debug?:any}>{
  if(!n||bad(n))return{id:null,log:'bad'};const c=n.toLowerCase().trim();
  if(CC[c])return{id:CC[c],log:'$'};
  for(const[x,v]of Object.entries(CC))if(sm(n,x)){CC[c]=v;return{id:v,log:'$f'};}
  try{const r=await G('/companies',k,{name:n,limit:'50'});await W(DL);if(r?.Data)for(const x of r.Data)if(x.Id&&ok(x.Id)&&x.Name&&sm(n,x.Name)){CC[c]=x.Id;await safeDbUpdate('marketing_companies',{crelate_id:x.Id},'company_name',n);return{id:x.Id,log:'s'};}}catch{}
  if(!n||!n.trim())return{id:null,log:'x:empty-name',error:'Company name is empty or undefined'};
  try{const r=await Po('/companies',k,{Name:n});await W(DL);
    if(r.ok){const id=xI(r.data);if(id){CC[c]=id;await safeDbUpdate('marketing_companies',{crelate_id:id},'company_name',n);return{id,log:'+'};}else return{id:null,log:'x:no-id',error:`POST OK but no ID. Body: ${(r.rawBody||'').substring(0,200)}`};}
    else{
      if(r.status===409){
        if(companyCacheLoading){await W(2000);}
        companiesLoadedAt=0;
        await loadAllCrelateCompanies(k);
        for(const co of allCrelateCompanies){
          if(co.n===N(n)||sm(n,co.name)){
            CC[c]=co.id;
            await safeDbUpdate('marketing_companies',{crelate_id:co.id},'company_name',n);
            return{id:co.id,log:'409+cache'};
          }
        }
        return{id:null,log:'x:409-nf',error:`409 duplicate but not found in full company cache (${allCrelateCompanies.length} companies loaded). Input="${n}"`};
      }
      console.log(`[v54] COMPANY CREATE FAILED: Status=${r.status}, err=${r.err}`);return{id:null,log:`x:${r.status}`,error:`HTTP ${r.status} - ${r.err}`};}
  }catch(e){return{id:null,log:'x:exc',error:`Exception: ${(e as Error).message}`};}
}
interface TitleMapping{tracker_title:string;crelate_title:string;crelate_title_id:string|null;}
let titleMappings:TitleMapping[]=[];let titleMappingsLoadedAt=0;const MAPPING_CACHE_TTL=5*60*1000;
async function loadTitleMappings():Promise<void>{
  if(titleMappings.length>0&&(Date.now()-titleMappingsLoadedAt)<MAPPING_CACHE_TTL)return;
  const{data,error}=await sb.from('crelate_title_mappings').select('tracker_title,crelate_title,crelate_title_id');
  if(error){console.error('[v54] Error loading title mappings:',error.message);return;}
  titleMappings=(data||[]).map((r:any)=>({tracker_title:(r.tracker_title||'').toLowerCase().trim(),crelate_title:r.crelate_title||'',crelate_title_id:r.crelate_title_id||null}));
  titleMappingsLoadedAt=Date.now();console.log(`[v54] Loaded ${titleMappings.length} title mappings`);
}
function checkTitleMapping(title:string):{id:string|null;crelateTitle:string|null}{
  const nt=(title||'').toLowerCase().trim();if(!nt)return{id:null,crelateTitle:null};
  for(const m of titleMappings){if(m.tracker_title===nt)return{id:m.crelate_title_id,crelateTitle:m.crelate_title};}
  const nn=N(title);for(const m of titleMappings){if(N(m.tracker_title)===nn)return{id:m.crelate_title_id,crelateTitle:m.crelate_title};}
  return{id:null,crelateTitle:null};
}
interface CachedTitle{id:string;title:string;n:string;words:Set<string>;}
let allTitles:CachedTitle[]=[];let titlesLoadedAt=0;let titleLoadApiCalls=0;const TITLE_CACHE_TTL=10*60*1000;
async function loadAllJobTitles(k:string):Promise<void>{
  if(allTitles.length>0&&(Date.now()-titlesLoadedAt)<TITLE_CACHE_TTL)return;
  const startMs=Date.now();const seen=new Set<string>();const newTitles:CachedTitle[]=[];let apiCalls=0;let noNewCount=0;
  for(let skip=0;skip<5000;skip+=100){const r=await G('/jobtitles',k,{limit:'100',offset:String(skip)});apiCalls++;await W(DL);if(!r?.Data||!Array.isArray(r.Data)||r.Data.length===0)break;let newInPage=0;for(const j of r.Data){if(!j.Id||!ok(j.Id)||!j.Title||seen.has(j.Id))continue;seen.add(j.Id);const n=N(j.Title);const words=new Set(n.split(/\s+/).filter((w:string)=>w.length>1));newTitles.push({id:j.Id,title:j.Title,n,words});newInPage++;}if(newInPage===0){noNewCount++;if(noNewCount>=2)break;}else{noNewCount=0;}}
  allTitles=newTitles;titlesLoadedAt=Date.now();titleLoadApiCalls=apiCalls;
  console.log(`[v54] Loaded ${allTitles.length} titles in ${Date.now()-startMs}ms (${apiCalls} calls)`);
}
const JC:Record<string,string>={};
const RL=['nurse practitioner','registered nurse','licensed practical nurse','certified nursing assistant','medical assistant','physician assistant','physical therapist','occupational therapist','speech language pathologist','respiratory therapist','radiologic technologist','pharmacy technician','pharmacist','medical director','physician','surgeon','psychiatrist','psychologist','social worker','counselor','therapist','dietitian','paramedic','sonographer','lab technician','phlebotomist','medical coder','case manager','care coordinator','clinical director','director of nursing','nurse manager','staff nurse','travel nurse','home health aide','hospice nurse','icu nurse','oncology nurse','pediatric nurse','practice manager','office manager','clinic manager','administrator','receptionist','billing specialist','health educator','behavioral health','mental health','lcsw','lpc','cna','rn','lpn','lvn','np','pa','pt','ot','slp','rt','aprn','crna','fnp','pmhnp','dnp','technician','technologist','specialist','coordinator','manager','director','supervisor','analyst','aide','assistant'];
const BASE_ROLE_ALIASES:Record<string,{id:string;title:string}>={'medical director':{id:'7ffda791-4486-4039-aa49-85de08045547',title:'Chief Medical Officer - St. John Hospital'}};
const sT=(t:string)=>t.replace(/\s*[-\u2013\u2014]\s*[A-Z][a-zA-Z\s,]+$/,'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/,?\s+[A-Z]{2}\s*$/,'').replace(/\b(full[\s-]?time|part[\s-]?time|prn|per diem|temp|contract|travel|remote|hybrid|onsite|urgent|immediate)\b/gi,'').replace(/\b(day shift|night shift|evening shift|rotating|weekends?)\b/gi,'').replace(/^[\s\-\u2013\u2014]+|[\s\-\u2013\u2014]+$/g,'').replace(/\s+/g,' ').trim();
const gR=(t:string)=>{const l=t.toLowerCase();for(const r of[...RL].sort((a,b)=>b.length-a.length))if(l.includes(r))return r.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');return null;};
const wO=(aWords:Set<string>,bWords:Set<string>):number=>{if(!aWords.size||!bWords.size)return 0;let o=0;for(const w of aWords)if(bWords.has(w))o++;return(o/aWords.size)*0.7+(o/bWords.size)*0.3;};
const toWords=(s:string):Set<string>=>new Set(N(s).split(/\s+/).filter(w=>w.length>1));
interface Top3Candidate{title:string;score:number;method:string;}
async function rJ(t:string,k:string):Promise<{id:string|null;log:string;mt?:string;bestScore?:number;bestCandidate?:string;simplified?:string;baseRole?:string;top3?:Top3Candidate[]}>{
  if(!t||bad(t))return{id:null,log:'bad'};const c=t.toLowerCase().trim();
  if(JC[c])return{id:JC[c],log:'$'};
  await loadTitleMappings();const mapping=checkTitleMapping(t);
  if(mapping.id&&ok(mapping.id)){JC[c]=mapping.id;return{id:mapping.id,log:'map',mt:mapping.crelateTitle||undefined};}
  if(mapping.crelateTitle){await loadAllJobTitles(k);const nc=N(mapping.crelateTitle);for(const ct of allTitles){if(ct.n===nc||ct.title.toLowerCase().trim()===mapping.crelateTitle.toLowerCase().trim()){JC[c]=ct.id;try{await sb.from('crelate_title_mappings').update({crelate_title_id:ct.id,updated_at:new Date().toISOString()}).ilike('tracker_title',t.trim());}catch{}return{id:ct.id,log:'map+',mt:ct.title};}}}
  await loadAllJobTitles(k);if(!allTitles.length)return{id:null,log:'0titles'};
  const nt=N(t);const tWords=toWords(t);
  for(const ct of allTitles){if(ct.n===nt){JC[c]=ct.id;return{id:ct.id,log:'exact',mt:ct.title};}}
  const si=sT(t);const nsi=si?N(si):'';
  if(nsi&&nsi!==nt){for(const ct of allTitles){if(ct.n===nsi){JC[c]=ct.id;return{id:ct.id,log:'simp',mt:ct.title};}}}
  const br=gR(t);const nbr=br?N(br):'';
  if(nbr&&nbr!==nt&&nbr!==nsi){for(const ct of allTitles){if(ct.n===nbr){JC[c]=ct.id;return{id:ct.id,log:'base',mt:ct.title};}}const alias=BASE_ROLE_ALIASES[nbr];if(alias&&alias.id&&ok(alias.id)){JC[c]=alias.id;return{id:alias.id,log:'base-alias',mt:alias.title};}}
  for(const ct of allTitles){if(ct.n.length>=4&&nt.length>=4){const shorter=Math.min(ct.n.length,nt.length);const longer=Math.max(ct.n.length,nt.length);if(shorter/longer>=0.5){if(ct.n.includes(nt)||nt.includes(ct.n)){JC[c]=ct.id;return{id:ct.id,log:'sub',mt:ct.title};}}}if(nsi&&nsi.length>=4&&ct.n.length>=4){const shorter=Math.min(ct.n.length,nsi.length);const longer=Math.max(ct.n.length,nsi.length);if(shorter/longer>=0.5){if(ct.n.includes(nsi)||nsi.includes(ct.n)){JC[c]=ct.id;return{id:ct.id,log:'sub-s',mt:ct.title};}}}}
  const siWords=nsi?toWords(si):tWords;const brWords=nbr?toWords(br!):tWords;
  const scored:{ct:CachedTitle;score:number;method:string}[]=[];
  for(const ct of allTitles){const s1=wO(tWords,ct.words);const s2=nsi?wO(siWords,ct.words):0;const s3=nbr?wO(brWords,ct.words):0;const best=Math.max(s1,s2,s3);const meth=best===s3&&s3>0?'baseRole':best===s2&&s2>0?'simplified':'original';scored.push({ct,score:best,method:meth});}
  scored.sort((a,b)=>b.score-a.score);
  const top3:Top3Candidate[]=scored.slice(0,3).map(s=>({title:s.ct.title,score:Math.round(s.score*1000)/1000,method:s.method}));
  const bestTitle=scored.length>0?scored[0]:null;const bestScore=bestTitle?bestTitle.score:0;
  if(bestTitle&&bestScore>=0.35){JC[c]=bestTitle.ct.id;return{id:bestTitle.ct.id,log:`s(${bestScore.toFixed(2)})`,mt:bestTitle.ct.title};}
  return{id:null,log:bestTitle?`lo(${bestScore.toFixed(2)})`:'0match',bestScore,bestCandidate:bestTitle?.ct.title,simplified:si,baseRole:br||undefined,top3};
}
async function fJ(t:string,co:string,k:string){try{const r=await G('/jobs',k,{name:co?`${co} ${t}`:t,limit:'30'});await W(DL);if(!r?.Data)return null;const nt=N(t),nc=N(co);for(const j of r.Data){if(!j.Id||!ok(j.Id))continue;const jn=N(j.Name||'');if(nc&&nt&&jn.includes(nt)&&jn.includes(nc))return{id:j.Id,name:j.Name};}return null;}catch{return null;}}
const vN=(v:any)=>{if(!v)return false;const t=v.trim();return t.length>0&&t.length<=80&&/[a-zA-Z]/.test(t);};
async function fCt(fn:string,ln:string,k:string){try{const r=await G('/contacts',k,{name:`${fn} ${ln}`,limit:'10'});for(const i of(r?.Data||[]))if((i.FirstName||'').toLowerCase().trim()===fn.toLowerCase().trim()&&(i.LastName||'').toLowerCase().trim()===ln.toLowerCase().trim())return i.Id;return null;}catch{return null;}}

Deno.serve(async(req)=>{
  console.log('[v54] Function invoked, method:', req.method, 'url:', req.url);
  if(req.method==='OPTIONS')return new Response('ok',{headers:getCorsHeaders(req)});
  try{
    const st=Date.now();
    const R=(o:any)=>new Response(JSON.stringify(o),{headers:{'Content-Type':'application/json',...getCorsHeaders(req)}});
    const k=Deno.env.get("CRELATE_API_KEY");
    if(!k)return R({error:"No key",success:false});
    let b:any;
    try{b=await req.json();}catch(jsonErr){return R({error:"JSON parse failed",success:false,v:'51',detail:(jsonErr as Error).message});}
    const{action:a,records:recs,skipDuplicateCheck:sd}=b;
    console.log('[v54] action:', a, 'records:', recs?.length);

if(a==='get_sync_status'){const{data:x}=await sb.from('marketing_companies').select('id,crelate_id');const{data:y}=await sb.from('marketing_contacts').select('id,crelate_contact_id');const{data:z}=await sb.from('marketing_jobs').select('id,crelate_id');return R({success:true,counts:{companies:{total:(x||[]).length,synced:(x||[]).filter(i=>i.crelate_id).length},contacts:{total:(y||[]).length,synced:(y||[]).filter(i=>i.crelate_contact_id).length},jobs:{total:(z||[]).length,synced:(z||[]).filter(i=>i.crelate_id).length}}});}

if(a==='inspect_job'){const jid=b.crelateId||b.jobId;if(!jid)return R({error:'crelateId required'});const d=await G(`/jobs/${jid}`,k);return R({success:true,data:d?.Data,allKeys:d?.Data?Object.keys(d.Data):[]});}

if(a==='verify_links'){const{data:sj}=await sb.from('marketing_jobs').select('id,job_title,company_name,crelate_id').not('crelate_id','is',null).limit(b.sampleSize||10);const rs:any[]=[];for(const j of(sj||[])){try{const d=await G(`/jobs/${j.crelate_id}`,k);await W(DL);rs.push(d?.Data?{id:j.id,t:j.job_title,cid:j.crelate_id,ok:true,n:d.Data.Name,jt:d.Data.JobTitleId?.Title,acct:d.Data.AccountId}:{id:j.id,t:j.job_title,cid:j.crelate_id,ok:false});}catch{rs.push({id:j.id,ok:false});}}return R({success:true,v:'51',results:rs});}

if(a==='fix_job_names'||a==='fix_existing_jobs'){await lCC();const{data:jobs}=await sb.from('marketing_jobs').select('id,job_title,company_name,crelate_id').not('crelate_id','is',null);if(!jobs?.length)return R({success:true,fixed:0,v:'51'});let fx=0,er=0,mi=0;const dt:any[]=[];for(const j of jobs){if(Date.now()-st>45000)break;try{const t=(j.job_title||'').trim(),c=(j.company_name||'').trim();if(!t||!j.crelate_id)continue;const ch=await G(`/jobs/${j.crelate_id}`,k);await W(DL);if(!ch?.Data){mi++;continue;}const p:any={Name:c?`${t} - ${c}`:t};if(c&&!bad(c)){const r=await rC(c,k);if(r.id)p.AccountId={Id:r.id};}const r=await rJ(t,k);if(r.id)p.JobTitleId={Id:r.id};const pr=await Pa(`/jobs/${j.crelate_id}`,k,p);await W(DL);pr.ok?fx++:er++;dt.push({t,jt:r.log,mt:r.mt});}catch{er++;}}return R({success:true,v:'51',fixed:fx,errors:er,missing:mi,total:jobs.length,details:dt.slice(0,50),titlesCached:allTitles.length,titleLoadCalls:titleLoadApiCalls,titleMappingsLoaded:titleMappings.length});}

if(a==='title_cache_info'){await loadAllJobTitles(k);await loadTitleMappings();return R({success:true,v:'51',titlesLoaded:allTitles.length,loadedAt:titlesLoadedAt?new Date(titlesLoadedAt).toISOString():null,ageMs:titlesLoadedAt?Date.now()-titlesLoadedAt:null,apiCallsToLoad:titleLoadApiCalls,titleMappingsLoaded:titleMappings.length,sample:allTitles.slice(0,20).map(t=>({id:t.id,title:t.title}))});}

if(a==='test_title_match'){const titles=b.titles||[b.title];await loadAllJobTitles(k);await loadTitleMappings();const results:any[]=[];for(const t of titles){const r=await rJ(t,k);results.push({input:t,matchedId:r.id,matchedTitle:r.mt,method:r.log,bestScore:r.bestScore,bestCandidate:r.bestCandidate,simplified:r.simplified,baseRole:r.baseRole,top3:r.top3});}return R({success:true,v:'51',titlesLoaded:allTitles.length,results});}

if(a==='refresh_title_cache'){titlesLoadedAt=0;allTitles=[];titleMappingsLoadedAt=0;titleMappings=[];Object.keys(JC).forEach(jk=>delete JC[jk]);await loadAllJobTitles(k);await loadTitleMappings();return R({success:true,v:'51',titlesLoaded:allTitles.length,loadedAt:new Date(titlesLoadedAt).toISOString(),titleMappingsLoaded:titleMappings.length,allTitles:allTitles.map(t=>({id:t.id,title:t.title}))});}

if(a==='get_title_mappings'){const{data:mappings,error}=await sb.from('crelate_title_mappings').select('*').order('created_at',{ascending:false});if(error)return R({success:false,error:error.message});await loadAllJobTitles(k);return R({success:true,v:'51',mappings:mappings||[],availableTitles:allTitles.map(t=>({id:t.id,title:t.title})),totalMappings:(mappings||[]).length});}

if(a==='save_title_mapping'){const{tracker_title,crelate_title,crelate_title_id,notes}=b;if(!tracker_title||!crelate_title)return R({success:false,error:'tracker_title and crelate_title required'});let resolvedId=crelate_title_id||null;if(!resolvedId){await loadAllJobTitles(k);const nc=N(crelate_title);for(const ct of allTitles){if(ct.n===nc||ct.title.toLowerCase().trim()===crelate_title.toLowerCase().trim()){resolvedId=ct.id;break;}}}const{data,error}=await sb.from('crelate_title_mappings').upsert({tracker_title:tracker_title.trim(),crelate_title:crelate_title.trim(),crelate_title_id:resolvedId,notes:notes||null,updated_at:new Date().toISOString()},{onConflict:'tracker_title',ignoreDuplicates:false}).select().single();if(error){const{data:d2,error:e2}=await sb.from('crelate_title_mappings').insert({tracker_title:tracker_title.trim(),crelate_title:crelate_title.trim(),crelate_title_id:resolvedId,notes:notes||null}).select().single();if(e2)return R({success:false,error:e2.message});titleMappingsLoadedAt=0;return R({success:true,v:'51',mapping:d2});}titleMappingsLoadedAt=0;return R({success:true,v:'51',mapping:data});}

if(a==='bulk_save_title_mappings'){const{mappings:newMappings}=b;if(!newMappings||!Array.isArray(newMappings)||newMappings.length===0)return R({success:false,error:'mappings array required'});await loadAllJobTitles(k);let saved=0,skipped=0,errors=0;const details:any[]=[];for(const m of newMappings){if(!m.tracker_title||!m.crelate_title){skipped++;continue;}let resolvedId=m.crelate_title_id||null;if(!resolvedId){const nc=N(m.crelate_title);for(const ct of allTitles){if(ct.n===nc||ct.title.toLowerCase().trim()===m.crelate_title.toLowerCase().trim()){resolvedId=ct.id;break;}}}const{error}=await sb.from('crelate_title_mappings').upsert({tracker_title:m.tracker_title.trim(),crelate_title:m.crelate_title.trim(),crelate_title_id:resolvedId,notes:m.notes||'Auto-suggested',updated_at:new Date().toISOString()},{onConflict:'tracker_title',ignoreDuplicates:false});if(error){const{error:e2}=await sb.from('crelate_title_mappings').insert({tracker_title:m.tracker_title.trim(),crelate_title:m.crelate_title.trim(),crelate_title_id:resolvedId,notes:m.notes||'Auto-suggested'});if(e2){errors++;details.push({title:m.tracker_title,error:e2.message});}else{saved++;details.push({title:m.tracker_title,status:'saved'});}}else{saved++;details.push({title:m.tracker_title,status:'saved'});}}titleMappingsLoadedAt=0;return R({success:true,v:'51',saved,skipped,errors,total:newMappings.length,details});}

if(a==='delete_title_mapping'){const{id,tracker_title}=b;let error:any=null;if(id){const result=await sb.from('crelate_title_mappings').delete().eq('id',id);error=result.error;}else if(tracker_title){const result=await sb.from('crelate_title_mappings').delete().ilike('tracker_title',tracker_title.trim());error=result.error;}else return R({success:false,error:'id or tracker_title required'});if(error)return R({success:false,error:error.message});titleMappingsLoadedAt=0;return R({success:true,v:'51'});}

if(a==='get_missing_titles'){
  await loadAllJobTitles(k);await loadTitleMappings();
  let jobsToScan:any[]=[];if(recs&&recs.length>0){jobsToScan=recs;}else{const{data:allJobs}=await sb.from('marketing_jobs').select('id,job_title,company_name,location,status,is_closed,crelate_id').order('job_title');jobsToScan=allJobs||[];}
  if(b.openOnly!==false){jobsToScan=jobsToScan.filter((j:any)=>!j.is_closed&&j.status!=='Closed');}
  const unmatchedMap:Record<string,{title:string;count:number;jobs:{id:string;company:string;location:string}[];bestScore:number;bestCandidate:string;simplified:string;baseRole:string;top3:Top3Candidate[];}>={};
  const matchedMap:Record<string,{title:string;matchedTo:string;method:string;count:number}>={};
  let totalScanned=0,totalMatched=0,totalUnmatched=0;
  for(const job of jobsToScan){const title=(job.job_title||job.title||'').trim();if(!title||bad(title))continue;totalScanned++;const r=await rJ(title,k);if(r.id){totalMatched++;const nk=N(title);if(matchedMap[nk])matchedMap[nk].count++;else matchedMap[nk]={title,matchedTo:r.mt||'',method:r.log,count:1};}else{totalUnmatched++;const nk=N(title);if(unmatchedMap[nk]){unmatchedMap[nk].count++;unmatchedMap[nk].jobs.push({id:job.id,company:job.company_name||'',location:job.location||''});}else unmatchedMap[nk]={title,count:1,jobs:[{id:job.id,company:job.company_name||'',location:job.location||''}],bestScore:r.bestScore||0,bestCandidate:r.bestCandidate||'',simplified:r.simplified||sT(title),baseRole:r.baseRole||gR(title)||'',top3:r.top3||[]};}}
  const unmatchedTitles=Object.values(unmatchedMap).sort((a,b)=>b.count-a.count).map(u=>({title:u.title,count:u.count,simplified:u.simplified,baseRole:u.baseRole,bestScore:Math.round(u.bestScore*100),bestCandidate:u.bestCandidate,top3:u.top3,sampleJobs:u.jobs.slice(0,5),companies:[...new Set(u.jobs.map(j=>j.company).filter(Boolean))].slice(0,10)}));
  const matchedTitles=Object.values(matchedMap).sort((a,b)=>b.count-a.count).map(m=>({title:m.title,matchedTo:m.matchedTo,method:m.method,count:m.count}));
  return R({success:true,v:'51',totalScanned,totalMatched,totalUnmatched,matchRate:totalScanned>0?Math.round((totalMatched/totalScanned)*100):0,unmatchedTitles,matchedTitles:matchedTitles.slice(0,50),titlesCached:allTitles.length,titleMappingsLoaded:titleMappings.length,availableTitles:allTitles.map(t=>t.title).sort(),generatedAt:new Date().toISOString()});
}

if(!a||!recs?.length)return R({error:"Need action+records",success:false});
await lCC();await loadTitleMappings();
const results:any[]=[];

if(a==='push_companies'){for(const rec of recs){try{if(Date.now()-st>45000){results.push({id:rec.id,status:'error',message:'TO'});continue;}const cn=rec.company_name||rec.Name;if(!cn||bad(cn)){results.push({id:rec.id,status:'error',message:'M'});continue;}const r=await rC(cn,k);if(r.id){results.push({id:rec.id,name:cn,status:'success',crelateId:r.id});await safeDbUpdate('marketing_companies',{crelate_id:r.id},'id',rec.id);}else results.push({id:rec.id,name:cn,status:'error',message:r.log,detail:r.error});}catch(e){results.push({id:rec.id,status:'error',message:(e as Error).message});}}}

else if(a==='push_contacts'){for(const rec of recs){try{if(Date.now()-st>45000){results.push({id:rec.id,status:'error',message:'TO'});continue;}const fn=vN(rec.first_name)?rec.first_name.trim():'',ln=vN(rec.last_name)?rec.last_name.trim():'';if(!fn&&!ln){results.push({id:rec.id,status:'skipped'});continue;}const dn=`${fn} ${ln}`.trim();if(rec.crelate_contact_id){results.push({id:rec.id,name:dn,status:'skipped'});continue;}if(!sd&&fn&&ln){const e=await fCt(fn,ln,k);if(e){results.push({id:rec.id,name:dn,status:'skipped',crelateId:e});await safeDbUpdate('marketing_contacts',{crelate_contact_id:e},'id',rec.id);await W(DL);continue;}}const ent:any={};if(fn)ent.FirstName=fn;if(ln)ent.LastName=ln;if(fn&&!ln){ent.LastName='(Unknown)';ent.FirstName=fn;}if(rec.email)ent.EmailAddresses_Work={Value:rec.email,IsPrimary:true};if(rec.title)ent.CurrentPosition={JobTitle:rec.title,IsPrimary:true};const cn=rec.company_name||'';if(cn&&!bad(cn)){const cr=await rC(cn,k);if(cr.id){if(!ent.CurrentPosition)ent.CurrentPosition={IsPrimary:true};ent.CurrentPosition.CompanyId={Id:cr.id};}}const res=await Po('/contacts',k,ent);await W(DL);if(res.ok){const cid=xI(res.data);results.push({id:rec.id,name:dn,status:'success',crelateId:cid});if(cid)await safeDbUpdate('marketing_contacts',{crelate_contact_id:cid},'id',rec.id);}else if(res.status===409&&fn&&ln){const dup=await fCt(fn,ln,k);if(dup){results.push({id:rec.id,name:dn,status:'skipped',crelateId:dup,message:'409-resolved'});await safeDbUpdate('marketing_contacts',{crelate_contact_id:dup},'id',rec.id);}else{results.push({id:rec.id,name:dn,status:'error',message:`409 duplicate but lookup failed`});}}else results.push({id:rec.id,name:dn,status:'error',message:res.err});}catch(e){results.push({id:rec.id,status:'error',message:(e as Error).message});}}}

else if(a==='push_jobs'){
  console.log('[v54] push_jobs:', recs.length, 'records');
  const unmatchedDuringPush:Record<string,{title:string;count:number;companies:string[];bestScore:number;bestCandidate:string;simplified:string;baseRole:string;top3:Top3Candidate[]}>={};
  for(let ri=0;ri<recs.length;ri++){const rec=recs[ri];try{if(Date.now()-st>45000){results.push({id:rec.id,status:'error',message:'TO'});continue;}
  const title=(rec.job_title||rec.title||rec.Name||'').trim();
  const rawCompanyName=rec.company_name;const rawCompany=rec.company;
  const company=(rec.company_name||rec.company||'').trim();
  const companySource=rec.company_name?'rec.company_name':rec.company?'rec.company':'(none)';
  if(!title||bad(title)){results.push({id:rec.id,status:'error',message:'No title'});continue;}
  const dn=company&&!bad(company)?`${title} - ${company}`:title;
  if(!sd){try{const ex=await fJ(title,company,k);if(ex){results.push({id:rec.id,name:title,status:'skipped',crelateId:ex.id});await safeDbUpdate('marketing_jobs',{crelate_id:ex.id},'id',rec.id);continue;}}catch{}}
  const ent:any={Name:dn,NumberOfOpenings:1,IsLead:true,OpportunityTypeId:{Id:BO},SalesWorkflowItemStatusId:{Id:SL}};
  if(rec.description)ent.Description=rec.description.substring(0,10000);
  const jobUrl=rec.website_job_desc||rec.job_url;
  if(jobUrl){
    ent.Websites_Other={Value:jobUrl,IsPrimary:true};
    ent.CustomField4=jobUrl;
  }
  if(rec.salary_range)ent.PortalCompensation=rec.salary_range;
  let ci=rec.city||'',sa=rec.state||'';if(!ci&&!sa&&rec.location){const p=rec.location.split(',').map((s:string)=>s.trim());ci=p[0]||'';sa=p[1]||'';}
  if(ci||sa)ent.Locations_Business={City:ci||'',State:sa||'',IsPrimary:true};else ent.Locations_Business={City:'Various',State:'',IsPrimary:true};
  
  let cl='n/a';let companyFailed=false;let companyError='';let crId:string|null=null;let crLog:string='not-called';let cr409Debug:any=undefined;
  const companyBadCheck=bad(company);
  if(company&&!companyBadCheck){
    try{const cr=await rC(company,k);crId=cr.id;crLog=cr.log;cl=cr.log;cr409Debug=cr._409Debug;
      if(cr.id){ent.AccountId={Id:cr.id};}
      else if(cr.log.startsWith('x')){companyFailed=true;companyError=cr.error||`Failed (${cr.log})`;}
    }catch(e){cl='x:exc';crLog='x:exc';companyFailed=true;companyError=(e as Error).message;}
  }
  
  const companyDebug:any={rawCompanyName:rawCompanyName===undefined?'UNDEFINED':rawCompanyName===null?'NULL':rawCompanyName===''?'EMPTY_STRING':rawCompanyName,rawCompany:rawCompany===undefined?'UNDEFINED':rawCompany===null?'NULL':rawCompany===''?'EMPTY_STRING':rawCompany,companyVar:company||'(empty)',companySource,isBad:companyBadCheck,wasResolutionAttempted:!!(company&&!companyBadCheck),resolutionLog:crLog,resolvedId:crId||'NULL',resolvedIdType:typeof crId,resolvedIdStringified:JSON.stringify(crId),resolvedIdIsValidUuid:typeof crId==='string'?ok(crId):false,accountIdOnEntity:ent.AccountId===undefined?'NOT_SET':JSON.stringify(ent.AccountId),entityName:dn};
  
  if(companyFailed){results.push({id:rec.id,name:title,status:'error',message:`Company failed: ${cl} | ${companyError}`});continue;}
  
  let jl='n/a',mt:string|undefined;let titleDebug:any=undefined;
  try{const jt=await rJ(title,k);jl=jt.log;mt=jt.mt;if(jt.id)ent.JobTitleId={Id:jt.id};else{titleDebug={originalTitle:title,simplified:jt.simplified||sT(title),baseRole:jt.baseRole||gR(title)||'(none)',top3:jt.top3||[],matchLog:jt.log,bestScore:jt.bestScore,bestCandidate:jt.bestCandidate};const nk=N(title);if(unmatchedDuringPush[nk]){unmatchedDuringPush[nk].count++;if(company&&!unmatchedDuringPush[nk].companies.includes(company))unmatchedDuringPush[nk].companies.push(company);}else unmatchedDuringPush[nk]={title,count:1,companies:company?[company]:[],bestScore:jt.bestScore||0,bestCandidate:jt.bestCandidate||'',simplified:jt.simplified||sT(title),baseRole:jt.baseRole||gR(title)||'',top3:jt.top3||[]};}}catch{jl='x';}
  
  const res=await Po('/jobs',k,ent);await W(DL);
  if(res.ok){const cid=xI(res.data);const ro:any={id:rec.id,name:title,status:'success',message:`co:${cl} jt:${jl}${mt?' ['+mt+']':''}`,crelateId:cid,matchedTitle:mt};if(titleDebug)ro._titleDebug=titleDebug;results.push(ro);if(cid)await safeDbUpdate('marketing_jobs',{crelate_id:cid,notes:`v52:${cid}`,updated_at:new Date().toISOString()},'id',rec.id);
  }else{const ro:any={id:rec.id,name:title,status:'error',message:`${res.err} co:${cl} jt:${jl}`};if(titleDebug)ro._titleDebug=titleDebug;results.push(ro);}
  }catch(e){results.push({id:rec?.id,name:rec?.job_title||'?',status:'error',message:(e as Error).message.substring(0,200)});}}
  const unmatchedTitles=Object.values(unmatchedDuringPush).sort((a,b)=>b.count-a.count).map(u=>({title:u.title,count:u.count,companies:u.companies.slice(0,10),bestScore:Math.round(u.bestScore*100),bestCandidate:u.bestCandidate,simplified:u.simplified,baseRole:u.baseRole,top3:u.top3}));
  const totalJobsPushed=results.filter(r=>r.status==='success').length;const jobsWithTitle=results.filter(r=>r.status==='success'&&r.matchedTitle).length;
  return R({success:true,v:'51',summary:{total:recs.length,ok:results.filter(r=>r.status==='success').length,skip:results.filter(r=>r.status==='skipped').length,err:results.filter(r=>r.status==='error').length},results,ms:`${Date.now()-st}`,titlesCached:allTitles.length,titleMappingsLoaded:titleMappings.length,titleMatchReport:{totalJobsPushed,jobsWithTitle,jobsWithoutTitle:totalJobsPushed-jobsWithTitle,matchRate:totalJobsPushed>0?Math.round((jobsWithTitle/totalJobsPushed)*100):0,unmatchedTitles,unmatchedCount:unmatchedTitles.length}});
}

else return R({error:`Unk:${a}`,success:false});
return R({success:true,v:'51',summary:{total:recs.length,ok:results.filter(r=>r.status==='success').length,skip:results.filter(r=>r.status==='skipped').length,err:results.filter(r=>r.status==='error').length},results,ms:`${Date.now()-st}`});

  }catch(topErr){
    console.error('[v54] TOP-LEVEL ERROR:', (topErr as Error).message, (topErr as Error).stack);
    return new Response(JSON.stringify({success:false,v:'51',error:(topErr as Error).message,stack:((topErr as Error).stack||'').substring(0,500),note:'Top-level catch triggered'}),{headers:{'Content-Type':'application/json',...getCorsHeaders(req)}});
  }
});