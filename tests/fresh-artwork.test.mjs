import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chooseConcept} from '../scripts/lib/campaigns.mjs';
import {creativeHoldReason} from '../scripts/lib/creative-policy.mjs';
import {planBatch, campaignFromItem} from '../scripts/lib/ai-creative.mjs';
const settings=JSON.parse(await readFile(new URL('../content/ai-creative.json',import.meta.url)));
const campaigns=JSON.parse(await readFile(new URL('../content/campaigns.json',import.meta.url)));
test('AI assets cannot repeat after 30 days, under another ID, or after a skipped approval',()=>{
 const concepts=[{id:'new-name',pillar:'booking',asset:'same.jpg'}];
 for(const status of ['posted','pending_approval','skipped']) {
  const history=[{id:'old',date:'2026-09-11',status,conceptId:'old-name',creativeAsset:'same.jpg'}];
  assert.equal(chooseConcept({key:'booking',date:'2026-10-11',concepts,reviews:[],history}).awaitingCreative,true);
  assert.match(creativeHoldReason({id:'new',date:'2026-10-11',illustration:true,creativeAsset:'same.jpg'},history),/already used/);
 }
});
test('no artwork holds the post; photos and reviews remain allowed',()=>{
 assert.equal(chooseConcept({key:'booking',date:'2026-10-11',concepts:[],reviews:[]}).awaitingCreative,true);
 assert.match(creativeHoldReason({awaitingCreative:true},[]),/Waiting/);
 assert.equal(creativeHoldReason({imageSource:'photo'},[]),null);
 assert.equal(creativeHoldReason({review:{id:'review'},imageSource:'graphic'},[]),null);
});
test('per-post generation ignores weekly interval and only buys for unfilled upcoming slots',()=>{
 const ledger={batches:[{provider:'github-openai',date:'2026-10-10',completedOn:'2026-10-10',status:'complete',items:[]}]};
 const posts=[{date:'2026-10-11',pillar:'booking',status:'planned',awaitingCreative:true,freshCopy:true,caption:'A newly written booking message.',graphicText:'Fresh daily copy'},
  {date:'2026-10-12',pillar:'hiring',status:'planned',awaitingCreative:true},
  {date:'2026-10-10',pillar:'hiring',status:'pending_approval'}];
 const {batch}=planBatch({ledger,campaigns,settings,today:'2026-10-10',posts});
 assert.equal(batch.items.length,1);
 assert.equal(batch.items[0].targetDate,'2026-10-11');
 const concept=campaignFromItem(batch,batch.items[0],'2026-10-10');
 assert.equal(chooseConcept({key:'booking',date:'2026-10-12',concepts:[concept],reviews:[]}).awaitingCreative,true);
 assert.equal(chooseConcept({key:'booking',date:'2026-10-11',concepts:[concept],reviews:[]}).creativeAsset,concept.asset);
 assert.equal(planBatch({ledger,campaigns,settings,today:'2026-10-10',posts:[]}).batch,undefined);
 assert.throws(()=>planBatch({ledger,campaigns,settings,today:'2026-10-10'}),/requires the calendar/);
});
