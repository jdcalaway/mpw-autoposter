import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FORMATS,nextFormat,graphicMode} from '../scripts/lib/post-formats.mjs';
import {validateCopy} from '../scripts/lib/fresh-copy.mjs';
import {renderGraphic} from '../scripts/make-graphic.mjs';
import {ROOT} from '../scripts/lib/util.mjs';
const cfg=JSON.parse(await readFile(join(ROOT,'config.json')));
test('format selection avoids the most recent compositions and preserves photo pillars',()=>{
 assert.equal(nextFormat([],'2026-10-17'),'question');
 assert.equal(nextFormat([{date:'2026-10-16',postFormat:'question'}],'2026-10-17'),'checklist');
 const history=FORMATS.map((postFormat,i)=>({date:`2026-10-${10+i}`,postFormat}));
 assert.equal(nextFormat(history,'2026-10-17'),'question');
 assert.equal(graphicMode('transformation','question'),false);assert.equal(graphicMode('hiring','question'),true);assert.equal(graphicMode('booking','mini_story'),false);
});
test('unsupported job promises and the wrong requested format are held',()=>{
 const post={id:'new',date:'2026-10-17'};const d={caption:'A flexible role without traffic.',headline:'Join our team',topic:'A new topic',scene:'A van',postFormat:'question',supportLines:['one','two','three']};
 assert.throws(()=>validateCopy(d,post,[]),/Unverified/);
 assert.throws(()=>validateCopy({...d,caption:'A new grooming conversation.',postFormat:'checklist'},post,[]),/assigned format/);
});
test('all five layouts render complete distinct images and reject missing text',async()=>{
 const sharp=(await import('sharp')).default;const dir=await mkdtemp(join(tmpdir(),'mpw-layouts-'));
 try {const hashes=[];for(const postFormat of FORMATS){const path=join(dir,postFormat+'.jpg');await renderGraphic({cfg,pillar:{},pillarKey:'engagement',bodyText:'What would your dog put on the agenda?',postFormat,supportLines:['A little extra time to say hello.','A moment to get comfortable.','Tell us what matters to your pup.'],outPath:path});const b=await readFile(path);const meta=await sharp(b).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1080);hashes.push(b.toString('base64'));}assert.equal(new Set(hashes).size,5);
 await assert.rejects(renderGraphic({cfg,pillar:{},pillarKey:'engagement',bodyText:'Missing text',postFormat:'checklist',outPath:join(dir,'bad.jpg')}),/three supporting/);
 } finally{await rm(dir,{recursive:true,force:true});}
});
