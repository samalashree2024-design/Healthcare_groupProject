// LOCAL DEMO ONLY. These routes are intentionally unauthenticated and accept
// only fictional sample patient IDs P101-P104. Do not deploy publicly.
const oracledb = require('oracledb');

module.exports = function registerClinicalDemoRoutes(app) {
  const DEMO_IDS = new Set(['P101', 'P102', 'P103', 'P104']);
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  };

  function checkDemoId(id) {
    return typeof id === 'string' && DEMO_IDS.has(id.toUpperCase())
      ? id.toUpperCase() : null;
  }
  async function rows(connection, sql, binds = {}) {
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    return result.rows;
  }
  async function handle(res, fn) {
    let connection;
    try {
      connection = await oracledb.getConnection(config);
      await fn(connection);
    } catch (error) {
      console.error('[clinical demo database]', error);
      if (!res.headersSent) res.status(500).json({
        success: false, error: 'Oracle query failed. Check the Node terminal.'
      });
    } finally {
      if (connection) {
        try { await connection.close(); }
        catch (error) { console.error('[clinical demo close]', error); }
      }
    }
  }

  app.get('/api/demo/patients', (req, res) => handle(res, async connection => {
    const patients = await rows(connection,
      `SELECT patient_id AS "id", name AS "name" FROM patient
       WHERE patient_id IN ('P101','P102','P103','P104') ORDER BY patient_id`);
    res.json({ success: true, patients, demoOnly: true });
  }));

  app.get('/api/demo/patients/:patientId', (req, res) => {
    const patientId = checkDemoId(req.params.patientId);
    if (!patientId) return res.status(404).json({success:false,error:'Not a demo patient ID'});
    return handle(res, async connection => {
      const patientRows = await rows(connection,
        `SELECT patient_id AS "id", name AS "name", age AS "age", gender AS "gender"
         FROM patient WHERE patient_id = :id`, {id:patientId});
      if (!patientRows.length) return res.status(404).json({success:false,error:'Patient not found'});

      const [labs, medications, history, allergies, diagnoses, predictions, symptoms] = await Promise.all([
        rows(connection, `SELECT lab_id AS "id", glucose AS "glucose",
          blood_pressure AS "bloodPressure", bmi AS "bmi",
          cholesterol AS "cholesterol", heart_rate AS "heartRate",
          TO_CHAR(test_date,'YYYY-MM-DD HH24:MI') AS "testDate"
          FROM laboratory_results WHERE patient_id = :id
          ORDER BY test_date DESC, lab_id DESC`, {id:patientId}),
        rows(connection, `SELECT pm.patient_medication_id AS "id",
          m.medicine_name AS "medicine", pm.dosage AS "dosage",
          TO_CHAR(pm.start_date,'YYYY-MM-DD') AS "startDate",
          TO_CHAR(pm.end_date,'YYYY-MM-DD') AS "endDate"
          FROM patient_medication pm JOIN medication m ON pm.medication_id=m.medication_id
          WHERE pm.patient_id=:id ORDER BY pm.start_date DESC`, {id:patientId}),
        rows(connection, `SELECT condition AS "condition",
          TO_CHAR(diagnosis_date,'YYYY-MM-DD') AS "date",
          description AS "description"
          FROM medical_history WHERE patient_id=:id ORDER BY diagnosis_date DESC`, {id:patientId}),
        rows(connection, `SELECT allergen AS "allergen", severity AS "severity",
          description AS "description" FROM allergy WHERE patient_id=:id`, {id:patientId}),
        rows(connection, `SELECT disease AS "disease",
          TO_CHAR(diagnosis_date,'YYYY-MM-DD') AS "date", remarks AS "remarks"
          FROM diagnosis WHERE patient_id=:id ORDER BY diagnosis_date DESC`, {id:patientId}),
        rows(connection, `SELECT disease AS "disease", risk_score AS "score",
          risk_level AS "level", model_name AS "model",
          TO_CHAR(prediction_date,'YYYY-MM-DD') AS "date"
          FROM prediction WHERE patient_id=:id ORDER BY prediction_date DESC`, {id:patientId}),
        rows(connection, `SELECT symptom_name AS "symptom", severity AS "severity",
          duration AS "duration" FROM symptoms WHERE patient_id=:id`, {id:patientId})
      ]);
      res.json({ success:true, patient:patientRows[0], labs, medications, history,
        allergies, diagnoses, predictions, symptoms, demoOnly:true });
    });
  });

  app.post('/api/demo/labs', (req, res) => {
    const body = req.body || {};
    const patientId = checkDemoId(body.patientId);
    if (!patientId) return res.status(400).json({success:false,error:'Select a fictional demo patient'});

    const numericSpecs = {
      glucose: [0, 9999.99], bmi: [0, 999.99],
      cholesterol: [0, 9999.99], heartRate: [0, 999]
    };
    const n = {};
    for (const [field, [min, max]] of Object.entries(numericSpecs)) {
      const raw = body[field];
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        return res.status(400).json({success:false,error:`Missing field: ${field}`});
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max ||
          (field === 'heartRate' && !Number.isInteger(value))) {
        return res.status(400).json({success:false,error:`Invalid ${field} for database column`});
      }
      n[field] = value;
    }
    const bp = String(body.bloodPressure ?? '').trim();
    if (!/^\d{1,3}\/\d{1,3}$/.test(bp) || bp.length > 20) {
      return res.status(400).json({success:false,error:'Use blood pressure format 120/80'});
    }

    return handle(res, async connection => {
      const found = await rows(connection,
        'SELECT patient_id AS "id" FROM patient WHERE patient_id=:id', {id:patientId});
      if (!found.length) return res.status(404).json({success:false,error:'Patient not found'});
      await connection.execute(
        `INSERT INTO laboratory_results
         (patient_id,glucose,blood_pressure,bmi,cholesterol,heart_rate,test_date)
         VALUES (:patientId,:glucose,:bp,:bmi,:cholesterol,:hr,SYSDATE)`, {
          patientId, glucose:n.glucose, bp, bmi:n.bmi,
          cholesterol:n.cholesterol, hr:n.heartRate
        });
      await connection.commit();
      res.status(201).json({success:true,message:'Fictional lab result saved to Oracle',patientId});
    });
  });
};
