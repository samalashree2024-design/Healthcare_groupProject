INSERT INTO patient
VALUES ('P101', 'Rahul', 52, 'Male', '9876543210', 'Vellore');

INSERT INTO doctor
VALUES ('D101', 'Dr. Kumar', 'General Medicine', '9876501234', 'kumar@hospital.com');

INSERT INTO symptoms (patient_id, symptom_name, severity, duration)
VALUES ('P101', 'Frequent thirst', 'High', '2 months');

INSERT INTO symptoms (patient_id, symptom_name, severity, duration)
VALUES ('P101', 'Frequent urination', 'High', '2 months');

INSERT INTO medical_history
(patient_id, condition, diagnosis_date, description)
VALUES ('P101', 'Family history of diabetes', DATE '2020-06-15', 'Mother has diabetes');

INSERT INTO laboratory_results
(patient_id, glucose, blood_pressure, bmi, cholesterol, heart_rate, test_date)
VALUES ('P101', 185, '150/95', 29.5, 220, 82, SYSDATE);

INSERT INTO diagnosis
(patient_id, doctor_id, disease, diagnosis_date, remarks)
VALUES ('P101', 'D101', 'Diabetes Risk', SYSDATE, 'High risk based on clinical indicators');

INSERT INTO treatment
(patient_id, doctor_id, treatment_name, treatment_date, description)
VALUES ('P101', 'D101', 'Lifestyle modification', SYSDATE, 'Diet control and regular exercise');

INSERT INTO medication
(medicine_name, category, standard_dosage)
VALUES ('Metformin', 'Antidiabetic', '500 mg');

INSERT INTO medication
(medicine_name, category, standard_dosage)
VALUES ('Aspirin', 'Antiplatelet', '75 mg');

INSERT INTO patient_medication
(patient_id, medication_id, dosage, start_date)
SELECT 'P101', medication_id, '500 mg', SYSDATE
FROM medication
WHERE medicine_name = 'Metformin';

INSERT INTO drug_interaction
(medication_id_1, medication_id_2, severity, description)
SELECT m1.medication_id, m2.medication_id, 'Moderate',
       'Example interaction record for demonstration'
FROM medication m1, medication m2
WHERE m1.medicine_name = 'Metformin'
AND m2.medicine_name = 'Aspirin';

INSERT INTO allergy
(patient_id, allergen, severity, description)
VALUES ('P101', 'Penicillin', 'High', 'Known allergy');

INSERT INTO prediction
(patient_id, disease, risk_score, risk_level, model_name)
VALUES ('P101', 'Diabetes', 87.50, 'High', 'Random Forest');

-- Additional Patients
INSERT INTO patient (patient_id, name, age, gender, phone, address)
VALUES ('P102', 'Ananya Sharma', 29, 'Female', '9876509876', 'Chennai');

INSERT INTO patient (patient_id, name, age, gender, phone, address)
VALUES ('P103', 'Vikram Seth', 64, 'Male', '9845012345', 'Bangalore');

INSERT INTO patient (patient_id, name, age, gender, phone, address)
VALUES ('P104', 'Deepa Nair', 41, 'Female', '9744123456', 'Kochi');

-- Additional Doctors
INSERT INTO doctor (doctor_id, name, specialization, phone, email)
VALUES ('D102', 'Dr. Priya Nair', 'Endocrinology', '9123456780', 'priya@hospital.com');

INSERT INTO doctor (doctor_id, name, specialization, phone, email)
VALUES ('D103', 'Dr. Rajesh Iyer', 'Cardiology', '9447102938', 'iyer@hospital.com');

-- Additional Medications
INSERT INTO medication (medicine_name, category, standard_dosage)
VALUES ('Atorvastatin', 'Lipid Lowering', '20 mg');

INSERT INTO medication (medicine_name, category, standard_dosage)
VALUES ('Lisinopril', 'Antihypertensive', '10 mg');

INSERT INTO medication (medicine_name, category, standard_dosage)
VALUES ('Ibuprofen', 'NSAID', '400 mg');

