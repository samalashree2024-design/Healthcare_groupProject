# Medication History Backend — MIMIC + Oracle (local educational demo)

This module adds **one doctor-only Express API** that accepts either:

- **MIMIC-IV Demo**, historical, de-identified prescription timeline data already prepared by your Python scripts in `database/data/processed/medication_periods.csv`. Uses the existing FastAPI endpoints on `127.0.0.1:8000`. Original sample: 18,087 prescription records; your earlier processing produced 11,374 grouped medication periods. The 1-hour-gap grouping is a **software heuristic**, not a clinical rule.
- **Oracle**, your four **fictional** patients P101–P104, including prescription intervals with missing dates.

**Never mix the MIMIC patient IDs with fictional Oracle patient IDs.** Neither source establishes that a drug was actually administered. Neither module makes a medication-interaction, allergy, washout, or dose-safety determination. A verified medication-interaction reference is a *separate unfinished feature*.

## 1. Installation — in the GIT folder, not the old ZIP folder

Go to the project in PowerShell:

```powershell
cd "C:\Users\malin\Downloads\Healthcare_groupProject-git"
```

Download `healthcare_medication_history_backend.zip` into Downloads, then:

```powershell
Test-Path "$env:USERPROFILE\Downloads\healthcare_medication_history_backend.zip"
Expand-Archive -Path "$env:USERPROFILE\Downloads\healthcare_medication_history_backend.zip" -DestinationPath . -Force
```

If the test returns `False`, locate the actual download before extracting. Extraction creates only new module, test and helper files; it does NOT overwrite your earlier `server.js`, `demo_auth.js`, dashboard, .env, Python API, or datasets.

Verify:

```powershell
Test-Path .\medication_history_routes.js
Test-Path .\medication_history_core.js
Test-Path .\scripts\activate_medication_history.js
```

All should be `True`.

## 2. Automatically connect your existing backend/auth (no manual editing)

```powershell
node .\scripts\activate_medication_history.js
```

This performs two minimal code changes:

1. Adds `require('./medication_history_routes')(app);` below the existing `clinical_demo_routes` registration in `server.js`.
2. Adds a **doctor-only allowlist** for the new GET/POST endpoints inside the existing Express auth middleware in `demo_auth.js`.

The installer is idempotent and checks both expected markers before modifying either file. If it refuses to run, **do not paste `app.use(...)` into PowerShell**. Inspect its error and share it.

`demo_auth` must still be registered after `express.json()` and before `express.static('public')` / all API routes. Bind Node to `127.0.0.1` for this local demo.

## 3. Unit tests (do not require Oracle, Python or login)

```powershell
node --check .\server.js
node --check .\demo_auth.js
node --check .\medication_history_routes.js
node --test .\tests\medication_history.test.js .\tests\medication_history_routes.test.js
```

Expected: 9 tests pass. These check date validation, same-name history, inclusive Oracle dates, missing/unknown end dates, and ensure date overlaps don't automatically become interaction claims.

## 4. Run both existing servers

Python API, **from the Git-connected project's ai folder** (if not already running):

```powershell
cd "C:\Users\malin\Downloads\Healthcare_groupProject-git\database\ai"
python -m uvicorn unified_api:app --host 127.0.0.1 --port 8000
```

Node API in **a separate terminal**:

```powershell
cd "C:\Users\malin\Downloads\Healthcare_groupProject-git"
node server.js
```

If either port is occupied, **do not start another instance**. Use the existing correct project server, or shut down the old one safely first. The earlier `.env` (Oracle and demo account passwords) is used unchanged.

Check processed data in the GIT folder:

```powershell
Test-Path .\database\data\processed\medication_periods.csv
```

If `False`, copy your previously generated processed CSV from the old working folder, **not into Git**:

