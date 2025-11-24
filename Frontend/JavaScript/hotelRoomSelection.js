import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

// ===== CHECK IF PACKAGE BOOKING =====
const packageData = JSON.parse(sessionStorage.getItem('travelPackage'));
const isPackageBooking = packageData?.packageInfo?.isPackageBooking || false;

console.log('🔍 Checking booking type...');
console.log('Package data:', packageData);
console.log('Is package booking:', isPackageBooking);

// ===== GET DATA SOURCE =====
let hotelData, flightData, checkIn, checkOut, hotelName, hotelImage, hotelRating, hotelReviews, hotelLocation, searchCity, rooms, adults, childrens;

// ✅ NEW: Global passenger counter
let currentPassengerCount = 1;
let selectedRoomPrice = null;

if (isPackageBooking && packageData) {
    console.log('✅ PACKAGE BOOKING MODE');
    
    // Load from package data
    hotelData = packageData.hotel;
    flightData = packageData.flight;
    
    hotelName = hotelData.name;
    hotelImage = hotelData.image;
    hotelRating = hotelData.rating;
    hotelLocation = hotelData.address;
    checkIn = hotelData.checkIn;
    checkOut = hotelData.checkOut;
    rooms = 1;
    adults = hotelData.guests || 1;
    childrens = 0;
    searchCity = packageData.packageInfo.city;
    
    // Initialize passenger count from flight data
    currentPassengerCount = flightData.passengers || 1;
    
    console.log('Flight:', flightData);
    console.log('Hotel:', hotelData);
} else {
    console.log('✅ REGULAR BOOKING MODE');
    
    // Load from URL params (original flow)
    const urlParams = new URLSearchParams(window.location.search);
    hotelName = urlParams.get('name');
    hotelImage = urlParams.get('image');
    hotelRating = urlParams.get('rating');
    hotelReviews = urlParams.get('reviews');
    hotelLocation = urlParams.get('location');
    searchCity = urlParams.get('search_city');
    checkIn = urlParams.get('chk_in');
    checkOut = urlParams.get('chk_out');
    rooms = urlParams.get('rooms');
    adults = urlParams.get('adults');
    childrens = urlParams.get('childrens');
}

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

