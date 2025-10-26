import pandas as pd
import requests
import time
from tqdm import tqdm

# --- Configuration ---
INPUT_FILE = './data/attractions_merged_processed.csv'
OUTPUT_FILE = './data/attractions_enriched.csv'
FOURSQUARE_API_KEY = ''  # Make sure this is correct!
# ---------------------

print("=== Foursquare Data Enrichment (Enhanced) ===\n")

# Load processed data
df = pd.read_csv(INPUT_FILE, encoding='utf-8')
print(f"Loaded {len(df)} attractions\n")

# Test API key first
print("=== Testing API Connection ===")
test_headers = {
    'Accept': 'application/json',
    'Authorization': FOURSQUARE_API_KEY
}
test_response = requests.get('https://api.foursquare.com/v3/places/search?ll=1.29,103.85&query=Merlion&limit=1', headers=test_headers)
print(f"API Test Status: {test_response.status_code}")
if test_response.status_code != 200:
    print(f"ERROR: API test failed! Response: {test_response.text}")
    print("Please check your API key!")
    exit()
else:
    print("✓ API connection successful!\n")

def search_foursquare_place(name, name_en, lat, lon):
    """Search for a place on Foursquare with fallback strategies"""
    
    headers = {
        'Accept': 'application/json',
        'Authorization': FOURSQUARE_API_KEY
    }
    
    # Try multiple search strategies
    search_names = []
    
    # Strategy 1: English name if available
    if pd.notna(name_en) and name_en != name:
        search_names.append(name_en)
    
    # Strategy 2: Original name
    if pd.notna(name):
        search_names.append(name)
    
    if not search_names:
        return None
    
    try:
        for search_name in search_names:
            # Try with larger radius first
            for radius in [500, 1000, 2000]:
                search_url = 'https://api.foursquare.com/v3/places/search'
                params = {
                    'll': f'{lat},{lon}',
                    'query': search_name,
                    'radius': radius,
                    'limit': 1
                }
                
                response = requests.get(search_url, headers=headers, params=params, timeout=10)
                
                if response.status_code == 200:
                    results = response.json().get('results', [])
                    
                    if results:
                        place = results[0]
                        fsq_id = place.get('fsq_id')
                        foursquare_name = place.get('name')
                        
                        # Get detailed information
                        details_url = f'https://api.foursquare.com/v3/places/{fsq_id}'
                        details_params = {
                            'fields': 'name,description,rating,tel,website,hours,photos,categories,location,email'
                        }
                        
                        details_response = requests.get(details_url, headers=headers, params=details_params, timeout=10)
                        
                        if details_response.status_code == 200:
                            details = details_response.json()
                            
                            enriched_data = {
                                'name_en': details.get('name', foursquare_name),
                                'description': details.get('description'),
                                'rating': details.get('rating'),
                                'phone': details.get('tel'),
                                'website': details.get('website'),
                                'email': details.get('email'),
                                'opening_hours': None,
                                'image': None
                            }
                            
                            # Extract opening hours
                            hours = details.get('hours', {})
                            if hours and 'display' in hours:
                                enriched_data['opening_hours'] = hours['display']
                            elif hours and 'regular' in hours:
                                enriched_data['opening_hours'] = str(hours['regular'])
                            
                            # Extract image
                            photos = details.get('photos', [])
                            if photos:
                                photo = photos[0]
                                prefix = photo.get('prefix', '')
                                suffix = photo.get('suffix', '')
                                enriched_data['image'] = f"{prefix}original{suffix}"
                            
                            return enriched_data
                    
                    # If found something, don't try larger radius
                    if results:
                        break
        
        return None
        
    except Exception as e:
        # Debug: Print error for first 5 failures
        return None

# Track enrichment statistics
stats = {
    'total_processed': 0,
    'enriched': 0,
    'failed': 0,
    'names_en_added': 0,
    'descriptions_added': 0,
    'ratings_added': 0,
    'phones_added': 0,
    'websites_added': 0,
    'emails_added': 0,
    'images_added': 0,
    'hours_added': 0
}

print("=== Starting Foursquare Enrichment ===")
print("Using multiple search strategies with progressive radius...\n")

