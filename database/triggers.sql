-- Ishani: Medicine Safety Triggers
-- Features:
-- 1. Drug-to-drug interaction prevention
-- 2. Allergy conflict prevention
-- 3. Duplicate medication prevention
-- 4. Dosage risk prevention


-- Trigger 1: Drug-to-Drug Interaction Prevention
CREATE OR REPLACE TRIGGER trg_check_drug_interaction
FOR INSERT ON patient_medication
COMPOUND TRIGGER

    v_patient_id       patient_medication.patient_id%TYPE;
    v_medication_id    patient_medication.medication_id%TYPE;

    AFTER EACH ROW IS
    BEGIN
        v_patient_id := :NEW.patient_id;
        v_medication_id := :NEW.medication_id;
    END AFTER EACH ROW;

    AFTER STATEMENT IS
        v_conflict_count NUMBER := 0;
        v_conflicting_drug VARCHAR2(100);
    BEGIN
        SELECT COUNT(*), MAX(m.medicine_name)
        INTO v_conflict_count, v_conflicting_drug
        FROM patient_medication pm
        JOIN drug_interaction di
          ON (
                (di.medication_id_1 = v_medication_id
                 AND di.medication_id_2 = pm.medication_id)
                OR
                (di.medication_id_2 = v_medication_id
                 AND di.medication_id_1 = pm.medication_id)
             )
        JOIN medication m
          ON m.medication_id = pm.medication_id
        WHERE pm.patient_id = v_patient_id
          AND pm.medication_id <> v_medication_id;

        IF v_conflict_count > 0 THEN
            RAISE_APPLICATION_ERROR(
                -20001,
                'CLINICAL ALERT: Prescribed drug clashes with existing active medication: '
                || v_conflicting_drug
            );
        END IF;
    END AFTER STATEMENT;

END trg_check_drug_interaction;
/


-- Trigger 2: Allergy Conflict Prevention
CREATE OR REPLACE TRIGGER trg_check_allergy_conflict
FOR INSERT ON patient_medication
COMPOUND TRIGGER

    v_patient_id    patient_medication.patient_id%TYPE;
    v_medication_id patient_medication.medication_id%TYPE;

    AFTER EACH ROW IS
    BEGIN
        v_patient_id := :NEW.patient_id;
        v_medication_id := :NEW.medication_id;
    END AFTER EACH ROW;

    AFTER STATEMENT IS
        v_conflict_count NUMBER := 0;
        v_allergen       VARCHAR2(100);
        v_severity       VARCHAR2(20);
    BEGIN
        SELECT COUNT(*),
               MAX(a.allergen),
               MAX(a.severity)
        INTO v_conflict_count,
             v_allergen,
             v_severity
        FROM allergy a
        JOIN medication m
          ON UPPER(m.category) LIKE '%' || UPPER(a.allergen) || '%'
        WHERE a.patient_id = v_patient_id
          AND m.medication_id = v_medication_id;

        IF v_conflict_count > 0 THEN
            RAISE_APPLICATION_ERROR(
                -20002,
                'ALLERGY ALERT: Patient has a '
                || v_severity
                || ' allergy to '
                || v_allergen
                || '. Medication cannot be prescribed.'
            );
        END IF;
    END AFTER STATEMENT;

END trg_check_allergy_conflict;
/


-- Trigger 3: Duplicate Medication Prevention
CREATE OR REPLACE TRIGGER trg_check_duplicate_medication
FOR INSERT ON patient_medication
COMPOUND TRIGGER

    v_patient_id    patient_medication.patient_id%TYPE;
    v_medication_id patient_medication.medication_id%TYPE;

    AFTER EACH ROW IS
    BEGIN
        v_patient_id := :NEW.patient_id;
        v_medication_id := :NEW.medication_id;
    END AFTER EACH ROW;

    AFTER STATEMENT IS
        v_duplicate_count NUMBER;
        v_medicine_name   VARCHAR2(100);
    BEGIN
        SELECT COUNT(*),
               MAX(m.medicine_name)
        INTO v_duplicate_count,
             v_medicine_name
        FROM patient_medication pm
        JOIN medication m
          ON m.medication_id = pm.medication_id
        WHERE pm.patient_id = v_patient_id
          AND pm.medication_id = v_medication_id;

        IF v_duplicate_count > 1 THEN
            RAISE_APPLICATION_ERROR(
                -20003,
                'DUPLICATE MEDICATION ALERT: Patient is already taking '
                || v_medicine_name
            );
        END IF;
    END AFTER STATEMENT;

END trg_check_duplicate_medication;
/


-- Trigger 4: Dosage Risk Prevention
CREATE OR REPLACE TRIGGER trg_check_dosage_risk
FOR INSERT ON patient_medication
COMPOUND TRIGGER

    v_patient_id       patient_medication.patient_id%TYPE;
    v_medication_id    patient_medication.medication_id%TYPE;
    v_entered_dosage   patient_medication.dosage%TYPE;

    AFTER EACH ROW IS
    BEGIN
        v_patient_id := :NEW.patient_id;
        v_medication_id := :NEW.medication_id;
        v_entered_dosage := :NEW.dosage;
    END AFTER EACH ROW;

    AFTER STATEMENT IS
        v_standard_dosage VARCHAR2(50);
        v_standard_value  NUMBER;
        v_entered_value   NUMBER;
        v_medicine_name   VARCHAR2(100);
    BEGIN
        SELECT medicine_name, standard_dosage
        INTO v_medicine_name, v_standard_dosage
        FROM medication
        WHERE medication_id = v_medication_id;

        v_standard_value :=
            TO_NUMBER(
                REGEXP_SUBSTR(v_standard_dosage, '[0-9]+(\.[0-9]+)?')
            );

        v_entered_value :=
            TO_NUMBER(
                REGEXP_SUBSTR(v_entered_dosage, '[0-9]+(\.[0-9]+)?')
            );

        IF v_entered_value > v_standard_value THEN
            RAISE_APPLICATION_ERROR(
                -20004,
                'DOSAGE RISK ALERT: Entered dosage for '
                || v_medicine_name
                || ' ('
                || v_entered_dosage
                || ') exceeds the stored standard dosage ('
                || v_standard_dosage
                || ').'
            );
        END IF;
    END AFTER STATEMENT;

END trg_check_dosage_risk;
/
