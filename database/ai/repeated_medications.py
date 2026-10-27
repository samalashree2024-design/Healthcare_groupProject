
import pandas as pd
from pathlib import Path

# Find our existing dataset
database_folder = Path(__file__).resolve().parent.parent

file_path = (
    database_folder
    / "data"
    / "raw"
    / "mimic"
    / "hosp"
    / "prescriptions.csv.gz"
)

# Load prescriptions
df = pd.read_csv(file_path, low_memory=False)

# Convert dates
df["starttime"] = pd.to_datetime(
    df["starttime"], errors="coerce"
)

df["stoptime"] = pd.to_datetime(
    df["stoptime"], errors="coerce"
)

# Standardize medicine names for comparison
df["drug_key"] = (
    df["drug"].astype("string").str.strip().str.lower()
)

# Keep records with valid patient, medicine and start date
df = df.dropna(
    subset=["subject_id", "drug_key", "starttime"]
)

# Remove exact duplicate prescription entries
df = df.drop_duplicates(
    subset=[
        "subject_id", "drug_key",
        "starttime", "stoptime",
        "dose_val_rx", "dose_unit_rx", "route"
    ]
)

# Count recorded prescriptions for each medicine
counts = (
    df.groupby(["subject_id", "drug_key"])
    .size()
)

repeated = counts[counts > 1].sort_values(
    ascending=False
)

print("\nREPEATED PRESCRIPTION RECORDS")
print("Patient-medicine groups with multiple records:",
      len(repeated))

# Display 5 examples
for (patient_id, medicine), count in repeated.head(5).items():

    print("\n----------------------------------")
    print("Patient ID:", patient_id)
    print("Medicine:", medicine)
    print("Prescription records:", count)

    records = df[
        (df["subject_id"] == patient_id) &
        (df["drug_key"] == medicine)
    ].sort_values("starttime")

    print(records[
        ["starttime", "stoptime", "dose_val_rx", "route"]
    ].to_string(index=False))
