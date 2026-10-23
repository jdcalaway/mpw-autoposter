import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateCopy} from '../scripts/generate-copy.mjs';
import {approvalHolds} from '../scripts/check-approvals.mjs';
import {copyBlock,LIMITS} from '../scripts/lib/fresh-copy.mjs';
const post={id:'2026-10-23',date:'2026-10-23',status:'planned',pillar:'booking',awaitingCopy:true};
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'mpw-recovery-'));try{await mkdir(join(root,'content'));await writeFile(join(root,'config.json'),JSON.stringify({business:{},timezone:'America/Los_Angeles'}));await writeFile(join(root,'content/calendar.json'),JSON.stringify({posts:[post]}));await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('rejected duplicate gets a second draft with rejection feedback',async()=>fixture(async root=>{
 let calls=0;await generateCopy({root,today:post.date,apiKey:'fixture',checkpoint:async()=>{},writer:async args=>{calls++;if(calls===1){const e=new Error('Topic already used.');e.code='CONTENT_REJECTED';e.rejectedDraft={topic:'Old topic'};throw e;}assert.equal(args.rejectionFeedback[0].reason,'Topic already used.');return {caption:'A new caption',headline:'A new direction'};}});
 const ledger=JSON.parse(await readFile(join(root,'content/copy-ledger.json')));assert.equal(calls,2);assert.equal(ledger.attempts[0].status,'rejected');assert.equal(ledger.attempts[1].status,'complete');
}));
test('limits and operational errors hold without an unbounded retry',async()=>fixture(async root=>{
 let calls=0;await assert.rejects(generateCopy({root,today:post.date,apiKey:'fixture',checkpoint:async()=>{},writer:async()=>{calls++;throw new Error('Network unavailable.');}}),/held/);assert.equal(calls,1);
 assert.ok(copyBlock(Array.from({length:LIMITS.perDay},()=>({date:post.date,day:post.date,status:'rejected'})),post.date,post.date));
}));
test('missing approvals are errors with the rejection reason, not a green empty run',()=>{
 assert.deepEqual(approvalHolds([post],post.date,[{date:post.date,reason:'Graphic wording already used.'}]),[{date:post.date,reason:'Graphic wording already used.'}]);
 assert.equal(approvalHolds([{...post,status:'pending_approval',issueNumber:10},{...post,status:'skipped'},{...post,date:'2026-10-22'}],post.date).length,0);
});
