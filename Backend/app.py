# ==================== IMPORTS ====================
import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import datetime
import traceback
import requests 
from services.xotelo_service import xotelo_service
import os
from dotenv import load_dotenv
from amadeus import Client, ResponseError


# ==================== LOAD ENVIRONMENT ====================
load_dotenv()


# ==================== API CONFIGURATION ====================
RAPIDAPI_KEY = os.getenv('RAPIDAPI_KEY')

# Hotels.com Provider API
HOTELS_COM_HOST = 'hotels-com-provider.p.rapidapi.com'
HOTELS_COM_BASE_URL = 'https://hotels-com-provider.p.rapidapi.com'

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
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {'storageBucket': STORAGE_BUCKET})
        print("✓ Firebase Admin SDK initialized successfully.")
    else:
        print("✓ Firebase Admin SDK already initialized.")
    
    db = firestore.client()
    bucket = storage.bucket()
    print("✓ Firestore and Storage clients created.")
    
except Exception as e:
    print(f"!!! CRITICAL ERROR initializing Firebase Admin SDK: {e}")
    db = None
    bucket = None


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

@app.route('/create-admin', methods=['POST'])
def create_admin():
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

        if caller_role != 'superadmin':
            print(f"FORBIDDEN: User {caller_uid} (role: {caller_role}) tried to create admin.")
            return jsonify({"status": "error", "message": "Forbidden: Insufficient permissions."}), 403

        print(f"Superadmin request verified for user {caller_uid}.")

        data = request.json
        new_email = data.get('email')
        new_password = data.get('password')
        new_firstName = data.get('firstName')
        new_lastName = data.get('lastName')

        if not all([new_email, new_password, new_firstName, new_lastName]):
            return jsonify({"status": "error", "message": "Missing required fields (email, password, name)."}), 400
        if len(new_password) < 8:
            return jsonify({"status": "error", "message": "Password must be at least 8 characters."}), 400

        try:
            new_user_record = auth.create_user(
                email=new_email,
                password=new_password,
                display_name=f"{new_firstName} {new_lastName}"
            )
            new_uid = new_user_record.uid
            print(f"Successfully created new admin in Auth. UID: {new_uid}")
        except auth.EmailAlreadyExistsError:
            return jsonify({"status": "error", "message": "Email already in use."}), 409
        except Exception as e:
            print(f"Error creating auth user: {e}")
            return jsonify({"status": "error", "message": f"Error creating auth user: {e}"}), 500
            
        profile_data = {
            'firstName': new_firstName,
            'lastName': new_lastName,
            'birthDate': data.get('birthDate'), 
            'gender': data.get('gender'),      
            'phone': data.get('phone'),     
            'email': new_email,
            'role': 'admin', 
            'createdAt': firestore.SERVER_TIMESTAMP,
            'profilePhotoURL': None
        }

        db.collection('users').document(new_uid).set(profile_data)

        print("Successfully created new admin profile in Firestore.")
        return jsonify({"status": "success", "message": "Admin account created successfully.", "userId": new_uid}), 201

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except Exception as e:
        print(f"An unexpected error occurred in create_admin: {e}")
        traceback.print_exc() 
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500

@app.route('/update-profile', methods=['POST'])
def update_profile():
    if db is None:
        print("!!! ERROR: Firestore client (db) not initialized.")
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        print(f"Verified token for user UID: {uid} attempting profile update.")

        data = request.json
        if not data:
            return jsonify({"status": "error", "message": "No data provided for update."}), 400

        update_data = {}
        allowed_fields = ['firstName', 'lastName', 'birthDate', 'gender', 'phone']
        for field in allowed_fields:
            if field in data:
                if isinstance(data[field], str):
                    update_data[field] = data[field].strip()
                else:
                    update_data[field] = data[field]

        if not update_data:
            return jsonify({"status": "error", "message": "No valid fields provided for update."}), 400
        print(f"Data prepared for update for user {uid}: {update_data}")

        doc_ref = db.collection('users').document(uid)
        doc_ref.update(update_data)

        print(f"Successfully updated profile for user {uid}.")
        return jsonify({"status": "success", "message": "Profile updated successfully."}), 200

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token during update - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except Exception as e:
        print(f"An unexpected error occurred in update_profile: {e}")
        return jsonify({"status": "error", "message": "An internal server error occurred during update."}), 500

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
