'use strict';
// Research-demo reference layer. NEVER interprets absence of a reference as safety.
// Exact normalized names only; no fuzzy matching, ingredient mapping or severity inference.
const fs = require('node:fs');
const path = require('node:path');
const REGISTRY_PATH = path.join(__dirname, 'reference', 'interaction_pairs.json');

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
function officialSource(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'https:' && [
      'dailymed.nlm.nih.gov', 'fda.gov', 'www.fda.gov',
      'accessdata.fda.gov', 'www.accessdata.fda.gov'
    ].includes(url.hostname.toLowerCase());
  } catch { return false; }
}
function validateRegistry(registry) {
  if (!registry || registry.schema_version !== 1 || !Array.isArray(registry.reviewed_pairs)) {
    throw new Error('Invalid interaction reference registry format');
  }
  const approved = [];
  for (const entry of registry.reviewed_pairs) {
    const fields = ['medicine_a','medicine_b','source_title','source_url','documented_text_summary','reviewed_by','reviewed_on'];
    if (!entry || entry.review_status !== 'source_checked' ||
        fields.some(f => typeof entry[f] !== 'string' || !entry[f].trim()) ||
        !officialSource(entry.source_url) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed_on) ||
        entry.medicine_a.length > 150 || entry.medicine_b.length > 150 ||
        entry.documented_text_summary.length > 1000 ||
        normalize(entry.medicine_a) === normalize(entry.medicine_b)) {
      throw new Error('Registry entry needs two distinct names, official HTTPS document, and documented human source review');
    }
    const a=normalize(entry.medicine_a), b=normalize(entry.medicine_b);
    if (!a || !b) throw new Error('Missing medicine identity');
    approved.push({
      key: [a,b].sort().join('\u001f'),
      details: {
        sourceTitle: entry.source_title,
        sourceUrl: entry.source_url,
        documentedTextSummary: entry.documented_text_summary,
        reviewedBy: entry.reviewed_by,
        reviewedOn: entry.reviewed_on,
        referenceStatus: 'SOURCE_LINKED_REVIEW_REQUIRED'
      }
    });
  }
  return approved;
}
function loadRegistry(registryPath = REGISTRY_PATH) {
  const json = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  return validateRegistry(json);
}
function checkPairs(proposedName, completeOverlaps = [], uncertainPeriods = [], opts = {}) {
  const entries = opts.entries ?? loadRegistry();
  const proposed = normalize(proposedName);
  if (!proposed) throw new Error('Proposed medicine name is required');
  if (!Array.isArray(completeOverlaps) || !Array.isArray(uncertainPeriods)) {
    throw new Error('Timeline comparison records must be arrays');
  }
  const found = [];
  let checkedPairs = 0, sameNamePairs = 0, unknownPairs = 0;
  // Only confirmed date-overlap pairs are candidates for a positive temporal match.
  for (const row of completeOverlaps) {
    const existing = normalize(row.medicine);
    if (!existing) { unknownPairs += 1; continue; }
    if (existing === proposed) { sameNamePairs += 1; continue; }
    checkedPairs += 1;
    const key = [existing, proposed].sort().join('\u001f');
    const matched = entries.find(r => r.key === key);
    if (matched) {
      found.push({
        existingMedicine: String(row.medicine),
        proposedMedicine: String(proposedName),
        timeline: 'RECORDED_OVERLAP',
        reference: matched.details
      });
    } else unknownPairs += 1;
  }
  const uncertain = uncertainPeriods.map(row => ({
    existingMedicine: String(row.medicine || ''),
    reason: row.reason || 'INCOMPLETE_PERIOD',
    timeline: 'UNDETERMINED'
  }));
  const notes = [
    'Reference lookup is limited to exact normalized recorded names in a manually reviewed local registry.',
    'No reference match means UNKNOWN, never safe; label matching is not a comprehensive drug-interaction service.',
    'A recorded prescription overlap does not prove that medicines were administered together or caused harm.',
    'Past exposure, drug persistence, allergies and dosage are not evaluated.'
  ];
  if (opts.incompletePeriodsExcluded) notes.push('MIMIC records with incomplete date periods were excluded before this check.');
  if (opts.overlapsTruncated) notes.push('Overlap details are truncated; reference results may omit additional pairs.');
  return {
    assessmentType: 'SOURCE_LINKED_EDUCATIONAL_REVIEW_ONLY',
    referenceRegistryCount: entries.length,
    status: entries.length === 0 ? 'NO_REVIEWED_REFERENCE_DATA_LOADED'
      : found.length ? 'SOURCE_LINKED_MATCH_REQUIRES_PROFESSIONAL_REVIEW'
      : 'NO_MATCH_FOUND_STATUS_UNKNOWN',
    definiteOverlapPairsReviewed: checkedPairs,
    sameNameOverlapRecords: sameNamePairs,
    pairsWithoutReviewedMatch: unknownPairs,
    uncertainDateRecords: uncertain,
    sourceLinkedMatches: found,
    notes
  };
}
module.exports = { normalize, officialSource, validateRegistry, loadRegistry, checkPairs };
