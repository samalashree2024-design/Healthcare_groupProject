// LOCAL DEMO SEED ONLY: hashes fictional user passwords in Oracle.
// Run from the project root: node .\database\setup_demo_users.js
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
const oracledb = require('oracledb');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const scrypt = promisify(crypto.scrypt);

const accounts = [
  { username: 'doctor_demo', role: 'doctor', patientId: null, passwordKey: 'DEMO_DOCTOR_PASSWORD' },
  { username: 'lab_demo', role: 'lab', patientId: null, passwordKey: 'DEMO_LAB_PASSWORD' },
  { username: 'patient_p101', role: 'patient', patientId: 'P101', passwordKey: 'DEMO_PATIENT_P101_PASSWORD' },
  { username: 'patient_p102', role: 'patient', patientId: 'P102', passwordKey: 'DEMO_PATIENT_P102_PASSWORD' }
];

async function main() {
  for (const account of accounts) {
    if (!process.env[account.passwordKey] || process.env[account.passwordKey].length < 12) {
      throw new Error(`Set ${account.passwordKey} to a private password of at least 12 characters in .env`);
    }
  }
  if (!process.env.DEMO_SESSION_SECRET || process.env.DEMO_SESSION_SECRET.length < 32) {
    throw new Error('Set DEMO_SESSION_SECRET to a random value of 32+ characters in .env');
  }
  const connection = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  });
  try {
    try {
      await connection.execute(`CREATE TABLE demo_user_account (
        username VARCHAR2(50) PRIMARY KEY,
        password_salt VARCHAR2(32) NOT NULL,
        password_hash VARCHAR2(128) NOT NULL,
        user_role VARCHAR2(16) NOT NULL
          CHECK (user_role IN ('doctor','lab','patient')),
        patient_id VARCHAR2(10),
        active NUMBER(1) DEFAULT 1 NOT NULL
      )`);
      console.log('Created DEMO_USER_ACCOUNT table.');
    } catch (err) {
      if (err.errorNum !== 955) throw err;
      console.log('DEMO_USER_ACCOUNT table already exists.');
    }

    for (const account of accounts) {
      const existing = await connection.execute(
        'SELECT COUNT(*) FROM demo_user_account WHERE username=:username',
        { username: account.username }
      );
      if (existing.rows[0][0] > 0) {
        console.log(`Already exists: ${account.username} (not overwriting password)`);
        continue;
      }
      const salt = crypto.randomBytes(16);
      const hash = await scrypt(process.env[account.passwordKey], salt, 64);
      await connection.execute(
        `INSERT INTO demo_user_account
         (username,password_salt,password_hash,user_role,patient_id,active)
         VALUES (:username,:salt,:hash,:role,:patientId,1)`,
        {
          username: account.username,
          salt: salt.toString('hex'),
          hash: hash.toString('hex'),
          role: account.role,
          patientId: account.patientId
        }
      );
      console.log(`Added ${account.username} (${account.role})`);
    }
    await connection.commit();
    console.log('Demo login accounts are ready. Passwords were not printed.');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    await connection.close();
  }
}
main().catch(err => { console.error('Setup failed:', err.message); process.exitCode = 1; });
