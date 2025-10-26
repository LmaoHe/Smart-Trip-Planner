import pandas as pd
import requests
import time
from tqdm import tqdm
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut

# --- Configuration ---
INPUT_FILE = './data/attractions_merged.csv'
OUTPUT_FILE = './data/attractions_merged_processed.csv'
USE_REVERSE_GEOCODING = True  # Set to True to get city names from coordinates
# ---------------------

print("=== Enhanced Attraction Data Processing (v2) ===\n")

# Load merged data
df = pd.read_csv(INPUT_FILE, low_memory=False)
print(f"Loaded {len(df)} attractions\n")

def get_first_available(row, field_list):
    """Get first non-null value from list of fields"""
    for field in field_list:
        if field in row.index and pd.notna(row[field]) and str(row[field]).strip() != '':
            return str(row[field]).strip()
    return None

print("=== Step 1: Extract Data with Smart Fallbacks ===\n")

processed_data = []

for idx, row in tqdm(df.iterrows(), total=len(df), desc="Processing attractions"):
    
    attraction = {
        # === NAME ===
        'name': get_first_available(row, ['name', 'official_name', 'int_name', 'short_name']),
        'name_en': get_first_available(row, ['name:en', 'int_name', 'official_name:en', 'name']),
        
        # === CONTACT INFO ===
        'phone': get_first_available(row, [
            'phone', 'contact:phone', 'operator:phone', 'fax'
        ]),
        
        'website': get_first_available(row, [
            'website', 'website:en', 'contact:website', 'url', 
            'operator:website', 'opening_hours:url'
        ]),
        
        'email': get_first_available(row, ['email', 'contact:email']),
        'facebook': get_first_available(row, ['facebook', 'contact:facebook']),
        'instagram': get_first_available(row, ['contact:instagram']),
        'twitter': get_first_available(row, ['twitter', 'contact:twitter']),
        
        # === ADDRESS ===
        'address': None,
        'addr_street': get_first_available(row, ['addr:street', 'addr:street:en']),
        'addr_housenumber': get_first_available(row, ['addr:housenumber']),
        'addr_city': get_first_available(row, ['addr:city', 'addr:city:en', 'addr:town']),
        'addr_district': get_first_available(row, ['addr:district', 'addr:quarter', 'addr:neighbourhood']),
        'addr_postcode': get_first_available(row, ['addr:postcode']),
        'addr_country': get_first_available(row, ['addr:country', 'is_in:country']),
        
        # === LOCATION ===
        'latitude': row.get('@lat') if '@lat' in row.index else row.get('latitude'),
        'longitude': row.get('@lon') if '@lon' in row.index else row.get('longitude'),
        'city': None,  # Will be determined below
        'country': None,  # Will be determined below
        
        # === PRACTICAL INFO ===
        'opening_hours': get_first_available(row, ['opening_hours']),
        'fee': get_first_available(row, ['fee', 'charge', 'charge:adult', 'charge:child', 'charge:student']),
        'wheelchair': get_first_available(row, ['wheelchair', 'wheelchair:description']),
        
        # === MEDIA ===
        'image': get_first_available(row, [
            'image', 'wikimedia_commons', 'subject:wikimedia_commons', 
            'image:0', 'mapillary'
        ]),
        
        # === DESCRIPTION ===
        'description': get_first_available(row, [
            'description', 'description:en', 'description:ja', 
            'description:ko', 'note'
        ]),
        
        # === WIKIPEDIA / WIKIDATA ===
        'wikidata': get_first_available(row, ['wikidata', 'operator:wikidata', 'subject:wikidata']),
        'wikipedia': get_first_available(row, ['wikipedia', 'wikipedia:ja', 'subject:wikipedia']),
        
        # === CATEGORIES (Raw OSM tags) ===
        'tourism': row.get('tourism'),
        'historic': row.get('historic'),
        'leisure': row.get('leisure'),
        'amenity': row.get('amenity'),
        'natural': row.get('natural'),
        'boundary': row.get('boundary'),
        
        # === OTHER INFO ===
        'operator': get_first_available(row, ['operator', 'operator:en', 'brand']),
        'architect': get_first_available(row, ['architect', 'architect:en']),
        'heritage': get_first_available(row, ['heritage', 'heritage:type']),
        
        # === METADATA ===
        '@id': row.get('@id'),
    }
    
    # Construct full address
    addr_parts = []
    if attraction['addr_housenumber']:
        addr_parts.append(attraction['addr_housenumber'])
    if attraction['addr_street']:
        addr_parts.append(attraction['addr_street'])
    if attraction['addr_district']:
        addr_parts.append(attraction['addr_district'])
    if attraction['addr_city']:
        addr_parts.append(attraction['addr_city'])
    if attraction['addr_postcode']:
        addr_parts.append(attraction['addr_postcode'])
    
    if addr_parts:
        attraction['address'] = ', '.join(addr_parts)
    elif get_first_available(row, ['addr:full']):
        attraction['address'] = get_first_available(row, ['addr:full'])
    
    # Determine city and country from addr fields first
    attraction['city'] = get_first_available(row, ['addr:city', 'addr:city:en', 'addr:town'])
    attraction['country'] = get_first_available(row, ['addr:country', 'is_in:country'])
    
    processed_data.append(attraction)

