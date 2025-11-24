# ==================== ITINERARY SERVICE (Firestore Version) ====================
import firebase_admin
from firebase_admin import credentials, firestore


# Initialize Firebase Admin SDK (if not already initialized)
try:
    firebase_admin.get_app()
except ValueError:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)


db = firestore.client()


# ==================== FUNCTIONS ====================

def get_all_itineraries():
    """Get all itineraries from Firestore."""
    try:
        itineraries_ref = db.collection('itineraries')
        docs = itineraries_ref.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id  # Ensure ID is included
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} itineraries from Firestore")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching itineraries: {e}")
        return []


def get_itinerary_by_id(itinerary_id):
    """Get specific itinerary by ID from Firestore."""
    try:
        doc_ref = db.collection('itineraries').document(itinerary_id)
        doc = doc_ref.get()
        
        if doc.exists:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            print(f"✅ Retrieved itinerary: {itinerary_id}")
            return itinerary
        else:
            print(f"⚠️ Itinerary not found: {itinerary_id}")
            return None
    
    except Exception as e:
        print(f"❌ Error fetching itinerary {itinerary_id}: {e}")
        return None


def get_itineraries_by_country(country):
    """Get all itineraries for a specific country."""
    try:
        itineraries_ref = db.collection('itineraries')
        query = itineraries_ref.where('country', '==', country)
        docs = query.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} itineraries for {country}")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching itineraries by country: {e}")
        return []


def get_itineraries_by_city(city):
    """Get all itineraries for a specific city."""
    try:
        itineraries_ref = db.collection('itineraries')
        query = itineraries_ref.where('city', '==', city)
        docs = query.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} itineraries for {city}")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching itineraries by city: {e}")
        return []


def get_itineraries_by_price_range(min_price, max_price):
    """Get itineraries within a specific price range."""
    try:
        itineraries_ref = db.collection('itineraries')
        query = itineraries_ref.where('price', '>=', min_price).where('price', '<=', max_price)
        docs = query.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} itineraries between RM{min_price}-RM{max_price}")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching itineraries by price: {e}")
        return []


def get_top_rated_itineraries(limit=10):
    """Get top-rated itineraries sorted by rating."""
    try:
        itineraries_ref = db.collection('itineraries')
        query = itineraries_ref.order_by('rating', direction=firestore.Query.DESCENDING).limit(limit)
        docs = query.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} top-rated itineraries")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching top-rated itineraries: {e}")
        return []


def search_itineraries(search_term):
    """Search itineraries by title or description (basic search)."""
    try:
        all_itineraries = get_all_itineraries()
        search_term_lower = search_term.lower()
        
        results = [
            itin for itin in all_itineraries
            if search_term_lower in itin.get('title', '').lower() 
            or search_term_lower in itin.get('description', '').lower()
        ]
        
        print(f"✅ Found {len(results)} itineraries matching '{search_term}'")
        return results
    
    except Exception as e:
        print(f"❌ Error searching itineraries: {e}")
        return []


def get_itineraries_by_difficulty(difficulty):
    """Get itineraries by difficulty level."""
    try:
        itineraries_ref = db.collection('itineraries')
        query = itineraries_ref.where('difficulty', '==', difficulty)
        docs = query.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} {difficulty} itineraries")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching itineraries by difficulty: {e}")
        return []


def get_itineraries_by_duration(days):
    """Get itineraries for a specific number of days."""
    try:
        itineraries_ref = db.collection('itineraries')
        query = itineraries_ref.where('days', '==', days)
        docs = query.stream()
        
        itineraries = []
        for doc in docs:
            itinerary = doc.to_dict()
            itinerary['id'] = doc.id
            itineraries.append(itinerary)
        
        print(f"✅ Retrieved {len(itineraries)} {days}-day itineraries")
        return itineraries
    
    except Exception as e:
        print(f"❌ Error fetching itineraries by duration: {e}")
        return []


# ==================== TESTING ====================
if __name__ == '__main__':
    print("Testing Itinerary Service...")
    print("\n1️⃣ Get all itineraries:")
    all_itin = get_all_itineraries()
    
    print("\n2️⃣ Get specific itinerary:")
    specific = get_itinerary_by_id('itin_001')
    
    print("\n3️⃣ Get by country:")
    malaysia_itin = get_itineraries_by_country('Malaysia')
    
    print("\n4️⃣ Get top rated:")
    top = get_top_rated_itineraries(5)
    
    print("\n5️⃣ Search itineraries:")
    search = search_itineraries('beach')
    
    print("\n✅ Service test complete!")
