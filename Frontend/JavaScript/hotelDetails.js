import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const hotelKey = urlParams.get('hotel_key');
const checkIn = urlParams.get('chk_in');
const checkOut = urlParams.get('chk_out');
const hotelName = urlParams.get('name');
const hotelImage = urlParams.get('image');
const hotelRating = urlParams.get('rating');
const hotelReviews = urlParams.get('reviews');
const hotelLocation = urlParams.get('location');
const hotelMentions = urlParams.get('mentions');
const searchCity = urlParams.get('search_city');
const rooms = urlParams.get('rooms');
const adults = urlParams.get('adults');
const childrens = urlParams.get('childrens');



// ===== PROFILE UI =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');


    if (!profileNameElement || !profileAvatarElement || !profileDropdown) return;


    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        profileNameElement.textContent = `${firstName} ${lastName}`.trim() || 'User';


        profileAvatarElement.innerHTML = '';
        const photoURL = userData.profilePhotoURL;


        if (photoURL) {
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = `${firstName}'s profile picture`;
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
            profileAvatarElement.appendChild(img);
        } else {
            const firstInitial = firstName ? firstName[0].toUpperCase() : '';
            const lastInitial = lastName ? lastName[0].toUpperCase() : '';
            profileAvatarElement.textContent = `${firstInitial}${lastInitial}` || 'U';
        }
        profileDropdown.style.display = 'flex';
    } else {
        profileDropdown.style.display = 'none';
    }
}


// ===== LOAD HOTEL DETAILS =====
async function loadHotelDetails() {
    try {
        // Display basic info from URL params
        displayBasicInfo();


        // ✅ Try to find hotel and load rooms from Hotels.com
        if (hotelName && searchCity) {
            console.log('✓ Have hotel name and search city - searching Hotels.com');
            await searchAndLoadRooms();
        } else if (hotelName) {
            console.log('⚠️ Have hotel name but no search city - trying anyway');
            await searchAndLoadRooms();
        } else {
            console.log('❌ Missing hotel name - showing no rooms available');
            displayNoRoomsAvailable();
        }


        hideLoading();

        // ✅ LOAD MAP FOR THIS HOTEL (NEW!)
        if (hotelLocation) {
            console.log('🗺️ Initializing map...');
            initializeHotelMap();
        } else {
            console.warn('⚠️ No hotel location - skipping map');
        }


    } catch (error) {
        console.error('Error loading hotel details:', error);
        showToast('Failed to load hotel details', true);
        hideLoading();
    }
}


// ===== CHECK AND UPDATE FAVORITE BUTTON =====
async function checkAndUpdateFavoriteButton() {
    const user = auth.currentUser;
    if (!user || !hotelKey) {
        console.log('User not logged in or no hotel key');
        return;
    }


    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");


        const favoriteRef = doc(db, 'users', user.uid, 'favorites', hotelKey);
        const favoriteSnap = await getDoc(favoriteRef);


        const favBtn = document.getElementById('favoriteBtnLarge');
        if (favBtn) {
            if (favoriteSnap.exists()) {
                console.log('Hotel is favorited!');
                favBtn.classList.add('favorited');
                favBtn.querySelector('i').style.color = 'red';
            } else {
                console.log('Hotel is NOT favorited');
                favBtn.classList.remove('favorited');
                favBtn.querySelector('i').style.color = '#ccc';
            }
        }
    } catch (error) {
        console.error('Error checking favorite status:', error);
    }
}


