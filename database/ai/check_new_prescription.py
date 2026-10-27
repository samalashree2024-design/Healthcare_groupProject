
import pandas as pd
from pathlib import Path

# Locate our processed medication history
database_folder = Path(__file__).resolve().parent.parent

file_path = (
    database_folder
    / "data"
    / "processed"
    / "medication_periods.csv"
)

# Load grouped medication records
df = pd.read_csv(file_path)

df["start"] = pd.to_datetime(df["start"])
df["end"] = pd.to_datetime(df["end"])

# Doctor enters a proposed prescription
print("\nNEW PRESCRIPTION TIMELINE CHECK")
print("--------------------------------")

patient_id = input("Enter Patient ID: ").strip()
new_medicine = input("Enter Medicine Name: ").strip()

try:
    new_start = pd.to_datetime(
        input("Start (YYYY-MM-DD HH:MM): "),
        format="%Y-%m-%d %H:%M",
        errors="raise"
    )

    new_end = pd.to_datetime(
        input("End (YYYY-MM-DD HH:MM): "),
        format="%Y-%m-%d %H:%M",
        errors="raise"
    )

except ValueError:
    print("Invalid date format.")
    raise SystemExit

if not new_medicine or new_end <= new_start:
    print("Invalid medicine name or prescription period.")
    raise SystemExit

# Find the patient's recorded medication periods
history = df[
    df["patient"].astype(str) == patient_id
].copy()

if history.empty:
    print("\nNo complete medication periods found for this patient.")
    raise SystemExit

# Check whether recorded periods overlap
overlaps = history[
    (history["start"] < new_end) &
    (history["end"] > new_start)
].sort_values("start")

print("\nPRESCRIPTION TIMELINE RESULTS")
print("--------------------------------")

if overlaps.empty:
    print("No overlap found among complete recorded periods.")
else:
    print("Overlapping recorded prescription periods:",
          len(overlaps))

    for _, record in overlaps.head(20).iterrows():

        same_name = (
            str(record["medicine"]).strip().lower()
            == new_medicine.lower()
        )

        print("\nExisting Medicine:", record["medicine"])
        print("Route:", record["route"])
        print("Existing Start:", record["start"])
        print("Existing End:", record["end"])

        if same_name:
            print("CHECK: Same medicine name recorded")
        else:
            print("CHECK: Different medicine; interaction unknown")

print("\nIMPORTANT:")
print("This checks prescription dates, not drug safety.")
print("Incomplete prescription periods were excluded.")
print("An overlap does not establish an interaction.")
print("No overlap does not guarantee safety.")
