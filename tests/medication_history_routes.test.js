'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {summarizeHistory, validateProposal} = require('../medication_history_core');
const proposal = validateProposal({patientId:'P102',medicineName:'Drug A',startDate:'2026-10-20',endDate:'2026-10-21'});
test('missing both interval boundaries requires review',()=>{
  const result = summarizeHistory([{id:1,medicine:'Drug A',startDate:null,endDate:null}],proposal);
  assert.equal(result.uncertainPeriodCount,1);
  assert.equal(result.completeOverlapCount,0);
  assert.equal(result.uncertainPeriods[0].reason,'START_AND_END_UNKNOWN');
});
test('known previous date is not assumed active',()=>{
  const result = summarizeHistory([{id:1,medicine:'Drug A',startDate:'2026-01-01',endDate:'2026-01-10'}],proposal);
  assert.equal(result.previousSameNamePeriodCount,1);
  assert.equal(result.completeOverlapCount,0);
});
test('same-name overlap is recorded but interaction not asserted',()=>{
  const result = summarizeHistory([{id:1,medicine:' DRUG  A ',startDate:'2026-10-20',endDate:'2026-10-25'}],proposal);
  assert.equal(result.sameNameOverlapCount,1);
  assert.match(result.interactionAssessment,/NOT_PERFORMED/);
});