// ===== DISPLAY FLIGHT SUMMARY (CORRECTED FOR YOUR DATA STRUCTURE) =====
function displayFlightSummary() {
    if (!isPackageBooking || !flightData) return;
    
    const flightSummarySection = document.getElementById('packageFlightSummary');
    const flightSummaryContent = document.getElementById('flightSummaryContent');
    
    if (!flightSummarySection || !flightSummaryContent) return;
    
    const basePricePerPerson = (flightData.price?.total || 0) / (flightData.passengers || 1);
    const currency = flightData.price?.currency || 'MYR';
    const flightPrice = basePricePerPerson * currentPassengerCount;
    const pricePerPerson = basePricePerPerson.toFixed(2);
    
    // ✅ Determine trip type based on hasReturn property
    const hasReturnFlight = flightData.hasReturn === true && flightData.returnFlight;
    const displayTripType = hasReturnFlight ? 'Round-trip' : 'One-way';
    
    // ✅ Extract return flight details
    const returnDeparture = flightData.returnFlight?.departure || 'N/A';
    const returnArrival = flightData.returnFlight?.arrival || 'N/A';
    const returnDuration = flightData.returnFlight?.duration || flightData.duration || 'N/A';
    const returnDate = flightData.returnDate || flightData.arrivalDate || flightData.departureDate;
    
    flightSummaryContent.innerHTML = `
        <!-- Outbound Flight -->
        <div class="flight-leg">
            <div class="flight-leg-header">
                <i class="fa fa-plane-departure"></i>
                <span>Outbound Flight</span>
            </div>
            <div class="flight-route-horizontal">
                <div class="flight-segment-horizontal">
                    <div class="airport-code-small">${flightData.fromAirport}</div>
                    <div class="flight-time-small">${flightData.departure}</div>
                    <div class="flight-date-small">${flightData.departureDate}</div>
                </div>
                
                <div class="flight-path-horizontal">
                    <div class="flight-line"></div>
                    <i class="fa fa-plane"></i>
                    <div class="flight-duration-badge">${flightData.duration}</div>
                </div>
                
                <div class="flight-segment-horizontal">
                    <div class="airport-code-small">${flightData.toAirport}</div>
                    <div class="flight-time-small">${flightData.arrival}</div>
                    <div class="flight-date-small">${flightData.arrivalDate || flightData.departureDate}</div>
                </div>
            </div>
        </div>

        <!-- Return Flight (if hasReturn is true) -->
        ${hasReturnFlight ? `
        <div class="flight-leg">
            <div class="flight-leg-header">
                <i class="fa fa-plane-arrival"></i>
                <span>Return Flight</span>
            </div>
            <div class="flight-route-horizontal">
                <div class="flight-segment-horizontal">
                    <div class="airport-code-small">${flightData.toAirport}</div>
                    <div class="flight-time-small">${returnDeparture}</div>
                    <div class="flight-date-small">${returnDate}</div>
                </div>
                
                <div class="flight-path-horizontal">
                    <div class="flight-line"></div>
                    <i class="fa fa-plane" style="transform: scaleX(-1);"></i>
                    <div class="flight-duration-badge">${returnDuration}</div>
                </div>
                
                <div class="flight-segment-horizontal">
                    <div class="airport-code-small">${flightData.fromAirport}</div>
                    <div class="flight-time-small">${returnArrival}</div>
                    <div class="flight-date-small">${returnDate}</div>
                </div>
            </div>
        </div>
        ` : ''}
        
        <div class="flight-details-summary">
            <!-- ✅ CLASS on the left -->
            <div class="flight-detail-item">
                <i class="fa fa-chair"></i>
                <span>${flightData.class || 'ECONOMY'}</span>
            </div>
            <!-- ✅ TRIP TYPE next to class -->
            <div class="flight-detail-item">
                <i class="fa fa-exchange-alt"></i>
                <span>${displayTripType}</span>
            </div>
            <!-- ✅ PRICE on the right -->
            <div class="flight-price-breakdown">
                <div class="price-per-person">${currency} ${pricePerPerson} × <span id="flightPassengerMultiplier">${currentPassengerCount}</span></div>
                <div class="flight-price-total" id="flightPriceDisplay">${currency} ${parseFloat(flightPrice).toFixed(2)}</div>
            </div>
        </div>
    `;
    
    // ✅ Show passenger editor section
    const passengerEditorSection = document.getElementById('passengerEditorSection');
    if (passengerEditorSection) {
        passengerEditorSection.style.display = 'block';
        initializePassengerEditor(basePricePerPerson, currency);
    }
    
    flightSummarySection.style.display = 'block';
    console.log('✅ Flight summary displayed');
}

// ===== INITIALIZE PASSENGER EDITOR =====
function initializePassengerEditor(basePricePerPerson, currency) {
    const passengerCount = document.getElementById('passengerCount');
    const pricePerPersonValue = document.getElementById('pricePerPersonValue');
    const decreaseBtn = document.getElementById('decreasePassengers');
    const increaseBtn = document.getElementById('increasePassengers');
    
    if (!passengerCount || !pricePerPersonValue || !decreaseBtn || !increaseBtn) return;
    
    // Set initial values
    passengerCount.textContent = currentPassengerCount;
    pricePerPersonValue.textContent = `${currency} ${basePricePerPerson.toFixed(2)}`;
    
    // Update button states
    updatePassengerButtons();
    
    // Decrease button handler
    decreaseBtn.addEventListener('click', () => {
        if (currentPassengerCount > 1) {
            currentPassengerCount--;
            updatePassengerDisplay(basePricePerPerson, currency);
            updateFlightPriceDisplay(basePricePerPerson, currency);
            updatePackageSummary(selectedRoomPrice);
        }
    });
    
    // Increase button handler
    increaseBtn.addEventListener('click', () => {
        if (currentPassengerCount < 9) { // Max 9 passengers
            currentPassengerCount++;
            updatePassengerDisplay(basePricePerPerson, currency);
            updateFlightPriceDisplay(basePricePerPerson, currency);
            updatePackageSummary(selectedRoomPrice);
        }
    });
}

// ===== UPDATE PASSENGER DISPLAY =====
function updatePassengerDisplay(basePricePerPerson, currency) {
    const passengerCount = document.getElementById('passengerCount');
    if (passengerCount) {
        passengerCount.textContent = currentPassengerCount;
    }
    
    updatePassengerButtons();
}

