import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import datetime
import traceback
from services.amadeus_service import amadeus_service 


# --- Firebase Initialization ---
print("Attempting Firebase Admin SDK initialization...")
# Make sure 'serviceAccountKey.json' is in the 'backend' folder
cred = credentials.Certificate('serviceAccountKey.json')

# Add your Storage Bucket URL here
STORAGE_BUCKET = 'smart-trip-planner-1c0a9.firebasestorage.app' # <<< MAKE SURE THIS IS YOUR BUCKET URL

db = None
bucket = None
try:
    if not firebase_admin._apps: # Check if already initialized
        firebase_admin.initialize_app(cred, {'storageBucket': STORAGE_BUCKET})
        print("Firebase Admin SDK initialized successfully.")
    else:
        print("Firebase Admin SDK already initialized.")
    db = firestore.client()
    bucket = storage.bucket()
except Exception as e:
    print(f"!!! CRITICAL ERROR initializing Firebase Admin SDK: {e}")
    # Handle error - db and bucket will be None if initialization fails

# --- Flask App Initialization ---
app = Flask(__name__) # Create the main Flask app instance
CORS(app) # Apply CORS to the app

print("Flask app created and Firebase services initialized.")


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

# --- ROUTES ---
@app.route('/create-profile', methods=['POST']) # Use @app.route, not @profile_bp.route
def create_profile():
    photo_url = None

    # Check if Firebase services initialized correctly
    if db is None or bucket is None:
        print("!!! ERROR: Firebase services (db or bucket) not initialized.")
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        # Authentication & Data Retrieval
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        data = request.json
        print(f"Received data keys: {list(data.keys())}") # Log received keys

        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        print(f"Verified token for user UID: {uid}")

        # Image Upload Logic
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

        # Prepare Firestore Data
        profile_data = {
            'firstName': data.get('firstName'),
            'lastName': data.get('lastName'),
            'birthDate': data.get('birthDate'),
            'gender': data.get('gender'),
            'phone': data.get('phone'),
            'email': data.get('email'),
            'role': 'Traveler',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'profilePhotoURL': photo_url
        }

        # Save to Firestore
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
    if db is None: # Check if db is initialized
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        # --- 1. Verify the CALLER is a Superadmin ---
        # Get the ID Token of the superadmin making the request
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        caller_uid = decoded_token['uid'] # This is the Superadmin's UID

        caller_doc = db.collection('users').document(caller_uid).get()
        if not caller_doc.exists:
            return jsonify({"status": "error", "message": "Caller not found."}), 403

        caller_data = caller_doc.to_dict()
        caller_role = caller_data.get('role', '').lower()

        # Security Check: Only a superadmin can create other admins
        if caller_role != 'superadmin':
            print(f"FORBIDDEN: User {caller_uid} (role: {caller_role}) tried to create admin.")
            return jsonify({"status": "error", "message": "Forbidden: Insufficient permissions."}), 403

        print(f"Superadmin request verified for user {caller_uid}.")

        # --- 2. Get the NEW ADMIN's details from the request body ---
        data = request.json
        new_email = data.get('email')
        new_password = data.get('password')
        new_firstName = data.get('firstName')
        new_lastName = data.get('lastName')

        # Basic validation for the new account
        if not all([new_email, new_password, new_firstName, new_lastName]):
            return jsonify({"status": "error", "message": "Missing required fields (email, password, name)."}), 400
        if len(new_password) < 6:
             return jsonify({"status": "error", "message": "Password must be at least 6 characters."}), 400

        # --- 3. Create the NEW user in Firebase Authentication ---
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
            
        # --- 4. Prepare and Save the NEW admin's profile in Firestore ---
        profile_data = {
            'firstName': new_firstName,
            'lastName': new_lastName,
            'birthDate': data.get('birthDate'), 
            'gender': data.get('gender'),      
            'phone': data.get('phone'),     
            'email': new_email,
            'role': 'Admin', 
            'createdAt': firestore.SERVER_TIMESTAMP,
            'profilePhotoURL': None # No photo on creation
        }

        # Save to Firestore
        db.collection('users').document(new_uid).set(profile_data)

        print("Successfully created new admin profile in Firestore.")
        return jsonify({"status": "success", "message": "Admin account created successfully.", "userId": new_uid}), 201

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except Exception as e:
        print(f"An unexpected error occurred in create_admin: {e}")
        import traceback
        traceback.print_exc() 
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500


