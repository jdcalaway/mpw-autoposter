import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT} from '../scripts/lib/util.mjs';
import {writeFreshCopy,validateCopy,copyBlock} from '../scripts/lib/fresh-copy.mjs';
import {generateCopy} from '../scripts/generate-copy.mjs';
const post={id:'2026-10-20',date:'2026-10-20',pillar:'tip',status:'planned',awaitingCopy:true};
const draft={postFormat:'question',supportLines:['A little more brushing?','A new appointment routine?','What would you like to ask?'],caption:'Bring your grooming questions to your next appointment. We can talk through a routine that fits your dog.',headline:'A routine for your dog',topic:'Planning a personal grooming routine',scene:'A thoughtful dog beside a calendar in a warm illustration'};
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'mpw-copy-'));try{await mkdir(join(root,'content'));await writeFile(join(root,'config.json'),JSON.stringify({business:{name:'Mobile Pet Works'},timezone:'America/Los_Angeles'}));await writeFile(join(root,'content/calendar.json'),JSON.stringify({posts:[post]}));await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('writer uses structured output and history, rejects duplicates and incomplete responses',async()=>{
 let body;
 const good=await writeFreshCopy({post,history:[],business:{name:'Mobile Pet Works'},apiKey:'fixture',fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]});}});
 assert.equal(good.caption,draft.caption);assert.equal(body.store,false);assert.equal(body.response_format.json_schema.strict,true);
 assert.throws(()=>validateCopy(draft,post,[{id:'old',date:'2026-01-01',status:'posted',caption:draft.caption}]),/already used/);
 await assert.rejects(writeFreshCopy({post,history:[],business:{},apiKey:'fixture',fetchImpl:async()=>Response.json({choices:[{finish_reason:'length'}]})}),/complete draft/);
});
test('successful writing checkpoints before request and reruns reuse the saved draft',async()=>fixture(async root=>{
 let requests=0,checkpoints=0;
 const args={root,today:post.date,apiKey:'fixture',checkpoint:async()=>{checkpoints++;},writer:async()=>{assert.ok(checkpoints);requests++;return draft;}};
 await generateCopy(args);await generateCopy(args);assert.equal(requests,1);
 assert.equal(JSON.parse(await readFile(join(root,'content/fresh-copy.json')))[0].date,post.date);
}));
test('checkpoint failure makes no API request; API failure holds without old-caption fallback',async()=>fixture(async root=>{
 let requests=0;
 await assert.rejects(generateCopy({root,today:post.date,apiKey:'fixture',checkpoint:async()=>{throw Error('push failed');},writer:async()=>{requests++;}}),/push failed/);assert.equal(requests,0);
 await rm(join(root,'content/copy-ledger.json'));
 const args={root,today:post.date,apiKey:'fixture',checkpoint:async()=>{},writer:async()=>{requests++;throw Error('temporary failure');}};
 await assert.rejects(generateCopy(args),/held/);await assert.rejects(generateCopy(args),/Already attempted/);assert.equal(requests,1);assert.deepEqual(JSON.parse(await readFile(join(root,'content/fresh-copy.json'))),[]);
}));
test('limits bound writing calls and do not reset on reruns',()=>{
 assert.ok(copyBlock(Array.from({length:4},(_,i)=>({day:post.date,date:`other${i}`})),post.date,post.date));
 assert.ok(copyBlock([{day:post.date,date:post.date}],post.date,post.date));
});
test('calendar starts empty, loads date-specific writing, and preserves it on rebuild',async()=>fixture(async root=>{
 await cp(join(ROOT,'scripts'),join(root,'scripts'),{recursive:true});
 await cp(join(ROOT,'content/pillars.json'),join(root,'content/pillars.json'));
 await writeFile(join(root,'package.json'),'{"type":"module"}');
 const run=()=>execFileSync(process.execPath,[join(root,'scripts/generate-calendar.mjs'),'--start',post.date,'--days','2'],{cwd:root});
 run();let cal=JSON.parse(await readFile(join(root,'content/calendar.json')));assert.equal(cal.posts[0].caption,'');assert.equal(cal.posts[0].awaitingCopy,true);
 await writeFile(join(root,'content/fresh-copy.json'),JSON.stringify([{...draft,date:post.date,pillar:cal.posts[0].pillar}]));
 run();run();cal=JSON.parse(await readFile(join(root,'content/calendar.json')));assert.equal(cal.posts[0].caption,draft.caption);assert.equal(cal.posts[0].freshCopy,true);assert.equal(cal.posts[0].awaitingCopy,false);
}));
test('booking posts must ask to book, stay on pillar and avoid recent themes',()=>{
 const business={name:'Mobile Pet Works',website:'mobilepetworks.com',phone:'(509) 591-5913'};
 const booking={id:'2026-11-20',date:'2026-11-20',pillar:'booking'};
 const base={postFormat:'punchline',supportLines:['one','two','three'],headline:'The salon comes to you',topic:'Skipping the drive to the groomer',scene:'A van in a driveway'};
 const ask={...base,caption:'Lint rollers handle the couch. We will handle the dog. Ask about your next appointment at mobilepetworks.com.'};
 assert.equal(validateCopy(ask,booking,[],business).caption,ask.caption);
 assert.equal(validateCopy({...ask,caption:'Your dog has an appointment. Text (509) 591-5913 to ask about availability.'},booking,[],business).postFormat,'punchline');
 assert.throws(()=>validateCopy({...base,caption:'Ever find dog fur in your shoes? Share your tips below!'},booking,[],business),/website or phone/);
 assert.throws(()=>validateCopy({...ask,caption:ask.caption+' Share your tips below!'},booking,[],business),/comments instead/);
 assert.throws(()=>validateCopy({...base,postFormat:'checklist',caption:ask.caption},booking,[],business),/assigned format/);
 const bts={id:'2026-11-19',date:'2026-11-19',pillar:'bts'};
 assert.throws(()=>validateCopy({...ask,postFormat:'question',topic:'Hiring groomers: a close look at mobile life'},bts,[],business),/Hiring content/);
 const fur=[{date:'2026-11-11',topic:'Unexpected places dog fur ends up around the house'},{date:'2026-11-12',topic:'Unexpected dog fur hideouts around your home'},{date:'2026-11-17',topic:'The invisible places dog fur loves to hide'}];
 assert.throws(()=>validateCopy({...ask,topic:'Everyday tricks to manage dog fur between grooming'},booking,fur,business),/recent theme \(fur\)/);
 const unique=[{date:'2026-11-08',topic:'Unique coats need unique care'},{date:'2026-11-09',topic:'What makes each pup unique'},{date:'2026-11-10',topic:'Unique personalities on the table'}];
 assert.equal(validateCopy({...ask,topic:'The unique joys of a driveway groom'},booking,unique,business).caption,ask.caption);
 assert.equal(validateCopy({...ask,topic:'Fur on the couch again'},booking,fur.slice(0,2),business).caption,ask.caption);
});