```powershell
New-Item -ItemType Directory -Force .\database\data\processed | Out-Null
Copy-Item "$env:USERPROFILE\Downloads\Healthcare_groupProject-main\Healthcare_groupProject-main\database\data\processed\medication_periods.csv" .\database\data\processed\ -Force
```

Do not copy a MIMIC CSV into your Oracle PATIENT table or merge its IDs with P101–P104.

## 5. Full authenticated API smoke test (no frontend, no writes)

Open another PowerShell terminal **in the project root**:

```powershell
cd "C:\Users\malin\Downloads\Healthcare_groupProject-git"
node .\scripts\test_medication_history_api.js
```

The test uses the already-configured `doctor_demo` password from the private `.env` file, obtains a session cookie, and checks:

- anonymous access is denied with **401**;
- doctor can view fictional Oracle P102 prescription history;
- doctor can submit a fictional Oracle proposed timeline, including unknown-end warnings;
- doctor can submit a MIMIC example using de-identified patient ID `10001217` and shifted dates in 2157;
- patient login, when configured, is denied use of the doctor-only prescription checker with **403**.

No passwords are printed. This test **does not** save or alter a prescription, patient or lab entry.

## 6. API contract

Requires a signed-in **doctor** session to Express (`localhost:3000`). Examples:

### Oracle fictional patient

`POST /api/medication-history/check`

```json
{
  "source": "oracle",
  "patientId": "P102",
  "medicineName": "Example Medicine",
  "startDate": "2026-10-20",
  "endDate": "2026-10-22"
}
```

All date comparisons here use **inclusive calendar days** because Oracle demo fields are SQL DATE values presented as YYYY-MM-DD. Missing end dates are **uncertain**, not active or confirmed overlapping.

### MIMIC de-identified research patient

`POST /api/medication-history/check`

```json
{
  "source": "mimic",
  "patientId": "10001217",
  "medicineName": "Example Medicine",
  "start": "2157-12-20T09:00:00",
  "end": "2157-12-22T09:00:00"
}
```

MIMIC comparisons use timestamp intervals **[start, end)**, so a medicine stopping exactly when another begins is not counted as overlap. Only complete valid periods were retained by earlier preprocessing; incomplete periods are explicitly flagged as excluded. Shifted dates are **not present-day clinical dates**. Start/end times in source are prescription intervals, not proof of ingestion.

### Read-only history

- `GET /api/medication-history/oracle/P102`
- `GET /api/medication-history/mimic/10001217?limit=30&offset=0`

These are doctor-only. Keep Python FastAPI bound to loopback; it is *not itself authenticated by Express*.

## 7. Git checkpoint — only when tests pass

```powershell
git status
git add server.js demo_auth.js medication_history_core.js medication_history_routes.js scripts/activate_medication_history.js scripts/test_medication_history_api.js tests/medication_history.test.js tests/medication_history_routes.test.js MEDICATION_HISTORY_SETUP.md
```

If the demo login files are still untracked, stage them too (they are required by the route):

```powershell
git add database/setup_demo_users.js public/login-demo.html package.json package-lock.json
```

Then:

```powershell
git diff --cached --name-only
git -c core.whitespace=cr-at-eol diff --cached --check
git ls-files .env database/data/raw database/data/processed database/ai/models
```

Do not commit if secrets or patient datasets appear, or if the formatting check fails. Finally:

```powershell
git commit -m "Integrate MIMIC and Oracle medication history checks"
git push
git status
```

**Never** run `git add .` without reviewing its effects. Your private `.env`, raw MIMIC data, processed CSV and trained model binaries stay out of GitHub.

## What this milestone does NOT finish

- Clinically validated drug-drug interaction identification and substance-name normalization (same spelling is not enough)
- Actual medication administrations and adherence
- Pharmacological washout/residual effects
- Allergy, dose, contraindication and adverse drug event prediction
- Production-grade security and clinical validation

Those claims must not be made from simple temporal overlap. The existing demonstration `drug_interaction` rows, if present, are illustrative until reviewed against an authoritative source.