@app.route('/update-profile', methods=['POST'])
def update_profile():
    # Check if Firestore client (db) initialized correctly
    if db is None:
         print("!!! ERROR: Firestore client (db) not initialized.")
         return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        # 1. Verify User Token
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        print(f"Verified token for user UID: {uid} attempting profile update.")

        # 2. Get Data to Update from request body
        data = request.json
        if not data:
            return jsonify({"status": "error", "message": "No data provided for update."}), 400

        # 3. Prepare *only* the allowed fields for update
        update_data = {}
        # List of fields the user is allowed to change via this form
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

        # 4. Update Firestore Document
        doc_ref = db.collection('users').document(uid)
        doc_ref.update(update_data)

        print(f"Successfully updated profile for user {uid}.")
        return jsonify({"status": "success", "message": "Profile updated successfully."}), 200 # 200 OK for update

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token during update - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except Exception as e:
        print(f"An unexpected error occurred in update_profile: {e}")
        return jsonify({"status": "error", "message": "An internal server error occurred during update."}), 500


@app.route('/update-profile-picture', methods=['POST'])
def update_profile_picture():
    # Check if services are initialized
    if db is None or bucket is None:
         print("!!! ERROR: Firebase services (db or bucket) not initialized.")
         return jsonify({"status": "error", "message": "Server configuration error."}), 500

    new_photo_url = None
    try:
        # 1. Verify Token
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        print(f"Verified token for user UID: {uid} attempting picture update.")

        # 2. Get Image Data URL from request body
        data = request.json
        profile_pic_data_url = data.get('profilePicDataURL')

        if not (profile_pic_data_url and profile_pic_data_url.startswith('data:image')):
             return jsonify({"status": "error", "message": "No valid image data URL provided."}), 400

        # 3. Upload Image to Storage (Same logic as registration)
        try:
            print("Processing profile picture upload (update)...")
            header, encoded = profile_pic_data_url.split(",", 1)
            image_data = base64.b64decode(encoded)
            content_type = header.split(";")[0].split(":")[1]
            if not content_type.startswith('image/'):
                raise ValueError("Invalid image type.")

            file_name = f"users/{uid}/profile.png" # Overwrite existing file
            blob = bucket.blob(file_name)
            blob.upload_from_string(image_data, content_type=content_type)
            
            # Make the file public (so the URL works)
            blob.make_public()
            
            # Get the public URL
            new_photo_url = blob.public_url
            print(f"Image updated successfully: {new_photo_url}")

        except Exception as upload_error:
            print(f"!!! CRITICAL: Image upload failed during update for user {uid}: {upload_error}")
            raise upload_error 

        # 4. Update *only* the photo URL in Firestore
        doc_ref = db.collection('users').document(uid)
        doc_ref.update({
            'profilePhotoURL': new_photo_url
        })

        print(f"Successfully updated profilePhotoURL for user {uid}.")
        # Return the new URL so the frontend can update immediately
        return jsonify({
            "status": "success",
            "message": "Profile picture updated successfully.",
            "photoURL": new_photo_url 
        }), 200

    except auth.InvalidIdTokenError as e:
        print(f"Error: Invalid ID Token - {e}")
        return jsonify({"status": "error", "message": "Invalid credentials or token expired."}), 401
    except ValueError as e: # Catch invalid image data errors
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
        # 1. Verify the CALLER's Token
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
        # Get role - keep original casing from Firestore
        caller_role = caller_data.get('role', 'Traveler')

        # Check permissions (case-insensitive)
        if caller_role.lower() not in ['admin', 'superadmin']:
            return jsonify({"status": "error", "message": "Forbidden: Insufficient permissions."}), 403

        print(f"'{caller_role}' request verified for user {caller_uid}. Fetching users.")
        
        auth_users = {}

        now_utc = datetime.datetime.now(datetime.timezone.utc)
        two_weeks_ago_utc = now_utc - datetime.timedelta(weeks=2)

        # Iterate through all auth users
        for user in auth.list_users().iterate_all():
            status = 'active'

            # FIXED: Access timestamps through user_metadata
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

            # Status logic
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

        # 3. Fetch all user data from FIRESTORE
        firestore_users = {}
        users_ref = db.collection('users')
        for doc in users_ref.stream():
            firestore_users[doc.id] = doc.to_dict()

        # 4. Combine and FILTER the data
        combined_users = []
        for uid, auth_data in auth_users.items():
            profile_data = firestore_users.get(uid)

            if profile_data:
                user_role = profile_data.get('role', 'Traveler')

                # Filter based on caller role
                if caller_role.lower() == 'admin':
                    # Admin can only see Travelers
                    if user_role.lower() != 'traveler':
                        continue

                # Superadmin sees everyone (no filtering)

                combined_users.append({
                    'id': uid,
                    'fullName': f"{profile_data.get('firstName', '')} {profile_data.get('lastName', '')}".strip() or 'N/A',
                    'email': auth_data['email'],
                    'status': auth_data['status'],
                    'role': user_role  # Send original casing from Firestore
                })
            else:
                # Orphaned Auth users - only superadmin sees these
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
        import traceback
        traceback.print_exc() 
        return jsonify({"status": "error", "message": f"Internal server error: {str(e)}"}), 500