// ===== TOGGLE FAVORITE =====
async function toggleFavorite() {
    const user = auth.currentUser;
    if (!user) {
        showToast('Please log in to save favorites', true);
        return;
    }

    if (!hotelKey) {
        showToast('Hotel information not available', true);
        return;
    }

    try {
        const { doc, getDoc, setDoc, deleteDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const favoriteRef = doc(db, 'users', user.uid, 'favorites', hotelKey);
        const favoriteSnap = await getDoc(favoriteRef);
        const favBtn = document.getElementById('favoriteBtnLarge');
        if (favoriteSnap.exists()) {
            // Remove from favorites
            await deleteDoc(favoriteRef);
            showToast('Removed from favorites');

            if (favBtn) {
                favBtn.classList.remove('favorited');
                favBtn.querySelector('i').style.color = '#ccc';
            }
        } else {
            // Add to favorites
            await setDoc(favoriteRef, {
                hotelId: hotelKey,
                hotelName: decodeURIComponent(hotelName || 'Unknown Hotel'),
                image: decodeURIComponent(hotelImage || ''),
                location: decodeURIComponent(hotelLocation || 'Unknown'),
                rating: parseFloat(hotelRating || 0),
                reviewCount: parseInt(hotelReviews || 0),
                mentions: hotelMentions ? decodeURIComponent(hotelMentions).split(',') : [],
                savedAt: serverTimestamp()
            });

            showToast('Added to favorites', false);

            if (favBtn) {
                favBtn.classList.add('favorited');
                favBtn.querySelector('i').style.color = 'red';
            }
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        showToast('Failed to update favorites', true);
    }
}

// ===== DISPLAY BASIC INFO =====
function displayBasicInfo() {
    const heroSection = document.getElementById('heroSection');
    const hotelNameEl = document.getElementById('hotelName');
    const hotelImageEl = document.getElementById('hotelImage');
    const ratingSection = document.getElementById('ratingSection');
    const locationSection = document.getElementById('hotelLocation');
    const mentionsSection = document.getElementById('mentionsSection');
    const tripadvisorLink = document.getElementById('tripadvisorLink');

    // Set hotel name
    if (hotelName) {
        hotelNameEl.textContent = decodeURIComponent(hotelName);
        document.title = `${decodeURIComponent(hotelName)} - Travel.Co`;
    }

    // Set hotel image
    if (hotelImage) {
        hotelImageEl.src = decodeURIComponent(hotelImage);
        hotelImageEl.alt = decodeURIComponent(hotelName || 'Hotel');
    }

    // Set rating
    if (hotelRating && hotelReviews) {
        const rating = parseFloat(hotelRating);
        const reviews = parseInt(hotelReviews);
        const ratingValue = Math.round(rating);

        ratingSection.innerHTML = `
            <div class="rating-circles">
                <span class="rating-number">${rating}</span>
                <div class="circles">
                    ${Array(5).fill(0).map((_, i) =>
            `<div class="circle ${i < ratingValue ? 'filled' : ''}"></div>`
        ).join('')}
                </div>
                <span class="review-count">(${reviews.toLocaleString()} reviews)</span>
            </div>
        `;
    }

    // Set location
    if (hotelLocation) {
        locationSection.textContent = decodeURIComponent(hotelLocation);
    }

    // Set mentions
    if (hotelMentions) {
        const mentions = decodeURIComponent(hotelMentions).split(',');
        mentionsSection.innerHTML = mentions.map(mention =>
            `<span class="mention-tag">${mention.trim()}</span>`
        ).join('');
    }

    heroSection.style.display = 'block';
}

// ===== SEARCH HOTEL AND LOAD ROOMS =====
async function searchAndLoadRooms() {
    try {
        const hotelNameDecoded = decodeURIComponent(hotelName);
        const searchCityDecoded = searchCity ? decodeURIComponent(searchCity) : '';
        console.log('🔍 Step 1/2: Finding hotel in Hotels.com...');
        console.log('   Hotel:', hotelNameDecoded);
        console.log('   Location:', searchCityDecoded);

        // ✅ REQUEST 1: Search hotel by name (v2 Regions)
        const searchUrl = `http://localhost:5000/api/hotels/search-by-name?hotel_name=${encodeURIComponent(hotelNameDecoded)}&location=${encodeURIComponent(searchCityDecoded)}`;
        console.log('Calling:', searchUrl);

        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
            const errorData = await searchResponse.json();
            throw new Error(errorData.error || 'Hotel not found in Hotels.com database');
        }

        const searchResult = await searchResponse.json();

        if (!searchResult.success || !searchResult.hotel_id) {
            throw new Error('Could not find hotel ID');
        }

        const hotelsComHotelId = searchResult.hotel_id;
        console.log('✓ Found hotel:', searchResult.hotel_name);
        console.log('   Hotels.com ID:', hotelsComHotelId);

        console.log('🔍 Step 2/2: Loading rooms...');

        // ✅ REQUEST 2: Get rooms with Hotels.com ID
        await fetchHotelRooms(hotelsComHotelId);
        console.log('✅ Successfully loaded real rooms!');

    } catch (error) {
        console.error('❌ Search failed:', error.message);
        console.log('→ Showing no rooms available message');
        displayNoRoomsAvailable();
    }
}

// ===== FETCH HOTEL ROOMS (HOTELS.COM) =====
async function fetchHotelRooms(hotelId) {
    try {
        const checkin = checkIn || '2025-11-01';
        const checkout = checkOut || '2025-11-05';
        console.log('📡 Fetching hotel rooms from Hotels.com...');
        console.log('   Hotel ID:', hotelId);
        console.log('   Dates:', checkin, 'to', checkout);

        const response = await fetch(
            `http://localhost:5000/api/hotels/rooms?hotel_id=${hotelId}&checkin=${checkin}&checkout=${checkout}&adults=2`
        );

        if (!response.ok) {
            throw new Error('Failed to load rooms');
        }

        const result = await response.json();

        if (result.success && result.data) {
            console.log('✓ Rooms data received:', result.data);
            displayRealRooms(result.data);
            return result.data;
        } else {
            throw new Error('No rooms data received');
        }

    } catch (error) {
        console.error('❌ Error fetching rooms:', error);
        displayNoRoomsAvailable();
        return null;
    }
}


// ===== DISPLAY REAL ROOMS FROM API =====
function displayRealRooms(roomsData) {
    const roomsGrid = document.getElementById('roomsGrid');
    const roomsSection = document.getElementById('availableRoomsSection');
    if (!roomsGrid) return;

    roomsGrid.innerHTML = '';
    console.log('📊 Full API response:', roomsData);

    // ✅ Try different possible data structures
    let rooms = [];

    // v2 offers format
    if (roomsData.categorizedListings && roomsData.categorizedListings.length > 0) {
        console.log('✓ Found categorizedListings');
        rooms = roomsData.categorizedListings;
    }
    // v3 format
    else if (roomsData.units && roomsData.units.length > 0) {
        console.log('✓ Found units');
        rooms = roomsData.units;
    }
    // Alternative format
    else if (roomsData.rooms && roomsData.rooms.length > 0) {
        console.log('✓ Found rooms');
        rooms = roomsData.rooms;
    }
    // Check if roomsData itself is an array
    else if (Array.isArray(roomsData)) {
        console.log('✓ Data is array');
        rooms = roomsData;
    }

    if (rooms.length === 0) {
        console.log('⚠️ No rooms available - showing empty state');
        displayNoRoomsAvailable();
        return;
    }

    console.log(`✓ Displaying ${rooms.length} rooms`);

    // Process each room category
    rooms.forEach((category, index) => {
        console.log(`Room ${index + 1}:`, category);

        // Extract room data from category
        const roomCard = createRoomCardFromCategory(category);

        // ✅ Only display if price was successfully extracted
        if (roomCard && roomCard.priceFound) {
            roomsGrid.appendChild(roomCard);
        } else if (!roomCard.priceFound) {
            console.warn(`⚠️ Skipping room ${index + 1} - price not found`);
        }
    });

    // Show the section
    roomsSection.style.display = 'block';
}

// ===== DISPLAY NO ROOMS AVAILABLE =====
function displayNoRoomsAvailable() {
    const roomsGrid = document.getElementById('roomsGrid');
    const roomsSection = document.getElementById('availableRoomsSection');

    if (!roomsGrid || !roomsSection) return;

    roomsGrid.innerHTML = '';

    // Create empty state container
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
        padding: 60px 40px;
        text-align: center;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border-radius: 12px;
        border: 2px dashed #dee2e6;
    `;

    emptyState.innerHTML = `
        <div style="margin-bottom: 20px;">
            <i class="fa-solid fa-door-open" style="font-size: 48px; color: #adb5bd;"></i>
        </div>
        <h3 style="color: #495057; margin-bottom: 8px; font-size: 20px;">No Rooms Available</h3>
        <p style="color: #6c757d; margin-bottom: 24px; font-size: 15px;">
            Unfortunately, there are no rooms available for the selected dates.
        </p>
        <p style="color: #6c757d; font-size: 14px; margin: 0;">
            Try adjusting your check-in and check-out dates or contact the hotel directly.
        </p>
    `;

    roomsGrid.appendChild(emptyState);
    roomsSection.style.display = 'block';
}

// ===== CREATE ROOM CARD FROM CATEGORY =====
function createRoomCardFromCategory(category) {
    const card = document.createElement('div');
    card.className = 'room-card';

    // ROOM NAME
    const roomName = category.header?.text || 'Standard Room';

    // FEATURES/AMENITIES - At category level!
    let features = [];
    if (category.features && Array.isArray(category.features)) {
        features = category.features.map(f => f.text).slice(0, 6);
    }

    if (features.length === 0) {
        features = ['Free WiFi', 'Air Conditioning', 'TV'];
    }

    // GUESTS & BED - Extract from features
    let maxGuests = 2;
    let bedText = 'Queen Bed';

    for (const feature of category.features || []) {
        const text = feature.text || '';
        if (text.includes('Sleeps')) {
            maxGuests = parseInt(text.match(/\d+/)?.[0] || '2');
        }
        if (text.includes('Bed') || text.includes('bed')) {
            bedText = text;
        }
    }

    let roomImage = 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400';

    const gallery = category.primarySelections?.[0]?.propertyUnit?.unitGallery?.gallery;
    if (gallery && gallery.length > 0) {
        roomImage = gallery[0].image?.url || roomImage;
    }

    // PRICE - Complex nested structure with better debugging
    let roomPrice = 350;
    let currency = 'RM';
    let priceFound = false;

    const priceDetails = category.primarySelections?.[0]?.propertyUnit?.ratePlans?.[0]?.priceDetails;

    console.log('🔍 Price extraction debug:');
    console.log('   priceDetails:', priceDetails);

    if (priceDetails && priceDetails.length > 0) {
        const price = priceDetails[0].price;
        console.log('   price object:', price);

        // Try displayMessages path (most reliable)
        if (price.displayMessages && price.displayMessages.length > 1) {
            console.log('   ✓ Using displayMessages');
            const lineItems = price.displayMessages[1].lineItems;
            for (const item of lineItems) {
                if (item.role === 'LEAD' && item.price) {
                    const formatted = item.price.formatted; // "$1,151 total"
                    console.log('   formatted price:', formatted);


                    const usdPrice = parseFloat(formatted.replace(/[$,]/g, '').split(' ')[0]) || 350;
                    roomPrice = Math.round(usdPrice * 4.70);
                    currency = 'RM';
                    priceFound = true;
                    console.log('   ✓ Extracted price:', roomPrice);
                    break;
                }
            }
        }

        // Try options path (alternative)
        if (!priceFound && price.options && price.options.length > 0) {
            console.log('   ✓ Using options path');
            const displayPrice = price.options[0].formattedDisplayPrice; // "$1,151"
            console.log('   displayPrice:', displayPrice);


            const usdPrice = parseFloat(displayPrice.replace(/[$,]/g, '')) || 350;
            roomPrice = Math.round(usdPrice * 4.70);
            currency = 'RM';
            priceFound = true;
            console.log('   ✓ Extracted price:', roomPrice);
        }
    }

    if (!priceFound) {
        console.warn('   ❌ Could not extract price - using fallback 350');
    }

    // Description
    const roomDescription = 'Comfortable room with modern amenities';

    card.innerHTML = `
        <div class="room-image-container">
            <img src="${roomImage}" alt="${roomName}" class="room-image" onerror="this.src='https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400'">
        </div>
        <div class="room-info">
            <div class="room-header">
                <div class="room-type-name">${roomName}</div>
                <div class="room-capacity">
                <span class="capacity-item"><i class="fa-solid fa-user"></i> ${maxGuests} guests</span>
                <span class="capacity-item"><i class="fa-solid fa-bed"></i> ${bedText}</span>
                </div>
            </div>
            <div class="room-type-description">${roomDescription}</div>
            <div class="room-type-features">
                ${features.map(feature =>
        `<span class="room-feature-tag">${feature}</span>`
    ).join('')}
            </div>
        </div>
        <div class="room-booking">
            <div class="room-price-container">
                <div class="room-price">${currency} ${Math.round(roomPrice)}</div>
                <div class="room-price-label">per night</div>
            </div>
            <button class="select-room-btn" onclick='selectRoom(${JSON.stringify({
        name: roomName,
        price: roomPrice,
        image: roomImage,
        guests: maxGuests,
        bed: bedText,
        amenities: features
    })})'>
                Book Now
            </button>
        </div>
    `;

    card.priceFound = priceFound;

    return card;
}

// ===== CREATE ROOM CARD FROM API DATA =====
function createRoomCardFromAPI(room) {
    const card = document.createElement('div');
    card.className = 'room-card';


    const roomName = room.name || room.roomType || 'Standard Room';
    const roomDescription = room.description || 'Comfortable room with modern amenities';
    const roomPrice = room.price?.value || room.rate?.nightly || room.totalPrice || 350;
    const currency = room.price?.currency || room.currency || 'RM';
    const features = room.amenities || room.features || ['Free WiFi', 'Air Conditioning', 'TV'];
    const roomImage = room.images?.[0] || room.image || 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400';
    const maxGuests = room.maxOccupancy || room.maxGuests || 2;
    const bedType = room.bedTypes?.[0] || room.bedType || 'Queen Bed';


    card.innerHTML = `
        <div class="room-image-container">
            <img src="${roomImage}" alt="${roomName}" class="room-image" onerror="this.src='https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400'">
        </div>
        <div class="room-info">
            <div class="room-header">
                <div class="room-type-name">${roomName}</div>
                <div class="room-capacity">
                    <span class="capacity-item"><i class="fa-solid fa-user"></i> ${maxGuests} guests</span>
                    <span class="capacity-item"><i class="fa-solid fa-bed"></i> ${bedType}</span>
                </div>
            </div>
            <div class="room-type-description">${roomDescription}</div>
            <div class="room-type-features">
                ${features.slice(0, 6).map(feature =>
        `<span class="room-feature-tag">${feature}</span>`
    ).join('')}
            </div>
        </div>
        <div class="room-booking">
            <div class="room-price-container">
                <div class="room-price">${currency} ${Math.round(roomPrice)}</div>
                <div class="room-price-label">per night</div>
            </div>
            <button class="select-room-btn" onclick='selectRoom(${JSON.stringify({
        name: roomName,
        price: roomPrice,
        image: roomImage,
        guests: maxGuests,
        bed: bedType,
        amenities: features
    })})'>
    Book Now
