import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import pickle
import os

# --- Configuration ---
INPUT_FILE = './attractions_final_model_data.csv'
MODEL_DIR = './models/'
TFIDF_MODEL_FILE = 'tfidf_vectorizer.pkl'
SIMILARITY_MATRIX_FILE = 'cosine_similarity_matrix.pkl'
ATTRACTIONS_DATA_FILE = 'attractions_lookup.pkl'

MAX_FEATURES = 5000
MIN_DF = 2
MAX_DF = 0.8
NGRAM_RANGE = (1, 2)
# ---------------------

def train_recommendation_model(df):
    print("\n[Training] Initializing TF-IDF Vectorizer...")
    
    tfidf = TfidfVectorizer(
        max_features=MAX_FEATURES,
        min_df=MIN_DF,
        max_df=MAX_DF,
        ngram_range=NGRAM_RANGE,
        stop_words='english',
        strip_accents='unicode',
        lowercase=True,
        analyzer='word',
        token_pattern=r'\b[a-zA-Z]{2,}\b'
    )
    
    print(f"[Training] Vectorizing {len(df):,} attractions...")
    tfidf_matrix = tfidf.fit_transform(df['content'])
    
    print(f"  TF-IDF matrix shape: {tfidf_matrix.shape}")
    print(f"  Vocabulary size: {len(tfidf.vocabulary_):,}")
    
    print("\n[Training] Computing cosine similarity matrix...")
    cosine_sim_matrix = cosine_similarity(tfidf_matrix, tfidf_matrix)
    
    print(f"  Similarity matrix shape: {cosine_sim_matrix.shape}")
    print(f"  Memory size: {cosine_sim_matrix.nbytes / (1024**2):.2f} MB")
    
    return tfidf, cosine_sim_matrix, df

def save_model(tfidf, cosine_sim, attractions_df):
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    print("\n[Saving] Saving trained model...")
    
    with open(os.path.join(MODEL_DIR, TFIDF_MODEL_FILE), 'wb') as f:
        pickle.dump(tfidf, f)
    print(f"  ✓ TF-IDF vectorizer saved")
    
    with open(os.path.join(MODEL_DIR, SIMILARITY_MATRIX_FILE), 'wb') as f:
        pickle.dump(cosine_sim, f)
    print(f"  ✓ Similarity matrix saved")
    
    with open(os.path.join(MODEL_DIR, ATTRACTIONS_DATA_FILE), 'wb') as f:
        pickle.dump(attractions_df, f)
    print(f"  ✓ Attractions data saved")

if __name__ == "__main__":
    print("="*70)
    print("CONTENT-BASED RECOMMENDATION SYSTEM - MODEL TRAINING")
    print("="*70)
    
    print(f"\nLoading data from {INPUT_FILE}...")
    if not os.path.exists(INPUT_FILE):
        print(f"\nFATAL ERROR: {INPUT_FILE} not found!")
        exit()
    
    df = pd.read_csv(INPUT_FILE)
    print(f"Loaded {len(df):,} attractions")
    
    required_cols = ['name', 'main_category', 'description', 'city', 'country', 'content', 'all_categories']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        print(f"\nERROR: Missing required columns: {missing_cols}")
        exit()
    
    df['content'] = df['content'].fillna('')
    empty_content = (df['content'].str.strip() == '').sum()
    if empty_content > 0:
        print(f"\nWARNING: Removing {empty_content} rows with empty content...")
        df = df[df['content'].str.strip() != '']
    
    print(f"\nDataset summary:")
    print(f"  Attractions: {len(df):,}")
    print(f"  Categories: {df['main_category'].nunique()}")
    print(f"  Cities: {df['city'].nunique()}")
    
    print("\n" + "="*70)
    print("TRAINING MODEL")
    print("="*70)
    
    tfidf_vectorizer, cosine_sim_matrix, attractions_data = train_recommendation_model(df)
    save_model(tfidf_vectorizer, cosine_sim_matrix, attractions_data)
    
    print("\n" + "="*70)
    print("TRAINING COMPLETE")
    print("="*70)
    print(f"Model files saved to: {MODEL_DIR}")
    print("="*70)