-- Additional Drug Interactions
-- Lisinopril + Ibuprofen interaction (NSAIDs reduce antihypertensive effect and risk renal injury)
INSERT INTO drug_interaction (medication_id_1, medication_id_2, severity, description)
SELECT m1.medication_id, m2.medication_id, 'High', 
       'NSAID may diminish antihypertensive efficacy and increase nephrotoxicity'
FROM medication m1, medication m2
WHERE m1.medicine_name = 'Lisinopril' AND m2.medicine_name = 'Ibuprofen';

-- Additional Symptoms
INSERT INTO symptoms (patient_id, symptom_name, severity, duration)
VALUES ('P102', 'Persistent fatigue', 'Moderate', '3 weeks');

INSERT INTO symptoms (patient_id, symptom_name, severity, duration)
VALUES ('P103', 'Chest tightness', 'High', '5 days');

INSERT INTO symptoms (patient_id, symptom_name, severity, duration)
VALUES ('P104', 'Dizziness', 'Low', '1 month');

-- Additional Medical History
INSERT INTO medical_history (patient_id, condition, diagnosis_date, description)
VALUES ('P103', 'Hypertension', DATE '2018-03-10', 'Stage 2 hypertension under management');

INSERT INTO medical_history (patient_id, condition, diagnosis_date, description)
VALUES ('P104', 'Hypothyroidism', DATE '2021-11-20', 'Levothyroxine maintenance therapy');

-- Additional Lab Results
INSERT INTO laboratory_results (patient_id, glucose, blood_pressure, bmi, cholesterol, heart_rate, test_date)
VALUES ('P102', 95.0, '118/78', 22.4, 175.0, 72, SYSDATE);

INSERT INTO laboratory_results (patient_id, glucose, blood_pressure, bmi, cholesterol, heart_rate, test_date)
VALUES ('P103', 142.0, '160/100', 31.2, 260.0, 88, SYSDATE);

INSERT INTO laboratory_results (patient_id, glucose, blood_pressure, bmi, cholesterol, heart_rate, test_date)
VALUES ('P104', 110.0, '135/85', 26.5, 210.0, 78, SYSDATE);

-- Additional Diagnoses
INSERT INTO diagnosis (patient_id, doctor_id, disease, diagnosis_date, remarks)
VALUES ('P103', 'D103', 'Hypertensive Heart Disease', SYSDATE, 'Marked blood pressure spike; review lipid profile');

INSERT INTO diagnosis (patient_id, doctor_id, disease, diagnosis_date, remarks)
VALUES ('P104', 'D102', 'Pre-diabetes', SYSDATE, 'Borderline fasting glucose; lifestyle therapy suggested');

-- Additional Treatments
INSERT INTO treatment (patient_id, doctor_id, treatment_name, treatment_date, description)
VALUES ('P103', 'D103', 'Pharmacotherapy', SYSDATE, 'Titrate antihypertensive and initiate statin therapy');

-- Prescriptions
INSERT INTO patient_medication (patient_id, medication_id, dosage, start_date)
SELECT 'P103', medication_id, '10 mg', SYSDATE
FROM medication WHERE medicine_name = 'Lisinopril';

INSERT INTO patient_medication (patient_id, medication_id, dosage, start_date)
SELECT 'P103', medication_id, '20 mg', SYSDATE
FROM medication WHERE medicine_name = 'Atorvastatin';

-- Allergies
INSERT INTO allergy (patient_id, allergen, severity, description)
VALUES ('P103', 'Sulfa Drugs', 'Severe', 'Severe cutaneous adverse reaction');

INSERT INTO allergy (patient_id, allergen, severity, description)
VALUES ('P104', 'Aspirin', 'Moderate', 'Urticaria and bronchospasm');

-- Predictions
INSERT INTO prediction (patient_id, disease, risk_score, risk_level, model_name)
VALUES ('P103', 'Cardiovascular Disease', 91.20, 'High', 'Random Forest');

INSERT INTO prediction (patient_id, disease, risk_score, risk_level, model_name)
VALUES ('P104', 'Type 2 Diabetes', 54.00, 'Moderate', 'Logistic Regression');

COMMIT;
