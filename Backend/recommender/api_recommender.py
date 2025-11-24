import os
import pickle
import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from math import radians, sin, cos, sqrt, atan2


class ItineraryRecommender:
    """AI-powered travel itinerary recommender using TF-IDF similarity"""
    
    # City centers (latitude, longitude) for distance validation
    CITY_CENTERS = {
        # ===== ASIA =====
        
        # Malaysia
        'kuala lumpur': (3.1390, 101.6869),
        'penang': (5.4164, 100.3327),
        'langkawi': (6.3500, 99.8000),
        
        # Singapore
        'singapore': (1.3521, 103.8198),
        
        # Thailand
        'bangkok': (13.7563, 100.5018),
        'phuket': (7.8804, 98.3923),
        'chiang mai': (18.7883, 98.9853),
        'krabi': (8.0863, 98.9063),
        
        # Indonesia
        'bali': (-8.4095, 115.1889),
        'jakarta': (-6.2088, 106.8456),
        'yogyakarta': (-7.7956, 110.3695),
        
        # Japan
        'tokyo': (35.6762, 139.6503),
        'kyoto': (35.0116, 135.7681),
        'osaka': (34.6937, 135.5023),
        'hiroshima': (34.3853, 132.4553),
        
        # South Korea
        'seoul': (37.5665, 126.9780),
        'busan': (35.1796, 129.0756),
        'jeju island': (33.4996, 126.5312),
        
        # Vietnam
        'hanoi': (21.0285, 105.8542),
        'ho chi minh city': (10.8231, 106.6297),
        'da nang': (16.0544, 108.2022),
        
        # Cambodia
        'siem reap': (13.3671, 103.8448),
        
        # ===== EUROPE =====
        
        # France
        'paris': (48.8566, 2.3522),
        'nice': (43.7102, 7.2620),
        'lyon': (45.7640, 4.8357),
        'marseille': (43.2965, 5.3698),
        
        # Italy
        'rome': (41.9028, 12.4964),
        'venice': (45.4408, 12.3155),
        'florence': (43.7696, 11.2558),
        'milan': (45.4642, 9.1900),
        'naples': (40.8518, 14.2681),
        
        # Spain
        'barcelona': (41.3851, 2.1734),
        'madrid': (40.4168, -3.7038),
        'seville': (37.3891, -5.9845),
        'valencia': (39.4699, -0.3763),
        
        # United Kingdom
        'london': (51.5074, -0.1278),
        'edinburgh': (55.9533, -3.1883),
        'liverpool': (53.4084, -2.9916),
        
        # Germany
        'berlin': (52.5200, 13.4050),
        'munich': (48.1351, 11.5820),
        'frankfurt': (50.1109, 8.6821),
        
        # Netherlands
        'amsterdam': (52.3676, 4.9041),
        'rotterdam': (51.9225, 4.4792),
        
        # Switzerland
        'zurich': (47.3769, 8.5417),
        'geneva': (46.2044, 6.1432),
        'interlaken': (46.6863, 7.8632),
        
        # Greece
        'athens': (37.9838, 23.7275),
        'santorini': (36.3932, 25.4615),
        'mykonos': (37.4467, 25.3289),
        
        # Portugal
        'lisbon': (38.7223, -9.1393),
        'porto': (41.1579, -8.6291),
        
        # Czech Republic
        'prague': (50.0755, 14.4378),
        
        # ===== AMERICAS =====
        
        # United States
        'new york': (40.7128, -74.0060),
        'los angeles': (34.0522, -118.2437),
        'san francisco': (37.7749, -122.4194),
        'las vegas': (36.1699, -115.1398),
        'miami': (25.7617, -80.1918),
        'orlando': (28.5383, -81.3792),
        
        # Canada
        'toronto': (43.6532, -79.3832),
        'vancouver': (49.2827, -123.1207),
        'montreal': (45.5017, -73.5673),
        
        # Brazil
        'rio de janeiro': (-22.9068, -43.1729),
        'são paulo': (-23.5505, -46.6333),
        'sao paulo': (-23.5505, -46.6333),  # Alternative spelling
        
        # Mexico
        'cancun': (21.1619, -86.8515),
        'mexico city': (19.4326, -99.1332),
        'playa del carmen': (20.6296, -87.0739),
        
        # Peru
        'cusco': (-13.5319, -71.9675),
        'lima': (-12.0464, -77.0428),
        
        # Argentina
        'buenos aires': (-34.6037, -58.3816),
        
        # ===== MIDDLE EAST & AFRICA =====
        
        # UAE
        'dubai': (25.2048, 55.2708),
        'abu dhabi': (24.4539, 54.3773),
        
        # Turkey
        'istanbul': (41.0082, 28.9784),
        'cappadocia': (38.6431, 34.8289),
        
        # Egypt
        'cairo': (30.0444, 31.2357),
        'luxor': (25.6872, 32.6396),
        'sharm el sheikh': (27.9158, 34.3300),
        
        # Morocco
        'marrakech': (31.6295, -7.9811),
        'casablanca': (33.5731, -7.5898),
        
        # South Africa
        'cape town': (-33.9249, 18.4241),
        
        # ===== OCEANIA =====
        
        # Australia
        'sydney': (-33.8688, 151.2093),
        'melbourne': (-37.8136, 144.9631),
        'gold coast': (-28.0167, 153.4000),
        
        # New Zealand
        'auckland': (-36.8485, 174.7633),
        'queenstown': (-45.0312, 168.6626),
    }
    
    def __init__(self):
        """Initialize and load trained models"""
        print("🔄 Loading recommender models...")
        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        models_dir = os.path.join(current_dir, 'models')
        
        print(f"📂 Models directory: {models_dir}")
        
        self.vectorizer_path = os.path.join(models_dir, 'tfidf_vectorizer.pkl')
        self.matrix_path = os.path.join(models_dir, 'tfidf_matrix.pkl')
        self.data_path = os.path.join(models_dir, 'pois_data.pkl')
        
        try:
            with open(self.vectorizer_path, 'rb') as f:
                self.tfidf = pickle.load(f)
            print("   ✅ Loaded TF-IDF vectorizer")
            
            with open(self.matrix_path, 'rb') as f:
                self.tfidf_matrix = pickle.load(f)
            print("   ✅ Loaded TF-IDF matrix")
            
            self.df = pd.read_pickle(self.data_path)
            print(f"   ✅ Loaded {len(self.df):,} POIs")
            
            print(f"\n📊 Available data:")
            print(f"   Countries: {self.df['country'].nunique()}")
            print(f"   Cities: {self.df['city'].nunique()}")
            print(f"   Categories: {self.df['category'].nunique()}\n")
            
        except FileNotFoundError as e:
            print(f"❌ Error loading models: {e}")
            print(f"📍 Expected path: {models_dir}")
            print("Please run 'python train_recommender.py' first!")
            raise
        except Exception as e:
            print(f"❌ Unexpected error loading models: {e}")
            raise
    
    def calculate_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two points in km using Haversine formula"""
        R = 6371  # Earth's radius in km
        
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c
    
    def get_recommendations(self, city, country, categories, traveler_type='solo', nights=3, top_n=40):
        """Get POI recommendations for itinerary"""
        
        print(f"\n🎯 Getting recommendations:")
        print(f"   📍 {city}, {country}")
        print(f"   🏷️ Categories: {', '.join(categories)}")
        print(f"   👥 Traveler: {traveler_type}")
        print(f"   🌙 Nights: {nights}")
        print(f"   📊 Limit: {top_n}")
        
        try:
            # Filter by city and country
            city_filter = (
                (self.df['city'].str.lower() == city.lower()) & 
                (self.df['country'].str.lower() == country.lower())
            )
            
            category_filter = self.df['category'].isin(categories)
            traveler_filter = self.df['suitable_for'].str.contains(traveler_type, case=False, na=False)
            
            # Combine filters
            combined_filter = city_filter & category_filter & traveler_filter
            filtered_df = self.df[combined_filter].copy()
            
            print(f"   🔍 Filtered POIs (with traveler): {len(filtered_df)}")
            
            # Relax filters if needed
            if len(filtered_df) < top_n:
                print(f"   ⚠️ Not enough results, relaxing traveler filter...")
                combined_filter = city_filter & category_filter
                filtered_df = self.df[combined_filter].copy()
                print(f"   🔍 Filtered POIs (without traveler): {len(filtered_df)}")
            
            if len(filtered_df) < top_n:
                print(f"   ⚠️ Still not enough, using all categories...")
                filtered_df = self.df[city_filter].copy()
                print(f"   🔍 Filtered POIs (all categories): {len(filtered_df)}")
            
            # ✅ DISTANCE VALIDATION
            city_lower = city.lower().strip()
            if city_lower in self.CITY_CENTERS:
                city_lat, city_lon = self.CITY_CENTERS[city_lower]
                
                print(f"   🌍 Validating distance from city center...")
                
                filtered_df['distance_km'] = filtered_df.apply(
                    lambda row: self.calculate_distance(
                        city_lat, city_lon,
                        row['latitude'], row['longitude']
                    ), axis=1
                )
                
                print(f"   📊 Distance range: {filtered_df['distance_km'].min():.1f}km - {filtered_df['distance_km'].max():.1f}km")
                
                max_distance_km = 50
                filtered_df = filtered_df[filtered_df['distance_km'] <= max_distance_km].copy()
                
                print(f"   ✅ Filtered by distance (<{max_distance_km}km): {len(filtered_df)} POIs")
            else:
                print(f"   ⚠️ No city center data for {city}, skipping distance validation")
            
            if len(filtered_df) == 0:
                print(f"   ❌ No POIs found for {city}, {country}")
                return []
            
            # TF-IDF ranking
            search_query = f"{city} {' '.join(categories)} {traveler_type}"
            query_vec = self.tfidf.transform([search_query])
            
            filtered_indices = filtered_df.index.tolist()
            filtered_tfidf = self.tfidf_matrix[filtered_indices]
            similarity_scores = cosine_similarity(query_vec, filtered_tfidf).flatten()
            
            filtered_df['similarity_score'] = similarity_scores
            
            filtered_df['combined_score'] = (
                filtered_df['similarity_score'] * 0.4 +
                (filtered_df['rating'] / 5.0) * 0.4 +
                (np.log1p(filtered_df['reviews']) / 10.0) * 0.2
            )
            
            top_pois = filtered_df.nlargest(min(top_n, len(filtered_df)), 'combined_score')
            
            recommendations = []
            for _, poi in top_pois.iterrows():
                recommendations.append({
                    'name': str(poi['name']),
                    'category': str(poi['category']),
                    'latitude': float(poi['latitude']),
                    'longitude': float(poi['longitude']),
                    'address': str(poi.get('address', '')),
                    'phone': str(poi.get('phone', '')),
                    'website': str(poi.get('website', '')),
                    'rating': float(poi['rating']) if pd.notna(poi['rating']) else 0.0,
                    'reviews': int(poi['reviews']) if pd.notna(poi['reviews']) else 0,
                    'place_id': str(poi['place_id']) if pd.notna(poi.get('place_id')) else None,
                    'photo_reference': str(poi['photo_reference']) if pd.notna(poi.get('photo_reference')) else None,
                    'suitable_for': str(poi.get('suitable_for', '')),
                    'city': str(poi['city']),
                    'country': str(poi['country']),
                    'types': str(poi.get('types', '')),
                    'score': float(poi['combined_score'])
                })
            
            print(f"\n✅ Returning {len(recommendations)} recommendations")
            return recommendations
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return []


# ========== GLOBAL INSTANCE ==========
try:
    recommender = ItineraryRecommender()
    print("✅ Recommender system initialized successfully\n")
except Exception as e:
    print(f"❌ Failed to initialize recommender: {e}")
    recommender = None
