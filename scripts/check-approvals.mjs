import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadCalendar,loadConfig,todayLocal,addDays} from './lib/util.mjs';
import {readContent} from './lib/campaigns.mjs';
export function approvalHolds(posts,today,attempts=[]) {
 return posts.filter(p=>!p.isTest&&p.date>=today&&p.date<=addDays(today,1)&&p.status==='planned'&&!p.issueNumber).map(p=>{
  const latest=attempts.filter(a=>a.date===p.date).at(-1);
  return {date:p.date,reason:p.awaitingCopy?(latest?.reason||'Waiting for original writing'):p.awaitingCreative?'Waiting for fresh artwork':'Approval was not created; inspect image and content checks'};
 });
}
async function main(){
 const cfg=await loadConfig();const cal=await loadCalendar();const ledger=await readContent('copy-ledger.json',{attempts:[]});
 const holds=approvalHolds(cal.posts,todayLocal(cfg.timezone),ledger.attempts);
 if(!holds.length){console.log('All upcoming posts have an approval or a recorded decision.');return;}
 const message=holds.map(h=>`${h.date}: ${h.reason}`).join('\n');
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## Approval generation held\n\n${message}\n\nNo duplicate content was published.\n`);
 console.error(message);throw new Error(`${holds.length} upcoming approval(s) missing. The preparation run must not report success.`);
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
