import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ROOT,todayLocal,addDays} from './lib/util.mjs';
import {writeFreshCopy,copyBlock,MODEL} from './lib/fresh-copy.mjs';
const read=async(root,path,fallback)=>{try{return JSON.parse(await readFile(join(root,path),'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}};
export async function generateCopy({root=ROOT,apiKey,today,checkpoint,writer=writeFreshCopy}) {
 const cfg=await read(root,'config.json');today ||= todayLocal(cfg.timezone);
 const cal=await read(root,'content/calendar.json');
 const ledger=await read(root,'content/copy-ledger.json',{attempts:[]});
 const drafts=await read(root,'content/fresh-copy.json',[]);
 const persist=async()=>{await writeFile(join(root,'content/copy-ledger.json'),JSON.stringify(ledger,null,2)+'\n');await writeFile(join(root,'content/fresh-copy.json'),JSON.stringify(drafts,null,2)+'\n');await checkpoint();};
 const targets=cal.posts.filter(p=>p.status==='planned'&&!p.review&&p.date>=today&&p.date<=addDays(today,1)&&!drafts.some(d=>d.date===p.date&&d.pillar===p.pillar&&(d.revision||1)===(p.copyRevision||1)));
 if(!targets.length) return;
 if(!apiKey||!checkpoint) throw new Error('Writing requires the existing API secret and durable checkpoints.');
 const unresolved=[];
 for(const post of targets){
  let complete=false, reason='No fresh draft created.';
  // A second draft is allowed only for a content rejection, within unchanged caps.
  for(let pass=0;pass<2;pass++) {
   const blocked=copyBlock(ledger.attempts,post.date,today,post.copyRevision||1);
   if(blocked){reason=blocked;console.log(`${post.date}: ${blocked}`);break;}
   const feedback=ledger.attempts.filter(a=>a.date===post.date&&a.reason).map(a=>({reason:a.reason,draft:a.rejectedDraft}));
   const attempt={date:post.date,day:today,status:'requesting',model:MODEL,revision:post.copyRevision||1};ledger.attempts.push(attempt);await persist();
   try{
    const history=[...cal.posts,...drafts.filter(d=>d.date!==post.date||(d.revision||1)!==(post.copyRevision||1)).map(d=>({...d,id:`draft-${d.date}-${d.revision||1}`,graphicText:d.headline,freshCopy:true,status:'draft'}))];
    const draft=await writer({post,history,business:cfg.business,apiKey,rejectionFeedback:feedback});
    drafts.push({...draft,date:post.date,pillar:post.pillar,revision:post.copyRevision||1,model:MODEL,createdAt:new Date().toISOString()});attempt.status='complete';complete=true;
   }catch(e){
    attempt.status=e.status===401?'auth_error':e.code==='CONTENT_REJECTED'?'rejected':'held';attempt.httpStatus=e.status||null;
    reason=e.status?`Writing API HTTP ${e.status}`:e.message;
    attempt.reason=reason;
    if(e.rejectedDraft) attempt.rejectedDraft=e.rejectedDraft;
    console.log(`${post.date}: fresh writing held (${reason}).`);
   }
   await persist();
   if(complete||attempt.status!=='rejected')break;
  }
  if(!complete)unresolved.push(`${post.date}: ${reason}`);
 }
 if(unresolved.length)throw new Error(`Fresh writing held for ${unresolved.length} post(s): ${unresolved.join('; ')}`);
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='jdcalaway/mpw-autoposter'||process.env.GITHUB_REF!=='refs/heads/main') throw new Error('Run fresh writing in this repository’s main-branch workflow.');
 const git=args=>execFileSync('git',args,{cwd:ROOT,stdio:['ignore','pipe','pipe']});
 const checkpoint=async()=>{git(['add','--','content/fresh-copy.json','content/copy-ledger.json']);if(git(['diff','--cached','--name-only']).toString().trim())git(['commit','-m','Checkpoint fresh post writing [skip ci]']);git(['push','origin','HEAD:main']);};
 generateCopy({apiKey:process.env.OPENAI_API_KEY,checkpoint}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
