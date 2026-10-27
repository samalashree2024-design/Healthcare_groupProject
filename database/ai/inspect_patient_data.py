
import pandas as pd
from pathlib import Path

# Locate the database folder
database_folder = Path(__file__).resolve().parent.parent

# Location of downloaded prescription data
file_path = (
    database_folder
    / "data"
    / "raw"
    / "mimic"
    / "hosp"
    / "prescriptions.csv.gz"
)

# Check if the file exists
if not file_path.exists():
    print("Dataset not found!")
    print("Expected location:", file_path)
    exit()

# Read the dataset
df = pd.read_csv(file_path, compression="gzip", low_memory=False)

print("\nDATASET LOADED SUCCESSFULLY!")

print("\nTotal prescription records:", len(df))

print("\nTotal unique patients:", df["subject_id"].nunique())

print("\nDataset columns:")
print(df.columns.tolist())

print("\nFirst 5 prescription records:")
print(df[["subject_id", "drug", "starttime", "stoptime"]].head())

print("\nMissing values:")
print(df[["drug", "starttime", "stoptime"]].isnull().sum())
