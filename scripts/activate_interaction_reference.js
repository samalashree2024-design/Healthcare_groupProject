'use strict';
// Idempotent integration against the previously tested medication_history_routes.js.
// Does not edit database, frontend, auth, .env, or the Python API.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const filename = path.join(root, 'medication_history_routes.js');
const registry = path.join(root, 'reference', 'interaction_pairs.json');
function stop(message) { console.error('ACTIVATION STOPPED:', message); process.exit(1); }
if (!fs.existsSync(filename) || !fs.existsSync(registry)) {
  stop('Open Healthcare_groupProject-git and extract the package before running this installer.');
}
let source = fs.readFileSync(filename, 'utf8');
if (source.includes('checkPairs(') && source.includes('referenceReview:')) {
  console.log('Interaction reference integration already installed; no changes made.');
  process.exit(0);
}
const lineBreak = source.includes('\r\n') ? '\r\n' : '\n';
const importMarker = "const { validateProposal, summarizeHistory } = require('./medication_history_core');";
const oracleMarker = "res.set('Cache-Control','no-store');\n        return res.json({success:true, source:'oracle_fictional_demo',\n          ...summarizeHistory(records, proposal), disclaimer:DISCLAIMER});";
const mimicMarker = "incompletePeriodsExcluded:true,\n            interactionAssessment:'NOT_PERFORMED_NO_VERIFIED_REFERENCE',";
// Match either LF or CRLF and no alternate versions silently.
const oraclePattern = /res\.set\('Cache-Control','no-store'\);\s*return res\.json\(\{success:true, source:'oracle_fictional_demo',\s*\.\.\.summarizeHistory\(records, proposal\), disclaimer:DISCLAIMER\}\);/;
const mimicPattern = /incompletePeriodsExcluded:true,\s*interactionAssessment:'NOT_PERFORMED_NO_VERIFIED_REFERENCE',/;
if (!source.includes(importMarker) || !oraclePattern.test(source) || !mimicPattern.test(source)) {
  stop('The route file differs from the tested version. No files changed. Do not overwrite your working routes.');
}
let updated = source.replace(importMarker, importMarker + lineBreak + "const { checkPairs } = require('./interaction_reference');");
updated = updated.replace(oraclePattern,
  `const timeline = summarizeHistory(records, proposal);${lineBreak}        const referenceReview = checkPairs(proposal.medicineName,${lineBreak}          timeline.completeOverlaps, timeline.uncertainPeriods);${lineBreak}        res.set('Cache-Control','no-store');${lineBreak}        return res.json({success:true, source:'oracle_fictional_demo',${lineBreak}          ...timeline, referenceReview, disclaimer:DISCLAIMER});`);
updated = updated.replace(mimicPattern,
  `incompletePeriodsExcluded:true,${lineBreak}            referenceReview: checkPairs(medicineName, r.body.overlaps || [], [], {${lineBreak}              incompletePeriodsExcluded:true, overlapsTruncated:!!r.body.overlaps_truncated${lineBreak}            }),${lineBreak}            interactionAssessment:'NOT_PERFORMED_NO_VERIFIED_REFERENCE',`);
if (updated === source || !updated.includes('referenceReview: checkPairs(') || !updated.includes('const referenceReview = checkPairs(')) {
  stop('Could not verify both source integrations; no files changed.');
}
fs.writeFileSync(filename, updated, 'utf8');
console.log('Interaction reference lookup added to existing Oracle + MIMIC medication check responses.');
console.log('No old data or user accounts changed.');
