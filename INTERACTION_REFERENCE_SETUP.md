# Medication interaction reference layer — local educational prototype

**Status:** Source-aware reference matching is implemented. The reviewed reference registry ships EMPTY: no real interaction pair is asserted as verified. To populate it, authorized faculty/clinical reviewers must review official label sources and approve each structured pair; matching metadata alone is not enough for clinical validity. No actual patient records, external services or credentials are transmitted.

This addition does not change or retrain the three disease prediction models. It does not connect MIMIC IDs to Oracle fictional IDs, and it does not change the earlier temporal grouping/overlap rules.

## Installation (GitHub-connected project)

PowerShell commands, run one at a time:

```powershell
cd "C:\Users\malin\Downloads\Healthcare_groupProject-git"
Test-Path "$env:USERPROFILE\Downloads\healthcare_interaction_reference_integration.zip"
Expand-Archive -Path "$env:USERPROFILE\Downloads\healthcare_interaction_reference_integration.zip" -DestinationPath . -Force
node .\scripts\activate_interaction_reference.js
node --check .\medication_history_routes.js
node --test .\tests\medication_history.test.js .\tests\medication_history_routes.test.js .\tests\interaction_reference.test.js
```

Expected **16 passing tests** (existing 9 + new 7), if existing tests have not changed.

Restart Node on 127.0.0.1:3000 and make sure the Python API is running on 127.0.0.1:8000. Then rerun:

```powershell
node .\scripts\test_medication_history_api.js
node .\scripts\test_interaction_reference_api.js
```

The response of the already-authenticated doctor-only `POST /api/medication-history/check` now contains `referenceReview` for BOTH `source: oracle` and `source: mimic`, without deleting the existing timeline results. By default:

```json
"referenceReview": {
  "assessmentType":"SOURCE_LINKED_EDUCATIONAL_REVIEW_ONLY",
  "referenceRegistryCount":0,
  "status":"NO_REVIEWED_REFERENCE_DATA_LOADED",
  "sourceLinkedMatches":[]
}
```

The exact payload has additional fields for incomplete timelines, counts and disclaimers. **Empty array or no match means UNKNOWN, never safe.**

## Why the reference registry is empty

The Oracle `DRUG_INTERACTION` table has fictional sample entries, not validated sources. They are not imported. The U.S. NLM RxNav drug-drug interaction API was retired January 2, 2024; this module does not call it. For a trustworthy non-demo reference library, each asserted pair would need separately reviewed source documentation and an appropriate coverage/licensing policy. No medical source content is supplied by this package.

## Why source fields are necessary

`reference/interaction_pairs.json` requires: `schema_version:1`, `reviewed_pairs:[]`. The data validator requires exact medicine names, an official-source URL, a document title, a short reviewer-authored evidence summary, reviewer identifier, review date and `review_status: source_checked`. Even with these fields, the UI/API reports `SOURCE_LINKED_MATCH_REQUIRES_PROFESSIONAL_REVIEW`, **never** safe/unsafe or a severity score. This metadata check cannot validate clinical content; reviewers must verify it.

**Research-only scope:** Prescription record periods do not prove use. Missing dates are uncertain. Medication clearance/washout, dosage appropriateness, allergies and interaction causality are out of scope. Real medical decisions require qualified oversight.

## Git checkpoint after real API test passes

```powershell
git status
git add interaction_reference.js reference/interaction_pairs.json scripts/activate_interaction_reference.js scripts/test_interaction_reference_api.js tests/interaction_reference.test.js medication_history_routes.js INTERACTION_REFERENCE_SETUP.md
git diff --cached --name-only
git -c core.whitespace=cr-at-eol diff --cached --check
git commit -m "Add source-aware medication interaction reference review"
git push
```

Do not add `.env`, downloaded MIMIC files, real patient data, trained models, or unreviewed medication interaction pairs.
