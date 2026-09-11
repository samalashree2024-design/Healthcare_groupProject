const express = require("express");
const oracledb = require("oracledb");
require("dotenv").config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
};


// TEST ORACLE CONNECTION
app.get("/api/test-db", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            "SELECT 'Oracle connection successful!' AS message FROM dual"
        );

        res.json({
            success: true,
            message: result.rows[0][0]
        });

    } catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error("Error closing connection:", error);
            }
        }
    }
});


// GET PATIENT INFORMATION
app.get("/api/patient/:patientId", async (req, res) => {
    let connection;

    try {
        const patientId = req.params.patientId;

        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `
            SELECT
                patient_id,
                name,
                age,
                gender,
                phone,
                address
            FROM patient
            WHERE patient_id = :patientId
            `,
            {
                patientId: patientId
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        res.json({
            success: true,
            patient: result.rows[0]
        });

    } catch (error) {
        console.error("Patient API error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error("Error closing connection:", error);
            }
        }
    }
});

// GET ALL MEDICINES
app.get("/api/medicines", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `
            SELECT
                medication_id,
                medicine_name,
                category,
                standard_dosage
            FROM medication
            ORDER BY medicine_name
            `,
            {},
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        res.json({
            success: true,
            medicines: result.rows
        });

    } catch (error) {
        console.error("Medicine API error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error("Error closing connection:", error);
            }
        }
    }
});

// CHECK MEDICINE SAFETY
app.post("/api/medicine/check", async (req, res) => {
    let connection;

    try {
        const { patientId, medicineName, dosage } = req.body;

        connection = await oracledb.getConnection(dbConfig);

        // Calculate medicine risk using Oracle function
        const riskResult = await connection.execute(
            `
            SELECT calculate_medicine_risk(
                :patientId,
                :medicineName,
                :dosage
            ) AS risk_score
            FROM dual
            `,
            {
                patientId: patientId,
                medicineName: medicineName,
                dosage: dosage
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        const riskScore = riskResult.rows[0].RISK_SCORE;

        let riskLevel;

        if (riskScore >= 70) {
            riskLevel = "HIGH";
        } else if (riskScore >= 40) {
            riskLevel = "MEDIUM";
        } else {
            riskLevel = "LOW";
        }

        res.json({
            success: true,
            medicine: medicineName,
            dosage: dosage,
            riskScore: riskScore,
            riskLevel: riskLevel
        });

    } catch (error) {
        console.error("Medicine safety error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error("Error closing connection:", error);
            }
        }
    }
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Healthcare server running at http://localhost:${PORT}`);
});
