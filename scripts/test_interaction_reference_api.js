'use strict';
// Authenticated read-only smoke test for the locally running Node + Python servers.
require('dotenv').config();
const ROOT = 'http://127.0.0.1:3000';
async function request(path, method='GET', data, cookie='') {
  const response = await fetch(ROOT + path, {
    method,
    headers: {'Content-Type':'application/json', ...(cookie?{Cookie:cookie}:{})},
    ...(data === undefined ? {} : {body:JSON.stringify(data)})
  });
  const body = await response.json().catch(()=>({}));
  return {status: response.status, body, cookie: (response.headers.get('set-cookie')||'').split(';')[0]};
}
function assert(condition, message) { if(!condition) throw Error('FAILED: '+message); console.log('PASS:', message); }
(async()=>{
  const anonymous = await request('/api/medication-history/check','POST',{
    source:'oracle',patientId:'P102',medicineName:'Example Medicine',startDate:'2026-10-20',endDate:'2026-10-22'
  });
  assert(anonymous.status===401,'Anonymous reference checks blocked');
  if (!process.env.DEMO_DOCTOR_PASSWORD) throw Error('DEMO_DOCTOR_PASSWORD missing in local .env');
  const login=await request('/api/auth/login','POST',{username:'doctor_demo',password:process.env.DEMO_DOCTOR_PASSWORD});
  assert(login.status===200 && login.cookie,'Doctor login works');
  const oracle=await request('/api/medication-history/check','POST',{
    source:'oracle',patientId:'P102',medicineName:'Example Medicine',startDate:'2026-10-20',endDate:'2026-10-22'
  },login.cookie);
  console.log("Oracle HTTP status:", oracle.status);
console.log("Oracle success:", oracle.body.success);
console.log("Reference review present:", !!oracle.body.referenceReview);
console.log("Oracle error:", oracle.body.error || oracle.body.detail || "none");
  assert(oracle.status===200 && oracle.body.success && oracle.body.referenceReview,
    'Oracle timeline includes source-aware reference review');
  assert(oracle.body.referenceReview.status==='NO_REVIEWED_REFERENCE_DATA_LOADED' &&
    oracle.body.referenceReview.sourceLinkedMatches.length===0,
    'No unverified interaction claims from the empty registry');
  const mimic=await request('/api/medication-history/check','POST',{
    source:'mimic',patientId:'10001217',medicineName:'Example Medicine',
    start:'2157-12-20T09:00:00',end:'2157-12-22T09:00:00'
  },login.cookie);
  assert(mimic.status===200 && mimic.body.referenceReview && mimic.body.incompletePeriodsExcluded===true,
    'De-identified MIMIC timeline includes reference status and incompleteness disclaimer');
  if (process.env.DEMO_PATIENT_P102_PASSWORD) {
    const patient=await request('/api/auth/login','POST',{
      username:'patient_p102',password:process.env.DEMO_PATIENT_P102_PASSWORD
    });
    assert(patient.status===200 && patient.cookie,'Patient demo account login');
    const blocked=await request('/api/medication-history/check','POST',{
      source:'oracle',patientId:'P102',medicineName:'Example Medicine',
      startDate:'2026-10-20',endDate:'2026-10-22'
    },patient.cookie);
    assert(blocked.status===403,'Patient forbidden from doctor-only reference check');
  }
  console.log('\nREFERENCE-LAYER INTEGRATION: ALL CHECKS PASSED');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
