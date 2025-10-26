import pandas as pd
import pickle
import os
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

MODEL_DIR = './models/'
TFIDF_VECTORIZER_FILE = os.path.join(MODEL_DIR, 'tfidf_vectorizer.pkl')
SIMILARITY_MATRIX_FILE = os.path.join(MODEL_DIR, 'cosine_similarity_matrix.pkl')
ATTRACTIONS_DATA_FILE = os.path.join(MODEL_DIR, 'attractions_lookup.pkl')

def load_model():
    print("Loading recommender model...")
    try:
        with open(TFIDF_VECTORIZER_FILE, 'rb') as f:
            vectorizer = pickle.load(f)
        with open(SIMILARITY_MATRIX_FILE, 'rb') as f:
            cosine_sim_matrix = pickle.load(f)
        with open(ATTRACTIONS_DATA_FILE, 'rb') as f:
            df = pickle.load(f)
        
        print("✓ Model loaded successfully.")
        print(f"  Attractions: {len(df):,}")
        
        # Convert all_categories from string to list
        if 'all_categories' in df.columns:
            df['all_categories'] = df['all_categories'].apply(
                lambda x: x.split(',') if pd.notna(x) and isinstance(x, str) else [df.loc[df.index[0], 'main_category']]
            )
        
        return vectorizer, cosine_sim_matrix, df
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        return None, None, None

def get_recommendations(interests, city_name, budget, num_days, num_people, vectorizer, 
                       cosine_sim_matrix, attractions_df, mode='combined'):
    print("\n" + "="*80)
    print(f"📍 {city_name} | 📅 {num_days} days | 👥 {num_people} people | 💰 {budget}")
    print(f"🎯 Interests: {', '.join(interests)} | 📋 Mode: {mode.upper()}")
    print("="*80)

    attraction_interests = [i for i in interests if i.lower() != 'food']
    if not attraction_interests:
        print("\n❌ No attraction interests selected.")
        return {}

    interest_map = {'history': 'History', 'culture': 'Culture', 'nature': 'Nature', 'adventure': 'Adventure'}
    normalized_interests = [interest_map.get(i.lower(), i) for i in attraction_interests]
    
    city_attractions = attractions_df[
        attractions_df['city'].str.contains(city_name, case=False, na=False)
    ].copy()
    
    if city_attractions.empty:
        print(f"\n❌ No attractions found in {city_name}")
        return {}
    
    print(f"✓ Found {len(city_attractions)} attractions in {city_name}")
    
    if budget.lower() == 'budget':
        filtered_attractions = city_attractions[
            (city_attractions['fee'].str.lower() == 'no') | (city_attractions['fee'].isna())
        ]
        print(f"✓ Filtered to {len(filtered_attractions)} budget-friendly attractions")
    else:
        filtered_attractions = city_attractions
        print(f"✓ Budget '{budget}' - including all attractions")
    
    if filtered_attractions.empty:
        print(f"\n❌ No attractions match budget")
        return {}

    if mode in ['combined', 'both']:
        combined_results = _get_combined_recommendations(
            normalized_interests, filtered_attractions, cosine_sim_matrix, 
            attractions_df, num_days
        )
    
    if mode in ['separate', 'both']:
        separate_results = _get_separate_recommendations(
            normalized_interests, filtered_attractions, cosine_sim_matrix,
            attractions_df, num_days
        )
    
    if mode == 'combined':
        return {'combined': combined_results}
    elif mode == 'separate':
        return {'separate': separate_results}
    else:
        return {'combined': combined_results, 'separate': separate_results}

