
const fs = require("fs");
const path = require("path");
const oracledb = require("oracledb");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

async function main() {
  const filePath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(filePath, "utf8");

  // schema.sql contains CREATE TABLE statements
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(Boolean);

  const connection = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  });

  try {
    for (const statement of statements) {
      const tableName =
        statement.match(/CREATE\s+TABLE\s+(\w+)/i)?.[1]
        || "Unknown";

      try {
        await connection.execute(statement);
        console.log("Created:", tableName);
      } catch (error) {
        if (error.errorNum === 955) {
          console.log("Already exists:", tableName);
        } else {
          console.error("Failed:", tableName);
          throw error;
        }
      }
    }

    const result = await connection.execute(
      "SELECT table_name FROM user_tables ORDER BY table_name"
    );

    console.log("\nTotal tables:", result.rows.length);
    console.log(result.rows.map(row => row[0]).join(", "));
  } finally {
    await connection.close();
  }
}

main().catch(error => {
  console.error("Database setup failed:", error.message);
  process.exitCode = 1;
});
