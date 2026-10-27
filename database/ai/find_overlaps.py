
import pandas as pd
from pathlib import Path

# Step 1: Locate the dataset
database_folder = Path(__file__).resolve().parent.parent

file_path = (
    database_folder
    / "data"
    / "raw"
    / "mimic"
    / "hosp"
    / "prescriptions.csv.gz"
)

# Step 2: Read patient prescription records
df = pd.read_csv(
    file_path,
    compression="gzip",
    low_memory=False
)

# Step 3: Convert dates to datetime
df["starttime"] = pd.to_datetime(
    df["starttime"], errors="coerce"
)

df["stoptime"] = pd.to_datetime(
    df["stoptime"], errors="coerce"
)

# Step 4: Keep records with valid time intervals
valid = df.dropna(
    subset=["subject_id", "drug", "starttime", "stoptime"]
).copy()

valid = valid[
    valid["stoptime"] > valid["starttime"]
]

# Remove exact repetitions for this demonstration
valid = valid.drop_duplicates(
    subset=["subject_id", "drug", "starttime", "stoptime"]
)

print("VALID PRESCRIPTION RECORDS:", len(valid))
print("\nCHECKING FOR OVERLAPPING PRESCRIPTION PERIODS...\n")

# Step 5: Check each patient's prescriptions
examples_found = 0

for patient_id, group in valid.groupby("subject_id"):

    records = group.sort_values(
        "starttime"
    ).to_dict("records")

    for i in range(len(records)):

        first = records[i]

        for j in range(i + 1, len(records)):

            second = records[j]

            # Records are sorted by start date
            if second["starttime"] >= first["stoptime"]:
                break

            # Compare different medicine names
            if str(first["drug"]).strip().lower() == \
               str(second["drug"]).strip().lower():
                continue

            overlap_start = max(
                first["starttime"],
                second["starttime"]
            )

            overlap_end = min(
                first["stoptime"],
                second["stoptime"]
            )

            if overlap_start < overlap_end:

                print("Patient ID:", patient_id)
                print("Medicine 1:", first["drug"])
                print("Medicine 2:", second["drug"])
                print("Overlap starts:", overlap_start)
                print("Overlap ends:", overlap_end)
                print("-" * 45)

                examples_found += 1

            # Display only the first 5 examples
            if examples_found >= 5:
                break

        if examples_found >= 5:
            break

    if examples_found >= 5:
        break

if examples_found == 0:
    print("No overlap examples found in complete records.")