# Enrich each attraction
debug_count = 0
for idx, row in tqdm(df.iterrows(), total=len(df), desc="Enriching attractions"):
    
    stats['total_processed'] += 1
    
    # Skip if missing required data
    if pd.isna(row['latitude']) or pd.isna(row['longitude']) or pd.isna(row['name']):
        continue
    
    # Search Foursquare with both names
    fsq_data = search_foursquare_place(
        row['name'],
        row.get('name_en'),
        row['latitude'],
        row['longitude']
    )
    
    if fsq_data:
        stats['enriched'] += 1
        
        # Update English name
        if fsq_data['name_en']:
            if pd.isna(row['name_en']) or row['name_en'] == row['name']:
                df.at[idx, 'name_en'] = fsq_data['name_en']
                stats['names_en_added'] += 1
        
        # Update description
        if fsq_data['description'] and pd.isna(row['description']):
            df.at[idx, 'description'] = fsq_data['description']
            stats['descriptions_added'] += 1
        
        # Update rating
        if fsq_data['rating'] and pd.isna(row['rating']):
            df.at[idx, 'rating'] = fsq_data['rating']
            stats['ratings_added'] += 1
        
        # Update phone
        if fsq_data['phone'] and pd.isna(row['phone']):
            df.at[idx, 'phone'] = fsq_data['phone']
            stats['phones_added'] += 1
        
        # Update website
        if fsq_data['website'] and pd.isna(row['website']):
            df.at[idx, 'website'] = fsq_data['website']
            stats['websites_added'] += 1
        
        # Update email
        if fsq_data['email'] and pd.isna(row['email']):
            df.at[idx, 'email'] = fsq_data['email']
            stats['emails_added'] += 1
        
        # Update opening hours
        if fsq_data['opening_hours'] and pd.isna(row['opening_hours']):
            df.at[idx, 'opening_hours'] = fsq_data['opening_hours']
            stats['hours_added'] += 1
        
        # Update image
        if fsq_data['image'] and pd.isna(row['image']):
            df.at[idx, 'image'] = fsq_data['image']
            stats['images_added'] += 1
        
        # Debug: Show first 3 successful enrichments
        if debug_count < 3:
            print(f"\n✓ Successfully enriched: {row['name']} → {fsq_data['name_en']}")
            debug_count += 1
    else:
        stats['failed'] += 1
    
    # Rate limiting
    time.sleep(0.15)

# Update content column
print("\n\nUpdating content column with enriched data...")

def create_content(row):
    parts = []
    name = row['name_en'] if pd.notna(row['name_en']) else row['name']
    if pd.notna(name):
        parts.append(str(name))
    if pd.notna(row['main_category']):
        parts.append(str(row['main_category']))
    if pd.notna(row['description']):
        parts.append(str(row['description']))
    else:
        tags = []
        for tag in ['tourism', 'historic', 'leisure']:
            if pd.notna(row.get(tag)):
                tags.append(f"{tag}:{row[tag]}")
        if tags:
            parts.append(' '.join(tags))
    if pd.notna(row['city']):
        parts.append(f"located in {row['city']}")
    return ' '.join(parts)

df['content'] = df.apply(create_content, axis=1)

# Select final columns
final_columns = [
    'name', 'name_en', 'phone', 'website', 'email', 'address',
    'latitude', 'longitude', 'city', 'country', 'opening_hours', 'fee',
    'image', 'description', 'tourism', 'historic', 'leisure',
    'main_category', 'all_categories', 'content', 'rating'
]

df_final = df[final_columns].copy()
df_final.to_csv(OUTPUT_FILE, index=False, encoding='utf-8-sig')

# Print statistics
print("\n" + "="*60)
print("=== ENRICHMENT COMPLETE ===")
print("="*60)
print(f"\nProcessing Statistics:")
print(f"  Total processed: {stats['total_processed']}")
print(f"  Successfully enriched: {stats['enriched']}")
print(f"  Failed: {stats['failed']}")
print(f"  Success rate: {(stats['enriched']/stats['total_processed']*100):.1f}%")

print(f"\nData Added:")
print(f"  English names: {stats['names_en_added']}")
print(f"  Descriptions: {stats['descriptions_added']}")
print(f"  Ratings: {stats['ratings_added']}")
print(f"  Phone numbers: {stats['phones_added']}")
print(f"  Websites: {stats['websites_added']}")
print(f"  Emails: {stats['emails_added']}")
print(f"  Images: {stats['images_added']}")
print(f"  Opening hours: {stats['hours_added']}")

print(f"\nFinal Data Completeness:")
print(f"  With English names: {df_final['name_en'].notna().sum()} / {len(df_final)}")
print(f"  With descriptions: {df_final['description'].notna().sum()} / {len(df_final)}")
print(f"  With ratings: {df_final['rating'].notna().sum()} / {len(df_final)}")

print(f"\n✓ Saved to: {OUTPUT_FILE}")
