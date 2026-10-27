
import pandas as pd
from pathlib import Path

# Locate dataset
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

# Standardize names and route
df["drug_key"] = df["drug"].astype("string").str.strip().str.lower()
df["route_key"] = df["route"].astype("string").fillna("unknown").str.strip().str.lower()

# Keep valid, complete intervals
valid = df.dropna(
    subset=["subject_id", "drug_key", "starttime", "stoptime"]
).copy()

valid = valid[
    valid["stoptime"] >= valid["starttime"]
]

valid = valid.sort_values("starttime")

# Group intervals with a maximum 1-hour gap
max_gap = pd.Timedelta(hours=1)
episodes = []

for (patient, medicine, route), group in valid.groupby(
    ["subject_id", "drug_key", "route_key"]
):
    current_start = None
    current_end = None
    record_count = 0

    for row in group.itertuples():
        start = row.starttime
        end = row.stoptime

        if current_start is None:
            current_start = start
            current_end = end
            record_count = 1

        elif start <= current_end + max_gap:
            current_end = max(current_end, end)
            record_count += 1

        else:
            episodes.append({
                "patient": patient,
                "medicine": medicine,
                "route": route,
                "start": current_start,
                "end": current_end,
                "records": record_count
            })

            current_start = start
            current_end = end
            record_count = 1

    if current_start is not None:
        episodes.append({
            "patient": patient,
            "medicine": medicine,
            "route": route,
            "start": current_start,
            "end": current_end,
            "records": record_count
        })

result = pd.DataFrame(episodes)

print("\nTotal valid records:", len(valid))
print("Total grouped medication periods:", len(result))

# Show groups with several original records
multiple = result[result["records"] >= 3]

print("\nEXAMPLES OF GROUPED RECORDS:")
print(
    multiple.head(10).to_string(index=False)
)

# Save processed data
output_path = database_folder / "data" / "processed"
output_path.mkdir(parents=True, exist_ok=True)

result.to_csv(
    output_path / "medication_periods.csv",
    index=False
)

print("\nProcessed file saved successfully!")
