'use strict';
// Run from project root: node scripts/test_medication_history_api.js
// Makes no database changes. The MIMIC test requires a running local Python API.
require('dotenv').config();
const BASE = 'http://127.0.0.1:3000';
async function jsonRequest(path, method='GET', payload, cookie='') {
  const response = await fetch(BASE + path, {
    method,
    headers: {'Content-Type':'application/json', ...(cookie ? {Cookie:cookie} : {})},
    ...(payload === undefined ? {} : {body:JSON.stringify(payload)})
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  return {status:response.status, body, cookie:(response.headers.get('set-cookie') || '').split(';')[0]};
}
function check(condition, explanation) {
  if (!condition) throw new Error('FAILED: '+explanation);
  console.log('PASS:',explanation);
}
(async () => {
  const unauthorized = await jsonRequest('/api/medication-history/oracle/P102');
  check(unauthorized.status === 401, 'Anonymous request blocked (401)');
  const password = process.env.DEMO_DOCTOR_PASSWORD;
  if (!password) throw new Error('Set DEMO_DOCTOR_PASSWORD in your local .env file');
  const doctor = await jsonRequest('/api/auth/login', 'POST', {username:'doctor_demo', password});
  check(doctor.status === 200 && doctor.cookie, 'Doctor authenticated without displaying password');
  const oracle = await jsonRequest('/api/medication-history/oracle/P102','GET',undefined,doctor.cookie);
  check(oracle.status === 200 && Array.isArray(oracle.body.records), 'Fictional Oracle prescription history retrieved');
  const oracleCheck = await jsonRequest('/api/medication-history/check','POST',{
    source:'oracle', patientId:'P102', medicineName:'Example Medicine',
    startDate:'2026-10-20',endDate:'2026-10-22'
  },doctor.cookie);
  check(oracleCheck.status === 200 && oracleCheck.body.success === true &&
        typeof oracleCheck.body.uncertainPeriodCount === 'number',
        'Oracle temporal check responds, including unknown-date review');
  check(/NOT_PERFORMED/.test(oracleCheck.body.interactionAssessment),
        'Oracle result never claims clinically verified interactions');
  const mimic = await jsonRequest('/api/medication-history/check','POST',{
    source:'mimic',patientId:'10001217',medicineName:'Example Medicine',
    start:'2157-12-20T09:00:00',end:'2157-12-22T09:00:00'
  },doctor.cookie);
  if (mimic.status !== 200) {
    throw new Error(`MIMIC API status ${mimic.status}. Is the cloned project's Python API running on 8000 with medication_periods.csv? ${JSON.stringify(mimic.body)}`);
  }
  check(mimic.body.success === true && typeof mimic.body.completeOverlapCount === 'number',
        'MIMIC timeline checker returns overlap counts');
  check(mimic.body.incompletePeriodsExcluded === true,
        'MIMIC result clearly flags excluded incomplete periods');
  if (process.env.DEMO_PATIENT_P102_PASSWORD) {
    const patient = await jsonRequest('/api/auth/login','POST',{
      username:'patient_p102',password:process.env.DEMO_PATIENT_P102_PASSWORD
    });
    check(patient.status === 200 && patient.cookie, 'Patient account login works');
    const blocked = await jsonRequest('/api/medication-history/check','POST',{
      source:'oracle',patientId:'P101',medicineName:'Example',
      startDate:'2026-10-20',endDate:'2026-10-22'
    },patient.cookie);
    check(blocked.status === 403,'Patient cannot invoke doctor prescription checker (403)');
  } else {
    console.log('SKIP: patient access test (DEMO_PATIENT_P102_PASSWORD not set)');
  }
  console.log('\nMEDICATION HISTORY BACKEND: ALL CHECKS PASSED');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
