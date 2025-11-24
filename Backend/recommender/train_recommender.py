# ========== train_recommender.py ==========
import pandas as pd
import pickle
import os
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from datetime import datetime


def train_recommender_model():
    """Train TF-IDF recommender model"""
    
    print("\n" + "="*70)
    print("🤖 TRAINING TF-IDF ITINERARY RECOMMENDER")
    print("="*70)
    print(f"⏰ Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # ========== 1. LOAD DATA ==========
    print("📖 Loading POI data...")
    try:
        df = pd.read_csv('data/pois_84_cities.csv')
        print(f"   ✅ Loaded {len(df):,} POIs from {df['city'].nunique()} cities\n")
    except FileNotFoundError:
        print("   ❌ Error: data/pois_84_cities.csv not found!")
        print("   Please run the POI collection script first.")
        return
    
    # ========== 2. DATA VALIDATION ==========
    print("🔍 Validating data...")
    
    # Check required columns
    required_cols = ['name', 'category', 'city', 'country', 'latitude', 'longitude', 
                     'suitable_for', 'rating', 'reviews', 'address', 'place_id']
    missing_cols = [col for col in required_cols if col not in df.columns]
    
    if missing_cols:
        print(f"   ❌ Missing columns: {missing_cols}")
        return
    
    print(f"   ✅ All required columns present")
    
    # Check for nulls
    print(f"   Missing values:")
    for col in ['name', 'category', 'city', 'country']:
        null_count = df[col].isnull().sum()
        if null_count > 0:
            print(f"      ⚠️ {col}: {null_count} nulls (will be filled)")
    
    # Fill missing values
    df['name'] = df['name'].fillna('')
    df['category'] = df['category'].fillna('')
    df['description'] = df['description'].fillna('') if 'description' in df.columns else ''
    df['types'] = df['types'].fillna('') if 'types' in df.columns else ''
    df['rating'] = df['rating'].fillna(0)
    df['reviews'] = df['reviews'].fillna(0)
    
    print(f"   ✅ Data cleaned\n")
    
    # ========== 3. FEATURE ENGINEERING ==========
    print("🔧 Building text features...")
    
    # Combine text fields for TF-IDF
    df['combined_text'] = (
        df['name'] + ' ' + 
        df['category'] + ' ' + 
        df['types'] + ' ' + 
        df['description']
    )
    
    print(f"   ✅ Combined text features created")
    print(f"   Sample: {df['combined_text'].iloc[0][:100]}...\n")
    
    # ========== 4. BUILD TF-IDF MODEL ==========
    print("🧠 Training TF-IDF vectorizer...")
    
    tfidf_vectorizer = TfidfVectorizer(
        max_features=1000,        # Top 1000 most important words
        stop_words='english',     # Remove common English words
        ngram_range=(1, 2),       # Use 1-word and 2-word phrases
        min_df=2,                 # Word must appear in at least 2 documents
        max_df=0.8                # Word must not appear in more than 80% of documents
    )
    
    tfidf_matrix = tfidf_vectorizer.fit_transform(df['combined_text'])
    
    print(f"   ✅ TF-IDF matrix shape: {tfidf_matrix.shape}")
    print(f"   ✅ Vocabulary size: {len(tfidf_vectorizer.vocabulary_)}")
    print(f"   ✅ Matrix density: {(tfidf_matrix.nnz / (tfidf_matrix.shape[0] * tfidf_matrix.shape[1]) * 100):.2f}%\n")
    
    # ========== 5. SAVE MODELS ==========
    print("💾 Saving models...")
    
    models_dir = 'models'
    os.makedirs(models_dir, exist_ok=True)
    
    # Save TF-IDF vectorizer
    vectorizer_path = os.path.join(models_dir, 'tfidf_vectorizer.pkl')
    with open(vectorizer_path, 'wb') as f:
        pickle.dump(tfidf_vectorizer, f)
    print(f"   ✅ Saved TF-IDF vectorizer ({os.path.getsize(vectorizer_path) / 1024:.1f} KB)")
    
    # Save TF-IDF matrix (sparse format)
    matrix_path = os.path.join(models_dir, 'tfidf_matrix.pkl')
    with open(matrix_path, 'wb') as f:
        pickle.dump(tfidf_matrix, f)
    print(f"   ✅ Saved TF-IDF matrix ({os.path.getsize(matrix_path) / 1024:.1f} KB)")
    
    # Save POI data
    data_path = os.path.join(models_dir, 'pois_data.pkl')
    df.to_pickle(data_path)
    print(f"   ✅ Saved POI data ({os.path.getsize(data_path) / 1024:.1f} KB)\n")
    
    # ========== 6. STATISTICS ==========
    print("="*70)
    print("📊 TRAINING STATISTICS")
    print("="*70)
    
    print(f"\n🌍 GEOGRAPHIC COVERAGE:")
    print(f"   Countries: {df['country'].nunique()}")
    print(f"   Cities: {df['city'].nunique()}")
    
    print(f"\n🏙️ TOP 10 CITIES:")
    for city, count in df['city'].value_counts().head(10).items():
        print(f"   {city}: {count:,} POIs")
    
    print(f"\n📂 CATEGORY DISTRIBUTION:")
    print(f"   Total categories: {df['category'].nunique()}")
    for cat, count in df['category'].value_counts().head(10).items():
        print(f"   {cat}: {count:,}")
    
    print(f"\n👥 TRAVELER TYPE DISTRIBUTION:")
    for traveler_type in ['family', 'couple', 'solo', 'friends']:
        count = len(df[df['suitable_for'].str.contains(traveler_type, na=False)])
        pct = (count / len(df)) * 100
        print(f"   {traveler_type.capitalize()}: {count:,} ({pct:.1f}%)")
    
    print(f"\n⭐ RATING DISTRIBUTION:")
    print(f"   Average rating: {df['rating'].mean():.2f}")
    print(f"   Median rating: {df['rating'].median():.2f}")
    print(f"   POIs with ratings: {(df['rating'] > 0).sum():,} ({(df['rating'] > 0).sum() / len(df) * 100:.1f}%)")
    
    print(f"\n💬 REVIEW STATISTICS:")
    print(f"   Total reviews: {df['reviews'].sum():,.0f}")
    print(f"   Average reviews per POI: {df['reviews'].mean():.0f}")
    print(f"   Median reviews: {df['reviews'].median():.0f}")
    
    # ========== 7. MODEL INFO ==========
    print(f"\n" + "="*70)
    print("✅ TRAINING COMPLETE!")
    print("="*70)
    print(f"⏰ Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\n📦 Models saved to: {models_dir}/")
    print(f"   • tfidf_vectorizer.pkl")
    print(f"   • tfidf_matrix.pkl")
    print(f"   • pois_data.pkl")
    print(f"\n🚀 Ready to use! Run your Flask app with: python app.py")
    print("="*70 + "\n")


if __name__ == '__main__':
    try:
        train_recommender_model()
    except KeyboardInterrupt:
        print("\n\n⚠️ Training interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error during training: {str(e)}")
        import traceback
        traceback.print_exc()