@app.route('/api/admin/dashboard-stats', methods=['GET'])
def get_dashboard_stats():
    if db is None:
        return jsonify({"status": "error", "message": "Server configuration error."}), 500

    try:
        # 1. Verify the CALLER is an Admin
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

        # --- 2. Get Time Period Filter ---
        period = request.args.get('period', 'week') # Default to 'week'
        start_date_utc = get_start_date(period)
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        # --- 3. Calculate Stats ---
        stats = {}
        users_ref = db.collection('users')
        all_firestore_users = list(users_ref.stream())
        
        # A. Total Users (Always total, not period-based)
        stats["totalUsers"] = len(all_firestore_users)
        
        # B. New Registrations (Based on period)
        # This query REQUIRES a Firestore Index on 'createdAt'
        new_users_query = users_ref.where('createdAt', '>=', start_date_utc).order_by('createdAt').stream()
        
        # Process registrations into daily counts for the chart
        registrations_by_day = {} # Key: 'YYYY-MM-DD', Value: count
        
        # Pre-fill dictionary with 0s for the period
        current_date = start_date_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        while current_date <= now_utc:
            date_str = current_date.strftime('%Y-%m-%d')
            registrations_by_day[date_str] = 0
            current_date += datetime.timedelta(days=1)
            
        total_new_registrations = 0
        for user_doc in new_users_query:
            created_at = user_doc.to_dict().get('createdAt')
            if created_at:
                # Convert Firestore Timestamp to datetime string
                date_str = created_at.strftime('%Y-%m-%d')
                if date_str in registrations_by_day:
                    registrations_by_day[date_str] += 1
                total_new_registrations += 1

        stats["newRegistrations"] = total_new_registrations # For the number card
        stats["registrationsOverTime"] = registrations_by_day # For the chart

        # C. Active Logins (Always last 2 weeks, not period-based)
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

        # D. Get Top Destinations (Always all-time, not period-based)
        destination_counts = {}
        for user_doc in all_firestore_users:
            itineraries_ref = user_doc.reference.collection('savedItineraries')
            # You could add a .where('createdAt', '>=', start_date_utc) here too if needed
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
        
        # --- IMPORTANT: Check for Firestore Index Error ---
        error_message = str(e)
        if "query requires an index" in error_message:
            # Extract the index creation URL from the error message
            try:
                index_url = error_message.split("You can create it here: ")[1]
                print(f"--- MISSING INDEX --- \nCreate the required Firestore index here:\n{index_url}\n")
                return jsonify({"status": "error", "message": "Database query failed: A required index is missing. Check backend logs."}), 500
            except:
                 pass # Fallback to generic error
        
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500
    

# ===== HOTEL ROUTES =====
@app.route('/api/hotels/search', methods=['POST'])
def search_hotels():
    """Search hotels by city name"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['cityName', 'checkInDate', 'checkOutDate']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Search hotels using the correct method name
        results = amadeus_service.search_hotels_by_city(  # ← CHANGED
            city_name=data['cityName'],
            check_in=data['checkInDate'],
            check_out=data['checkOutDate'],
            adults=data.get('adults', 2),
            rooms=data.get('roomQuantity', 1)
        )
        
        return jsonify(results), 200
        
    except Exception as e:
        app.logger.error(f"Hotel search error: {str(e)}")
        return jsonify({
            'error': 'Failed to search hotels',
            'message': str(e)
        }), 500


# ===== FLIGHT ROUTES =====
@app.route('/api/flights/search', methods=['POST'])
def search_flights():
    """Search for flights"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['origin', 'destination', 'departureDate']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Search flights
        results = amadeus_service.search_flights(
            origin=data['origin'],
            destination=data['destination'],
            departure_date=data['departureDate'],
            adults=data.get('adults', 1),
            return_date=data.get('returnDate'),
            currency=data.get('currency', 'MYR')
        )
        
        return jsonify(results), 200
        
    except Exception as e:
        app.logger.error(f"Flight search error: {str(e)}")
        return jsonify({
            'error': 'Failed to search flights',
            'message': str(e)
        }), 500


# --- Run the App ---
if __name__ == '__main__':
    # Now you can run this file directly from the 'backend' folder
    app.run(port=5000, debug=True)