// ===== UPDATE PASSENGER BUTTONS =====
function updatePassengerButtons() {
    const decreaseBtn = document.getElementById('decreasePassengers');
    const increaseBtn = document.getElementById('increasePassengers');
    
    if (decreaseBtn) {
        decreaseBtn.disabled = currentPassengerCount <= 1;
    }
    
    if (increaseBtn) {
        increaseBtn.disabled = currentPassengerCount >= 9;
    }
}

// ===== UPDATE FLIGHT PRICE DISPLAY =====
function updateFlightPriceDisplay(basePricePerPerson, currency) {
    const flightPassengerCount = document.getElementById('flightPassengerCount');
    const flightPassengerMultiplier = document.getElementById('flightPassengerMultiplier');
    const flightPriceDisplay = document.getElementById('flightPriceDisplay');
    
    const totalFlightPrice = basePricePerPerson * currentPassengerCount;
    
    if (flightPassengerCount) {
        flightPassengerCount.textContent = currentPassengerCount;
    }
    
    if (flightPassengerMultiplier) {
        flightPassengerMultiplier.textContent = currentPassengerCount;
    }
    
    if (flightPriceDisplay) {
        flightPriceDisplay.textContent = `${currency} ${totalFlightPrice.toFixed(2)}`;
    }
}

// ===== DISPLAY PACKAGE INFO BADGES =====
function displayPackageInfoBadges() {
    if (!isPackageBooking) return;
    
    const packageInfoBadges = document.getElementById('packageInfoBadges');
    const checkInOutDates = document.getElementById('checkInOutDates');
    const nightsCount = document.getElementById('nightsCount');
    const guestsCount = document.getElementById('guestsCount');
    
    if (!packageInfoBadges) return;
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    
    checkInOutDates.textContent = `${checkIn} to ${checkOut}`;
    nightsCount.textContent = `${nights} night(s)`;
    guestsCount.textContent = `${adults} guest(s)`;
    
    packageInfoBadges.style.display = 'flex';
    console.log('✅ Package info badges displayed');
}

// ===== UPDATE PACKAGE SUMMARY FOOTER (WITH ROOM CALCULATION) =====
function updatePackageSummary(roomPrice = null) {
    if (!isPackageBooking) return;
    
    const summaryFooter = document.getElementById('packageSummaryFooter');
    const flightPriceFooter = document.getElementById('flightPriceFooter');
    const hotelPriceFooter = document.getElementById('hotelPriceFooter');
    const totalPriceFooter = document.getElementById('totalPriceFooter');
    const proceedBtn = document.getElementById('proceedCheckoutBtn');
    const pricingNote = document.getElementById('pricingNote');
    const passengerCountSummary = document.getElementById('passengerCountSummary');
    
    if (!summaryFooter) return;
    
    // Calculate flight price based on current passenger count
    const basePricePerPerson = (flightData.price?.total || 0) / (flightData.passengers || 1);
    const totalFlightPrice = basePricePerPerson * currentPassengerCount;
    const currency = flightData.price?.currency || 'MYR';
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    
    // ✅ Calculate number of rooms needed (2 passengers = 1 room, rounded up)
    const roomsNeeded = Math.ceil(currentPassengerCount / 2);
    
    // Update passenger count in summary
    if (passengerCountSummary) {
        passengerCountSummary.textContent = currentPassengerCount;
    }
    
    flightPriceFooter.textContent = `${currency} ${totalFlightPrice.toFixed(2)}`;
    
    if (roomPrice) {
        selectedRoomPrice = roomPrice;
        
        // ✅ Calculate hotel price: price per night × nights × rooms needed
        const totalHotelPrice = roomPrice * nights * roomsNeeded;
        
        hotelPriceFooter.textContent = `${currency} ${totalHotelPrice.toFixed(2)} (${roomsNeeded} room(s) × ${nights} night(s))`;
        
        const totalPackagePrice = totalFlightPrice + totalHotelPrice;
        totalPriceFooter.textContent = `${currency} ${totalPackagePrice.toFixed(2)}`;
        
        proceedBtn.disabled = false;
    } else {
        hotelPriceFooter.textContent = 'Select room above';
        totalPriceFooter.textContent = '-';
        proceedBtn.disabled = true;
    }
    
    summaryFooter.style.display = 'block';
    if (pricingNote) pricingNote.style.display = 'flex';
}

