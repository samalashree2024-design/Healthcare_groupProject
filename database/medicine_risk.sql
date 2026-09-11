-- Ishani: Medicine Safety Risk Scoring
-- Calculates a project-level medicine safety risk score from 0 to 100.
-- Checks:
-- 1. Drug-to-drug interactions
-- 2. Allergy conflicts
-- 3. Duplicate medication
-- 4. Dosage risk

CREATE OR REPLACE FUNCTION calculate_medicine_risk (
    p_patient_id     IN VARCHAR2,
    p_medicine_name  IN VARCHAR2,
    p_dosage         IN VARCHAR2
) RETURN NUMBER
IS
    v_medication_id      NUMBER;
    v_risk_score         NUMBER := 0;
    v_standard_dosage    VARCHAR2(100);
    v_standard_value     NUMBER;
    v_entered_value      NUMBER;
    v_interaction_count  NUMBER := 0;
    v_high_interaction   NUMBER := 0;
    v_allergy_count      NUMBER := 0;
    v_high_allergy       NUMBER := 0;
    v_duplicate_count    NUMBER := 0;
BEGIN

    -- Find the proposed medicine
    SELECT medication_id, standard_dosage
    INTO v_medication_id, v_standard_dosage
    FROM medication
    WHERE UPPER(medicine_name) = UPPER(p_medicine_name);

    -- 1. Check drug interactions
    SELECT COUNT(*),
           NVL(SUM(
               CASE
                   WHEN UPPER(di.severity) = 'HIGH' THEN 1
                   ELSE 0
               END
           ), 0)
    INTO v_interaction_count, v_high_interaction
    FROM patient_medication pm
    JOIN drug_interaction di
      ON (di.medication_id_1 = v_medication_id
          AND di.medication_id_2 = pm.medication_id)
      OR (di.medication_id_2 = v_medication_id
          AND di.medication_id_1 = pm.medication_id)
    WHERE pm.patient_id = p_patient_id;

    IF v_high_interaction > 0 THEN
        v_risk_score := v_risk_score + 50;
    ELSIF v_interaction_count > 0 THEN
        v_risk_score := v_risk_score + 30;
    END IF;

    -- 2. Check allergy conflict
    SELECT COUNT(*),
           NVL(SUM(
               CASE
                   WHEN UPPER(a.severity) = 'HIGH' THEN 1
                   ELSE 0
               END
           ), 0)
    INTO v_allergy_count, v_high_allergy
    FROM allergy a
    JOIN medication m
      ON UPPER(m.category) LIKE '%' || UPPER(a.allergen) || '%'
    WHERE a.patient_id = p_patient_id
      AND m.medication_id = v_medication_id;

    IF v_high_allergy > 0 THEN
        v_risk_score := v_risk_score + 40;
    ELSIF v_allergy_count > 0 THEN
        v_risk_score := v_risk_score + 25;
    END IF;

    -- 3. Check duplicate medication
    SELECT COUNT(*)
    INTO v_duplicate_count
    FROM patient_medication
    WHERE patient_id = p_patient_id
      AND medication_id = v_medication_id;

    IF v_duplicate_count > 0 THEN
        v_risk_score := v_risk_score + 20;
    END IF;

    -- 4. Check dosage risk
    v_standard_value :=
        TO_NUMBER(
            REGEXP_SUBSTR(v_standard_dosage, '[0-9]+(\.[0-9]+)?')
        );

    v_entered_value :=
        TO_NUMBER(
            REGEXP_SUBSTR(p_dosage, '[0-9]+(\.[0-9]+)?')
        );

    IF v_entered_value > v_standard_value THEN
        v_risk_score := v_risk_score + 20;
    END IF;

    -- Maximum score is 100
    IF v_risk_score > 100 THEN
        v_risk_score := 100;
    END IF;

    RETURN v_risk_score;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(
            -20005,
            'Medicine not found in the medication database.'
        );
END;
/
