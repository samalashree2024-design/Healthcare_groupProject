'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {checkPairs, validateRegistry, loadRegistry} = require('../interaction_reference');
const reviewFixture = {
  schema_version:1,
  reviewed_pairs:[{
    medicine_a:'Example Substance A', medicine_b:'Example Substance B',
    source_title:'Simulated test document — not a real drug label',
    source_url:'https://www.fda.gov/example-test-document',
    documented_text_summary:'FAKE TEST EVIDENCE; NOT A MEDICAL CLAIM',
    reviewed_by:'Automated fixture, not clinical review',
    reviewed_on:'2026-10-27', review_status:'source_checked'
  }]
};
const entries=validateRegistry(reviewFixture);
test('real registry is empty by design, makes no unsupported clinical claims',()=>{
  assert.equal(loadRegistry().length,0);
  const result=checkPairs('Example Substance A',[{medicine:'Example Substance B'}]);
  assert.equal(result.status,'NO_REVIEWED_REFERENCE_DATA_LOADED');
  assert.equal(result.sourceLinkedMatches.length,0);
  assert.equal(result.pairsWithoutReviewedMatch,1);
});
test('simulated source-linked pair works in both input orders',()=>{
  const r=checkPairs('Example Substance A',[{medicine:' example  substance B '}],[],{entries});
  assert.equal(r.sourceLinkedMatches.length,1);
  assert.equal(r.status,'SOURCE_LINKED_MATCH_REQUIRES_PROFESSIONAL_REVIEW');
  const swapped=checkPairs('Example Substance B',[{medicine:'EXAMPLE SUBSTANCE A'}],[],{entries});
  assert.equal(swapped.sourceLinkedMatches.length,1);
});
test('different names without a reference remain unknown, never safe',()=>{
  const r=checkPairs('Example Substance A',[{medicine:'Unrelated Name'}],[],{entries});
  assert.equal(r.sourceLinkedMatches.length,0);
  assert.equal(r.status,'NO_MATCH_FOUND_STATUS_UNKNOWN');
});
test('same name overlap is not a drug-drug reference match',()=>{
  const r=checkPairs('Example Substance A',[{medicine:'EXAMPLE SUBSTANCE A'}],[],{entries});
  assert.equal(r.sameNameOverlapRecords,1);
  assert.equal(r.sourceLinkedMatches.length,0);
});
test('unknown timeline cannot be called a definite overlap',()=>{
  const r=checkPairs('Example Substance A',[],[{medicine:'Example Substance B',reason:'END_UNKNOWN'}],{entries});
  assert.equal(r.sourceLinkedMatches.length,0);
  assert.equal(r.uncertainDateRecords[0].timeline,'UNDETERMINED');
});
test('reject missing source or non-official source metadata',()=>{
  assert.throws(()=>validateRegistry({schema_version:1, reviewed_pairs:[{
    ...reviewFixture.reviewed_pairs[0], source_url:'https://example.com/claims'
  }]}));
  assert.throws(()=>validateRegistry({schema_version:1, reviewed_pairs:[{
    ...reviewFixture.reviewed_pairs[0], reviewed_by:''
  }]}));
});
test('truncated and incomplete history is flagged explicitly',()=>{
  const r=checkPairs('Example Substance A',[{medicine:'Example Substance B'}],[],{
    entries, overlapsTruncated:true, incompletePeriodsExcluded:true
  });
  assert.ok(r.notes.some(x=>x.includes('truncated')));
  assert.ok(r.notes.some(x=>x.includes('excluded')));
});