// ===== LOAD HOTEL DETAILS =====
async function loadHotelDetails() {
    try {
        // Display basic info
        displayBasicInfo();
        
        // Display flight summary if package
        if (isPackageBooking) {
            displayFlightSummary();
            displayPackageInfoBadges();
            updatePackageSummary();
        }

        // Load rooms
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

        // Load map
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

// ===== DISPLAY BASIC INFO =====
function displayBasicInfo() {
    const heroSection = document.getElementById('heroSection');
    const hotelNameEl = document.getElementById('hotelName');
    const hotelImageEl = document.getElementById('hotelImage');
    const ratingSection = document.getElementById('ratingSection');
    const locationSection = document.getElementById('hotelLocation');

    // Set hotel name
    if (hotelName) {
        const displayName = typeof hotelName === 'string' ? hotelName : decodeURIComponent(hotelName);
        hotelNameEl.textContent = displayName;
        document.title = `${displayName} - Travel.Co`;
    }

    // Set hotel image
    if (hotelImage) {
        const displayImage = typeof hotelImage === 'string' ? hotelImage : decodeURIComponent(hotelImage);
        hotelImageEl.src = displayImage;
        hotelImageEl.alt = hotelNameEl.textContent;
    }

    // Set rating
    if (hotelRating) {
        const rating = parseFloat(hotelRating);
        const reviews = parseInt(hotelReviews || 0);
        const ratingValue = Math.round(rating);

        ratingSection.innerHTML = `
            <div class="rating-circles">
                <span class="rating-number">${rating}</span>
                <div class="circles">
                    ${Array(5).fill(0).map((_, i) =>
                        `<div class="circle ${i < ratingValue ? 'filled' : ''}"></div>`
                    ).join('')}
                </div>
                ${reviews > 0 ? `<span class="review-count">(${reviews.toLocaleString()} reviews)</span>` : ''}
            </div>
        `;
    }

    // Set location
    if (hotelLocation) {
        const displayLocation = typeof hotelLocation === 'string' ? hotelLocation : decodeURIComponent(hotelLocation);
        locationSection.textContent = displayLocation;
    }

    heroSection.style.display = 'block';
}

// ===== SEARCH HOTEL AND LOAD ROOMS =====
async function searchAndLoadRooms() {
    try {
        const hotelNameDecoded = typeof hotelName === 'string' ? hotelName : decodeURIComponent(hotelName);
        const searchCityDecoded = searchCity ? (typeof searchCity === 'string' ? searchCity : decodeURIComponent(searchCity)) : '';
        
        console.log('🔍 Step 1/2: Finding hotel in Hotels.com...');
        console.log('   Hotel:', hotelNameDecoded);
        console.log('   Location:', searchCityDecoded);

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
        await fetchHotelRooms(hotelsComHotelId);
        console.log('✅ Successfully loaded real rooms!');

    } catch (error) {
        console.error('❌ Search failed:', error.message);
        console.log('→ Showing no rooms available message');
        displayNoRoomsAvailable();
    }
}

// ===== FETCH HOTEL ROOMS =====
async function fetchHotelRooms(hotelId) {
    try {
        const checkin = checkIn || '2025-11-01';
        const checkout = checkOut || '2025-11-05';
        
        console.log('📡 Fetching hotel rooms from Hotels.com...');
        console.log('   Hotel ID:', hotelId);
        console.log('   Dates:', checkin, 'to', checkout);

        const response = await fetch(
            `http://localhost:5000/api/hotels/rooms?hotel_id=${hotelId}&checkin=${checkin}&checkout=${checkout}&adults=${adults || 2}`
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

// ===== DISPLAY REAL ROOMS =====
function displayRealRooms(roomsData) {
    const roomsGrid = document.getElementById('roomsGrid');
    const roomsSection = document.getElementById('availableRoomsSection');
    if (!roomsGrid) return;

    roomsGrid.innerHTML = '';
    console.log('📊 Full API response:', roomsData);

    let rooms = [];

    if (roomsData.categorizedListings && roomsData.categorizedListings.length > 0) {
        console.log('✓ Found categorizedListings');
        rooms = roomsData.categorizedListings;
    } else if (roomsData.units && roomsData.units.length > 0) {
        console.log('✓ Found units');
        rooms = roomsData.units;
    } else if (roomsData.rooms && roomsData.rooms.length > 0) {
        console.log('✓ Found rooms');
        rooms = roomsData.rooms;
    } else if (Array.isArray(roomsData)) {
        console.log('✓ Data is array');
        rooms = roomsData;
    }

    if (rooms.length === 0) {
        console.log('⚠️ No rooms available - showing empty state');
        displayNoRoomsAvailable();
        return;
    }

    console.log(`✓ Displaying ${rooms.length} rooms`);

    rooms.forEach((category, index) => {
        console.log(`Room ${index + 1}:`, category);
        const roomCard = createRoomCardFromCategory(category);

        if (roomCard && roomCard.priceFound) {
            roomsGrid.appendChild(roomCard);
        } else if (!roomCard.priceFound) {
            console.warn(`⚠️ Skipping room ${index + 1} - price not found`);
        }
    });

    roomsSection.style.display = 'block';
}

// ===== DISPLAY NO ROOMS AVAILABLE =====
function displayNoRoomsAvailable() {
    const roomsGrid = document.getElementById('roomsGrid');
    const roomsSection = document.getElementById('availableRoomsSection');

    if (!roomsGrid || !roomsSection) return;

    roomsGrid.innerHTML = '';

    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
        padding: 60px 40px;
        text-align: center;
        background: var(--bg-light);
        border-radius: 12px;
        border: 2px dashed var(--border-color);
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

    const roomName = category.header?.text || 'Standard Room';

    let features = [];
    if (category.features && Array.isArray(category.features)) {
        features = category.features.map(f => f.text).slice(0, 6);
    }

    if (features.length === 0) {
        features = ['Free WiFi', 'Air Conditioning', 'TV'];
    }

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

    let roomPrice = 350;
    let currency = 'RM';
    let priceFound = false;

    const priceDetails = category.primarySelections?.[0]?.propertyUnit?.ratePlans?.[0]?.priceDetails;

    console.log('🔍 Price extraction debug:');
    console.log('   priceDetails:', priceDetails);

    if (priceDetails && priceDetails.length > 0) {
        const price = priceDetails[0].price;
        console.log('   price object:', price);

        if (price.displayMessages && price.displayMessages.length > 1) {
            console.log('   ✓ Using displayMessages');
            const lineItems = price.displayMessages[1].lineItems;
            for (const item of lineItems) {
                if (item.role === 'LEAD' && item.price) {
                    const formatted = item.price.formatted;
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

        if (!priceFound && price.options && price.options.length > 0) {
            console.log('   ✓ Using options path');
            const displayPrice = price.options[0].formattedDisplayPrice;
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
                ${isPackageBooking ? 'Select Room' : 'Book Now'}
            </button>
        </div>
    `;

    card.priceFound = priceFound;

    return card;
}

// ===== SELECT ROOM FUNCTION (WITH ROOM CALCULATION) =====
window.selectRoom = function (roomData) {
    console.log('Room selected:', roomData);

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    
    // ✅ Calculate rooms needed based on passengers
    const roomsNeeded = Math.ceil(currentPassengerCount / 2);

    if (isPackageBooking) {
        // ✅ PACKAGE BOOKING: Store both flight + hotel with updated passenger count
        console.log('📦 Package booking - storing flight + hotel with', currentPassengerCount, 'passengers');
        console.log('🏨 Rooms needed:', roomsNeeded);
        
        // Calculate updated flight price
        const basePricePerPerson = (flightData.price?.total || 0) / (flightData.passengers || 1);
        const updatedFlightPrice = basePricePerPerson * currentPassengerCount;
        
        // Update flight data with new passenger count and price
        const updatedFlightData = {
            ...flightData,
            passengers: currentPassengerCount,
            price: {
                ...flightData.price,
                total: updatedFlightPrice
            }
        };
        
        // Update package summary
        updatePackageSummary(roomData.price);
        
        // ✅ Calculate total hotel price (room price × nights × rooms needed)
        const totalHotelPrice = roomData.price * nights * roomsNeeded;
        
        // Store complete package for checkout
        sessionStorage.setItem('packageCheckout', JSON.stringify({
            // Flight data with updated passengers
            flight: updatedFlightData,
            
            // Hotel data
            hotel: {
                roomName: roomData.name,
                roomPrice: roomData.price,
                roomPricePerNight: roomData.price,
                totalHotelPrice: totalHotelPrice,
                roomImage: roomData.image,
                roomGuests: roomData.guests || 2,
                roomBed: roomData.bed || '1 King Bed',
                roomAmenities: roomData.amenities || ['Free WiFi', 'Air Conditioning', 'TV'],
                hotelName: hotelName,
                hotelImage: hotelImage,
                hotelRating: parseFloat(hotelRating || 0),
                hotelLocation: hotelLocation,
                checkIn: checkIn,
                checkOut: checkOut,
                nights: nights,
                rooms: roomsNeeded, // ✅ Updated to calculated rooms
                adults: parseInt(adults || '1'),
                children: parseInt(childrens || '0'),
                totalGuests: currentPassengerCount // ✅ Using passenger count
            },
            
            // Package metadata
            packageInfo: packageData.packageInfo,
            isPackageBooking: true
        }));
        
        showToast(`Room selected! ${roomsNeeded} room(s) for ${currentPassengerCount} passenger(s)`, false);
        
    } else {
        // ✅ REGULAR BOOKING: Hotel only
        console.log('🏨 Regular booking - storing hotel only');
        
        sessionStorage.setItem('selectedRoom', JSON.stringify({
            roomName: roomData.name,
            roomPrice: roomData.price,
            roomImage: roomData.image,
            roomGuests: roomData.guests || 2,
            roomBed: roomData.bed || '1 King Bed',
            roomAmenities: roomData.amenities || ['Free WiFi', 'Air Conditioning', 'TV'],
            hotelName: hotelName,
            hotelImage: hotelImage,
            hotelRating: parseFloat(hotelRating || 0),
            hotelLocation: hotelLocation,
            checkIn: checkIn,
            checkOut: checkOut,
            nights: nights,
            rooms: parseInt(rooms || '1'),
            adults: parseInt(adults || '2'),
            children: parseInt(childrens || '0'),
            totalGuests: parseInt(adults || '2') + parseInt(childrens || '0')
        }));
        
        // Redirect to checkout immediately for regular booking
        window.location.href = 'packageCheckout.html';
    }
};

// ===== PROCEED TO CHECKOUT (FOR PACKAGE) =====
document.addEventListener('DOMContentLoaded', () => {
    const proceedBtn = document.getElementById('proceedCheckoutBtn');
    if (proceedBtn && isPackageBooking) {
        proceedBtn.addEventListener('click', () => {
            const packageCheckout = sessionStorage.getItem('packageCheckout');
            if (packageCheckout) {
                console.log('✅ Proceeding to package checkout');
                window.location.href = 'packageCheckout.html';
            } else {
                showToast('Please select a room first', true);
            }
        });
    }
});

// ===== HELPER FUNCTIONS =====
function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
}

// ===== LOAD HOTEL MAP =====
async function initializeHotelMap() {
    const mapSection = document.getElementById('locationMapSection');
    const mapEmbed = document.getElementById('hotelMapEmbed');
    const directionsBtn = document.getElementById('getDirectionsBtn');

    if (!mapSection || !mapEmbed) {
        console.warn('⚠️ Map elements not found');
        return;
    }

    try {
        const locationString = typeof hotelLocation === 'string' ? hotelLocation : decodeURIComponent(hotelLocation || '');
        const hotelNameString = typeof hotelName === 'string' ? hotelName : decodeURIComponent(hotelName || '');

        console.log('🗺️ Loading map for:', hotelNameString);

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

        const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(hotelNameString + ', ' + locationString)}&zoom=15`;

        console.log('🔗 Embed URL set');
        mapEmbed.src = embedUrl;
        mapSection.style.display = 'block';

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

    // ✅ BACK BUTTON - Dynamic text
    const backBtn = document.getElementById('backToSearchBtn');
    const backBtnText = document.getElementById('backBtnText');
    
    if (backBtn) {
        if (isPackageBooking) {
            backBtnText.textContent = 'Back to Itinerary';
        } else {
            backBtnText.textContent = 'Back to Search';
        }
        
        backBtn.addEventListener('click', () => {
            if (isPackageBooking) {
                // Go back to AI itinerary page
                window.location.href = 'aiItinerary.html';
            } else {
                // Save search state and go back to booking
                sessionStorage.setItem('lastSearch', JSON.stringify({
                    destination: hotelLocation,
                    checkIn: checkIn,
                    checkOut: checkOut,
                    rooms: parseInt(rooms || '1'),
                    adults: parseInt(adults || '2'),
                    children: parseInt(childrens || '0')
                }));
                window.location.href = 'booking.html';
            }
        });
    }

    // Load hotel details
    if (hotelName) {
        loadHotelDetails();
    } else {
        showToast('Hotel information not found', true);
        setTimeout(() => {
            window.location.href = isPackageBooking ? 'aiItinerary.html' : 'booking.html';
        }, 2000);
    }
});
