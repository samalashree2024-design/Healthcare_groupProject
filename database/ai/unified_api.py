"""Local-only educational prescription timeline + classifier API.

IMPORTANT: Not a clinical decision support product. The demo recognizes recorded
prescription date overlaps, not observed administrations, adverse events, or drug
safety. Only run on 127.0.0.1 with de-identified research data.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from datetime import datetime

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATABASE_ROOT = ROOT.parent
CSV = DATABASE_ROOT / 'data' / 'processed' / 'medication_periods.csv'
MODEL_DIR = ROOT / 'models'
app = FastAPI(title='Healthcare Research Demonstration API', version='1.0.0')

DISCLAIMER = (
    'Research demonstration only. Dates are shifted and prescriptions do not '
    'prove administration. Recorded overlap does not prove interaction, and no '
    'recorded overlap does not establish safety. Requires professional review.'
)


def norm(value: Any) -> str:
    return re.sub(r'\s+', ' ', str(value).strip().casefold())


@lru_cache(maxsize=1)
def load_history() -> pd.DataFrame:
    if not CSV.exists():
        raise FileNotFoundError(
            f'Missing {CSV}. Run your existing group_prescription_courses.py first.'
        )
    df = pd.read_csv(CSV, dtype={'patient': 'string'}, low_memory=False)
    required = {'patient', 'medicine', 'route', 'start', 'end', 'records'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f'Processed file missing columns: {sorted(missing)}')
    df['start'] = pd.to_datetime(df['start'], errors='coerce')
    df['end'] = pd.to_datetime(df['end'], errors='coerce')
    df = df.dropna(subset=['patient', 'medicine', 'start', 'end']).copy()
    df = df[df['end'] > df['start']].copy()
    df['patient'] = df['patient'].astype(str)
    df['medicine_key'] = df['medicine'].map(norm)
    return df.sort_values(['patient', 'start', 'end']).reset_index(drop=True)


def required_history():
    try:
        return load_history()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def describe_row(row):
    return {
        'medicine': str(row['medicine']),
        'route': str(row['route']),
        'start': row['start'].isoformat(sep=' '),
        'end': row['end'].isoformat(sep=' '),
        'source_prescription_records': int(row['records']),
    }


class PrescriptionRequest(BaseModel):
    patient_id: str = Field(min_length=1, max_length=64)
    medicine_name: str = Field(min_length=1, max_length=150)
    start: datetime
    end: datetime


def check_proposed_prescription(df: pd.DataFrame, request: PrescriptionRequest):
    if request.start.tzinfo or request.end.tzinfo:
        raise ValueError('Use dates without timezone offsets, in dataset-local shifted time.')
    if request.end <= request.start:
        raise ValueError('End time must be later than start time.')
    patient_rows = df[df['patient'] == request.patient_id.strip()]
    if patient_rows.empty:
        raise KeyError('No complete grouped medication records for this patient ID.')

    start, end = pd.Timestamp(request.start), pd.Timestamp(request.end)
    overlaps = patient_rows[
        (patient_rows['start'] < end) & (patient_rows['end'] > start)
    ].sort_values('start')
    key = norm(request.medicine_name)
    details = []
    same_medicine_count = 0
    for _, r in overlaps.iterrows():
        same = r['medicine_key'] == key
        if same:
            same_medicine_count += 1
        actual_start = max(start, r['start'])
        actual_end = min(end, r['end'])
        details.append({
            **describe_row(r),
            'same_recorded_name': bool(same),
            'overlap_starts': actual_start.isoformat(sep=' '),
            'overlap_ends': actual_end.isoformat(sep=' '),
            'overlap_hours': round((actual_end - actual_start).total_seconds()/3600, 2),
        })
    prior_count = int((
        (patient_rows['medicine_key'] == key) & (patient_rows['end'] <= start)
    ).sum())
    return {
        'patient_id': request.patient_id,
        'proposed_medicine': request.medicine_name,
        'proposed_start': request.start.isoformat(sep=' '),
        'proposed_end': request.end.isoformat(sep=' '),
        'recorded_overlap_count': len(details),
        'same_name_overlap_count': same_medicine_count,
        'previous_same_name_period_count': prior_count,
        'overlaps': details[:100],
        'overlaps_truncated': len(details) > 100,
        'interaction_assessment': 'NOT_PERFORMED_NO_VERIFIED_REFERENCE',
        'allergy_assessment': 'NOT_PERFORMED_NO_ALLERGY_RECORDS_LINKED',
        'dosage_assessment': 'NOT_PERFORMED_NO_VALIDATED_DOSING_RULES',
        'interpretation': 'Recorded prescription overlap only; not evidence of harmful interaction.',
        'disclaimer': DISCLAIMER,
    }


@app.get('/health')
def health():
    return {'status': 'running', 'mode': 'local-research-demo', 'data_file_exists': CSV.exists()}


@app.get('/patients')
def patients():
    df = required_history()
    result = df.groupby('patient', sort=True).size().reset_index(name='grouped_periods')
    return {'patients': result.to_dict('records'), 'count': len(result)}


@app.get('/patients/{patient_id}/history')
def history(patient_id: str, limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)):
    df = required_history()
    rows = df[df['patient'] == patient_id]
    if rows.empty:
        raise HTTPException(status_code=404, detail='No complete grouped records for this patient.')
    slice_df = rows.iloc[offset:offset+limit]
    return {
        'patient_id': patient_id,
        'total_grouped_periods': len(rows),
        'returned_count': len(slice_df),
        'periods': [describe_row(r) for _, r in slice_df.iterrows()],
        'disclaimer': DISCLAIMER,
    }


@app.post('/check-prescription')
def check_prescription(payload: PrescriptionRequest):
    df = required_history()
    try:
        return check_proposed_prescription(df, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# Separate ML functionality, available only after local UCI training.
ML_NAMES = {'heart', 'kidney', 'diabetes'}


@lru_cache(maxsize=3)
def load_ml(name):
    import joblib  # lazy: medication checker runs without ML installed
    model_file = MODEL_DIR / f'{name}_pipeline.joblib'
    info_file = MODEL_DIR / f'{name}_metadata.json'
    if not model_file.exists() or not info_file.exists():
        raise FileNotFoundError(f'Model {name} not trained. Run train_models.py --disease {name}.')
    # Local, trusted project model files only; never load uploaded joblib files.
    return joblib.load(model_file), json.loads(info_file.read_text(encoding='utf-8'))


@app.get('/models')
def models():
    return {'models': [
        {'name': name, 'trained': (MODEL_DIR / f'{name}_pipeline.joblib').exists()}
        for name in sorted(ML_NAMES)
    ], 'disclaimer': 'Educational dataset classifiers, not clinical diagnosis.'}


@app.get('/models/{name}/schema')
def model_schema(name: str):
    if name not in ML_NAMES:
        raise HTTPException(status_code=404, detail='Unknown model.')
    try:
        _, meta = load_ml(name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        'name': name,
        'dataset': meta['dataset_name'],
        'features': meta['features'],
        'feature_types': meta['feature_types'],
        'categorical_values': meta['categorical_values'],
        'target_definition': meta['target_definition'],
    }


class PredictionRequest(BaseModel):
    disease: Literal['heart', 'kidney', 'diabetes']
    features: dict[str, Any]


@app.post('/predict')
def predict(payload: PredictionRequest):
    try:
        model, meta = load_ml(payload.disease)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    fields = meta['features']
    if set(payload.features) != set(fields):
        raise HTTPException(status_code=422, detail={
            'missing': sorted(set(fields) - set(payload.features)),
            'unexpected': sorted(set(payload.features) - set(fields)),
        })
    record = {}
    for field in fields:
        value = payload.features[field]
        if value is None or (isinstance(value, str) and not value.strip()):
            raise HTTPException(status_code=422, detail=f'Missing value: {field}')
        if meta['feature_types'][field] == 'numeric':
            try:
                value = float(value)
            except (ValueError, TypeError) as exc:
                raise HTTPException(status_code=422, detail=f'Invalid number: {field}') from exc
            if not math.isfinite(value):
                raise HTTPException(status_code=422, detail=f'Nonfinite number: {field}')
        else:
            value = norm(value)
            if value not in meta['categorical_values'][field]:
                raise HTTPException(status_code=422, detail=f'Unsupported category for: {field}')
        record[field] = value
    result = int(model.predict(pd.DataFrame([record], columns=fields))[0])
    return {
        'disease': payload.disease,
        'dataset_class': 'positive' if result else 'negative',
        'target_definition': meta['target_definition'],
        'model': meta['selected_algorithm'],
        'disclaimer': 'Educational dataset classification only. Not a diagnosis or treatment recommendation.',
    }