df_processed = pd.DataFrame(processed_data)
print("✓ Extracted all available fields\n")

print("=== Step 2: Reverse Geocoding for Missing Cities ===\n")

if USE_REVERSE_GEOCODING:
    geolocator = Nominatim(user_agent="attraction_processor")
    geocoded = 0
    
    for idx, row in tqdm(df_processed.iterrows(), total=len(df_processed), desc="Geocoding"):
        # Only geocode if city is missing and we have coordinates
        if pd.isna(row['city']) and pd.notna(row['latitude']) and pd.notna(row['longitude']):
            try:
                location = geolocator.reverse(f"{row['latitude']}, {row['longitude']}", language='en', timeout=10)
                if location and location.raw.get('address'):
                    addr = location.raw['address']
                    
                    # Extract city
                    city = addr.get('city') or addr.get('town') or addr.get('village') or addr.get('county')
                    if city:
                        df_processed.at[idx, 'city'] = city
                        geocoded += 1
                    
                    # Extract country if missing
                    if pd.isna(row['country']):
                        country = addr.get('country')
                        if country:
                            df_processed.at[idx, 'country'] = country
                
                time.sleep(1)  # Be respectful to Nominatim
            except (GeocoderTimedOut, Exception):
                pass
    
    print(f"✓ Geocoded {geocoded} missing cities\n")
else:
    print("Skipped (disabled in config)\n")

print("=== Step 3: Assign Categories ===\n")

def assign_main_category(row):
    """Determine main category based on OSM tags"""
    if pd.notna(row['tourism']):
        tourism_type = row['tourism']
        if tourism_type in ['museum', 'gallery']:
            return 'Culture & Arts'
        elif tourism_type in ['theme_park', 'zoo', 'aquarium']:
            return 'Adventure'
        else:
            return 'Culture & Arts'
    
    if pd.notna(row['historic']):
        return 'History'
    
    if pd.notna(row['leisure']):
        leisure_type = row['leisure']
        if leisure_type in ['nature_reserve', 'beach_resort']:
            return 'Nature & Parks'
        elif leisure_type == 'water_park':
            return 'Adventure'
    
    if pd.notna(row['natural']):
        return 'Nature & Parks'
    
    if pd.notna(row['boundary']):
        return 'Nature & Parks'
    
    return 'Culture & Arts'

def assign_all_categories(row):
    """Assign all applicable categories"""
    categories = set()
    
    if pd.notna(row['tourism']):
        tourism_type = row['tourism']
        if tourism_type in ['museum', 'gallery']:
            categories.add('Culture & Arts')
        elif tourism_type in ['theme_park', 'zoo', 'aquarium']:
            categories.add('Adventure')
    
    if pd.notna(row['historic']):
        categories.add('History')
    
    if pd.notna(row['leisure']):
        if row['leisure'] in ['nature_reserve', 'beach_resort']:
            categories.add('Nature & Parks')
        elif row['leisure'] == 'water_park':
            categories.add('Adventure')
    
    if pd.notna(row['natural']) and row['natural'] == 'beach':
        categories.add('Nature & Parks')
    
    if pd.notna(row['boundary']) and row['boundary'] in ['national_park', 'protected_area']:
        categories.add('Nature & Parks')
    
    return ', '.join(sorted(categories)) if categories else 'Culture & Arts'