def _get_combined_recommendations(interests, filtered_attractions, cosine_sim_matrix, 
                                 attractions_df, num_days):
    filtered_attractions = filtered_attractions.copy()
    filtered_attractions['category_match_score'] = 0.0
    filtered_attractions['num_matches'] = 0
    filtered_attractions['matched_categories'] = ''
    
    for idx in filtered_attractions.index:
        attraction_categories = filtered_attractions.at[idx, 'all_categories']
        matches = [cat for cat in interests if cat in attraction_categories]
        num_matches = len(matches)
        
        if num_matches > 0:
            multiplier = 1.0 + (min(num_matches - 1, 2) * 0.15)
            filtered_attractions.at[idx, 'category_match_score'] = multiplier
            filtered_attractions.at[idx, 'num_matches'] = num_matches
            filtered_attractions.at[idx, 'matched_categories'] = ', '.join(matches)
        else:
            filtered_attractions.at[idx, 'category_match_score'] = 0.3
            filtered_attractions.at[idx, 'matched_categories'] = 'Other'
    
    matching_category_attractions = attractions_df[
        attractions_df['all_categories'].apply(lambda cats: any(cat in interests for cat in cats))
    ]
    
    filtered_attractions['content_similarity'] = 0.0
    
    if len(matching_category_attractions) > 0:
        matching_indices = matching_category_attractions.index.tolist()
        for idx in filtered_attractions.index:
            similarities = cosine_sim_matrix[idx][matching_indices]
            filtered_attractions.at[idx, 'content_similarity'] = similarities.max()
    
    filtered_attractions['final_score'] = (
        filtered_attractions['category_match_score'] * 0.6 +
        filtered_attractions['content_similarity'] * 0.4
    )
    
    num_to_recommend = num_days * 3
    recommendations = filtered_attractions.nlargest(100, 'final_score').head(num_to_recommend)
    
    print(f"\n{'='*80}")
    print(f"🎉 COMBINED: TOP {len(recommendations)} RECOMMENDATIONS")
    print(f"{'='*80}\n")
    
    results = []
    for i, (idx, row) in enumerate(recommendations.iterrows(), 1):
        icon = "🔥🔥" if row['num_matches'] >= 2 else ("🔥" if row['final_score'] >= 0.7 else "⭐")
        
        print(f"{i:2d}. {icon} {row['name'].title()}")
        print(f"     Matches: {row['matched_categories']} ({row['num_matches']} interests)")
        print(f"     Score: {row['final_score']*100:5.1f}%")
        print()
        
        results.append({
            'name': row['name'],
            'matched_categories': row['matched_categories'],
            'num_matches': row['num_matches'],
            'score': row['final_score'],
            'city': row['city'],
            'fee': row.get('fee', 'N/A')
        })
    
    return results

def _get_separate_recommendations(interests, filtered_attractions, cosine_sim_matrix,
                                  attractions_df, num_days):
    print(f"\n{'='*80}")
    print(f"📂 SEPARATE: RECOMMENDATIONS BY INTEREST")
    print(f"{'='*80}")
    
    per_interest = num_days
    all_results = {}
    
    for interest in interests:
        print(f"\n🎯 {interest.upper()}")
        print("-" * 80)
        
        interest_attractions = filtered_attractions[
            filtered_attractions['all_categories'].apply(lambda cats: interest in cats)
        ].copy()
        
        if interest_attractions.empty:
            print(f"  ❌ No attractions for {interest}\n")
            all_results[interest] = []
            continue
        
        interest_category_attractions = attractions_df[
            attractions_df['all_categories'].apply(lambda cats: interest in cats)
        ]
        
        interest_attractions['similarity'] = 0.0
        
        if len(interest_category_attractions) > 0:
            matching_indices = interest_category_attractions.index.tolist()
            for idx in interest_attractions.index:
                similarities = cosine_sim_matrix[idx][matching_indices]
                interest_attractions.at[idx, 'similarity'] = similarities.mean()
        
        top_for_interest = interest_attractions.nlargest(per_interest * 2, 'similarity').head(per_interest)
        
        results = []
        for i, (idx, row) in enumerate(top_for_interest.iterrows(), 1):
            print(f"  {i}. {row['name'].title()}")
            print(f"     Score: {row['similarity']*100:5.1f}% | Fee: {row.get('fee', 'N/A')}")
            results.append({
                'name': row['name'],
                'score': row['similarity'],
                'fee': row.get('fee', 'N/A')
            })
        
        print()
        all_results[interest] = results
    
    return all_results

