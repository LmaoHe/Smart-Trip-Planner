import googlemaps
import pandas as pd
import os
import time

# ========== CONFIGURATION ==========
GOOGLE_API_KEY = ""

LOCATIONS = {
    # ASIA
    'Malaysia': ['Kuala Lumpur', 'Penang', 'Langkawi'],
    'Singapore': ['Singapore'],
    'Thailand': ['Bangkok', 'Phuket', 'Chiang Mai', 'Krabi'],
    'Indonesia': ['Bali', 'Jakarta', 'Yogyakarta'],
    'Japan': ['Tokyo', 'Kyoto', 'Osaka', 'Hiroshima'],
    'South Korea': ['Seoul', 'Busan', 'Jeju Island'],
    'Vietnam': ['Hanoi', 'Ho Chi Minh City', 'Da Nang'],
    'Cambodia': ['Siem Reap'],
    
    # EUROPE
    'France': ['Paris', 'Nice', 'Lyon', 'Marseille'],
    'Italy': ['Rome', 'Venice', 'Florence', 'Milan', 'Naples'],
    'Spain': ['Barcelona', 'Madrid', 'Seville', 'Valencia'],
    'United Kingdom': ['London', 'Edinburgh', 'Liverpool'],
    'Germany': ['Berlin', 'Munich', 'Frankfurt'],
    'Netherlands': ['Amsterdam', 'Rotterdam'],
    'Switzerland': ['Zurich', 'Geneva', 'Interlaken'],
    'Greece': ['Athens', 'Santorini', 'Mykonos'],
    'Portugal': ['Lisbon', 'Porto'],
    'Czech Republic': ['Prague'],
    
    # AMERICAS
    'United States': ['New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Miami', 'Orlando'],
    'Canada': ['Toronto', 'Vancouver', 'Montreal'],
    'Brazil': ['Rio de Janeiro', 'São Paulo'],
    'Mexico': ['Cancun', 'Mexico City', 'Playa del Carmen'],
    'Peru': ['Cusco', 'Lima'],
    'Argentina': ['Buenos Aires'],
    
    # MIDDLE EAST & AFRICA
    'UAE': ['Dubai', 'Abu Dhabi'],
    'Turkey': ['Istanbul', 'Cappadocia'],
    'Egypt': ['Cairo', 'Luxor', 'Sharm El Sheikh'],
    'Morocco': ['Marrakech', 'Casablanca'],
    'South Africa': ['Cape Town'],
    
    # OCEANIA
    'Australia': ['Sydney', 'Melbourne', 'Gold Coast'],
    'New Zealand': ['Auckland', 'Queenstown']
}

# ========== POI CATEGORIES (NO "CLASSIC") ==========
CATEGORIES = [
    # Core
    'restaurant', 'cafe', 'tourist_attraction', 'museum', 'shopping_mall', 'park', 'bar',
    # Cultural
    'art_gallery', 'library', 'theater',
    # Historical (religious + landmarks)
    'church', 'synagogue', 'hindu_temple', 'mosque',
    'archaeological_site', 'castle', 'fortress', 'historical_landmark',
    # Nature
    'campground', 'hiking_area', 'natural_feature',
    # Cityscape
    'night_club'
]

# ========== 4 TRAVELER TYPES ==========
TRAVELER_TAGS = {
    'family': [
        'park', 'tourist_attraction', 'museum', 'shopping_mall', 
        'campground', 'natural_feature', 'library', 'theater', 
        'restaurant', 'cafe'
    ],
    'couple': [
        'restaurant', 'cafe', 'bar', 'theater', 'art_gallery', 
        'night_club', 'castle', 'park', 'historical_landmark', 
        'natural_feature'
    ],
    'solo': [
        'museum', 'library', 'cafe', 'art_gallery', 'historical_landmark', 
        'hiking_area', 'archaeological_site', 'church', 'synagogue', 
        'hindu_temple', 'mosque', 'fortress', 'tourist_attraction'
    ],
    'friends': [
        'restaurant', 'bar', 'night_club', 'shopping_mall', 'tourist_attraction', 
        'park', 'theater', 'museum', 'hiking_area', 'campground', 'natural_feature'
    ]
}

def get_suitable_for(category):
    """Determine which traveler types this POI category suits"""
    suitable = []
    for traveler_type, categories in TRAVELER_TAGS.items():
        if category in categories:
            suitable.append(traveler_type)
    return ', '.join(suitable) if suitable else 'all'

