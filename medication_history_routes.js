'use strict';
// Doctor-only educational timeline API. The two datasets are NEVER joined by ID.
const oracledb = require('oracledb');
const { validateProposal, summarizeHistory } = require('./medication_history_core');

const DEMO_IDS = new Set(['P101', 'P102', 'P103', 'P104']);
const PYTHON_API = 'http://127.0.0.1:8000';
const DISCLAIMER = 'Recorded prescription intervals are not proof of administration or adverse events. An overlap is not a verified drug interaction; no overlap does not establish safety. Not for clinical decisions.';

function ensureDoctor(req, res) {
  if (!req.session?.user) {
    res.status(401).json({success: false, error: 'Login required'});
    return false;
  }
  if (req.session.user.role !== 'doctor') {
    res.status(403).json({success: false, error: 'Doctor role required'});
    return false;
  }
  return true;
}

async function oracleConnection() {
  return oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  });
}

async function queryOracleHistory(connection, patientId) {
  const result = await connection.execute(
    `SELECT pm.patient_medication_id AS "id",
            m.medicine_name AS "medicine",
            TO_CHAR(pm.start_date,'YYYY-MM-DD') AS "startDate",
            TO_CHAR(pm.end_date,'YYYY-MM-DD') AS "endDate"
       FROM patient_medication pm
       JOIN medication m ON m.medication_id = pm.medication_id
      WHERE pm.patient_id = :id
      ORDER BY pm.start_date, pm.patient_medication_id`,
    {id: patientId},
    {outFormat: oracledb.OUT_FORMAT_OBJECT}
  );
  return result.rows;
}

async function checkedOraclePatient(connection, patientId) {
  const result = await connection.execute(
    'SELECT COUNT(*) FROM patient WHERE patient_id = :id', {id: patientId});
  return Number(result.rows[0][0]) !== 0;
}

