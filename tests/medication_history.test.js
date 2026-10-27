'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validDateOnly, validateProposal, summarizeHistory } = require('../medication_history_core');
const proposal = validateProposal({
  patientId:'p103', medicineName:'Example A', startDate:'2026-10-10', endDate:'2026-10-12'
});

test('validates real calendar dates and order', () => {
  assert.equal(validDateOnly('2026-02-30'), false);
  assert.equal(validDateOnly('2026-10-12'), true);
  assert.throws(() => validateProposal({patientId:'P103',medicineName:'X',startDate:'2026-10-12',endDate:'2026-10-10'}));
  assert.throws(() => validateProposal({patientId:'NONDEMO',medicineName:'X',startDate:'2026-10-10',endDate:'2026-10-12'}));
});

test('complete recorded periods overlap using inclusive calendar days', () => {
  const result = summarizeHistory([{id:1,medicine:'Example B',startDate:'2026-10-09',endDate:'2026-10-10'}], proposal);
  assert.equal(result.completeOverlapCount, 1);
  assert.equal(result.completeOverlaps[0].overlapStartDate, '2026-10-10');
});

test('unknown end date is uncertain, NOT definite overlap', () => {
  const result = summarizeHistory([{id:2,medicine:'Example A',startDate:'2026-10-01',endDate:null}],proposal);
  assert.equal(result.completeOverlapCount, 0);
  assert.equal(result.uncertainPeriodCount, 1);
  assert.equal(result.sameNameUncertainCount, 1);
});

test('earlier same-name period counts without overlap', () => {
  const result = summarizeHistory([{id:3,medicine:' example  A ',startDate:'2026-09-01',endDate:'2026-09-20'}],proposal);
  assert.equal(result.completeOverlapCount, 0);
  assert.equal(result.previousSameNamePeriodCount, 1);
});

test('future known start does not overlap even with unknown end', () => {
  const result = summarizeHistory([{id:4,medicine:'Example A',startDate:'2026-11-01',endDate:null}],proposal);
  assert.equal(result.uncertainPeriodCount, 0);
});

test('date overlap never implies clinical interaction or safety', () => {
  const result = summarizeHistory([{id:5,medicine:'Example B',startDate:'2026-10-10',endDate:'2026-10-12'}],proposal);
  assert.match(result.interactionAssessment, /NOT_PERFORMED/);
  assert.match(result.message, /not evidence of safety/);
});