</button>


        </div>
    `;


    return card;
}


// ===== SELECT ROOM FUNCTION =====
window.selectRoom = function (roomData) {
    console.log('Room selected:', roomData);


    // Calculate nights
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));


    // Store selection with all necessary data
    sessionStorage.setItem('selectedRoom', JSON.stringify({
        // Room details
        roomName: roomData.name,
        roomPrice: roomData.price,
        roomImage: roomData.image,
        roomGuests: roomData.guests || 2,
        roomBed: roomData.bed || '1 King Bed',
        roomAmenities: roomData.amenities || ['Free WiFi', 'Air Conditioning', 'TV'],

        // Hotel details
        hotelKey: hotelKey,
        hotelName: decodeURIComponent(hotelName || 'Hotel'),
        hotelImage: decodeURIComponent(hotelImage || ''),
        hotelRating: parseFloat(hotelRating || 0),
        hotelReviews: parseInt(hotelReviews || 0),
        hotelLocation: decodeURIComponent(hotelLocation || ''),

        // Booking details
        checkIn: checkIn,
        checkOut: checkOut,
        nights: nights,

        // ✅ GUEST INFO (ADD THESE 4 LINES)
        rooms: parseInt(rooms || '1'),
        adults: parseInt(adults || '2'),
        children: parseInt(childrens || '0'),  // Note: using 'childrens' from your URL param
        totalGuests: parseInt(adults || '2') + parseInt(childrens || '0')
    }));


    // ✅ Redirect to checkout page
    window.location.href = 'bookingCheckout.html';
};


// ===== HELPER FUNCTIONS =====
function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
}


// ===== LOAD HOTEL MAP WITH EMBED API (DYNAMIC) =====
async function initializeHotelMap() {
    const mapSection = document.getElementById('locationMapSection');
    const mapEmbed = document.getElementById('hotelMapEmbed');
    const directionsBtn = document.getElementById('getDirectionsBtn');

    if (!mapSection || !mapEmbed) {
        console.warn('⚠️ Map elements not found');
        return;
    }

    try {
        const locationString = decodeURIComponent(hotelLocation || '');
        const hotelNameString = decodeURIComponent(hotelName || '');

        console.log('🗺️ Loading map for:', hotelNameString);

        // ✅ FETCH API KEY FROM BACKEND
        console.log('🔑 Fetching API key from backend...');
        const keyResponse = await fetch('http://localhost:5000/api/config/google-maps-key');

        if (!keyResponse.ok) {
            console.error('❌ Backend responded with:', keyResponse.status);
            throw new Error(`Failed to fetch API key - Status: ${keyResponse.status}`);
        }

        const keyData = await keyResponse.json();
        console.log('📦 Backend response:', keyData);

        if (!keyData.success || !keyData.key) {
            throw new Error('API key not available from backend');
        }

        const apiKey = keyData.key;
        console.log('✅ API key retrieved:', apiKey.substring(0, 20) + '...');

        // ✅ BUILD EMBED URL
        const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(hotelNameString + ', ' + locationString)}&zoom=15`;

        console.log('🔗 Embed URL set');
        mapEmbed.src = embedUrl;
        mapSection.style.display = 'block';

        // ✅ Set directions link only
        if (directionsBtn) {
            const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotelNameString + ', ' + locationString)}`;
            directionsBtn.href = directionsUrl;
        }

        console.log('✅ Map loaded successfully!');

    } catch (error) {
        console.error('❌ Error loading map:', error.message);
        mapSection.style.display = 'none';
    }
}

// ===== AUTH STATE =====
observeAuthState(async (user) => {
    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);


            if (docSnap.exists()) {
                const userData = docSnap.data();
                if (userData.profilePhotoURL) {
                    userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                }
                updateUserProfileUI(userData);


                // Check favorite status after user is authenticated
                await checkAndUpdateFavoriteButton();
            } else {
                showToast("Error: Profile not found", true);
                await handleLogout();
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        }
    } else {
        window.location.href = 'login.html';
    }
});


// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    const profileTrigger = document.querySelector('.profile-trigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');


    if (profileTrigger) {
        profileTrigger.addEventListener('click', () => {
            profileDropdown?.classList.toggle('active');
        });
    }


    document.addEventListener('click', (event) => {
        if (profileDropdown && !profileDropdown.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });


    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }


    // Favorite button click
    const favBtn = document.getElementById('favoriteBtnLarge');
    if (favBtn) {
        favBtn.addEventListener('click', toggleFavorite);
    }

    // Back to Search button - preserve search state
    const backBtn = document.getElementById('backToSearchBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            sessionStorage.setItem('lastSearch', JSON.stringify({
                destination: decodeURIComponent(hotelLocation || ''),
                checkIn: checkIn,
                checkOut: checkOut,
                rooms: parseInt(rooms || '1'),
                adults: parseInt(adults || '2'),
                children: parseInt(childrens || '0')
            }));
            window.location.href = 'booking.html';
        });
    }

    // Load hotel details
    if (hotelKey) {
        loadHotelDetails();
    } else {
        showToast('Hotel information not found', true);
        setTimeout(() => {
            window.location.href = 'booking.html';
        }, 2000);
    }
});