# ========== MAIN SCRIPT ==========
def main():
    gmaps = googlemaps.Client(key=GOOGLE_API_KEY)
    
    total_cities = sum(len(cities) for cities in LOCATIONS.values())
    
    print("\n" + "="*70)
    print("📥 SMART TRAVEL AI - POI DATA COLLECTION")
    print("="*70)
    print(f"   Countries: {len(LOCATIONS)}")
    print(f"   Cities: {total_cities}")
    print(f"   Categories: {len(CATEGORIES)}")
    print(f"   Traveler Types: {len(TRAVELER_TAGS)} (family, couple, solo, friends)")
    print(f"   Expected POIs: ~{total_cities * len(CATEGORIES) * 10:,}")
    print("="*70 + "\n")
    
    all_pois = []
    search_count = 0
    error_count = 0
    
    for country, cities in LOCATIONS.items():
        print(f"🌍 {country}")
        
        for city in cities:
            print(f"  🔍 {city}:")
            city_pois_count = 0
            
            for category in CATEGORIES:
                try:
                    query = f"{category} in {city} {country}"
                    places = gmaps.places(query=query)
                    
                    for place in places.get('results', [])[:20]:
                        try:
                            place_id = place.get('place_id')
                            
                            # Get photo reference
                            photo_reference = None
                            if place.get('photos'):
                                photo_reference = place['photos'][0].get('photo_reference')
                            
                            # Get traveler type suitability
                            suitable_for = get_suitable_for(category)
                            
                            poi_data = {
                                'name': place.get('name', ''),
                                'category': category,
                                'suitable_for': suitable_for,
                                'latitude': place['geometry']['location']['lat'],
                                'longitude': place['geometry']['location']['lng'],
                                'address': place.get('formatted_address', ''),
                                'phone': place.get('formatted_phone_number', ''),
                                'website': place.get('website', ''),
                                'rating': place.get('rating', 0),
                                'reviews': place.get('user_ratings_total', 0),
                                'country': country,
                                'city': city,
                                'place_id': place_id,
                                'photo_reference': photo_reference,
                                'types': ', '.join(place.get('types', [])[:3]),
                                'description': f"{place.get('name', '')} - {category} in {city}"
                            }
                            
                            all_pois.append(poi_data)
                            city_pois_count += 1
                            
                        except Exception as e:
                            error_count += 1
                            continue
                    
                    search_count += 1
                    time.sleep(0.5)
                    
                except Exception as e:
                    print(f"     ⚠️ Error {category}: {str(e)[:40]}")
                    error_count += 1
                    continue
            
            print(f"     ✅ {city_pois_count} POIs")
    
    # Create DataFrame
    df = pd.DataFrame(all_pois)
    df = df.drop_duplicates(subset=['name', 'city'], keep='first')
    
    # Save to CSV
    data_dir = 'data'
    os.makedirs(data_dir, exist_ok=True)
    output_file = os.path.join(data_dir, 'pois_84_cities.csv')
    df.to_csv(output_file, index=False, encoding='utf-8')
    
    # ========== STATISTICS ==========
    print(f"\n" + "="*70)
    print(f"✅ DOWNLOAD COMPLETE")
    print(f"="*70)
    print(f"   Total API Searches: {search_count:,}")
    print(f"   Total POIs Downloaded: {len(df):,}")
    print(f"   Unique POIs (after dedup): {len(df):,}")
    print(f"   Errors: {error_count}")
    
    print(f"\n📊 REGIONAL BREAKDOWN:")
    regions = {
        'Asia': ['Malaysia', 'Singapore', 'Thailand', 'Indonesia', 'Japan', 'South Korea', 'Vietnam', 'Cambodia'],
        'Europe': ['France', 'Italy', 'Spain', 'United Kingdom', 'Germany', 'Netherlands', 'Switzerland', 'Greece', 'Portugal', 'Czech Republic'],
        'Americas': ['United States', 'Canada', 'Brazil', 'Mexico', 'Peru', 'Argentina'],
        'Middle East/Africa': ['UAE', 'Turkey', 'Egypt', 'Morocco', 'South Africa'],
        'Oceania': ['Australia', 'New Zealand']
    }
    
    for region, countries in regions.items():
        count = len(df[df['country'].isin(countries)])
        print(f"   {region}: {count:,} POIs")
    
    print(f"\n📊 TOP 10 CITIES:")
    for city, count in df['city'].value_counts().head(10).items():
        print(f"   {city}: {count:,} POIs")
    
    print(f"\n📊 CATEGORY DISTRIBUTION (Top 10):")
    for cat, count in df['category'].value_counts().head(10).items():
        print(f"   {cat}: {count:,} POIs")
    
    print(f"\n📊 TRAVELER TYPE DISTRIBUTION:")
    for traveler_type in ['family', 'couple', 'solo', 'friends']:
        count = len(df[df['suitable_for'].str.contains(traveler_type, na=False)])
        print(f"   {traveler_type.capitalize()}: {count:,} POIs")
    
    print(f"\n💾 SAVED TO: {output_file}")
    print(f"   Countries: {df['country'].nunique()}")
    print(f"   Cities: {df['city'].nunique()}")
    print(f"   Categories: {df['category'].nunique()}")
    
    # Sample data
    print(f"\n📋 SAMPLE DATA:")
    sample_cols = ['name', 'category', 'city', 'suitable_for', 'rating', 'reviews']
    print(df[sample_cols].head(10).to_string(index=False))
    
    # Category coverage
    missing_cats = set(CATEGORIES) - set(df['category'].unique())
    if missing_cats:
        print(f"\n⚠️ Missing categories: {', '.join(missing_cats)}")
    else:
        print(f"\n✅ All {len(CATEGORIES)} categories have data!")
    
    print("\n" + "="*70)
    print("🎉 DOWNLOAD COMPLETE!")
    print(f"   {len(df):,} POIs from 84 cities ready for XGBoost training!")
    print("="*70 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Download interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error: {str(e)}")
        raise
