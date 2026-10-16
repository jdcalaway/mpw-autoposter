import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contentHoldReason, sameCopy, fingerprint, unusedMedia } from '../scripts/lib/content-policy.mjs';
import { chooseConcept } from '../scripts/lib/campaigns.mjs';
const old = {id:'old',date:'2026-01-01',status:'posted',caption:'A full grooming salon at your door.'};
const next = {id:'next',date:'2026-10-16',status:'planned'};
test('caption protection is permanent, includes skipped previews and ignores punctuation/case', () => {
  for (const status of ['posted','skipped','pending_approval']) {
    assert.match(contentHoldReason({...next,caption:'A FULL grooming salon at your door! 🚐'}, [{...old,status}]), /Caption/);
  }
  assert.equal(contentHoldReason({...old}, [old]), null);
  assert.equal(contentHoldReason({...next,caption:'Ask us about your puppy’s first appointment.'}, [old]), null);
});
test('minor copy edits do not bypass protection', () => {
  assert.ok(sameCopy('We bring the grooming salon to your home in the Tri Cities. Ask about an appointment today.', 'We bring the grooming salon to your home in the Tri Cities. Ask about an appointment now.'));
});
test('headlines and media fingerprints block reuse even with new filenames and captions', () => {
  assert.match(contentHoldReason({...next,graphicText:'Salon on wheels'}, [{...old,graphicText:'Salon on wheels!'}]), /Graphic/);
  assert.match(contentHoldReason({...next,mediaHashes:['abc']}, [{...old,mediaHashes:['abc'],image:'different.jpg'}]), /Media/);
});
test('legacy photo fingerprints exclude identical source files', async () => {
  const cal = JSON.parse(await readFile(new URL('../content/calendar.json',import.meta.url)));
  const photo = cal.posts.find(p=>p.imageSource==='photo' && p.image);
  await fingerprint(photo);
  assert.ok(photo.mediaHashes.length);
  assert.deepEqual(await unusedMedia([photo.image], next, [photo]), []);
});
test('reviews cannot return after the former 30-day cooldown', () => {
  const review={id:'r',text:'A verified example review.',author:'Example',rating:5,sourceUrl:'https://example.com',verified:true};
  const chosen=chooseConcept({key:'testimonial',date:next.date,concepts:[],reviews:[review],history:[{...old,review}]});
  assert.ok(chosen.awaitingCreative);
});
test('actual repeated booking and tip records are blocked', async () => {
  const {posts}=JSON.parse(await readFile(new URL('../content/calendar.json',import.meta.url)));
  for (const date of ['2026-10-16','2026-10-14']) assert.ok(contentHoldReason(posts.find(p=>p.date===date),posts));
});