if __name__ == "__main__":
    vectorizer, cosine_sim_matrix, df = load_model()
    
    if vectorizer is None:
        exit()
    
    # ===================================================================
    # TEST 1: Singapore - Nature + Adventure (Luxury, 3 days, 2 people)
    # ===================================================================
    print("\n" + "🧪 TEST 1 - SINGAPORE (COMBINED)".center(80, "="))
    get_recommendations(
        interests=["Nature", "Adventure"],
        city_name="Singapore",
        budget="luxury",
        num_days=3,
        num_people=2,
        vectorizer=vectorizer,
        cosine_sim_matrix=cosine_sim_matrix,
        attractions_df=df,
        mode='combined'
    )
    
    # ===================================================================
    # TEST 2: Kuala Lumpur - History + Culture (Mid-range, 2 days, 4 people)
    # ===================================================================
    print("\n" + "🧪 TEST 2 - KUALA LUMPUR (COMBINED)".center(80, "="))
    get_recommendations(
        interests=["History", "Culture"],
        city_name="Kuala Lumpur",
        budget="mid-range",
        num_days=2,
        num_people=4,
        vectorizer=vectorizer,
        cosine_sim_matrix=cosine_sim_matrix,
        attractions_df=df,
        mode='combined'
    )
    
    # ===================================================================
    # TEST 3: Hanoi - History + Culture (Budget, 3 days, 1 person)
    # ===================================================================
    print("\n" + "🧪 TEST 3 - HANOI (SEPARATE)".center(80, "="))
    get_recommendations(
        interests=["History", "Culture"],
        city_name="Hanoi",
        budget="budget",
        num_days=3,
        num_people=1,
        vectorizer=vectorizer,
        cosine_sim_matrix=cosine_sim_matrix,
        attractions_df=df,
        mode='separate'
    )
    
    # ===================================================================
    # TEST 4: Ho Chi Minh City - All interests (Mid-range, 4 days, 3 people)
    # ===================================================================
    print("\n" + "🧪 TEST 4 - HO CHI MINH CITY (BOTH)".center(80, "="))
    results_both = get_recommendations(
        interests=["History", "Culture", "Nature", "Adventure"],
        city_name="Ho Chi Minh",
        budget="mid-range",
        num_days=4,
        num_people=3,
        vectorizer=vectorizer,
        cosine_sim_matrix=cosine_sim_matrix,
        attractions_df=df,
        mode='both'
    )
    
    # ===================================================================
    # TEST 5: Phnom Penh - History + Culture (Budget, 2 days, 2 people)
    # ===================================================================
    print("\n" + "🧪 TEST 5 - PHNOM PENH (COMBINED)".center(80, "="))
    get_recommendations(
        interests=["Adventure", "History"],
        city_name="Penang",
        budget="budget",
        num_days=2,
        num_people=2,
        vectorizer=vectorizer,
        cosine_sim_matrix=cosine_sim_matrix,
        attractions_df=df,
        mode='combined'
    )
    
    # ===================================================================
    # TEST 6: Singapore - All interests (Luxury, 5 days, 2 people)
    # ===================================================================
    print("\n" + "🧪 TEST 6 - SINGAPORE DIVERSE TRIP (COMBINED)".center(80, "="))
    get_recommendations(
        interests=["History", "Culture", "Nature", "Adventure"],
        city_name="Singapore",
        budget="luxury",
        num_days=5,
        num_people=2,
        vectorizer=vectorizer,
        cosine_sim_matrix=cosine_sim_matrix,
        attractions_df=df,
        mode='combined'
    )
