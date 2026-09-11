function checkMedicine() {
    const medicine = document.getElementById("medicineSelect").value;
    const dosage = document.getElementById("dosageInput").value.trim();

    let score = 0;
    let alerts = [];

    // -------------------------------
    // METFORMIN
    // -------------------------------
    if (medicine === "Metformin") {

        // P101 already takes Metformin
        score += 20;

        alerts.push({
            title: "Duplicate medication",
            message: "Patient is already taking Metformin.",
            severity: "MEDIUM"
        });

        // Stored standard dosage = 500 mg
        const enteredDosage = parseFloat(dosage);

        if (!isNaN(enteredDosage) && enteredDosage > 500) {
            score += 20;

            alerts.push({
                title: "Dosage risk",
                message:
                    `Entered dosage (${dosage}) exceeds standard dosage (500 mg).`,
                severity: "MEDIUM"
            });
        }
    }

    // -------------------------------
    // ASPIRIN
    // -------------------------------
    else if (medicine === "Aspirin") {

        // Existing demo database contains
        // Metformin <-> Aspirin interaction
        score += 30;

        alerts.push({
            title: "Drug interaction detected",
            message:
                "Aspirin conflicts with the patient's existing Metformin medication.",
            severity: "MEDIUM"
        });

        const enteredDosage = parseFloat(dosage);

        if (!isNaN(enteredDosage) && enteredDosage > 75) {
            score += 20;

            alerts.push({
                title: "Dosage risk",
                message:
                    `Entered dosage (${dosage}) exceeds standard dosage (75 mg).`,
                severity: "MEDIUM"
            });
        }
    }

    // -------------------------------
    // AMOXICILLIN
    // -------------------------------
    else if (medicine === "Amoxicillin") {

        // P101 has a HIGH Penicillin allergy
        score += 40;

        alerts.push({
            title: "Allergy conflict detected",
            message:
                "Patient has a HIGH allergy to Penicillin. Amoxicillin belongs to the Penicillin antibiotic category.",
            severity: "HIGH"
        });

        const enteredDosage = parseFloat(dosage);

        if (!isNaN(enteredDosage) && enteredDosage > 500) {
            score += 20;

            alerts.push({
                title: "Dosage risk",
                message:
                    `Entered dosage (${dosage}) exceeds standard dosage (500 mg).`,
                severity: "MEDIUM"
            });
        }
    }

    // Keep score between 0 and 100
    if (score > 100) {
        score = 100;
    }

    updateDashboard(score, alerts);
}


function updateDashboard(score, alerts) {

    const scoreDisplay = document.getElementById("displayScore");
    const topScore = document.getElementById("riskScore");
    const riskLevel = document.getElementById("riskLevel");
    const scoreFill = document.getElementById("scoreFill");
    const description = document.getElementById("riskDescription");
    const alertsContainer = document.getElementById("alertsContainer");
    const alertCount = document.getElementById("alertCount");

    // Update score
    scoreDisplay.textContent = score;
    topScore.textContent = score;

    // Update score bar
    scoreFill.style.width = score + "%";

    // Remove previous level classes
    riskLevel.classList.remove("low", "medium", "high");

    // Risk classification
    if (score >= 70) {

        riskLevel.textContent = "HIGH RISK";
        riskLevel.classList.add("high");

        scoreFill.style.background = "#dc2626";

        description.textContent =
            "Serious medicine safety concerns were detected.";

    } else if (score >= 40) {

        riskLevel.textContent = "MEDIUM RISK";
        riskLevel.classList.add("medium");

        scoreFill.style.background = "#f59e0b";

        description.textContent =
            "Some medicine safety concerns were detected.";

    } else {

        riskLevel.textContent = "LOW RISK";
        riskLevel.classList.add("low");

        scoreFill.style.background = "#16a34a";

        description.textContent =
            "No major medicine safety concerns were detected.";
    }


    // Clear previous alerts
    alertsContainer.innerHTML = "";

    // No issues
    if (alerts.length === 0) {

        alertCount.textContent = "0 issues";

        alertsContainer.innerHTML = `
            <div class="alert-item" 
                 style="background:#ecfdf3; border:1px solid #bbf7d0;">

                <div class="alert-symbol"
                     style="background:#dcfce7; color:#16a34a;">
                    ✓
                </div>

                <div>
                    <strong>No safety issues detected</strong>
                    <p>
                        No interaction, allergy, duplicate medication
                        or dosage risk was found.
                    </p>
                </div>

                <span class="severity"
                      style="background:#dcfce7; color:#16a34a;">
                    SAFE
                </span>

            </div>
        `;

        return;
    }


    // Number of detected issues
    alertCount.textContent =
        alerts.length + (alerts.length === 1 ? " issue" : " issues");


    // Display every alert
    alerts.forEach(alert => {

        const isHigh = alert.severity === "HIGH";

        const alertHTML = `
            <div class="alert-item warning-alert">

                <div class="alert-symbol">
                    ⚠
                </div>

                <div>
                    <strong>${alert.title}</strong>
                    <p>${alert.message}</p>
                </div>

                <span class="severity ${isHigh ? "high-label" : "medium-label"}">
                    ${alert.severity}
                </span>

            </div>
        `;

        alertsContainer.innerHTML += alertHTML;
    });
}
// Load medicines from Oracle database
async function loadMedicines() {
    try {
        const response = await fetch("/api/medicines");
        const data = await response.json();

        if (!data.success) {
            console.error("Could not load medicines");
            return;
        }

        const medicineSelect = document.getElementById("medicineSelect");

        // Clear existing options
        medicineSelect.innerHTML = "";

        // Add medicines from Oracle
        data.medicines.forEach(medicine => {
            const option = document.createElement("option");

            option.value = medicine.MEDICINE_NAME;
            option.textContent =
                medicine.MEDICINE_NAME +
                " (" +
                medicine.STANDARD_DOSAGE +
                ")";

            medicineSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Error loading medicines:", error);
    }
}

// Load medicines when page opens
loadMedicines();

// Check medicine safety using Oracle
async function checkMedicineSafety() {
    const patientId = "P101";
    const medicineSelect = document.getElementById("medicineSelect");
    const dosageInput = document.getElementById("dosage");

    const medicineName = medicineSelect.value;
    const dosage = dosageInput.value;

    if (!dosage) {
        alert("Please enter a dosage.");
        return;
    }

    try {
        const response = await fetch("/api/medicine/check", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                patientId: patientId,
                medicineName: medicineName,
                dosage: dosage
            })
        });

        const data = await response.json();

        if (!data.success) {
            alert("Error: " + data.error);
            return;
        }

        console.log("Oracle Safety Result:", data);

        // Display the risk score
        const riskScoreElement = document.querySelector(".risk-score");
        if (riskScoreElement) {
            riskScoreElement.textContent = data.riskScore;
        }

        // Display the risk level
        const riskLevelElement = document.querySelector(".risk-level");
        if (riskLevelElement) {
            riskLevelElement.textContent = data.riskLevel + " RISK";
        }

        alert(
            "Medicine Safety Result\n\n" +
            "Medicine: " + data.medicine + "\n" +
            "Dosage: " + data.dosage + "\n" +
            "Risk Score: " + data.riskScore + "/100\n" +
            "Risk Level: " + data.riskLevel
        );

    } catch (error) {
        console.error("Safety check error:", error);
        alert("Could not connect to the backend.");
    }
}