async function withOracle(res, task) {
  let connection;
  try {
    connection = await oracleConnection();
    await task(connection);
  } catch (error) {
    console.error('[medication-history oracle]', error.code || error.message);
    if (!res.headersSent) res.status(503).json({success: false, error: 'Oracle history service unavailable'});
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

async function callLocalPython(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(PYTHON_API + path, {
      ...options,
      signal: controller.signal,
      headers: {'Accept': 'application/json', ...(options.headers || {})}
    });
    const body = await response.json();
    return {status: response.status, body};
  } finally {
    clearTimeout(timeout);
  }
}

function errorToResponse(res, error) {
  console.error('[medication-history python]', error.message);
  return res.status(503).json({
    success: false,
    error: 'Local Python history service unavailable. Start unified_api.py on 127.0.0.1:8000.'
  });
}

module.exports = function registerMedicationHistoryRoutes(app) {
  // GET /api/medication-history/oracle/P102
  app.get('/api/medication-history/oracle/:patientId', (req, res) => {
    if (!ensureDoctor(req, res)) return;
    const patientId = String(req.params.patientId).toUpperCase();
    if (!DEMO_IDS.has(patientId)) return res.status(404).json({success:false, error:'Unknown fictional demo patient'});
    return withOracle(res, async connection => {
      if (!await checkedOraclePatient(connection, patientId)) {
        return res.status(404).json({success:false, error:'Demo patient not found'});
      }
      const records = await queryOracleHistory(connection, patientId);
      res.set('Cache-Control','no-store');
      res.json({
        success: true, source: 'oracle_fictional_demo', patientId, records,
        missingEndMeaning: 'Unknown recorded end date; not proof of ongoing medication use',
        disclaimer: DISCLAIMER
      });
    });
  });

  // GET /api/medication-history/mimic/10001217?limit=30&offset=0
  app.get('/api/medication-history/mimic/:patientId', async (req, res) => {
    if (!ensureDoctor(req, res)) return;
    const patientId = String(req.params.patientId).trim();
    if (!/^\d{1,16}$/.test(patientId)) return res.status(400).json({success:false, error:'Enter a numeric de-identified MIMIC patient ID'});
    const limit = Number(req.query.limit ?? 30);
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isInteger(offset) || offset < 0 || offset > 100000) {
      return res.status(400).json({success:false, error:'limit must be 1–100; offset must be a non-negative integer'});
    }
    try {
      const r = await callLocalPython(`/patients/${patientId}/history?limit=${limit}&offset=${offset}`);
      res.set('Cache-Control', 'no-store');
      return res.status(r.status).json(r.status === 200
        ? {success:true, source:'mimic_iv_demo_deidentified', ...r.body,
           incompletePeriodsExcluded:true, disclaimer: DISCLAIMER}
        : {success:false, detail:r.body.detail || 'Patient history unavailable'});
    } catch (error) {
      return errorToResponse(res, error);
    }
  });

  // POST /api/medication-history/check
  // Oracle: {source:'oracle', patientId:'P102', medicineName:'Example Medicine',
  //          startDate:'2026-10-20', endDate:'2026-10-22'}
  // MIMIC:  {source:'mimic', patientId:'10001217', medicineName:'Example Medicine',
  //          start:'2157-12-20T09:00:00', end:'2157-12-22T09:00:00'}
  app.post('/api/medication-history/check', (req, res) => {
    if (!ensureDoctor(req, res)) return;
    const source = req.body?.source;
    if (source === 'oracle') {
      let proposal;
      try {
        proposal = validateProposal(req.body);
      } catch (error) {
        return res.status(400).json({success:false, error:error.message});
      }
      return withOracle(res, async connection => {
        if (!await checkedOraclePatient(connection, proposal.patientId)) {
          return res.status(404).json({success:false, error:'Fictional patient not found'});
        }
        const records = await queryOracleHistory(connection, proposal.patientId);
        res.set('Cache-Control','no-store');
        return res.json({success:true, source:'oracle_fictional_demo',
          ...summarizeHistory(records, proposal), disclaimer:DISCLAIMER});
      });
    }
    if (source === 'mimic') {
      const patientId = String(req.body?.patientId ?? '').trim();
      const medicineName = String(req.body?.medicineName ?? '').trim();
      const start = req.body?.start;
      const end = req.body?.end;
      if (!/^\d{1,16}$/.test(patientId) || !medicineName || medicineName.length > 150 ||
          typeof start !== 'string' || typeof end !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(start) ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(end)) {
        return res.status(400).json({success:false, error:'Provide numeric MIMIC patient ID, medicine name and start/end timestamps in YYYY-MM-DDTHH:MM[:SS] format'});
      }
      return (async () => {
        try {
          const r = await callLocalPython('/check-prescription', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({patient_id:patientId,medicine_name:medicineName,start,end})
          });
          res.set('Cache-Control','no-store');
          if (r.status !== 200) return res.status(r.status).json({success:false, detail:r.body.detail || 'Timeline check failed'});
          return res.json({
            success:true, source:'mimic_iv_demo_deidentified', patientId,
            proposedMedicine:medicineName, timeGranularity:'TIMESTAMP_HALF_OPEN',
            completeOverlapCount:r.body.recorded_overlap_count,
            sameNameOverlapCount:r.body.same_name_overlap_count,
            previousSameNamePeriodCount:r.body.previous_same_name_period_count,
            completeOverlaps:r.body.overlaps,
            overlapsTruncated:r.body.overlaps_truncated,
            incompletePeriodsExcluded:true,
            interactionAssessment:'NOT_PERFORMED_NO_VERIFIED_REFERENCE',
            allergyAssessment:'NOT_PERFORMED',
            dosageAssessment:'NOT_PERFORMED',
            disclaimer:DISCLAIMER
          });
        } catch (error) {
          return errorToResponse(res, error);
        }
      })();
    }
    return res.status(400).json({success:false, error:'source must be oracle or mimic'});
  });
};
