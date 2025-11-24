import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK
cred = credentials.Certificate('../serviceAccountKey.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

def get_next_itinerary_id():
    """Get the next sequential itinerary ID (itin_001, itin_002, etc.)"""
    counter_ref = db.collection('counters').document('itinerary_counter')
    @firestore.transactional
    def increment_counter(transaction):
        snapshot = counter_ref.get(transaction=transaction)
        if snapshot.exists:
            current_count = snapshot.get('count')
        else:
            current_count = 0
        new_count = current_count + 1
        transaction.set(counter_ref, {'count': new_count})
        return f"itin_{new_count:03d}"
    transaction = db.transaction()
    return increment_counter(transaction)

sample_itineraries = [
    # 1. Malaysia (Penang)
    {
        "title": "Penang Heritage & Food Adventure",
        "destination": { "country": "Malaysia", "city": "Penang" },
        "duration": { "days": 3, "nights": 2 },
        "budget": { "min": 250, "max": 800 },
        "suitableFor": ["foodies", "culture"],
        "shortSummary": "A deep dive into Penang's UNESCO heritage streets, vibrant night markets, and world-class hawker food.",
        "detailedDescription": (
            "Discover the uniquely preserved multi-ethnic soul of George Town: stroll Armenian Street's street art, take in British colonial "
            "architecture, and savor the legendary Char Kuey Teow at Gurney Drive. The itinerary includes morning coastal jetty walks, heritage trail highlights, "
            "and a hawker food crawl—making this the perfect trip for history buffs and food lovers alike."
        ),
        "highlights": [
            "George Town UNESCO Heritage Walk",
            "Armenian Street murals",
            "Penang Hill funicular",
            "Sunset at Chew Jetty",
            "Gurney Drive food tour"
        ],
        "tags": ["heritage", "street-food", "art"],
        "seasonSuitability": "All",
        "slug": "penang-heritage-food-adventure",
        "publishStatus": "published",
        "coverImage": "https://storage.googleapis.com/your-app/penang_cover.jpg",
        "galleryImages": [
            "https://storage.googleapis.com/your-app/pg1.jpg",
            "https://storage.googleapis.com/your-app/pg2.jpg"
        ],
        "interestCount": 8,
        "interestThreshold": 15,
        "paymentStatus": "closed",
        "maxBookings": 15,
        "currentBookings": 4,
        "days": [
            {
                "dayNumber": 1,
                "title": "George Town Heritage Trail",
                "description": "Wander through colonial streets, Clan Jetties and sample Penang’s famous breakfast.",
                "activities": [
                    {
                        "name": "Armenian Street",
                        "category": "culture",
                        "time": "09:00",
                        "description": "Photograph street art, visit Chinese clanhouses.",
                        "cost": 0
                    },
                    {
                        "name": "Pinang Peranakan Mansion",
                        "category": "attraction",
                        "time": "11:00",
                        "description": "Tour this living museum showing Baba-Nyonya life.",
                        "cost": 25
                    },
                    {
                        "name": "Nasi Lemak Brunch",
                        "category": "food",
                        "time": "13:00",
                        "description": "Try the legendary Ali Nasi Lemak.",
                        "cost": 8
                    }
                ]
            },
            {
                "dayNumber": 2,
                "title": "Penang Hill & Kek Lok Si",
                "description": "Scenic funicular rides, panoramic views, and temple visit.",
                "activities": [
                    {
                        "name": "Penang Hill Funicular",
                        "category": "attraction",
                        "time": "10:00",
                        "description": "Take the funicular to the highest point.",
                        "cost": 30
                    },
                    {
                        "name": "Kek Lok Si Temple",
                        "category": "culture",
                        "time": "13:00",
                        "description": "Visit the largest Buddhist temple in Malaysia.",
                        "cost": 20
                    }
                ]
            },
            {
                "dayNumber": 3,
                "title": "Jetty Life & Gurney Drive",
                "description": "Morning jetty walk, evening hawker feast.",
                "activities": [
                    {
                        "name": "Chew Jetty",
                        "category": "culture",
                        "time": "08:00",
                        "description": "Walk the stilt village, meet friendly locals.",
                        "cost": 0
                    },
                    {
                        "name": "Gurney Drive Hawker Center",
                        "category": "food",
                        "time": "19:00",
                        "description": "Sample famous Penang Char Kuey Teow, Asam Laksa.",
                        "cost": 30
                    }
                ]
            }
        ]
    },
    # 2. Singapore (Singapore)
    {
        "title": "Singapore City Sights & Gardens",
        "destination": { "country": "Singapore", "city": "Singapore" },
        "duration": { "days": 2, "nights": 1 },
        "budget": { "min": 450, "max": 1300 },
        "suitableFor": ["urban", "family", "nature"],
        "shortSummary": "Dive into ultra-modern Singapore: Marina Bay, Supertrees, and hawker adventures.",
        "detailedDescription": (
            "A whistle-stop adventure through the Lion City! Admire skyline vistas from the Marina Bay Sands SkyPark, snap photos at Merlion Park, and lose yourself in "
            "the biodiversity of Gardens by the Bay. This itinerary highlights family-friendly attractions, multicultural food, and green cityscapes."
        ),
        "highlights": [
            "Gardens by the Bay",
            "Marina Bay Sands SkyPark",
            "Spectra Light & Water Show",
            "Chinatown Hawker adventure"
        ],
        "tags": ["city", "modern", "green"],
        "seasonSuitability": "All",
        "slug": "singapore-city-sights-gardens",
        "publishStatus": "published",
        "coverImage": "https://storage.googleapis.com/your-app/sg_cover.jpg",
        "galleryImages": [
            "https://storage.googleapis.com/your-app/sg1.jpg",
            "https://storage.googleapis.com/your-app/sg2.jpg"
        ],
        "interestCount": 5,
        "interestThreshold": 10,
        "paymentStatus": "closed",
        "maxBookings": 12,
        "currentBookings": 5,
        "days": [
            {
                "dayNumber": 1,
                "title": "Marina Bay & Gardens",
                "description": "Iconic towers and gardens, Marina Bay sands, night shows.",
                "activities": [
                    {
                        "name": "Gardens by the Bay",
                        "category": "nature",
                        "time": "10:00",
                        "description": "Cloud Forest, Supertree Grove skywalk.",
                        "cost": 28
                    },
                    {
                        "name": "Marina Bay Sands SkyPark",
                        "category": "attraction",
                        "time": "16:00",
                        "description": "Observation deck walk, best skyline photos.",
                        "cost": 25
                    }
                ]
            },
            {
                "dayNumber": 2,
                "title": "Heritage & Food",
                "description": "Multicultural neighborhoods and food tour.",
                "activities": [
                    {
                        "name": "Chinatown Heritage Center",
                        "category": "culture",
                        "time": "09:00",
                        "description": "Interactive journey of early settlers.",
                        "cost": 18
                    },
                    {
                        "name": "Maxwell Food Centre",
                        "category": "food",
                        "time": "13:00",
                        "description": "Try Hainanese chicken rice and satay.",
                        "cost": 10
                    }
                ]
            }
        ]
    },
    # 3. Japan (Tokyo)
    {
        "title": "Tokyo Sakura & Pop Culture Circuit",
        "destination": { "country": "Japan", "city": "Tokyo" },
        "duration": { "days": 4, "nights": 3 },
        "budget": { "min": 1200, "max": 3200 },
        "suitableFor": ["nature", "anime", "shopping"],
        "shortSummary": "Hanami under sakura trees, shopping, and Akihabara anime experiences.",
        "detailedDescription": (
            "In spring, Tokyo truly comes alive! This itinerary hits classic cherry blossom viewing at Ueno Park, city-edge shrines, anime paradise Akihabara, and luxurious "
            "shopping in Ginza. Cap each day with a traditional Japanese bathhouse and authentic izakaya cuisine."
        ),
        "highlights": [
            "Ueno Park Hanami",
            "Meiji Shrine",
            "Akihabara electric town",
            "Tsukiji outer market sushi"
        ],
        "tags": ["sakura", "anime", "shopping"],
        "seasonSuitability": "Mar - Apr",
        "slug": "tokyo-sakura-pop-circuit",
        "publishStatus": "published",
        "coverImage": "https://storage.googleapis.com/your-app/tokyo_cover.jpg",
        "galleryImages": [
            "https://storage.googleapis.com/your-app/tok1.jpg",
            "https://storage.googleapis.com/your-app/tok2.jpg"
        ],
        "interestCount": 9,
        "interestThreshold": 15,
        "paymentStatus": "closed",
        "maxBookings": 18,
        "currentBookings": 10,
        "days": [
            {
                "dayNumber": 1,
                "title": "Blossoms & Shrines",
                "description": "Morning sakura, afternoon quiet spirituality.",
                "activities": [
                    {
                        "name": "Ueno Park Sakura",
                        "category": "nature",
                        "time": "08:30",
                        "description": "Picnic beneath thousands of cherry trees.",
                        "cost": 0
                    },
                    {
                        "name": "Meiji Shrine",
                        "category": "culture",
                        "time": "11:00",
                        "description": "Yoyogi’s tranquil paths.",
                        "cost": 0
                    }
                ]
            },
            {
                "dayNumber": 2,
                "title": "Anime & Shopping",
                "description": "A day geeking out and shopping.",
                "activities": [
                    {
                        "name": "Akihabara",
                        "category": "shopping",
                        "time": "10:00",
                        "description": "Spend the day in anime, manga, and game shops.",
                        "cost": 0
                    }
                ]
            },
            {
                "dayNumber": 3,
                "title": "Market To Nightlife",
                "description": "World-famous sushi market and themed izakaya.",
                "activities": [
                    {
                        "name": "Tsukiji Outer Market",
                        "category": "food",
                        "time": "08:00",
                        "description": "Fresh sushi for breakfast.",
                        "cost": 40
                    },
                    {
                        "name": "Omoide Yokocho",
                        "category": "food",
                        "time": "21:00",
                        "description": "Bar-hopping in Shinjuku's alleys.",
                        "cost": 60
                    }
                ]
            },
            {
                "dayNumber": 4,
                "title": "Tokyo Bay & Relax",
                "description": "Sightseeing and unwind.",
                "activities": [
                    {
                        "name": "Tokyo Bay Cruise",
                        "category": "attraction",
                        "time": "13:00",
                        "description": "Short afternoon cruise.",
                        "cost": 40
                    }
                ]
            }
        ]
    },
    # 4. Italy (Venice)
    {
        "title": "Dreamy Venice: Gondolas & Piazza San Marco",
        "destination": { "country": "Italy", "city": "Venice" },
        "duration": { "days": 3, "nights": 2 },
        "budget": { "min": 950, "max": 2000 },
        "suitableFor": ["romance", "art"],
        "shortSummary": "A Venetian fantasy—canals, bridges, and Italy’s greatest art and coffee.",
        "detailedDescription": (
            "Wander cobblestone alleys to world-class museums, cruise the Grand Canal by gondola, and sip sunsets on Piazza San Marco. This immersive "
            "Venice itinerary mixes history, culinary exploration, and high romance for a truly Italian experience."
        ),
        "highlights": [
            "Grand Canal gondola ride",
            "Piazza San Marco",
            "Doge's Palace tour",
            "Venetian art museums"
        ],
        "tags": ["romance", "art", "scenic"],
        "seasonSuitability": "Mar - Oct",
        "slug": "venice-gondolas-san-marco",
        "publishStatus": "published",
        "coverImage": "https://storage.googleapis.com/your-app/venice_cover.jpg",
        "galleryImages": [
            "https://storage.googleapis.com/your-app/ven1.jpg",
            "https://storage.googleapis.com/your-app/ven2.jpg"
        ],
        "interestCount": 7,
        "interestThreshold": 10,
        "paymentStatus": "closed",
        "maxBookings": 12,
        "currentBookings": 6,
        "days": [
            {
                "dayNumber": 1,
                "title": "St. Mark’s & Palazzos",
                "description": "Venice’s most famous square and royal history.",
                "activities": [
                    {
                        "name": "Piazza San Marco",
                        "category": "attraction",
                        "time": "09:30",
                        "description": "See the basilica and bell tower.",
                        "cost": 10
                    },
                    {
                        "name": "Doge's Palace",
                        "category": "culture",
                        "time": "11:00",
                        "description": "Guided palace museum tour.",
                        "cost": 22
                    }
                ]
            },
            {
                "dayNumber": 2,
                "title": "Canal Life",
                "description": "Gondolas and bridges.",
                "activities": [
                    {
                        "name": "Gondola Ride",
                        "category": "adventure",
                        "time": "15:00",
                        "description": "Romantic sunset ride.",
                        "cost": 80
                    },
                    {
                        "name": "Rialto Bridge",
                        "category": "attraction",
                        "time": "17:00",
                        "description": "Iconic photo spot.",
                        "cost": 0
                    }
                ]
            },
            {
                "dayNumber": 3,
                "title": "Art & Espresso",
                "description": "Museums and local cafes.",
                "activities": [
                    {
                        "name": "Peggy Guggenheim Museum",
                        "category": "art",
                        "time": "11:00",
                        "description": "Modern art in a palace setting.",
                        "cost": 20
                    },
                    {
                        "name": "Caffe Florian",
                        "category": "food",
                        "time": "16:00",
                        "description": "Coffee in the world’s oldest cafe.",
                        "cost": 15
                    }
                ]
            }
        ]
    },
    # 5. Turkey (Cappadocia)
    {
        "title": "Cappadocia Balloons, Caves & Traditions",
        "destination": { "country": "Turkey", "city": "Cappadocia" },
        "duration": { "days": 3, "nights": 2 },
        "budget": { "min": 850, "max": 2100 },
        "suitableFor": ["adventure", "culture", "nature"],
        "shortSummary": "Float above the fairy chimneys at dawn, then explore cave dwellings and Turkish bazaars.",
        "detailedDescription": (
            "One of the world’s most magical landscapes—wake to a sunrise balloon ride, descend into underground cities, and dine with local artisans. "
            "Perfect for outdoor and photography lovers, this is a bucket-list journey."
        ),
        "highlights": [
            "Hot Air Balloon ride at dawn",
            "Göreme Open-Air Museum",
            "Cave hotel experience",
            "Kaymakli underground city"
        ],
        "tags": ["adventure", "nature", "culture"],
        "seasonSuitability": "Apr - Oct",
        "slug": "cappadocia-balloons-caves",
        "publishStatus": "published",
        "coverImage": "https://storage.googleapis.com/your-app/cap_cover.jpg",
        "galleryImages": [
            "https://storage.googleapis.com/your-app/cap1.jpg",
            "https://storage.googleapis.com/your-app/cap2.jpg"
        ],
        "interestCount": 8,
        "interestThreshold": 15,
        "paymentStatus": "closed",
        "maxBookings": 15,
        "currentBookings": 6,
        "days": [
            {
                "dayNumber": 1,
                "title": "Balloons & Fairy Chimneys",
                "description": "Early sunrise and natural wonders.",
                "activities": [
                    {
                        "name": "Hot Air Balloon Ride",
                        "category": "adventure",
                        "time": "06:00",
                        "description": "Sunrise flight over Cappadocia.",
                        "cost": 200
                    },
                    {
                        "name": "Göreme Open-Air Museum",
                        "category": "culture",
                        "time": "10:00",
                        "description": "Tour ancient cave churches.",
                        "cost": 50
                    }
                ]
            },
            {
                "dayNumber": 2,
                "title": "Underground Mysteries",
                "description": "Explore subterranean cities.",
                "activities": [
                    {
                        "name": "Kaymakli Underground City",
                        "category": "adventure",
                        "time": "11:00",
                        "description": "Discover an ancient labyrinth.",
                        "cost": 35
                    }
                ]
            },
            {
                "dayNumber": 3,
                "title": "Bazaar & Departure",
                "description": "Handmade pottery and Turkish delights.",
                "activities": [
                    {
                        "name": "Avanos Pottery Bazaar",
                        "category": "shopping",
                        "time": "12:00",
                        "description": "Shop ceramics from local artisans.",
                        "cost": 40
                    }
                ]
            }
        ]
    }
]

def seed_firestore():
    """Upload all itineraries to Firestore with auto-incrementing IDs"""
    try:
        print('📤 Starting upload to Firestore...\n')
        count = 0

        for itinerary in sample_itineraries:
            doc_id = get_next_itinerary_id()
            doc_ref = db.collection('itineraries').document(doc_id)
            doc_ref.set(itinerary)
            count += 1
            print(f'  ✅ {count:2d}. [{doc_id}] {itinerary["title"]} - {itinerary["destination"]["country"]} ({itinerary["destination"]["city"]})')

        print(f'\n✅ Successfully uploaded {count} itineraries to Firestore!')
        print(f'📊 IDs range: itin_001 to itin_{count:03d}')

    except Exception as e:
        print(f'❌ Error: {e}')

if __name__ == '__main__':
    seed_firestore()
