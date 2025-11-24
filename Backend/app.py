# ==================== IMPORTS ====================
import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import base64
import random
import datetime
import traceback
import requests 
from services.xotelo_service import xotelo_service
from services.itinerary_service import get_all_itineraries, get_itinerary_by_id
import os
from dotenv import load_dotenv
from amadeus import Client, ResponseError
from recommender.api_recommender import ItineraryRecommender


# ==================== LOAD ENVIRONMENT ====================
load_dotenv()
recommender = ItineraryRecommender()

# ==================== API CONFIGURATION ====================
RAPIDAPI_KEY = os.getenv('RAPIDAPI_KEY')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')

# Hotels.com Provider API
HOTELS_COM_HOST = 'hotels-com-provider.p.rapidapi.com'
HOTELS_COM_BASE_URL = 'https://hotels-com-provider.p.rapidapi.com'

OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')

# Validate API key
if not RAPIDAPI_KEY:
    print("⚠️ WARNING: RAPIDAPI_KEY not found in .env file!")
else:
    print(f"✓ RapidAPI Key loaded: {RAPIDAPI_KEY[:10]}...")


# ==================== INITIALIZE FLASK ====================
app = Flask(__name__)
CORS(app, resources={
    r"/*": { 
        "origins": [
            "http://localhost:5500", 
            "http://127.0.0.1:5500", 
            "http://localhost:3000",
            "http://127.0.0.1:3000"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# ==================== INITIALIZE FIREBASE ====================
print("Attempting Firebase Admin SDK initialization...")
cred = credentials.Certificate('serviceAccountKey.json')
STORAGE_BUCKET = 'smart-trip-planner-1c0a9.firebasestorage.app'

try:
    # ✅ DELETE existing app if it exists
    if firebase_admin._apps:
        print("⚠️  Deleting existing Firebase app...")
        firebase_admin.delete_app(firebase_admin.get_app())
    
    # ✅ Initialize fresh with storage bucket
    firebase_admin.initialize_app(cred, {'storageBucket': STORAGE_BUCKET})
    print("✓ Firebase Admin SDK initialized successfully.")
    
    db = firestore.client()
    bucket = storage.bucket()
    print("✓ Firestore and Storage clients created.")
    
except FileNotFoundError:
    print("!!! ERROR: serviceAccountKey.json not found!")
    print("Please download it from Firebase Console > Project Settings > Service Accounts")
    db = None
    bucket = None
except Exception as e:
    print(f"!!! CRITICAL ERROR initializing Firebase Admin SDK: {e}")
    import traceback
    traceback.print_exc()
    db = None
    bucket = None

# Validate initialization
if db is None or bucket is None:
    print("\n" + "!"*60)
    print("⚠️  WARNING: Firebase not properly initialized!")
    print("Database operations will fail.")
    print("!"*60 + "\n")
else:
    print("✅ Firebase fully initialized and ready")

# ==================== INITIALIZE AMADEUS ====================
amadeus = Client(
    client_id=os.getenv('AMADEUS_API_KEY'),
    client_secret=os.getenv('AMADEUS_API_SECRET')
)

# Validate Amadeus credentials
if os.getenv('AMADEUS_API_KEY') and os.getenv('AMADEUS_API_SECRET'):
    print(f"✓ Amadeus API initialized: {os.getenv('AMADEUS_API_KEY')[:10]}...")
else:
    print("⚠️ WARNING: AMADEUS credentials not found in .env file!")

print("✓ All services initialized. Flask app ready.")


# ==================== HELPER FUNCTIONS ====================
def get_start_date(period='week'):
    """ Calculates the start date based on the period string. """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    
    if period == 'month':
        return now_utc - datetime.timedelta(days=30)
    elif period == 'year':
        return now_utc - datetime.timedelta(days=365)
    elif period == 'today':
        return now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        return now_utc - datetime.timedelta(days=7)
    
# ==================== GET API KEY ENDPOINT ====================
@app.route('/api/config/google-maps-key', methods=['GET', 'OPTIONS'])
def get_google_maps_key():
    """Get Google Maps API key for frontend use"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response, 200
    
    try:
        if not GOOGLE_API_KEY:
            print("❌ Google API key not configured in .env")
            return jsonify({'success': False, 'error': 'Google API key not configured'}), 500
        
        print(f"✅ Google Maps API key sent to frontend: {GOOGLE_API_KEY[:10]}...")
        return jsonify({
            'success': True,
            'key': GOOGLE_API_KEY
        }), 200
        
    except Exception as e:
        print(f"❌ Error getting API key: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== ROUTES START HERE ====================
@app.route('/create-profile', methods=['POST'])
def create_profile():
    photo_url = None

    if db is None or bucket is None:
        print("!!! ERROR: Firebase services (db or bucket) not initialized.")
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        data = request.json
        print(f"Received data keys: {list(data.keys())}")

        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        print(f"Verified token for user UID: {uid}")

        profile_pic_data_url = data.get('profilePicDataURL')
        if profile_pic_data_url and profile_pic_data_url.startswith('data:image'):
            try:
                print("Processing profile picture upload...")
                header, encoded = profile_pic_data_url.split(",", 1)
                image_data = base64.b64decode(encoded)
                content_type = header.split(";")[0].split(":")[1]
                if not content_type.startswith('image/'):
                    raise ValueError("Invalid image data URL format.")

                file_name = f"users/{uid}/profile.png"
                blob = bucket.blob(file_name)
                blob.upload_from_string(image_data, content_type=content_type)
                blob.make_public()
                photo_url = blob.public_url
                print(f"Image uploaded successfully: {photo_url}")
            except Exception as upload_error:
                print(f"!!! WARNING: Image upload failed for user {uid}: {upload_error}")
                photo_url = None
        else:
            print("No profile picture provided or data URL format invalid.")

        profile_data = {
            'firstName': data.get('firstName'),
            'lastName': data.get('lastName'),
            'birthDate': data.get('birthDate'),
            'gender': data.get('gender'),
            'phone': data.get('phone'),
            'email': data.get('email'),
            'role': 'traveler',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'profilePhotoURL': photo_url
        }

        doc_ref = db.collection('users').document(uid)
        doc_ref.set(profile_data)

        print("Successfully created profile in Firestore.")
        return jsonify({
            "status": "success", "message": "User profile created.",
            "userId": uid, "photoURL": photo_url
        }), 201

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except ValueError as e:
        print(f"Value Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        print(f"An unexpected error occurred in create_profile: {e}")
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500

@app.route('/update-profile', methods=['POST', 'OPTIONS'])
def update_profile():
    """Update user profile information."""
    
    print("\n" + "="*70)
    print("📝 UPDATE PROFILE REQUEST RECEIVED")
    print("="*70)
    
    if request.method == 'OPTIONS':
        print("✅ CORS preflight handled")
        return '', 204
    
    if db is None:
        print("❌ CRITICAL: Firestore client (db) is None!")
        return jsonify({"message": "Database not initialized"}), 500

    try:
        # 1. Get and verify auth header
        auth_header = request.headers.get('Authorization')
        print(f"1️⃣ Auth header present: {bool(auth_header)}")
        
        if not auth_header or not auth_header.startswith('Bearer '):
            print("❌ Invalid auth header format")
            return jsonify({"message": "Invalid authorization header"}), 401

        token = auth_header.split('Bearer ')[1]
        print(f"2️⃣ Token extracted: {token[:20]}...")
        
        # 2. Verify token
        try:
            decoded = auth.verify_id_token(token)
            uid = decoded['uid']
            print(f"3️⃣ ✅ Token verified for UID: {uid}")
        except Exception as token_error:
            print(f"❌ Token verification failed: {str(token_error)}")
            return jsonify({"message": f"Token error: {str(token_error)}"}), 401

        # 3. Get request data
        try:
            data = request.get_json()
            print(f"4️⃣ Request JSON received: {data}")
        except Exception as json_error:
            print(f"❌ JSON parse error: {str(json_error)}")
            return jsonify({"message": f"Invalid JSON: {str(json_error)}"}), 400

        if not data:
            print("❌ No JSON data in request")
            return jsonify({"message": "No data provided"}), 400

        # 4. Prepare update data
        try:
            update_data = {
                'firstName': str(data.get('firstName', '')).strip(),
                'lastName': str(data.get('lastName', '')).strip(),
                'birthDate': str(data.get('birthDate', '')).strip(),
                'gender': str(data.get('gender', '')).strip(),
                'phone': str(data.get('phone', '')).strip(),
                'updatedAt': firestore.SERVER_TIMESTAMP
            }
            print(f"5️⃣ Update payload prepared: {update_data}")
        except Exception as prep_error:
            print(f"❌ Data preparation error: {str(prep_error)}")
            return jsonify({"message": f"Data prep error: {str(prep_error)}"}), 400

        # 5. Firestore update
        try:
            user_ref = db.collection('users').document(uid)
            print(f"6️⃣ Updating document at: /users/{uid}")
            
            user_ref.update(update_data)
            print(f"7️⃣ ✅ UPDATE SUCCESSFUL!")
            print("="*70 + "\n")
            
            return jsonify({
                'message': 'Profile updated successfully',
                'status': 'success'
            }), 200
            
        except Exception as firestore_error:
            print(f"❌ Firestore error: {str(firestore_error)}")
            print(f"   Type: {type(firestore_error).__name__}")
            import traceback
            traceback.print_exc()
            return jsonify({"message": f"Firestore error: {str(firestore_error)}"}), 500

    except Exception as error:
        print(f"❌ UNEXPECTED ERROR: {str(error)}")
        print(f"   Type: {type(error).__name__}")
        import traceback
        traceback.print_exc()
        print("="*70 + "\n")
        return jsonify({
            'message': f"Server error: {str(error)}",
            'error_type': type(error).__name__
        }), 500

@app.route('/update-profile-picture', methods=['POST'])
def update_profile_picture():
    if db is None or bucket is None:
        print("!!! ERROR: Firebase services (db or bucket) not initialized.")
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    new_photo_url = None
    try:
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        print(f"Verified token for user UID: {uid} attempting picture update.")

        data = request.json
        profile_pic_data_url = data.get('profilePicDataURL')

        if not (profile_pic_data_url and profile_pic_data_url.startswith('data:image')):
            return jsonify({"status": "error", "message": "No valid image data URL provided."}), 400

        try:
            print("Processing profile picture upload (update)...")
            header, encoded = profile_pic_data_url.split(",", 1)
            image_data = base64.b64decode(encoded)
            content_type = header.split(";")[0].split(":")[1]
            if not content_type.startswith('image/'):
                raise ValueError("Invalid image type.")

            file_name = f"users/{uid}/profile.png"
            blob = bucket.blob(file_name)
            blob.upload_from_string(image_data, content_type=content_type)
            blob.make_public()
            new_photo_url = blob.public_url
            print(f"Image updated successfully: {new_photo_url}")

        except Exception as upload_error:
            print(f"!!! CRITICAL: Image upload failed during update for user {uid}: {upload_error}")
            raise upload_error 

        doc_ref = db.collection('users').document(uid)
        doc_ref.update({'profilePhotoURL': new_photo_url})

        print(f"Successfully updated profilePhotoURL for user {uid}.")
        return jsonify({
            "status": "success",
            "message": "Profile picture updated successfully.",
            "photoURL": new_photo_url 
        }), 200

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except ValueError as e:
        print(f"Value Error during picture update: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        print(f"An unexpected error occurred in update_profile_picture: {e}")
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500

@app.route('/get-all-users', methods=['GET'])
def get_all_users():
    if db is None:
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"status": "error", "message": "Missing authorization header."}), 401
            
        id_token = auth_header.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        caller_uid = decoded_token['uid']

        caller_doc = db.collection('users').document(caller_uid).get()
        if not caller_doc.exists:
            return jsonify({"status": "error", "message": "Caller not found."}), 403

        caller_data = caller_doc.to_dict()
        caller_role = caller_data.get('role', 'traveler')

        if caller_role.lower() not in ['admin', 'superadmin']:
            return jsonify({"status": "error", "message": "Forbidden: Insufficient permissions."}), 403

        print(f"'{caller_role}' request verified for user {caller_uid}. Fetching users.")
        
        auth_users = {}
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        two_weeks_ago_utc = now_utc - datetime.timedelta(weeks=2)

        for user in auth.list_users().iterate_all():
            status = 'active'
            last_sign_in_ms = user.user_metadata.last_sign_in_timestamp
            creation_ms = user.user_metadata.creation_timestamp

            last_sign_in_dt = None
            creation_dt = None
            
            if last_sign_in_ms:
                last_sign_in_dt = datetime.datetime.fromtimestamp(
                    last_sign_in_ms / 1000, 
                    datetime.timezone.utc
                )
            if creation_ms:
                creation_dt = datetime.datetime.fromtimestamp(
                    creation_ms / 1000, 
                    datetime.timezone.utc
                )

            if user.disabled:
                status = 'inactive'
            elif last_sign_in_dt is None:
                if creation_dt and creation_dt < two_weeks_ago_utc:
                    status = 'inactive'
            elif last_sign_in_dt < two_weeks_ago_utc:
                status = 'inactive'
            
            auth_users[user.uid] = {
                'uid': user.uid,
                'email': user.email if user.email else 'No email',
                'status': status
            }

        firestore_users = {}
        users_ref = db.collection('users')
        for doc in users_ref.stream():
            firestore_users[doc.id] = doc.to_dict()

        combined_users = []
        for uid, auth_data in auth_users.items():
            profile_data = firestore_users.get(uid)

            if profile_data:
                user_role = profile_data.get('role', 'traveler')

                if caller_role.lower() == 'admin':
                    if user_role.lower() != 'traveler':
                        continue

                combined_users.append({
                    'id': uid,
                    'fullName': f"{profile_data.get('firstName', '')} {profile_data.get('lastName', '')}".strip() or 'N/A',
                    'email': auth_data['email'],
                    'status': auth_data['status'],
                    'role': user_role
                })
            else:
                if caller_role.lower() == 'superadmin':
                    combined_users.append({
                        'id': uid,
                        'fullName': 'N/A (Missing Profile)',
                        'email': auth_data['email'],
                        'status': auth_data['status'],
                        'role': 'unknown'
                    })
        
        print(f"Successfully fetched {len(combined_users)} users for {caller_role}.")
        return jsonify({"status": "success", "users": combined_users}), 200

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except Exception as e:
        print(f"An unexpected error occurred in get-all-users: {e}")
        traceback.print_exc() 
        return jsonify({"status": "error", "message": f"Internal server error: {str(e)}"}), 500

@app.route('/api/admin/dashboard-stats', methods=['GET'])
def get_dashboard_stats():
    if db is None:
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        caller_uid = decoded_token['uid']

        caller_doc = db.collection('users').document(caller_uid).get()
        if not caller_doc.exists:
            return jsonify({"status": "error", "message": "Caller not found."}), 403

        caller_data = caller_doc.to_dict()
        caller_role = caller_data.get('role', '').lower()

        if caller_role not in ['admin', 'superadmin']:
            return jsonify({"status": "error", "message": "Forbidden: Insufficient permissions."}), 403

        print(f"Admin stats request verified for user {caller_uid}.")

        period = request.args.get('period', 'week')
        start_date_utc = get_start_date(period)
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        stats = {}
        users_ref = db.collection('users')
        all_firestore_users = list(users_ref.stream())
        
        stats["totalUsers"] = len(all_firestore_users)
        
        new_users_query = users_ref.where('createdAt', '>=', start_date_utc).order_by('createdAt').stream()
        
        registrations_by_day = {}
        current_date = start_date_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        while current_date <= now_utc:
            date_str = current_date.strftime('%Y-%m-%d')
            registrations_by_day[date_str] = 0
            current_date += datetime.timedelta(days=1)
            
        total_new_registrations = 0
        for user_doc in new_users_query:
            created_at = user_doc.to_dict().get('createdAt')
            if created_at:
                date_str = created_at.strftime('%Y-%m-%d')
                if date_str in registrations_by_day:
                    registrations_by_day[date_str] += 1
                total_new_registrations += 1

        stats["newRegistrations"] = total_new_registrations
        stats["registrationsOverTime"] = registrations_by_day

        two_weeks_ago_utc = now_utc - datetime.timedelta(weeks=2)
        active_logins = 0
        for user in auth.list_users().iterate_all():
            if user.disabled: continue
            last_sign_in_ms = user.user_metadata.last_sign_in_timestamp if user.user_metadata else None
            if last_sign_in_ms:
                last_sign_in_dt = datetime.datetime.fromtimestamp(last_sign_in_ms / 1000, datetime.timezone.utc)
                if last_sign_in_dt >= two_weeks_ago_utc:
                    active_logins += 1
        stats["activeLogins"] = active_logins

        destination_counts = {}
        for user_doc in all_firestore_users:
            itineraries_ref = user_doc.reference.collection('savedItineraries')
            for itinerary_doc in itineraries_ref.stream():
                dest_name = itinerary_doc.to_dict().get('destinationName') 
                if dest_name: 
                    destination_counts[dest_name] = destination_counts.get(dest_name, 0) + 1
        
        sorted_destinations = sorted(destination_counts.items(), key=lambda item: item[1], reverse=True)
        stats["topDestinations"] = sorted_destinations[:5]
        
        print(f"Successfully calculated stats: {stats}")
        return jsonify({"status": "success", "stats": stats}), 200

    except Exception as e:
        print(f"An unexpected error occurred in get_dashboard_stats: {e}")
        traceback.print_exc() 
        
        error_message = str(e)
        if "query requires an index" in error_message:
            try:
                index_url = error_message.split("You can create it here: ")[1]
                print(f"--- MISSING INDEX --- \nCreate the required Firestore index here:\n{index_url}\n")
                return jsonify({"status": "error", "message": "Database query failed: A required index is missing. Check backend logs."}), 500
            except:
                pass
        
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500

# ===== HOTEL SEARCH (XOTELO) =====
@app.route('/api/hotels/search', methods=['POST', 'OPTIONS'])
def search_hotels():
    """Search hotels using Xotelo API"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        return response, 200
    
    try:
        print("\n" + "="*60)
        print("🏨 HOTEL SEARCH REQUEST (Xotelo)")
        print("="*60)
        
        data = request.get_json()
        
        if not data.get('cityName'):
            return jsonify({'error': 'City name is required'}), 400
        
        city_name = data['cityName']
        check_in = data.get('checkInDate')
        check_out = data.get('checkOutDate')
        adults = data.get('adults', 2)
        rooms = data.get('roomQuantity', 1)
        
        print(f"Searching: {city_name}")
        if check_in and check_out:
            print(f"Dates: {check_in} to {check_out}")
        print(f"Guests: {adults} adults, {rooms} rooms")
        
        results = xotelo_service.get_hotels(
            city_name=city_name,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            rooms=rooms
        )
        
        print(f"✓ Search completed: {len(results.get('data', []))} hotels found")
        print("="*60 + "\n")
        
        return jsonify(results), 200
        
    except Exception as e:
        print("\n" + "="*60)
        print("❌ ERROR IN HOTEL SEARCH")
        print("="*60)
        print(f"Error: {str(e)}")
        traceback.print_exc()
        print("="*60 + "\n")
        
        return jsonify({
            'error': 'Failed to search hotels',
            'message': str(e)
        }), 500

# ===== HOTELS.COM PROVIDER API ROUTES =====
@app.route('/api/hotels/search-by-name', methods=['GET', 'OPTIONS'])
def search_hotel_by_name():
    """Search for hotel by name using v2 Regions to get hotel_id"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response, 200
    
    try:
        hotel_name = request.args.get('hotel_name')
        location = request.args.get('location', '')
        
        if not hotel_name:
            return jsonify({'error': 'Hotel name required'}), 400
        
        print(f"\n🔍 Searching Hotels.com by name:")
        print(f"   Hotel: {hotel_name}")
        if location:
            print(f"   Location: {location}")
        
        # Use v2 Regions to search by hotel name
        url = f"{HOTELS_COM_BASE_URL}/v2/regions"
        
        headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": HOTELS_COM_HOST
        }
        
        # Combine hotel name + location for better match
        search_query = f"{hotel_name} {location}".strip()
        
        params = {
            "query": search_query,
            "locale": "en_US",
            "domain": "US"
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            results = data.get('data', [])
            
            if not results or len(results) == 0:
                print(f"⚠️ No results found")
                return jsonify({'error': 'Hotel not found'}), 404
            
            # Look for hotel type results
            hotel_results = [r for r in results if r.get('type') == 'hotel' or 'hotel' in str(r.get('type', '')).lower()]
            
            if hotel_results and len(hotel_results) > 0:
                hotel = hotel_results[0]
                hotel_id = hotel.get('hotelId') or hotel.get('id')
                hotel_name_found = hotel.get('regionNames', {}).get('fullName') or hotel.get('name', 'Unknown')
                
                print(f"✓ Found: {hotel_name_found}")
                print(f"   Hotel ID: {hotel_id}")
                
                return jsonify({
                    'success': True,
                    'hotel_id': hotel_id,
                    'hotel_name': hotel_name_found
                }), 200
            else:
                # Try first result anyway
                first = results[0]
                hotel_id = first.get('hotelId') or first.get('id')
                
                if hotel_id:
                    print(f"⚠️ Using first result (type: {first.get('type')})")
                    return jsonify({
                        'success': True,
                        'hotel_id': hotel_id,
                        'hotel_name': first.get('name', hotel_name)
                    }), 200
                else:
                    print(f"❌ No hotel ID found")
                    return jsonify({'error': 'Hotel not found'}), 404
                
        else:
            print(f"❌ API error: {response.status_code}")
            return jsonify({'error': 'Search failed'}), response.status_code
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/hotels/rooms', methods=['GET', 'OPTIONS'])
def get_hotel_rooms():
    """Get available room types and prices using v3 Hotel Rooms"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response, 200
    
    try:
        hotel_id = request.args.get('hotel_id')
        checkin = request.args.get('checkin')
        checkout = request.args.get('checkout')
        adults = request.args.get('adults', '2')
        
        if not hotel_id:
            return jsonify({'error': 'Hotel ID required'}), 400
        
        if not checkin or not checkout:
            return jsonify({'error': 'Check-in and check-out dates required'}), 400
        
        print(f"\n🛏️  Fetching hotel rooms (Hotels.com):")
        print(f"   Hotel ID: {hotel_id}")
        print(f"   Dates: {checkin} to {checkout}")
        print(f"   Adults: {adults}")
        
        url = f"{HOTELS_COM_BASE_URL}/v2/hotels/offers"
        
        headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": HOTELS_COM_HOST
        }
        
        params = {
            "hotel_id": hotel_id,
            "checkin_date": checkin,
            "checkout_date": checkout,
            "adults_number": int(adults),
            "locale": "en_US",
            "domain": "US"
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=15)
        
        if response.status_code == 200:
            print(f"✓ Rooms retrieved")
            return jsonify({
                'success': True,
                'data': response.json()
            }), 200
        else:
            print(f"❌ API error: {response.status_code}")
            return jsonify({'error': 'No rooms found'}), 404
            
    except Exception as e:
        print(f"❌ Error in get_hotel_rooms: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ==================== AMADEUS FLIGHT ROUTES ====================
@app.route('/search-flights', methods=['POST', 'OPTIONS'])
def search_flights():
    """Search for flights using Amadeus API"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        return response, 200
    
    try:
        print("\n" + "="*60)
        print("✈️  FLIGHT SEARCH REQUEST (Amadeus)")
        print("="*60)
        
        data = request.json
        
        # Get search parameters
        origin = data.get('origin')
        destination = data.get('destination')
        departure_date = data.get('departureDate')
        return_date = data.get('returnDate', None)
        adults = data.get('adults', 1)
        travel_class = data.get('travelClass', 'ECONOMY')
        
        # Validate required fields
        if not all([origin, destination, departure_date]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields (origin, destination, departureDate)'
            }), 400
        
        print(f"Route: {origin} → {destination}")
        print(f"Departure: {departure_date}")
        if return_date:
            print(f"Return: {return_date} (Round-trip)")
        print(f"Passengers: {adults}, Class: {travel_class}")
        
        # Build search parameters
        search_params = {
            'originLocationCode': origin,
            'destinationLocationCode': destination,
            'departureDate': departure_date,
            'adults': adults,
            'currencyCode': 'MYR',
            'travelClass': travel_class,
            'max': 50
        }
        
        # Add return date for round-trip
        if return_date:
            search_params['returnDate'] = return_date
        
        # Call Amadeus API
        response = amadeus.shopping.flight_offers_search.get(**search_params)
        
        # Format response
        flights = []
        for offer in response.data:
            flight_data = {
                'id': offer['id'],
                'price': {
                    'total': float(offer['price']['total']),
                    'currency': offer['price']['currency']
                },
                'itineraries': []
            }
            
            # Process each itinerary (outbound + return if applicable)
            for itinerary in offer['itineraries']:
                segments = []
                for segment in itinerary['segments']:
                    segments.append({
                        'departure': {
                            'airport': segment['departure']['iataCode'],
                            'time': segment['departure']['at']
                        },
                        'arrival': {
                            'airport': segment['arrival']['iataCode'],
                            'time': segment['arrival']['at']
                        },
                        'airline': segment['carrierCode'],
                        'flightNumber': segment['number'],
                        'aircraft': segment.get('aircraft', {}).get('code', 'N/A'),
                        'duration': segment['duration']
                    })
                
                flight_data['itineraries'].append({
                    'duration': itinerary['duration'],
                    'segments': segments
                })
            
            flights.append(flight_data)
        
        print(f"✓ Found {len(flights)} flight options")
        print("="*60 + "\n")
        
        return jsonify({
            'success': True,
            'flights': flights,
            'count': len(flights)
        }), 200
        
    except ResponseError as error:
        print("\n" + "="*60)
        print("❌ AMADEUS API ERROR")
        print("="*60)
        print(f"Error: {error}")
        print("="*60 + "\n")
        
        return jsonify({
            'success': False,
            'error': str(error)
        }), 400
        
    except ResponseError as error:
        print("\n" + "="*60)
        print("❌ AMADEUS API ERROR")
        print("="*60)
        
        # ✅ Extract detailed error information
        try:
            error_code = error.response.status_code
            error_body = error.response.body
            print(f"Status Code: {error_code}")
            print(f"Response Body: {error_body}")
            
            # Try to get specific error message
            if hasattr(error.response, 'result'):
                error_data = error.response.result
                if 'errors' in error_data:
                    for err in error_data['errors']:
                        print(f"  - {err.get('title', 'Unknown')}: {err.get('detail', 'No details')}")
                        print(f"    Code: {err.get('code', 'N/A')}")
                        print(f"    Source: {err.get('source', {})}")
        except Exception as parse_error:
            print(f"Could not parse error details: {parse_error}")
        
        print(f"Full Error Object: {error}")
        print("="*60 + "\n")
        
        # Return detailed error to frontend
        error_message = str(error)
        try:
            if hasattr(error.response, 'result') and 'errors' in error.response.result:
                first_error = error.response.result['errors'][0]
                error_message = f"{first_error.get('title', 'API Error')}: {first_error.get('detail', str(error))}"
        except:
            pass
        
        return jsonify({
            'success': False,
            'error': error_message
        }), 400
        
    except Exception as e:
        print("\n" + "="*60)
        print("❌ FLIGHT SEARCH ERROR")
        print("="*60)
        print(f"Error: {str(e)}")
        traceback.print_exc()
        print("="*60 + "\n")
        
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/airport-search', methods=['GET', 'OPTIONS'])
def airport_search():
    """Search for airports (autocomplete) using Amadeus API"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response, 200
    
    try:
        keyword = request.args.get('keyword', '')
        
        if len(keyword) < 2:
            return jsonify({
                'success': True,
                'airports': []
            }), 200
        
        print(f"🔍 Airport search: '{keyword}'")
        
        response = amadeus.reference_data.locations.get(
            keyword=keyword,
            subType='AIRPORT,CITY'
        )
        
        airports = []
        for location in response.data[:10]:  # Limit to 10 results
            airports.append({
                'code': location['iataCode'],
                'name': location['name'],
                'city': location['address']['cityName'],
                'country': location['address']['countryName']
            })
        
        print(f"   ✓ Found {len(airports)} airports")
        
        return jsonify({
            'success': True,
            'airports': airports
        }), 200
        
    except Exception as e:
        print(f"❌ Airport Search Error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== GOOGLE PLACES API ENDPOINTS ========== 
CATEGORY_MAPPING = {
    'cafe': 'cafe',
    'coffee': 'cafe',
    'museum': 'museum',
    'attraction': 'tourist_attraction',
    'point_of_interest': 'tourist_attraction',
    'park': 'park',
    'gym': 'gym',
    'fitness': 'gym',
    'shopping': 'shopping_mall',
    'shopping_mall': 'shopping_mall',
    'all': ''  
}

@app.route('/api/places/nearby', methods=['GET'])
def search_nearby():
    """Search for nearby places using Google Places API."""
    lat = request.args.get('lat')
    lng = request.args.get('lng')
    radius = request.args.get('radius', 5000)
    place_type = request.args.get('type', 'all')
    
    if not lat or not lng or not GOOGLE_API_KEY:
        return jsonify({'error': 'Missing parameters or API key'}), 400
    
    try:
        print(f"🔍 Nearby search: type={place_type}, lat={lat}, lng={lng}, radius={radius}")
        
        # ✅ MAP category to Google Places API type
        google_type = CATEGORY_MAPPING.get(place_type.lower(), place_type)
        print(f"📍 Mapped {place_type} → {google_type}")
        
        url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json'
        params = {
            'location': f'{lat},{lng}',
            'radius': radius,
            'key': GOOGLE_API_KEY
        }
        
        # ✅ Only add type if not 'all'
        if google_type:
            params['type'] = google_type
            print(f"✅ Using type: {google_type}")
        else:
            print(f"✅ No type filter (searching all places)")
        
        response = requests.get(url, params=params)
        data = response.json()
        
        print(f"📋 Google response status: {data.get('status')}")
        print(f"📊 Got {len(data.get('results', []))} results from Google")
        
        # ✅ PROCESS THE RESPONSE
        if 'results' in data and data['results']:
            processed_results = []
            
            for idx, place in enumerate(data['results']):
                place_id = place.get('place_id')
                
                formatted_address = place.get('formatted_address')
                vicinity = place.get('vicinity', '')
                place_name = place.get('name', 'Unknown')
                
                # ✅ Build address from available fields
                if formatted_address:
                    final_address = formatted_address
                    print(f"✅ [{idx}] Got formatted_address: {final_address}")
                elif vicinity:
                    final_address = f"{place_name}, {vicinity}"
                    print(f"✅ [{idx}] Using vicinity: {final_address}")
                else:
                    final_address = place_name
                    print(f"⚠️ [{idx}] Only name available: {final_address}")
                
                processed_results.append({
                    'name': place_name,
                    'formatted_address': final_address, 
                    'geometry': place.get('geometry'),
                    'rating': place.get('rating'),
                    'types': place.get('types', []),
                    'place_id': place_id,
                    'formatted_phone_number': place.get('formatted_phone_number'),
                    'photos': place.get('photos', [])
                })
            
            data['results'] = processed_results
            print(f"✅ Processed {len(processed_results)} results with addresses")
            
            if processed_results:
                first = processed_results[0]
                print(f"📍 First: {first['name']} → {first['formatted_address']}")
        else:
            print(f"⚠️ No results in data")
        
        return jsonify(data)
    except Exception as error:
        print(f"❌ Nearby search error: {error}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(error)}), 500

@app.route('/api/places/textsearch', methods=['GET'])
def text_search():
    """Search for places using text query."""
    query = request.args.get('query')
    lat = request.args.get('location', '').split(',')[0] if 'location' in request.args else None
    lng = request.args.get('location', '').split(',')[1] if 'location' in request.args else None
    radius = request.args.get('radius', 50000)
    
    if not query or not GOOGLE_API_KEY:
        return jsonify({'error': 'Missing query or API key'}), 400
    
    try:
        url = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
        params = {
            'query': query,
            'key': GOOGLE_API_KEY
        }
        
        # ✅ ADD location if provided
        if lat and lng:
            params['location'] = f'{lat},{lng}'
            params['radius'] = radius
        
        response = requests.get(url, params=params)
        data = response.json()
        
        # ✅ PROCESS THE RESPONSE - Extract only needed fields
        if 'results' in data:
            processed_results = []
            for place in data['results']:
                processed_results.append({
                    'name': place.get('name'),
                    'formatted_address': place.get('formatted_address', 'No address'), 
                    'geometry': place.get('geometry'),
                    'rating': place.get('rating'),
                    'types': place.get('types', []),
                    'place_id': place.get('place_id'),
                    'formatted_phone_number': place.get('formatted_phone_number'),
                    'photos': place.get('photos', [])
                })
            
            data['results'] = processed_results
            print(f"✅ Text search returned {len(processed_results)} results")
            print(f"📍 First result: {processed_results[0] if processed_results else 'None'}")
        
        return jsonify(data)
    except Exception as error:
        print(f"❌ Text search error: {error}")
        return jsonify({'error': str(error)}), 500

# ===== CITY COORDINATES (FOR FALLBACK) =====
CITY_COORDINATES = {
    # Malaysia
    'Kuala Lumpur': (3.1390, 101.6869),
    'Penang': (5.3544, 100.3047),
    
    # France
    'Paris': (48.8566, 2.3522),
    'Lyon': (45.7640, 4.8357),
    'Marseille': (43.2965, 5.3698),
    
    # United States
    'New York': (40.7128, -74.0060),
    'Los Angeles': (34.0522, -118.2437),
    
    # Brazil
    'Rio de Janeiro': (-22.9068, -43.1729),
    'Salvador': (-12.9714, -38.5014),
    
    # Mexico
    'Mexico City': (19.4326, -99.1332),
    'Guadalajara': (20.6595, -103.2494),
}

# ===== WEATHER API ENDPOINT =====
@app.route('/api/get-weather', methods=['POST'])
def get_weather():
    """Get weather forecast using OpenWeatherMap 5-day forecast"""
    try:
        if not OPENWEATHER_API_KEY:
            return jsonify({
                'success': False,
                'error': 'OpenWeatherMap API key not configured'
            }), 500
        
        data = request.json
        city = data.get('city', 'Kuala Lumpur')
        country = data.get('country', 'Malaysia')
        date_str = data.get('date')
        
        print(f"🌡️ Getting weather for {city}, {country} on {date_str}")
        
        # ✅ Get coordinates first (geocoding)
        geo_url = "https://api.openweathermap.org/geo/1.0/direct"
        geo_params = {
            "q": f"{city},{country}",
            "limit": 1,
            "appid": OPENWEATHER_API_KEY
        }
        
        geo_response = requests.get(geo_url, params=geo_params)
        geo_data = geo_response.json()
        
        if not geo_data:
            print(f"❌ City not found: {city}")
            # Fallback to predefined coordinates
            if city in CITY_COORDINATES:
                lat, lon = CITY_COORDINATES[city]
                print(f"📍 Using default coordinates for {city}: {lat}, {lon}")
            else:
                return jsonify({
                    'success': False,
                    'error': 'City not found'
                }), 404
        else:
            lat = geo_data[0]['lat']
            lon = geo_data[0]['lon']
        
        print(f"📍 Coordinates: {lat}, {lon}")
        
        # ✅ Get 5-day forecast (free tier supports 3-hour intervals for 5 days)
        forecast_url = "https://api.openweathermap.org/data/2.5/forecast"
        forecast_params = {
            "lat": lat,
            "lon": lon,
            "appid": OPENWEATHER_API_KEY,
            "units": "metric" 
        }
        
        forecast_response = requests.get(forecast_url, params=forecast_params)
        forecast_data = forecast_response.json()
        
        if forecast_response.status_code != 200:
            print(f"❌ OpenWeatherMap API error: {forecast_data}")
            return jsonify({
                'success': False,
                'error': 'Could not fetch weather'
            }), 500
        
        # ✅ Find weather for the requested date (closest match around noon)
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        target_time = datetime.strptime(f"{date_str} 12:00", "%Y-%m-%d %H:%M")
        
        print(f"🔍 Looking for forecast around {target_time}")
        
        best_match = None
        min_diff = float('inf')
        
        for forecast in forecast_data['list']:
            forecast_time = datetime.fromtimestamp(forecast['dt'])
            time_diff = abs((forecast_time - target_time).total_seconds())
            
            # Find the forecast closest to noon on the requested date
            if time_diff < min_diff and forecast_time.date() == target_date:
                min_diff = time_diff
                best_match = forecast
        
        if not best_match:
            # If exact date not found, get first available forecast
            print("⚠️ Exact date not in forecast, using first available")
            best_match = forecast_data['list'][0]
        
        # ✅ Extract weather information
        weather_info = {
            'temp': round(best_match['main']['temp']),
            'temp_min': round(best_match['main']['temp_min']),
            'temp_max': round(best_match['main']['temp_max']),
            'feels_like': round(best_match['main']['feels_like']),
            'humidity': best_match['main']['humidity'],
            'wind_speed': round(best_match['wind']['speed'], 1),
            'description': best_match['weather'][0]['description'],
            'condition': best_match['weather'][0]['main'],
            'icon': best_match['weather'][0]['icon'],
            'date': datetime.fromtimestamp(best_match['dt']).strftime('%Y-%m-%d %H:%M')
        }
        
        print(f"✅ Weather: {weather_info['temp']}°C, {weather_info['description']}")
        
        return jsonify({
            'success': True,
            'weather': weather_info
        })
        
    except Exception as e:
        print(f"❌ Error getting weather: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ===== ROUTES API ENDPOINT =====
@app.route('/api/get-route', methods=['POST'])
def get_route():
    """Get route between two places using Google Routes API or fallback to Directions API"""
    try:
        if not GOOGLE_API_KEY:
            return jsonify({
                'success': False,
                'error': 'Google Places API key not configured'
            }), 500
        
        data = request.json
        origin = data.get('origin')
        destination = data.get('destination')
        day = data.get('day', 1)
        
        print(f"🗺️ Getting route from {origin} to {destination}")
        
        # ✅ Use Google Directions API (simpler, free tier available)
        directions_url = "https://maps.googleapis.com/maps/api/directions/json"
        directions_params = {
            "origin": origin,
            "destination": destination,
            "key": GOOGLE_API_KEY,
            "mode": "driving"
        }
        
        response = requests.get(directions_url, params=directions_params)
        directions_data = response.json()
        
        if response.status_code != 200 or directions_data.get('status') != 'OK':
            print(f"❌ Google Directions API error: {directions_data.get('status')}")
            return jsonify({
                'success': False,
                'error': f"Could not find route: {directions_data.get('status')}"
            }), 400
        
        route = directions_data['routes'][0]
        leg = route['legs'][0]
        
        # Extract route information
        route_info = {
            'distanceMeters': leg['distance']['value'],
            'duration': leg['duration']['value'],
            'startAddress': leg['start_address'],
            'endAddress': leg['end_address'],
            'steps': [
                {
                    'instruction': step['html_instructions'].replace('<b>', '').replace('</b>', '').replace('<div', '<span').replace('</div>', '</span>'),
                    'distance': step['distance']['value'],
                    'duration': step['duration']['value']
                }
                for step in leg['steps']
            ],
            'polyline': route['overview_polyline']['points']
        }
        
        distance_km = route_info['distanceMeters'] / 1000
        duration_min = route_info['duration'] / 60
        
        print(f"✅ Route found: {distance_km:.1f}km, {duration_min:.0f}min")
        
        return jsonify({
            'success': True,
            'route': route_info
        })
        
    except Exception as e:
        print(f"❌ Error getting route: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ===== PLACE DETAILS ENDPOINT (POST) =====
@app.route('/api/place-details', methods=['POST'])
def place_details_post():
    """Get place information via POST (for frontend compatibility)"""
    try:
        if not GOOGLE_API_KEY:
            return jsonify({'success': False, 'error': 'Google API key not configured'}), 500
        
        data = request.json
        place_id = data.get('place_id')
        place_name = data.get('place_name')
        
        print(f"🔍 Getting details for: {place_name}")
        
        # If no place_id, search by name first
        if not place_id or place_id == '':
            places_search_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
            search_params = {
                "query": place_name,
                "key": GOOGLE_API_KEY
            }
            
            search_response = requests.get(places_search_url, params=search_params)
            search_data = search_response.json()
            
            if search_data.get('results'):
                place_id = search_data['results'][0]['place_id']
                print(f"✅ Found place ID: {place_id}")
            else:
                return jsonify({'success': False, 'error': 'Place not found'}), 404
        
        # Get detailed place information
        place_details_url = "https://maps.googleapis.com/maps/api/place/details/json"
        details_params = {
            "place_id": place_id,
            "fields": "name,formatted_address,rating,user_ratings_total,international_phone_number,website,opening_hours,photos",
            "key": GOOGLE_API_KEY
        }
        
        details_response = requests.get(place_details_url, params=details_params)
        details_data = details_response.json()
        
        if details_data.get('status') != 'OK':
            return jsonify({'success': False, 'error': 'Could not fetch details'}), 400
        
        place_detail = details_data['result']
        
        # Extract photos
        photos = []
        if place_detail.get('photos'):
            for photo in place_detail['photos'][:3]:
                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference={photo['photo_reference']}&key={GOOGLE_API_KEY}"
                photos.append(photo_url)
        
        place_details = {
            'name': place_detail.get('name', 'N/A'),
            'address': place_detail.get('formatted_address', 'N/A'),
            'rating': place_detail.get('rating', 'N/A'),
            'reviews': place_detail.get('user_ratings_total', 0),
            'phone': place_detail.get('international_phone_number', 'N/A'),
            'website': place_detail.get('website', 'N/A'),
            'photos': photos
        }
        
        print(f"✅ Place details retrieved")
        
        return jsonify({'success': True, 'details': place_details})
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/places/details', methods=['GET'])
def get_place_details():
    """Get detailed information about a place."""
    place_id = request.args.get('place_id')
    
    if not place_id or not GOOGLE_API_KEY:
        return jsonify({'error': 'Missing place_id or API key'}), 400
    
    try:
        url = 'https://maps.googleapis.com/maps/api/place/details/json'
        params = {
            'place_id': place_id,
            'fields': 'name,rating,photos,reviews,formatted_address,formatted_phone_number,opening_hours,website,price_level,url',
            'key': GOOGLE_API_KEY
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        result = data.get('result', {})
        return jsonify({
            'name': result.get('name'),
            'rating': result.get('rating'),
            'reviews_count': len(result.get('reviews', [])),
            'reviews': result.get('reviews', [])[:5],
            'photos': result.get('photos', []),
            'phone': result.get('formatted_phone_number'),
            'website': result.get('website'),
            'address': result.get('formatted_address'),
            'hours': result.get('opening_hours'),
            'price_level': result.get('price_level'),
            'maps_url': result.get('url')
        })
    except Exception as error:
        print(f"❌ Details error: {error}")
        return jsonify({'error': str(error)}), 500

@app.route('/api/places/photo', methods=['GET'])
def get_place_photo():
    """Get photo URL for a place - returns a proper redirect."""
    photo_reference = request.args.get('photo_reference')
    maxwidth = request.args.get('maxwidth', 400)
    
    if not photo_reference or not GOOGLE_API_KEY:
        return jsonify({'error': 'Missing photo_reference or API key'}), 400
    
    try:
        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth={maxwidth}&photo_reference={photo_reference}&key={GOOGLE_API_KEY}"
        
        print(f"✅ Redirecting to Google photo: {photo_url}")
        
        # Return a direct redirect so the browser can load it
        return redirect(photo_url)
        
    except Exception as error:
        print(f"❌ Photo error: {error}")
        return jsonify({'error': str(error)}), 500

# ==================== ITINERARY ENDPOINTS ====================
@app.route('/api/itineraries', methods=['GET'])
def get_itineraries():
    """Get all preloaded itineraries."""
    try:
        itineraries = get_all_itineraries()
        print(f"✅ Returning {len(itineraries)} itineraries")
        return jsonify({
            'status': 'success',
            'itineraries': itineraries
        })
    except Exception as error:
        print(f"❌ Error getting itineraries: {error}")
        return jsonify({'error': str(error)}), 500

@app.route('/api/itineraries/<itinerary_id>', methods=['GET'])
def get_itinerary_details(itinerary_id):
    """Get details for a specific itinerary."""
    try:
        itinerary = get_itinerary_by_id(itinerary_id)
        
        if not itinerary:
            return jsonify({'error': 'Itinerary not found'}), 404
        
        print(f"✅ Returning itinerary: {itinerary['title']}")
        return jsonify({
            'status': 'success',
            'itinerary': itinerary
        })
    except Exception as error:
        print(f"❌ Error getting itinerary details: {error}")
        return jsonify({'error': str(error)}), 500

# ==================== TRAVEL STYLE TO CATEGORY MAPPING ====================
TRAVEL_STYLE_TO_CATEGORIES = {
    'cultural': ['museum', 'art_gallery', 'library', 'theater'],
    'nature': ['park', 'campground', 'hiking_area', 'natural_feature'],
    'cityscape': ['shopping_mall', 'night_club', 'bar', 'restaurant', 'cafe'],
    'historical': [
        'archaeological_site', 'castle', 'fortress', 'historical_landmark',
        'church', 'synagogue', 'hindu_temple', 'mosque'
    ]
}

TRAVELER_TYPE_CATEGORIES = {
    'family': ['park', 'tourist_attraction', 'museum', 'shopping_mall', 'restaurant', 'cafe'],
    'couple': ['restaurant', 'cafe', 'bar', 'theater', 'art_gallery', 'historical_landmark'],
    'solo': ['museum', 'library', 'cafe', 'art_gallery', 'historical_landmark', 'hiking_area'],
    'friends': ['restaurant', 'bar', 'night_club', 'shopping_mall', 'tourist_attraction', 'park']
}

# ==================== ITINERARY RECOMMENDATIONS ROUTES ====================
@app.route('/api/itinerary/recommendations', methods=['POST', 'OPTIONS'])
def get_itinerary_recommendations():
    """Get activity recommendations using trained ML model"""
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        return response, 200
    
    try:
        print("\n" + "="*60)
        print("🎯 ITINERARY RECOMMENDATIONS REQUEST")
        print("="*60)
        
        data = request.get_json()

        city = data.get('city') or data.get('destination')
        country = data.get('country')
        
        travel_styles = data.get('travelStyles', data.get('interests', []))
        with_whom = data.get('withWhom', 'solo')
        nights = data.get('nights', 3)
        
        # Validate required fields
        if not city or not country:
            return jsonify({
                'success': False,
                'error': 'City and country are required'
            }), 400
        
        print(f"📍 City: {city}")
        print(f"🌍 Country: {country}")
        print(f"🎨 Travel Styles: {travel_styles}")
        print(f"👥 With Whom: {with_whom}")
        print(f"🌙 Nights: {nights}")
        
        selected_categories = []
        
        if travel_styles and len(travel_styles) > 0:
            print(f"\n🔄 Mapping travel styles to categories...")
            for style in travel_styles:
                categories = TRAVEL_STYLE_TO_CATEGORIES.get(style, [])
                selected_categories.extend(categories)
                print(f"   {style} → {categories}")

        traveler_categories = TRAVELER_TYPE_CATEGORIES.get(with_whom, [])
        all_categories = list(set(selected_categories + traveler_categories))

        if not all_categories:
            all_categories = ['restaurant', 'tourist_attraction', 'museum', 'park']
            print(f"⚠️ No preferences provided, using defaults: {all_categories}")
        
        print(f"\n📦 Final categories to search: {all_categories}")
        
        # ✅ Call recommender
        recommendations = recommender.get_recommendations(
            city=city,
            country=country,
            categories=all_categories,
            traveler_type=with_whom,
            nights=nights
        )
        
        print(f"\n✅ Got {len(recommendations)} recommendations")
        print("="*60 + "\n")
        
        return jsonify({
            'success': True,
            'activities': recommendations,
            'count': len(recommendations)
        }), 200
        
    except Exception as e:
        print("\n" + "="*60)
        print("❌ ERROR IN RECOMMENDATIONS")
        print("="*60)
        print(f"Error: {str(e)}")
        traceback.print_exc()
        print("="*60 + "\n")
        
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def format_activity(activity):
    """Format activity with all required fields including full place details"""
    formatted = {
        'name': activity.get('name', ''),
        'category': activity.get('category', ''),
        'time': activity.get('time', ''),
        'rating': float(activity.get('rating', 4.0)),
        'reviews': activity.get('reviews', 0),
        'place_id': activity.get('place_id', ''),
        'photo_reference': activity.get('photo_reference', ''),
        'photos': activity.get('photos', []),
        'address': activity.get('address', ''),
        'latitude': activity.get('latitude'),
        'longitude': activity.get('longitude'),
        'is_activity': True
    }
    
    if activity.get('place_id'):
        formatted['phone'] = activity.get('phone', '')
        formatted['website'] = activity.get('website', '')
        formatted['opening_hours'] = activity.get('opening_hours', {})
        formatted['price_level'] = activity.get('price_level', '')
    
    return formatted

# ===== HEALTH CHECK =====
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'Travel API',
        'search': 'Xotelo (unlimited)',
        'details': 'Hotels.com Provider (600/month)',
        'flights': 'Amadeus (10,000/month)', 
        'timestamp': datetime.datetime.now().isoformat(),
        'rapidapi_configured': RAPIDAPI_KEY is not None,
        'amadeus_configured': os.getenv('AMADEUS_API_KEY') is not None 
    }), 200

# --- Run the App ---
if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 Starting Flask Server")
    print("   - Hotel Search: Xotelo (unlimited)")
    print("   - Hotel Details: Hotels.com Provider (600/month)")
    print("   - Flight Search: Amadeus (10,000/month)") 
    print("="*60 + "\n")
    app.run(port=5000, debug=True)
