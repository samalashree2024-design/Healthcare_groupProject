"""Educational multi-disease classifiers on public UCI datasets.

Usage:
    python train_models.py --disease all
    python train_models.py --disease heart

Requires internet the first time to fetch UCI datasets. Never use this as a clinical
prediction system. There is no longitudinal outcome or external clinical validation.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"
REPORT_DIR = BASE_DIR / "reports"

DATASETS = {
    "diabetes": {
        "uci_id": 529,
        "title": "Early Stage Diabetes Risk Prediction",
        "url": "https://archive.ics.uci.edu/dataset/529/early+stage+diabetes+risk+prediction",
        "positive_label": "positive",
        "outcome": "Positive class in the questionnaire dataset",
    },
    "heart": {
        "uci_id": 45,
        "title": "Heart Disease (Cleveland)",
        "url": "https://archive.ics.uci.edu/dataset/45/heart+disease",
        "positive_label": "1",
        "outcome": "Presence of heart disease label (num > 0)",
    },
    "kidney": {
        "uci_id": 336,
        "title": "Chronic Kidney Disease",
        "url": "https://archive.ics.uci.edu/dataset/336/chronic+kidney+disease",
        "positive_label": "ckd",
        "outcome": "CKD class in the source dataset",
    },
}


def normalise_text(value):
    if pd.isna(value):
        return np.nan
    text = re.sub(r"\s+", " ", str(value).strip().lower())
    return np.nan if text in {"", "?", "nan", "none", "null"} else text


def clean_features(raw):
    """Preserve UCI feature names; normalize text and infer numeric columns carefully."""
    X = raw.copy().reset_index(drop=True)
    X.columns = X.columns.astype(str)
    types = {}
    categories = {}
    for column in X.columns:
        series = X[column].map(normalise_text)
        # Convert to numeric only if ALL observed non-missing values are numbers.
        numeric = pd.to_numeric(series, errors="coerce")
        observed = series.notna().sum()
        if observed and numeric.notna().sum() == observed:
            X[column] = numeric.astype(float)
            types[column] = "numeric"
        else:
            X[column] = series.astype("object")
            types[column] = "categorical"
            categories[column] = sorted(str(v) for v in series.dropna().unique())
    return X, types, categories


def label_target(name, raw):
    y = raw.iloc[:, 0].reset_index(drop=True)
    if name == "heart":
        values = pd.to_numeric(y, errors="coerce")
        return pd.Series(np.where(values.notna(), (values > 0).astype(int), -1))
    normalised = y.map(normalise_text)
    pos = DATASETS[name]["positive_label"]
    if name == "diabetes":
        # UCI uses Positive and Negative.
        result = normalised.map({"positive": 1, "negative": 0})
    else:
        # UCI uses ckd and notckd (occasionally with trailing whitespace).
        result = normalised.map({"ckd": 1, "notckd": 0})
    return result


def read_public_dataset(name):
    from ucimlrepo import fetch_ucirepo

    spec = DATASETS[name]
    print(f"Fetching UCI dataset {spec['uci_id']} ({spec['title']})...")
    downloaded = fetch_ucirepo(id=spec["uci_id"])
    if downloaded.data.features is None or downloaded.data.targets is None:
        raise ValueError(f"Dataset {name} did not return supervised learning data")
    X, types, categories = clean_features(downloaded.data.features)
    y = label_target(name, downloaded.data.targets)
    valid = y.notna() & y.isin([0, 1])
    if not valid.all():
        print(f"Removing {(~valid).sum()} records without a supported binary label")
    X, y = X.loc[valid].reset_index(drop=True), y.loc[valid].astype(int).reset_index(drop=True)

    # Avoid train/test leakage from identical feature rows. If same feature row
    # has contradictory labels, discard all such rows for the demo.
    signatures = X.fillna("<MISSING>").astype(str).agg("\x1f".join, axis=1)
    label_count = pd.DataFrame({"signature": signatures, "label": y}).groupby("signature")["label"].transform("nunique")
    consistent = label_count == 1
    if not consistent.all():
        print(f"Removing {(~consistent).sum()} ambiguous repeated observations")
    X, y, signatures = X.loc[consistent], y.loc[consistent], signatures.loc[consistent]
    unique = ~signatures.duplicated(keep="first")
    print(f"Removing {(~unique).sum()} duplicate feature observations")
    X, y = X.loc[unique].reset_index(drop=True), y.loc[unique].reset_index(drop=True)
    if y.nunique() != 2 or len(X) < 30:
        raise ValueError(f"Insufficient valid records for {name}: {len(X)}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    saved = X.copy()
    saved["target_binary"] = y
    saved.to_csv(DATA_DIR / f"{name}_processed.csv", index=False)
    return X, y, types, categories


def build_pipeline(types, estimator):
    numeric_cols = [key for key, typ in types.items() if typ == "numeric"]
    categorical_cols = [key for key, typ in types.items() if typ == "categorical"]
    transformers = []
    if numeric_cols:
        transformers.append(("num", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric_cols))
    if categorical_cols:
        transformers.append(("cat", Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical_cols))
    return Pipeline([
        ("preprocess", ColumnTransformer(transformers=transformers)),
        ("classifier", estimator),
    ])


def train_one(name):
    X, y, types, categories = read_public_dataset(name)
    print(f"{name}: {len(X)} unique rows, {len(X.columns)} inputs, class counts {y.value_counts().to_dict()}")
    Xtrain, Xtest, ytrain, ytest = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    classifiers = {
        "Logistic Regression": LogisticRegression(max_iter=2000, class_weight="balanced"),
        "Decision Tree": __import__("sklearn.tree", fromlist=["DecisionTreeClassifier"]).DecisionTreeClassifier(
            max_depth=5, min_samples_leaf=5, class_weight="balanced", random_state=42
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=200, min_samples_leaf=2, class_weight="balanced", random_state=42, n_jobs=-1
        ),
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    leaderboard = []
    for model_name, estimator in classifiers.items():
        pipeline = build_pipeline(types, estimator)
        scores = cross_val_score(pipeline, Xtrain, ytrain, scoring="f1", cv=cv, n_jobs=1)
        leaderboard.append({"name": model_name, "cv_f1_mean": round(float(scores.mean()), 4),
                            "cv_f1_std": round(float(scores.std()), 4)})
        print(f"  {model_name}: train-CV F1={scores.mean():.3f} (+/- {scores.std():.3f})")

    leaderboard.sort(key=lambda item: item["cv_f1_mean"], reverse=True)
    selected_name = leaderboard[0]["name"]
    selected = build_pipeline(types, classifiers[selected_name])
    selected.fit(Xtrain, ytrain)
    predicted = selected.predict(Xtest)
    probabilities = selected.predict_proba(Xtest)[:, 1]
    results = {
        "accuracy": float(accuracy_score(ytest, predicted)),
        "precision": float(precision_score(ytest, predicted, zero_division=0)),
        "recall": float(recall_score(ytest, predicted, zero_division=0)),
        "f1": float(f1_score(ytest, predicted, zero_division=0)),
        "roc_auc": float(roc_auc_score(ytest, probabilities)),
        "confusion_matrix_tn_fp_fn_tp": confusion_matrix(ytest, predicted, labels=[0, 1]).ravel().tolist(),
        "test_count": int(len(ytest)),
    }
    metadata = {
        "disease": name,
        "dataset_name": DATASETS[name]["title"],
        "dataset_url": DATASETS[name]["url"],
        "dataset_id": DATASETS[name]["uci_id"],
        "target_definition": DATASETS[name]["outcome"],
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "selected_algorithm": selected_name,
        "training_rows": int(len(Xtrain)),
        "total_unique_rows": int(len(X)),
        "features": list(X.columns),
        "feature_types": types,
        "categorical_values": categories,
        "cv_comparison": leaderboard,
        "held_out_test": results,
        "limitation": "Education/demo only. Not validated for diagnosis, prognosis, treatment, or individual clinical risk.",
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(selected, MODEL_DIR / f"{name}_pipeline.joblib")
    (MODEL_DIR / f"{name}_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (REPORT_DIR / f"{name}_evaluation.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"  Selected: {selected_name}. Held-out F1={results['f1']:.3f}, ROC-AUC={results['roc_auc']:.3f}")
    print(f"  Saved models/{name}_pipeline.joblib and reports/{name}_evaluation.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--disease", choices=["all", *DATASETS], default="all")
    args = parser.parse_args()
    names = list(DATASETS) if args.disease == "all" else [args.disease]
    for name in names:
        train_one(name)
    print("Finished. Check reports/ for actual evaluation numbers; do not invent results.")


if __name__ == "__main__":
    main()
