import test from "node:test";
import assert from "node:assert/strict";
import { chooseConcept, eligibleReview } from "../scripts/lib/campaigns.mjs";
import { normalizeReview, googleReviews } from "../scripts/import-reviews.mjs";

const review = { id: "test-only", text: "Test fixture, not a customer review.", author: "Test Author", rating: 5, sourceUrl: "https://example.com/review", verified: true };
test("reviews require verification, attribution, rating and source", () => {
  assert.ok(eligibleReview(review));
  for (const patch of [{ verified: false }, { sourceUrl: "" }, { author: "" }, { rating: 0 }, { text: "" }, { enabled: false }]) {
    assert.ok(!eligibleReview({ ...review, ...patch }));
  }
});

test("Google sync paginates and rejects a failed second page without returning partial data", async () => {
  const keys = { GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", GOOGLE_REFRESH_TOKEN: "test",
    GOOGLE_BUSINESS_LOCATION: "accounts/123/locations/456", GOOGLE_REVIEWS_URL: "https://example.com/reviews" };
  const saved = Object.fromEntries(Object.keys(keys).map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, keys);
  try {
    let calls = 0;
    globalThis.fetch = async url => {
      calls++;
      if (calls === 1) return Response.json({access_token: "test"});
      if (calls === 2) return Response.json({reviews: [{reviewId: "a", comment: "Fixture A", reviewer: {displayName: "Test"}, starRating: "FIVE"}], nextPageToken: "next"});
      assert.equal(new URL(url).searchParams.get("pageToken"), "next");
      return Response.json({reviews: [{reviewId: "b", comment: "Fixture B", reviewer: {displayName: "Test"}, starRating: "FOUR"}]});
    };
    assert.equal((await googleReviews()).length, 2);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return Response.json({access_token: "test"});
      if (calls === 2) return Response.json({reviews: [], nextPageToken: "next"});
      return new Response("unavailable", {status: 503});
    };
    await assert.rejects(googleReviews(), /no partial import saved/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
test("source review text is preserved and cannot repeat within 30 days", () => {
  const input = { key: "testimonial", date: "2026-09-10", concepts: [], reviews: [review] };
  const selected = chooseConcept(input);
  assert.ok(selected.caption.includes(review.text));
  assert.equal(selected.review.author, review.author);
  assert.equal(chooseConcept({ ...input, history: [{ date: "2026-09-01", status: "posted", review }] }), null);
});
test("review fallback is a booking concept, never an invented quotation", () => {
  const selected = chooseConcept({ key: "testimonial", date: "2026-09-10", concepts: [{id: "booking", pillar: "booking", caption: "Ask about grooming", headline: "We come to you"}], reviews: [] });
  assert.equal(selected.caption, "Ask about grooming");
  assert.equal(selected.review, undefined);
});
test("art and caption remain paired and recently used ads are excluded", () => {
  const concepts = [{ id: "one", pillar: "booking", caption: "One", asset: "one.png" }, { id: "two", pillar: "booking", caption: "Two", asset: "two.png" }];
  const result = chooseConcept({ key: "booking", date: "2026-09-10", concepts, reviews: [], history: [{date: "2026-09-09", status: "posted", conceptId: "one"}] });
  assert.equal(result.caption, "Two"); assert.equal(result.creativeAsset, "two.png");
});
test("Google normalization preserves exact text and manual imports need explicit verification", () => {
  const r = normalizeReview({reviewId: "123", comment: "Exact words & punctuation!", reviewer: {displayName: "Reviewer"}, starRating: "FIVE"}, "https://example.com", true);
  assert.equal(r.text, "Exact words & punctuation!"); assert.equal(r.rating, 5); assert.ok(r.verified);
  assert.equal(normalizeReview({...review, verified: undefined}).verified, false);
  assert.throws(() => normalizeReview({...review, sourceUrl: "javascript:bad"}));
});

test("fresh weekly creatives get priority while future and expired ads stay out", () => {
  const concepts = [
    {id:"old", pillar:"booking", caption:"Old"},
    {id:"fresh", pillar:"booking", caption:"Fresh", createdAt:"2026-09-07", availableFrom:"2026-09-07", expiresOn:"2026-11-07"},
    {id:"future", pillar:"booking", caption:"Future", createdAt:"2026-09-08", availableFrom:"2026-09-15"},
    {id:"expired", pillar:"booking", caption:"Expired", createdAt:"2026-09-09", expiresOn:"2026-09-09"}
  ];
  assert.equal(chooseConcept({key:"booking", date:"2026-09-10", concepts, reviews:[]}).caption, "Fresh");
});
