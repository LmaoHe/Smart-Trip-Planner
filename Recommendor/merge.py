import pandas as pd
import os
import glob

# --- Configuration ---
DATA_FOLDER = './data/'
OUTPUT_FILE = './data/attractions_merged.csv'
# ---------------------

print("=== CSV Merger ===\n")

# Find all CSV files in the data folder
csv_files = glob.glob(os.path.join(DATA_FOLDER, '*.csv'))

if not csv_files:
    print(f"No CSV files found in {DATA_FOLDER}")
else:
    print(f"Found {len(csv_files)} CSV file(s):")
    for file in csv_files:
        print(f"  - {os.path.basename(file)}")
    
    print("\nReading and merging files...")
    dfs = []
    total_rows = 0
    
    for file in csv_files:
        try:
            print(f"\nProcessing: {os.path.basename(file)}")
            df = pd.read_csv(file, encoding='utf-8', on_bad_lines='skip', low_memory=False)
            rows = len(df)
            total_rows += rows
            dfs.append(df)
            print(f"  ✓ Loaded {rows:,} rows")
        except Exception as e:
            print(f"  ✗ Error reading file: {e}")
    
    if dfs:
        # Combine all dataframes
        print("\nMerging all dataframes...")
        combined_df = pd.concat(dfs, ignore_index=True)
        
        # Remove duplicate rows if any
        original_count = len(combined_df)
        combined_df = combined_df.drop_duplicates()
        duplicates_removed = original_count - len(combined_df)
        
        print(f"\n=== Merge Summary ===")
        print(f"Total rows before merge: {total_rows:,}")
        print(f"Total rows after merge: {len(combined_df):,}")
        print(f"Duplicates removed: {duplicates_removed:,}")
        print(f"Columns: {len(combined_df.columns)}")
        
        # Show wikidata stats
        has_wikidata = (combined_df['wikidata'].notna() & 
                       (combined_df['wikidata'] != '') & 
                       (combined_df['wikidata'].astype(str) != 'nan')).sum()
        print(f"Rows with Wikidata IDs: {has_wikidata:,}")
        
        # Save merged file
        combined_df.to_csv(OUTPUT_FILE, index=False)
        print(f"\n✓ Successfully saved to: {OUTPUT_FILE}")
    else:
        print("\nNo data to merge!")