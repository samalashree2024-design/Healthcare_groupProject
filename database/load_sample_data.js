
const fs = require("fs");
const path = require("path");
const oracledb = require("oracledb");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const tables = [
  "PATIENT",
  "DOCTOR",
  "SYMPTOMS",
  "MEDICAL_HISTORY",
  "LABORATORY_RESULTS",
  "DIAGNOSIS",
  "TREATMENT",
  "MEDICATION",
  "PATIENT_MEDICATION",
  "DRUG_INTERACTION",
  "ALLERGY",
  "PREDICTION"
];

async function main() {
  const connection = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  });

  try {
    // Prevent accidental duplicate loading
    for (const table of tables) {
      const result = await connection.execute(
        `SELECT COUNT(*) FROM ${table}`
      );

      if (result.rows[0][0] > 0) {
        throw new Error(
          `${table} already contains records. ` +
          "Stopped to avoid duplicate data."
        );
      }
    }

    // Read the existing sample SQL file
    const filePath = path.join(
      __dirname,
      "sample_data.sql"
    );

    const sql = fs.readFileSync(filePath, "utf8");

    // Remove comment lines, then separate SQL statements
    const statements = sql
      .split(/\r?\n/)
      .filter(line => !line.trim().startsWith("--"))
      .join("\n")
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
      .map(statement => statement.trim())
      .filter(statement =>
        statement && !/^COMMIT$/i.test(statement)
      );

    // Insert fictional demonstration records
    for (const statement of statements) {
      await connection.execute(statement);
    }

    await connection.commit();

    console.log("\nSAMPLE DATA LOADED SUCCESSFULLY!");

    // Verify final counts
    for (const table of tables) {
      const result = await connection.execute(
        `SELECT COUNT(*) FROM ${table}`
      );

      console.log(`${table}: ${result.rows[0][0]}`);
    }

  } catch (error) {
    await connection.rollback();
    console.error("\nLOAD STOPPED:", error.message);
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
