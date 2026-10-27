"""Offline self-check using synthetic examples; no medical claims or real data."""
from datetime import datetime
import pandas as pd
from unified_api import PrescriptionRequest, check_proposed_prescription, norm

df = pd.DataFrame([
    dict(patient='P1', medicine='Example A', route='IV', start='2157-12-18 20:00', end='2157-12-21 10:00', records=3),
    dict(patient='P1', medicine='Example B', route='PO', start='2157-12-21 19:00', end='2157-12-24 19:00', records=2),
    dict(patient='P1', medicine='Example A', route='IV', start='2157-11-19 01:00', end='2157-11-25 22:00', records=1),
])
df['start'] = pd.to_datetime(df['start'])
df['end'] = pd.to_datetime(df['end'])
df['medicine_key'] = df['medicine'].map(norm)
case = PrescriptionRequest(patient_id='P1', medicine_name='Example A',
    start=datetime(2157,12,20,9), end=datetime(2157,12,22,9))
result = check_proposed_prescription(df, case)
assert result['recorded_overlap_count'] == 2, result
assert result['same_name_overlap_count'] == 1, result
assert result['previous_same_name_period_count'] == 1, result
assert result['interaction_assessment'] == 'NOT_PERFORMED_NO_VERIFIED_REFERENCE'
print('PASS: 2 overlapping recorded periods; 1 same-name overlap; 1 earlier period')
print('PASS: No misleading drug interaction or clinical risk claim')
