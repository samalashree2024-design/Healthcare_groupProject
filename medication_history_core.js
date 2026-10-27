'use strict';

// Educational date-only timeline comparison for fictional records.
// No drug-interaction, allergy, dose, ingestion, or clinical safety assessment.

function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validateProposal(input) {
  const patientId = String(input?.patientId ?? '').trim().toUpperCase();
  const medicineName = String(input?.medicineName ?? '').trim();
  const startDate = input?.startDate;
  const endDate = input?.endDate;
  if (!/^P10[1-4]$/.test(patientId)) throw new Error('Select a fictional patient ID from P101–P104.');
  if (!medicineName || medicineName.length > 100) throw new Error('Medicine name must be 1–100 characters.');
  if (!validDateOnly(startDate) || !validDateOnly(endDate)) {
    throw new Error('Enter startDate and endDate as real calendar dates in YYYY-MM-DD format.');
  }
  if (startDate > endDate) throw new Error('endDate cannot precede startDate.');
  return { patientId, medicineName, startDate, endDate };
}

function summarizeHistory(rows, proposal) {
  const completeOverlaps = [];
  const uncertainPeriods = [];
  const priorSameNamePeriods = [];
  const invalidPeriods = [];
  const proposedName = normalizeName(proposal.medicineName);

  for (const row of rows) {
    const id = Number(row.id);
    const medicine = String(row.medicine ?? '');
    const startDate = row.startDate || null;
    const endDate = row.endDate || null;
    const sameRecordedName = normalizeName(medicine) === proposedName;
    const entry = {
      id, medicine, startDate, endDate,
      sameRecordedName, source: 'oracle_fictional_demo'
    };
    if ((startDate !== null && !validDateOnly(startDate)) ||
        (endDate !== null && !validDateOnly(endDate)) ||
        (startDate && endDate && startDate > endDate)) {
      invalidPeriods.push({ ...entry, reason: 'INVALID_RECORDED_DATES' });
      continue;
    }
    if (startDate && endDate) {
      if (endDate < proposal.startDate) {
        if (sameRecordedName) priorSameNamePeriods.push(entry);
        continue;
      }
      if (startDate > proposal.endDate) continue;
      completeOverlaps.push({
        ...entry,
        overlapStartDate: startDate > proposal.startDate ? startDate : proposal.startDate,
        overlapEndDate: endDate < proposal.endDate ? endDate : proposal.endDate
      });
    } else {
      // No definitive overlap can be established without both boundaries.
      // However, non-overlap can sometimes be established using the known boundary.
      if (startDate && startDate > proposal.endDate) continue;
      if (endDate && endDate < proposal.startDate) {
        if (sameRecordedName) priorSameNamePeriods.push(entry);
        continue;
      }
      uncertainPeriods.push({
        ...entry,
        reason: !startDate && !endDate ? 'START_AND_END_UNKNOWN'
          : !startDate ? 'START_UNKNOWN' : 'END_UNKNOWN'
      });
    }
  }
  const sameNameOverlapCount = completeOverlaps.filter(r => r.sameRecordedName).length;
  const sameNameUncertainCount = uncertainPeriods.filter(r => r.sameRecordedName).length;
  return {
    patientId: proposal.patientId,
    proposedMedicine: proposal.medicineName,
    proposedStartDate: proposal.startDate,
    proposedEndDate: proposal.endDate,
    scope: 'FICTIONAL_ORACLE_PATIENT_RECORDS_ONLY',
    comparisonGranularity: 'CALENDAR_DAY_INCLUSIVE',
    recordsReviewed: rows.length,
    completeOverlapCount: completeOverlaps.length,
    sameNameOverlapCount,
    uncertainPeriodCount: uncertainPeriods.length,
    sameNameUncertainCount,
    previousSameNamePeriodCount: priorSameNamePeriods.length,
    invalidPeriodCount: invalidPeriods.length,
    completeOverlaps,
    uncertainPeriods,
    previousSameNamePeriods: priorSameNamePeriods,
    invalidPeriods,
    interactionAssessment: 'NOT_PERFORMED_NO_VALIDATED_REFERENCE',
    allergyAssessment: 'NOT_PERFORMED',
    dosageAssessment: 'NOT_PERFORMED',
    message: 'Date comparisons concern prescription records, not confirmed use. Missing end dates remain unknown. No recorded overlap is not evidence of safety.',
    disclaimer: 'Educational fictional-record demonstration only; not a clinical decision or prescribing system.'
  };
}

module.exports = { normalizeName, validDateOnly, validateProposal, summarizeHistory };