df_processed['main_category'] = df_processed.apply(assign_main_category, axis=1)
df_processed['all_categories'] = df_processed.apply(assign_all_categories, axis=1)

print("Category distribution:")
print(df_processed['main_category'].value_counts())
print()

print("=== Step 4: Enrich with Wikidata ===\n")

def get_wikidata_info(wikidata_id):
    """Fetch description and image from Wikidata"""
    if pd.isna(wikidata_id) or wikidata_id == '':
        return None, None
    
    # Clean wikidata ID
    wikidata_id = str(wikidata_id).strip()
    
    try:
        url = f"https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            entity = data.get('entities', {}).get(wikidata_id, {})
            
            # Get description
            descriptions = entity.get('descriptions', {})
            desc = descriptions.get('en', {}).get('value') if 'en' in descriptions else None
            
            # Get image
            img = None
            claims = entity.get('claims', {})
            if 'P18' in claims:
                try:
                    img_name = claims['P18'][0]['mainsnak']['datavalue']['value']
                    img_url = img_name.replace(' ', '_')
                    img = f"https://commons.wikimedia.org/wiki/File:{img_url}"
                except:
                    pass
            
            return desc, img
        
        return None, None
    except Exception as e:
        return None, None

enriched_desc = 0
enriched_img = 0

for idx, row in tqdm(df_processed.iterrows(), total=len(df_processed), desc="Fetching Wikidata"):
    if pd.notna(row['wikidata']) and str(row['wikidata']).strip() != '':
        desc, img = get_wikidata_info(row['wikidata'])
        
        if desc and pd.isna(row['description']):
            df_processed.at[idx, 'description'] = desc
            enriched_desc += 1
        
        if img and pd.isna(row['image']):
            df_processed.at[idx, 'image'] = img
            enriched_img += 1
        
        time.sleep(0.15)

print(f"✓ Enriched {enriched_desc} descriptions and {enriched_img} images from Wikidata\n")

print("=== Step 5: Create Content Column ===\n")

def create_content(row):
    """Create searchable content for ML model"""
    parts = []
    
    # Use English name if available, otherwise use regular name
    name = row['name_en'] if pd.notna(row['name_en']) else row['name']
    if pd.notna(name):
        parts.append(str(name))
    
    if pd.notna(row['main_category']):
        parts.append(str(row['main_category']))
    
    if pd.notna(row['description']):
        parts.append(str(row['description']))
    else:
        # Fallback to OSM tags
        tags = []
        for tag in ['tourism', 'historic', 'leisure', 'natural']:
            if pd.notna(row[tag]):
                tags.append(f"{tag}:{row[tag]}")
        if tags:
            parts.append(' '.join(tags))
    
    # Add city for context
    if pd.notna(row['city']):
        parts.append(f"located in {row['city']}")
    
    return ' '.join(parts)

df_processed['content'] = df_processed.apply(create_content, axis=1)
df_processed['rating'] = None
df_processed['user_ratings_total'] = None

print("✓ Created content column\n")

# Save processed data
df_processed.to_csv(OUTPUT_FILE, index=False)

print("=== Processing Complete ===")
print(f"Total attractions: {len(df_processed)}")
print(f"With cities: {df_processed['city'].notna().sum()}")
print(f"With countries: {df_processed['country'].notna().sum()}")
print(f"With descriptions: {df_processed['description'].notna().sum()}")
print(f"With content: {df_processed['content'].notna().sum()}")
print(f"With addresses: {df_processed['address'].notna().sum()}")
print(f"With websites: {df_processed['website'].notna().sum()}")
print(f"With phone: {df_processed['phone'].notna().sum()}")
print(f"With images: {df_processed['image'].notna().sum()}")
print(f"\n✓ Saved to: {OUTPUT_FILE}")

print("\n=== Sample Data ===")
sample_cols = ['name', 'name_en', 'main_category', 'city', 'country', 'description']
print(df_processed[sample_cols].head(10).to_string())
