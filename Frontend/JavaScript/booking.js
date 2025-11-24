import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';
import apiService from './api_service.js';

// ===== GLOBAL STATE =====
let allHotels = [];
let filteredHotels = [];
let allFlights = [];
let filteredFlights = [];
let currentFilters = {
    rating: null,
    priceMin: 0,
    priceMax: 10000,
};

let currentFlightFilters = {
    stops: [],
    priceMax: 5000,
    departureTime: []
};

// Close modal
function closeFlightModal() {
    const modal = document.getElementById('flightModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// ===== CURRENCY CONVERSION =====
function convertToMYR(amount, fromCurrency) {
    const exchangeRates = {
        'MYR': 1,
        'USD': 4.20,
        'EUR': 4.55,
        'GBP': 5.30,
        'SGD': 3.12,
        'BRL': 0.85,
        'MXN': 0.25,
        'AUD': 2.75,
        'JPY': 0.028,
        'CNY': 0.58,
        'THB': 0.12,
    };
    const rate = exchangeRates[fromCurrency] || 1;
    return amount * rate;
}

// ===== UPDATE NIGHT COUNT DISPLAY =====
function updateNightCount() {
    const checkIn = document.getElementById('hotelCheckInSearch')?.value;
    const checkOut = document.getElementById('hotelCheckOutSearch')?.value;
    const nightLabel = document.querySelector('.night-label');

    if (checkIn && checkOut && nightLabel) {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

        if (nights > 0) {
            nightLabel.textContent = `${nights} night${nights > 1 ? 's' : ''}`;
        }
    }
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

// ===== GET USER'S FAVORITED HOTEL IDs =====
async function getFavoritedHotelIds() {
    const user = auth.currentUser;
    if (!user) return [];

    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

        const favoritesRef = collection(db, 'users', user.uid, 'favorites');
        const snapshot = await getDocs(favoritesRef);

        const favoritedIds = [];
        snapshot.forEach(doc => {
            favoritedIds.push(doc.id);
        });

        console.log('User favorited hotel IDs:', favoritedIds);
        return favoritedIds;

    } catch (error) {
        console.error('Error fetching favorited IDs:', error);
        return [];
    }
}

// ===== HOTEL SEARCH =====
async function searchHotels() {
    const cityName = document.getElementById('hotelDestSearch')?.value.trim();
    const checkIn = document.getElementById('hotelCheckInSearch')?.value;
    const checkOut = document.getElementById('hotelCheckOutSearch')?.value;
    const adults = parseInt(document.getElementById('adultsInlineCount')?.textContent || '2');
    const rooms = parseInt(document.getElementById('roomsInlineCount')?.textContent || '1');

    if (!cityName || !checkIn || !checkOut) {
        showToast('Please fill in all required fields', true);
        return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkInDate < today) {
        showToast('Check-in date cannot be in the past', true);
        return;
    }

    if (checkOutDate <= checkInDate) {
        showToast('Check-out date must be after check-in date', true);
        return;
    }

    showLoading();

    try {
        const results = await apiService.searchHotels(cityName, checkIn, checkOut, adults, rooms);

        if (results && results.data) {
            await displayHotelResults(results);
        } else {
            throw new Error('No response from server');
        }
    } catch (error) {
        console.error('Search error:', error);
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('City not supported') || errorMessage.includes('not found')) {
            showToast('⚠️ City not available. Please select a city from the dropdown list.', true);
        } else if (errorMessage.includes('No hotels found')) {
            showToast('No hotels available for the selected dates. Try different dates.', true);
        } else {
            showToast(`Search failed: ${errorMessage}`, true);
        }

        const resultsGrid = document.getElementById('resultsGrid');
        const resultsCount = document.getElementById('resultsCount');

        if (resultsGrid && resultsCount) {
            resultsCount.textContent = 'No hotels found';
            resultsGrid.innerHTML = `
                <div class="no-results" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <h3>Search Error</h3>
                    <p style="color: var(--text-gray);">${errorMessage}</p>
                </div>
            `;
        }
    } finally {
        hideLoading();
    }
}

// ===== DISPLAY RESULTS =====
async function displayHotelResults(data) {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');

    if (!resultsGrid || !resultsCount) return;

    resultsGrid.innerHTML = '';

    if (!data || !data.data) {
        resultsCount.textContent = 'No hotels found';
        return;
    }

    let hotels = data.data || [];
    const searchedCity = document.getElementById('hotelDestSearch')?.value.trim() || '';

    if (hotels.length === 0) {
        resultsCount.textContent = 'No hotels found';
        resultsGrid.innerHTML = `
            <div class="no-results">
                <h3>No hotels found</h3>
                <p style="color: var(--text-gray);">Try different search criteria</p>
            </div>
        `;
        return;
    }

    // Get favorited hotel IDs
    const favoritedIds = await getFavoritedHotelIds();

    // Sort: Favorited hotels first
    hotels = hotels.sort((a, b) => {
        const aId = a.hotel?.hotelId || a.hotel?.id;
        const bId = b.hotel?.hotelId || b.hotel?.id;
        const aFav = favoritedIds.includes(aId);
        const bFav = favoritedIds.includes(bId);

        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0;
    });

    // Store globally for filtering
    allHotels = hotels;
    filteredHotels = [];

    // Reset filters
    currentFilters = {
        rating: null,
        priceMin: 0,
        priceMax: 10000
    };

    const ratingCheckbox = document.querySelector('input[data-filter="rating"]');
    if (ratingCheckbox) ratingCheckbox.checked = false;

    const priceSlider = document.getElementById('priceSlider');
    if (priceSlider) priceSlider.value = 750;

    const priceRangeLabel = document.querySelector('.price-range-label');
    if (priceRangeLabel) priceRangeLabel.textContent = '(RM 0 - RM 750+)';

    document.querySelectorAll('.price-btn').forEach(b => b.classList.remove('active'));

    // Reset sort to recommended
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'recommended';

    resultsCount.textContent = `${hotels.length} ${hotels.length === 1 ? 'property' : 'properties'} found in ${searchedCity}`;

    for (let i = 0; i < hotels.length; i++) {
        try {
            const hotelCard = await createHotelCard(hotels[i], i, favoritedIds);
            resultsGrid.appendChild(hotelCard);
        } catch (error) {
            console.error('Error creating hotel card:', error);
        }
    }
}

// ===== CREATE HOTEL CARD =====
async function createHotelCard(hotelData, index, favoritedIds = []) {
    const card = document.createElement('div');
    card.className = 'hotel-card-horizontal';

    const hotel = hotelData.hotel || {};
    const offer = hotelData.offers?.[0];

    const hotelId = hotel.hotelId || hotel.id || 'unknown';
    const hotelName = hotel.name || 'Hotel Name Unavailable';
    const rating = hotel.rating || null;
    const reviewCount = hotel.reviewCount || 0;
    const mentions = hotel.mentions || [];

    // Check if this hotel is favorited
    const isFavorited = favoritedIds.includes(hotelId);

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    let cityName = document.getElementById('hotelDestSearch')?.value.trim() || 'Hotel';
    if (hotel.address?.cityName) cityName = hotel.address.cityName;

    const imageUrl = hotel.image || 'https://via.placeholder.com/400x300?text=No+Image';

    // TripAdvisor-style blue circles
    let circleRatingHTML = '';
    if (rating && rating > 0) {
        const ratingValue = Math.round(rating);
        circleRatingHTML = `
            <div class="rating-circles">
                <span class="rating-number">${rating}</span>
                <div class="circles">
                    ${Array(5).fill(0).map((_, i) =>
            `<div class="circle ${i < ratingValue ? 'filled' : ''}"></div>`
        ).join('')}
                </div>
                <span class="review-count">(${reviewCount} reviews)</span>
            </div>
        `;
    }

    // Display mentions
    let mentionsHTML = '';
    if (mentions && mentions.length > 0) {
        const mentionsList = mentions.slice(0, 5).join(' • ');
        mentionsHTML = `
            <div class="hotel-mentions-inline">
                <span class="mentions-label">Mentions:</span>
                <span class="mentions-text">${escapeHtml(mentionsList)}</span>
            </div>
        `;
    }

    card.innerHTML = `
    <div class="card-image-wrapper">
        <div class="card-image-container">
            <img src="${imageUrl}" alt="${escapeHtml(hotelName)}" class="hotel-image-horizontal">
            <button class="favorite-btn ${isFavorited ? 'favorited' : ''}" data-hotel-id="${escapeHtml(hotelId)}">
                <i class="fa fa-heart" style="color: ${isFavorited ? 'red' : '#ccc'};"></i>
            </button>
        </div>
    </div>
    <div class="card-content">
        <div class="card-header">
            <div class="header-left">
                <h3 class="hotel-name-horizontal">${escapeHtml(hotelName)}</h3>
                ${circleRatingHTML}
                <div class="hotel-location-horizontal">
                    <i class="gg-pin"></i>
                    <span>${escapeHtml(cityName)}</span>
                </div>
            </div>
        </div>
        <div class="card-mentions">
            ${mentionsHTML}
        </div>
        <div class="card-footer">
            <button class="view-hotel-btn" data-hotel-id="${escapeHtml(hotelId)}" data-offer-id="${escapeHtml(offer?.id || '')}">
                View hotel
            </button>
        </div>
    </div>
`;

    return card;
}

// ===== APPLY FILTERS =====
function applyFilters() {
    console.log('Applying filters:', currentFilters);

    filteredHotels = allHotels.filter(hotelData => {
        const hotel = hotelData.hotel;
        const offer = hotelData.offers?.[0];

        // Rating filter
        if (currentFilters.rating !== null) {
            const hotelRating = hotel?.rating || 0;
            if (hotelRating < currentFilters.rating) {
                return false;
            }
        }

        return true;
    });

    console.log(`Filtered: ${filteredHotels.length} hotels`);

    // Apply current sort order
    const sortSelect = document.getElementById('sortSelect');
    const sortBy = sortSelect?.value || 'recommended';
    const sortedHotels = sortHotels(filteredHotels, sortBy);

    displayFilteredHotels(sortedHotels);
}

// ===== DISPLAY FILTERED HOTELS =====
async function displayFilteredHotels(hotels) {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');
    const searchedCity = document.getElementById('hotelDestSearch')?.value.trim() || 'your search';

    if (!resultsGrid || !resultsCount) return;

    resultsGrid.innerHTML = '';

    if (hotels.length === 0) {
        resultsCount.textContent = 'No hotels found';
        resultsGrid.innerHTML = `
            <div class="no-results">
                <h3>No hotels match your filters</h3>
                <p style="color: var(--text-gray);">Try adjusting your filters</p>
            </div>
        `;
        return;
    }

    // Get favorited IDs for filtered display
    const favoritedIds = await getFavoritedHotelIds();

    resultsCount.textContent = `${hotels.length} ${hotels.length === 1 ? 'property' : 'properties'} found in ${searchedCity}`;

    for (let i = 0; i < hotels.length; i++) {
        const hotelCard = await createHotelCard(hotels[i], i, favoritedIds);
        resultsGrid.appendChild(hotelCard);
    }
}

// ===== SETUP FILTERS =====
function setupFilters() {
    // Rating filter
    const ratingCheckboxes = document.querySelectorAll('input[data-filter="rating"]');
    ratingCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                ratingCheckboxes.forEach(cb => {
                    if (cb !== e.target) {
                        cb.checked = false;
                    }
                });
                currentFilters.rating = parseFloat(e.target.value);
            } else {
                currentFilters.rating = null;
            }
            applyFilters();
        });
    });

    // Price slider
    const priceSlider = document.getElementById('priceSlider');
    const priceRangeLabel = document.querySelector('.price-range-label');
    if (priceSlider && priceRangeLabel) {
        priceSlider.addEventListener('input', (e) => {
            const maxPrice = parseInt(e.target.value);
            currentFilters.priceMax = maxPrice >= 750 ? 10000 : maxPrice;
            priceRangeLabel.textContent = `(RM 0 - RM ${maxPrice}${maxPrice >= 750 ? '+' : ''})`;
        });
        priceSlider.addEventListener('change', () => applyFilters());
    }

    // Price buttons
    const priceButtons = document.querySelectorAll('.price-btn');
    priceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            priceButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const priceRange = btn.dataset.price;
            if (priceRange === '450+') {
                currentFilters.priceMin = 450;
                currentFilters.priceMax = 10000;
            } else {
                const [min, max] = priceRange.split('-').map(p => parseInt(p));
                currentFilters.priceMin = min;
                currentFilters.priceMax = max;
            }

            if (priceSlider && priceRangeLabel) {
                priceSlider.value = currentFilters.priceMax >= 750 ? 750 : currentFilters.priceMax;
                priceRangeLabel.textContent = `(RM ${currentFilters.priceMin} - RM ${currentFilters.priceMax}${currentFilters.priceMax >= 10000 ? '+' : ''})`;
            }

            applyFilters();
        });
    });

}

// ===== SORT HOTELS =====
function sortHotels(hotels, sortBy) {
    const sorted = [...hotels];

    switch (sortBy) {
        case 'rating-high':
            return sorted.sort((a, b) => {
                const ratingA = a.hotel?.rating || 0;
                const ratingB = b.hotel?.rating || 0;
                return ratingB - ratingA;
            });

        case 'rating-low':
            return sorted.sort((a, b) => {
                const ratingA = a.hotel?.rating || 0;
                const ratingB = b.hotel?.rating || 0;
                return ratingA - ratingB;
            });

        case 'name-az':
            return sorted.sort((a, b) => {
                const nameA = (a.hotel?.name || '').toLowerCase();
                const nameB = (b.hotel?.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });

        case 'name-za':
            return sorted.sort((a, b) => {
                const nameA = (a.hotel?.name || '').toLowerCase();
                const nameB = (b.hotel?.name || '').toLowerCase();
                return nameB.localeCompare(nameA);
            });

        case 'recommended':
        default:
            return sorted;
    }
}

// ===== SORT FLIGHTS =====
function sortFlights(flights, sortBy) {
    // Create a copy to avoid mutating original
    const sorted = [...flights];

    switch (sortBy) {
        case 'price-low':
            return sorted.sort((a, b) => {
                const priceA = parseFloat(a.price?.total || 0);
                const priceB = parseFloat(b.price?.total || 0);
                return priceA - priceB;
            });

        case 'price-high':
            return sorted.sort((a, b) => {
                const priceA = parseFloat(a.price?.total || 0);
                const priceB = parseFloat(b.price?.total || 0);
                return priceB - priceA;
            });

        case 'duration-short':
            return sorted.sort((a, b) => {
                const durationA = a.itineraries[0]?.duration || 'PT0H';
                const durationB = b.itineraries[0]?.duration || 'PT0H';
                const minutesA = parseDuration(durationA);
                const minutesB = parseDuration(durationB);
                return minutesA - minutesB;
            });

        case 'departure-early':
            return sorted.sort((a, b) => {
                const timeA = new Date(a.itineraries[0]?.segments[0]?.departure?.time || 0);
                const timeB = new Date(b.itineraries[0]?.segments[0]?.departure?.time || 0);
                return timeA - timeB;
            });

        case 'departure-late':
            return sorted.sort((a, b) => {
                const timeA = new Date(a.itineraries[0]?.segments[0]?.departure?.time || 0);
                const timeB = new Date(b.itineraries[0]?.segments[0]?.departure?.time || 0);
                return timeB - timeA;
            });

        case 'recommended':
        default:
            return sorted;
    }
}


// ===== PARSE DURATION TO MINUTES =====
function parseDuration(duration) {
    // Convert PT1H30M to minutes
    const hours = duration.match(/(\d+)H/);
    const minutes = duration.match(/(\d+)M/);

    const h = hours ? parseInt(hours[1]) : 0;
    const m = minutes ? parseInt(minutes[1]) : 0;

    return h * 60 + m;
}


// ===== FAVORITES SYSTEM =====
async function toggleFavorite(hotelId, hotelData) {
    const user = auth.currentUser;
    if (!user) {
        showToast('Please log in to save favorites', true);
        return false;
    }

    try {
        const { collection, doc, getDoc, setDoc, deleteDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

        const favoriteRef = doc(db, 'users', user.uid, 'favorites', hotelId);
        const favoriteSnap = await getDoc(favoriteRef);

        if (favoriteSnap.exists()) {
            await deleteDoc(favoriteRef);
            showToast('Removed from favorites');
            return false;
        } else {
            const hotel = hotelData.hotel || {};
            const offer = hotelData.offers?.[0];

            await setDoc(favoriteRef, {
                hotelId: hotelId,
                hotelName: hotel.name || 'Unknown Hotel',
                image: hotel.image || 'https://via.placeholder.com/400x300',
                location: hotel.address?.cityName || 'Unknown',
                rating: hotel.rating || 0,
                reviewCount: hotel.reviewCount || 0,
                price: offer?.price?.total || 0,
                currency: offer?.price?.currency || 'MYR',
                mentions: hotel.mentions || [],
                savedAt: serverTimestamp()
            });

            showToast('Added to favorites', false);
            return true;
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        showToast('Failed to update favorites', true);
        return false;
    }
}

async function displayFlightResults(flights, tripType) {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');

    if (!resultsGrid) {
        console.error('resultsGrid not found');
        return;
    }

    resultsGrid.innerHTML = '';

    if (!flights || flights.length === 0) {
        if (resultsCount) {
            resultsCount.textContent = 'No flights found';
        }
        resultsGrid.innerHTML = `
            <div class="no-results">
                <i class="gg-airplane" style="font-size: 48px; color: var(--text-light); margin-bottom: 16px;"></i>
                <h3>No flights found</h3>
                <p style="color: var(--text-gray);">Try different search criteria or adjust filters</p>
            </div>
        `;
        return;
    }

    if (resultsCount) {
        resultsCount.textContent = `${flights.length} flights found`;
    }

    // Create combined flight cards
    flights.forEach((flight, index) => {
        const flightCard = createCombinedFlightCard(flight, index, tripType);
        resultsGrid.appendChild(flightCard);
    });

    console.log('✓ Displayed', flights.length, 'flights');
}


// ===== HELPER FUNCTIONS =====
function showLoading() {
    const loadingState = document.getElementById('loadingState');
    const resultsGrid = document.getElementById('resultsGrid');
    if (loadingState) loadingState.style.display = 'block';
    if (resultsGrid) resultsGrid.style.display = 'none';
}

function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    const resultsGrid = document.getElementById('resultsGrid');
    if (loadingState) loadingState.style.display = 'none';
    if (resultsGrid) resultsGrid.style.display = 'grid';
}

// ===== LIMITS CONFIG =====
const BOOKING_LIMITS = {
    rooms: { min: 1, max: 5 },
    adultsInline: { min: 1, max: 9 },
    childrenInline: { min: 0, max: 4 }
};

function setupGuestsCounter() {
    const guestsInline = document.querySelector('.guests-inline');
    const guestsTrigger = document.getElementById('guestsInlineTrigger');
    const guestsDisplay = document.getElementById('guestsInlineDisplay');

    if (!guestsInline || !guestsTrigger) return;

    guestsTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        guestsInline.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!guestsInline.contains(e.target)) {
            guestsInline.classList.remove('active');
        }
    });

    document.querySelectorAll('.counter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const target = btn.dataset.target;
            const countElement = document.getElementById(`${target}Count`);

            if (!countElement) return;

            let currentValue = parseInt(countElement.textContent);
            const limits = BOOKING_LIMITS[target];

            // Get limits (roomsInline, adultsInline, childrenInline)
            const maxLimit = limits?.max || 10;
            const minLimit = limits?.min || 0;

            if (action === 'plus') {
                if (currentValue >= maxLimit) {
                    showToast(`Maximum ${target.replace('Inline', '')} limit (${maxLimit}) reached`, true);
                    return;
                }
                currentValue++;
            } else if (action === 'minus') {
                if (currentValue <= minLimit) {
                    showToast(`Minimum ${target.replace('Inline', '')} limit (${minLimit}) required`, true);
                    return;
                }
                currentValue--;
            }

            countElement.textContent = currentValue;
            updateGuestsDisplay();
        });
    });

    function updateGuestsDisplay() {
        const rooms = parseInt(document.getElementById('roomsInlineCount')?.textContent || 1);
        const adults = parseInt(document.getElementById('adultsInlineCount')?.textContent || 2);
        const children = parseInt(document.getElementById('childrenInlineCount')?.textContent || 0);

        if (guestsDisplay) {
            guestsDisplay.textContent = `${rooms} room${rooms > 1 ? 's' : ''}, ${adults} adult${adults > 1 ? 's' : ''}, ${children} ${children === 1 ? 'child' : 'children'}`;
        }
    }
}

function setupNightCalculator() {
    const checkInInput = document.getElementById('hotelCheckInSearch');
    const checkOutInput = document.getElementById('hotelCheckOutSearch');

    if (!checkInInput || !checkOutInput) return;

    checkInInput.addEventListener('change', updateNightCount);
    checkOutInput.addEventListener('change', updateNightCount);
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

// ===== MAP AIRLINE CODES TO FULL NAMES =====
function getAirlineName(code) {
    const airlineMap = {
        'MH': 'Malaysia Airlines',
        'AK': 'AirAsia',
        'OD': 'Malindo Air',
        'FY': 'Firefly',
        'D7': 'AirAsia X',
        'SQ': 'Singapore Airlines',
        'TG': 'Thai Airways',
        'CX': 'Cathay Pacific',
        'EK': 'Emirates',
        'QR': 'Qatar Airways',
        'EY': 'Etihad Airways',
        'BA': 'British Airways',
        'QZ': 'Indonesia AirAsia',
        'TR': 'Scoot',
        'VN': 'Vietnam Airlines',
        'GA': 'Garuda Indonesia',
        'NH': 'All Nippon Airways',
        'JL': 'Japan Airlines',
        'KE': 'Korean Air',
        'CZ': 'China Southern'
    };
    return airlineMap[code] || code;
}

// ===== CREATE COMBINED FLIGHT CARD (ROUND-TRIP IN ONE CARD) =====
function createCombinedFlightCard(flightData, index, tripType) {
    const card = document.createElement('div');
    card.className = 'flight-card-combined';

    const itineraries = flightData.itineraries || [];
    const price = flightData.price || {};

    if (itineraries.length === 0) {
        card.innerHTML = '<p>No flight data available</p>';
        return card;
    }

    // Price
    const totalPrice = parseFloat(price.total || 0);
    const currency = price.currency || 'MYR';
    const priceInMYR = currency === 'MYR' ? totalPrice : convertToMYR(totalPrice, currency);

    // Build the HTML
    let flightHTML = '<div class="flight-card-wrapper">';

    // Left side: Flight details
    flightHTML += '<div class="flights-container">';

    // Outbound flight
    flightHTML += createFlightSegmentHTML(itineraries[0], 'Outbound');

    // Return flight (if round-trip)
    if (tripType === 'round-trip' && itineraries.length > 1) {
        flightHTML += '<div class="flight-separator"></div>';
        flightHTML += createFlightSegmentHTML(itineraries[1], 'Return');
    }

    flightHTML += '</div>';

    // Right side: Price and button
    const numPassengers = parseInt(document.getElementById('flightTravelersSearch')?.value || '1');
    const pricePerPerson = priceInMYR / numPassengers;

    flightHTML += `
        <div class="flight-price-section">
            <div class="price-display">RM${pricePerPerson.toFixed(2)}</div>
            <p style="font-size: 12px; color: #999; margin-top: 4px;">per person</p>
            <button class="view-details-btn" data-flight-index="${index}" style="margin-top: 12px;">
                View details
            </button>
        </div>
    `;


    flightHTML += '</div>';

    card.innerHTML = flightHTML;
    return card;
}

// ===== CREATE FLIGHT SEGMENT HTML (HELPER) =====
function createFlightSegmentHTML(itinerary, label) {
    if (!itinerary) return '';

    const segments = itinerary.segments || [];
    if (segments.length === 0) return '';

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    // Parse times and dates
    const departureDateTime = firstSegment.departure?.time;
    const arrivalDateTime = lastSegment.arrival?.time;

    if (!departureDateTime || !arrivalDateTime) return '';

    const departureDate = new Date(departureDateTime);
    const arrivalDate = new Date(arrivalDateTime);

    // Format times (HH:MM)
    const departureTime = departureDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const arrivalTime = arrivalDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // Format dates (DD MMM)
    const departureDay = departureDate.getDate();
    const departureMonth = departureDate.toLocaleString('en-US', { month: 'short' });
    const arrivalDay = arrivalDate.getDate();
    const arrivalMonth = arrivalDate.toLocaleString('en-US', { month: 'short' });

    // Duration
    const duration = itinerary.duration?.replace('PT', '').replace('H', ' hour ').replace('M', ' min') || 'N/A';

    // Stops
    const stops = segments.length - 1;
    const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;
    const stopsClass = stops === 0 ? 'direct' : 'with-stops';

    // Airline
    const airlineCode = firstSegment.airline || 'Unknown';
    const airlineName = getAirlineName(airlineCode);

    // Airports
    const departureAirport = firstSegment.departure?.airport || 'N/A';
    const arrivalAirport = lastSegment.arrival?.airport || 'N/A';

    return `
        <div class="flight-segment">
            <div class="flight-airline-small">
                <div class="airline-logo-small">
                    <span>${airlineCode}</span>
                </div>
                <div class="airline-info">
                    <div class="airline-name-small">${airlineName}</div>
                </div>
            </div>
            
            <div class="flight-route-info">
                <div class="flight-time-block">
                    <div class="time-large">${departureTime}</div>
                    <div class="airport-code">${departureAirport}</div>
                    <div class="date-small">${departureDay} ${departureMonth}</div>
                </div>
                
                <div class="flight-duration-block">
                    <div class="duration-text">${duration}</div>
                    <div class="route-line">
                        <div class="line"></div>
                        <div class="stops-badge ${stopsClass}">${stopsText}</div>
                    </div>
                </div>
                
                <div class="flight-time-block">
                    <div class="time-large">${arrivalTime}</div>
                    <div class="airport-code">${arrivalAirport}</div>
                    <div class="date-small">${arrivalDay} ${arrivalMonth}</div>
                </div>
            </div>
        </div>
    `;
}

// ===== SETUP FLIGHT FILTERS =====
function setupFlightFilters() {
    console.log('Setting up flight filters (one-time setup)');

    document.addEventListener('change', (e) => {
        if (e.target.matches('input[data-filter="stops"]')) {
            const stopCheckboxes = document.querySelectorAll('input[data-filter="stops"]');
            currentFlightFilters.stops = Array.from(stopCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => parseInt(cb.value));

            console.log('Stops filter updated:', currentFlightFilters.stops);
            applyFlightFilters();
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.matches('input[data-filter="departTime"]')) {
            const timeCheckboxes = document.querySelectorAll('input[data-filter="departTime"]');
            currentFlightFilters.departureTime = Array.from(timeCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            console.log('Departure time filter updated:', currentFlightFilters.departureTime);
            applyFlightFilters();
        }
    });

    const priceSlider = document.getElementById('flightPriceSlider');
    const priceMaxLabel = document.getElementById('flightPriceMax');
    if (priceSlider) {
        priceSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            currentFlightFilters.priceMax = parseInt(value);
            if (priceMaxLabel) {
                priceMaxLabel.textContent = value >= 5000 ? 'RM 5000+' : `RM ${value}`;
            }
            console.log('Price filter updated:', currentFlightFilters.priceMax);
            applyFlightFilters();
        });
    }

    console.log('✓ Flight filters setup complete (global listeners active)');
}

function applyFlightFilters() {
    if (!allFlights || allFlights.length === 0) {
        console.log('❌ No flights to filter');
        return;
    }

    console.log('🔍 Applying filters:', currentFlightFilters);
    console.log('📊 allFlights.length:', allFlights.length);

    filteredFlights = allFlights.filter(flight => {
        // ✅ Only apply price filter if it's LESS than default max (5000)
        const price = parseFloat(flight.price?.total || 0);
        const currency = flight.price?.currency || 'MYR';
        const priceInMYR = currency === 'MYR' ? price : convertToMYR(price, currency);

        // Only filter by price if slider has been moved from default
        if (currentFlightFilters.priceMax < 5000 && priceInMYR > currentFlightFilters.priceMax) {
            return false;
        }

        // Stops filter
        if (currentFlightFilters.stops.length > 0) {
            const segments = flight.itineraries?.[0]?.segments || [];
            const stops = segments.length - 1;

            const has2PlusStops = currentFlightFilters.stops.includes(2);
            const matchesStops = currentFlightFilters.stops.includes(stops);
            const is2OrMoreStops = stops >= 2 && has2PlusStops;

            if (!matchesStops && !is2OrMoreStops) {
                return false;
            }
        }

        // Departure time filter
        if (currentFlightFilters.departureTime.length > 0) {
            const departureTime = flight.itineraries?.[0]?.segments?.[0]?.departure?.time;
            if (!departureTime) {
                return false;
            }

            const hour = new Date(departureTime).getHours();
            const timeSlot = getTimeSlot(hour);
            if (!currentFlightFilters.departureTime.includes(timeSlot)) {
                return false;
            }
        }

        return true;
    });

    console.log(`✓ Filtered ${allFlights.length} → ${filteredFlights.length} flights`);

    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        resultsCount.textContent = `${filteredFlights.length} flight${filteredFlights.length !== 1 ? 's' : ''} found`;
    }

    displayFlightResults(filteredFlights, 'round-trip');
}

// ===== GET TIME SLOT =====
function getTimeSlot(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 24) return 'evening';
    return 'night';
}

// ===== CLEAR FLIGHT FILTERS (SIMPLE) =====
function clearFlightFilters() {
    console.log('Clearing flight filters...');

    // 1. Reset filter object
    currentFlightFilters = {
        stops: [],
        priceMax: 5000,
        departureTime: []
    };

    // 2. Uncheck all checkboxes
    document.querySelectorAll('input[data-filter="stops"]:checked').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[data-filter="departTime"]:checked').forEach(cb => cb.checked = false);

    // 3. Reset price slider
    const priceSlider = document.getElementById('flightPriceSlider');
    const priceMaxLabel = document.getElementById('flightPriceMax');
    if (priceSlider) priceSlider.value = 5000;
    if (priceMaxLabel) priceMaxLabel.textContent = 'RM 5000+';

    // 4. Re-apply filters (this will show all flights since filters are empty)
    applyFlightFilters();

    console.log('✓ Flight filters cleared');
}

// ===== SETUP CLEAR FILTERS BUTTON =====
function setupClearFilters() {
    const clearFiltersBtn = document.getElementById('clearFilters');
    if (!clearFiltersBtn) return;

    clearFiltersBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.search-tab.active');
        const tabType = activeTab?.dataset.type;

        if (tabType === 'hotel') {
            // Your existing hotel clear code
            console.log('Clearing HOTEL filters');

            const ratingCheckboxes = document.querySelectorAll('input[data-filter="rating"]');
            ratingCheckboxes.forEach(cb => cb.checked = false);

            const priceSlider = document.getElementById('priceSlider');
            const priceRangeLabel = document.querySelector('.price-range-label');
            if (priceSlider) priceSlider.value = 750;
            if (priceRangeLabel) priceRangeLabel.textContent = 'RM 0 - RM 750+';

            currentFilters = {
                rating: null,
                priceMin: 0,
                priceMax: 10000,
            };

            if (allHotels.length > 0) {
                const cityName = document.getElementById('hotelDestSearch')?.value || 'selected city';
                const resultsCount = document.getElementById('resultsCount');
                if (resultsCount) {
                    resultsCount.textContent = `${allHotels.length} properties found in ${cityName}`;
                }
                displayFilteredHotels(allHotels);
            }

        } else if (tabType === 'flight') {
            // ✅ SIMPLE: Just call the clear function
            clearFlightFilters();
        }
    });
}

// ==================== FLIGHT MODAL FUNCTIONS ====================
// Open flight details modal
function openFlightModal(flightData) {
    const modal = document.getElementById('flightModal');
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    const modalPrice = document.getElementById('modalTotalPrice');

    // Set title and price
    const origin = flightData.itineraries[0].segments[0].departure.airport;
    const destination = flightData.itineraries[0].segments[flightData.itineraries[0].segments.length - 1].arrival.airport;
    modalTitle.textContent = `Your flight to ${getAirportCity(destination)}`;
    const totalPrice = parseFloat(flightData.price.total);
    const numPassengers = parseInt(document.getElementById('flightTravelersSearch')?.value || '1');
    const pricePerPerson = totalPrice / numPassengers;
    const currency = flightData.price.currency === 'MYR' ? 'RM' : flightData.price.currency;

    modalPrice.textContent = `${currency}${pricePerPerson.toFixed(2)}`;

    // Build modal content
    let html = '';

    // Outbound flight
    html += buildFlightLegHTML(flightData.itineraries[0], 'outbound');

    // Return flight (if exists)
    if (flightData.itineraries.length > 1) {
        html += buildFlightLegHTML(flightData.itineraries[1], 'return');
    }

    // In buildFlightLegHTML() function, the modal content should now be:

    html += `
        <div class="modal-info-section">
            <div class="info-section-title">
                <i class="fas fa-suitcase-rolling"></i> Included baggage
            </div>
            <div class="info-row">
                <span class="info-label">The total baggage included in the price</span>
                <span class="info-value highlight">1 cabin bag</span>
            </div>
            <div class="info-row">
                <span class="info-label">Dimensions</span>
                <span class="info-value">23 x 36 x 56 cm · Max weight 7 kg</span>
            </div>
        </div>
    `;

    modalBody.innerHTML = html;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Build HTML for a flight leg (outbound or return)
function buildFlightLegHTML(itinerary, type) {
    const title = type === 'outbound' ? 'Flight to' : 'Flight to';
    const lastSegment = itinerary.segments[itinerary.segments.length - 1];
    const destination = getAirportCity(lastSegment.arrival.airport);

    let html = `
        <div class="flight-leg-section">
            <div class="flight-leg-header">
                ${title} ${destination}
                <span class="flight-leg-type">Direct · ${formatDuration(itinerary.duration)}</span>
            </div>
    `;

    itinerary.segments.forEach((segment, index) => {
        const depTime = formatTime(segment.departure.time);
        const arrTime = formatTime(segment.arrival.time);
        const depDate = formatDate(segment.departure.time);
        const arrDate = formatDate(segment.arrival.time);

        html += `
            <div class="flight-segment-detail">
                <div class="segment-time-row">
                    <span class="segment-time">${depTime}</span>
                    <span class="segment-airport">${segment.departure.airport} · ${getAirportName(segment.departure.airport)}</span>
                </div>
                <div class="segment-location">${depDate}</div>
                
                <div class="segment-airline-info">
                    <div class="airline-logo-modal">${segment.airline}</div>
                    <div class="airline-details">
                        <div class="airline-name-modal">${getAirlineName(segment.airline)}</div>
                        <div class="flight-number-modal">${segment.airline}${segment.flightNumber} · Economy</div>
                    </div>
                    <div class="flight-duration-modal">Flight time ${formatDuration(segment.duration)}</div>
                </div>
                
                <div class="segment-time-row">
                    <span class="segment-time">${arrTime}</span>
                    <span class="segment-airport">${segment.arrival.airport} · ${getAirportName(segment.arrival.airport)}</span>
                </div>
                <div class="segment-location">${arrDate}</div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

function bookFlight() {
    // Hide any leftover loading state from previous searches
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';

    try {
        // Detect trip type from the dropdown
        const tripTypeSelect = document.getElementById('tripTypeSelect');
        const tripType = tripTypeSelect ? tripTypeSelect.value : 'round-trip';

        // Get current flight data from the modal
        const modal = document.getElementById('flightModal');
        const modalPrice = document.getElementById('modalTotalPrice')?.textContent || '0';
        const numPassengers = parseInt(document.getElementById('flightTravelersSearch')?.value || 1);

        if (!modal.classList.contains('active')) {
            showToast('Please view a flight first', true);
            return;
        }

        // Extract price value (remove currency symbols)
        let pricePerPerson = parseFloat(modalPrice.replace(/[^\d.]/g, '') || 0);

        if (pricePerPerson === 0) {
            showToast('Could not retrieve flight price', true);
            return;
        }

        // Get the flight that's currently displayed in the modal
        const currentFlights = filteredFlights.length > 0 ? filteredFlights : allFlights;

        if (currentFlights.length === 0) {
            showToast('No flights available', true);
            return;
        }

        // Get the last clicked flight (the one in the modal)
        let selectedFlight = currentFlights[0];

        // Extract flight details
        const outboundItinerary = selectedFlight.itineraries[0];
        const outboundSegment = outboundItinerary?.segments[0];

        // For one-way, return itinerary won't exist
        const returnItinerary = selectedFlight.itineraries[1];
        const returnSegment = returnItinerary?.segments[0];

        // Helper function to format time
        const formatTimeHelper = (isoString) => {
            if (!isoString) return '';
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        };

        // Helper function to calculate duration in hours and minutes
        const parseDurationHelper = (durationStr) => {
            const hours = durationStr.match(/(\d+)H/);
            const minutes = durationStr.match(/(\d+)M/);
            const h = hours ? parseInt(hours[1]) : 0;
            const m = minutes ? parseInt(minutes[1]) : 0;
            return { hours: h, minutes: m };
        };

        // Prepare outbound flight data
        const outboundDuration = parseDurationHelper(outboundItinerary?.duration || 'PT0H');

        // ✅ Get the LAST segment for final destination
        const lastOutboundSegment = outboundItinerary?.segments?.[outboundItinerary.segments.length - 1];

        // ✅ Build stops array (all intermediate airports)
        const outboundStops = [];
        if (outboundItinerary?.segments?.length > 1) {
            // Get all middle segments (not first, not last)
            for (let i = 0; i < outboundItinerary.segments.length - 1; i++) {
                const stopAirport = outboundItinerary.segments[i]?.arrival?.airport;
                if (stopAirport) {
                    outboundStops.push({ airport: stopAirport });
                }
            }
        }

        const outboundData = {
            fromAirport: outboundSegment?.departure?.airport || 'N/A',
            toAirport: lastOutboundSegment?.arrival?.airport || 'N/A', // ✅ FIXED: Final destination
            departDate: outboundSegment?.departure?.time?.split('T')[0] || '',
            departTime: formatTimeHelper(outboundSegment?.departure?.time) || '',
            arriveTime: formatTimeHelper(lastOutboundSegment?.arrival?.time) || '', // ✅ FIXED: Final arrival time
            airline: outboundSegment?.airline || '',
            flightNumber: outboundSegment?.flightNumber || '',
            duration: `${outboundDuration.hours}h ${outboundDuration.minutes}m`,
            stops: outboundStops // ✅ FIXED: Array of stop airports
        };

        // Prepare return flight data (only for round-trip)
        let returnData = null;
        if (tripType === 'round-trip' && returnItinerary) {
            const returnDuration = parseDurationHelper(returnItinerary?.duration || 'PT0H');

            // ✅ Get the LAST segment for final destination
            const lastReturnSegment = returnItinerary?.segments?.[returnItinerary.segments.length - 1];

            // ✅ Build stops array
            const returnStops = [];
            if (returnItinerary?.segments?.length > 1) {
                for (let i = 0; i < returnItinerary.segments.length - 1; i++) {
                    const stopAirport = returnItinerary.segments[i]?.arrival?.airport;
                    if (stopAirport) {
                        returnStops.push({ airport: stopAirport });
                    }
                }
            }

            returnData = {
                fromAirport: returnSegment?.departure?.airport || 'N/A',
                toAirport: lastReturnSegment?.arrival?.airport || 'N/A', // ✅ FIXED
                departDate: returnSegment?.departure?.time?.split('T')[0] || '',
                departTime: formatTimeHelper(returnSegment?.departure?.time) || '',
                arriveTime: formatTimeHelper(lastReturnSegment?.arrival?.time) || '', // ✅ FIXED
                airline: returnSegment?.airline || '',
                flightNumber: returnSegment?.flightNumber || '',
                duration: `${returnDuration.hours}h ${returnDuration.minutes}m`,
                stops: returnStops // ✅ FIXED
            };
        }

        // Prepare complete flight data
        const flightData = {
            tripType: tripType,
            outbound: outboundData,
            return: returnData,
            passengers: numPassengers,
            pricePerPerson: pricePerPerson,
            currency: selectedFlight.price?.currency || 'MYR',
            travelClass: selectedFlight.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin || 'ECONOMY' // ✅ Add this
        };

        console.log('✓ Flight booking data:', flightData);

        // Store in sessionStorage for checkout page
        sessionStorage.setItem('selectedFlight', JSON.stringify(flightData));

        // Close modal
        closeFlightModal();

        window.location.href = 'flightCheckout.html';

    } catch (error) {
        console.error('Error booking flight:', error);
        showToast('Failed to book flight. Please try again.', true);
    }
}

window.bookFlight = bookFlight;


// ==================== AIRPORT LOOKUPS  ====================
// Helper: Get airport city name
function getAirportCity(code) {
    const cities = {
        // Asia
        'KUL': 'Kuala Lumpur',
        'PEN': 'Penang',
        'LGK': 'Langkawi',
        'SIN': 'Singapore',
        'BKK': 'Bangkok',
        'HKT': 'Phuket',
        'CNX': 'Chiang Mai',
        'KBV': 'Krabi',
        'DPS': 'Bali',
        'CGK': 'Jakarta',
        'JOG': 'Yogyakarta',
        'NRT': 'Tokyo',
        'HND': 'Tokyo',
        'KIX': 'Osaka',
        'HIJ': 'Hiroshima',
        'ICN': 'Seoul',
        'PUS': 'Busan',
        'CJU': 'Jeju Island',
        'HAN': 'Hanoi',
        'SGN': 'Ho Chi Minh City',
        'DAD': 'Da Nang',
        'REP': 'Siem Reap',

        // Europe
        'CDG': 'Paris',
        'NCE': 'Nice',
        'LYS': 'Lyon',
        'MRS': 'Marseille',
        'FCO': 'Rome',
        'VCE': 'Venice',
        'FLR': 'Florence',
        'MXP': 'Milan',
        'NAP': 'Naples',
        'BCN': 'Barcelona',
        'MAD': 'Madrid',
        'SVQ': 'Seville',
        'VLC': 'Valencia',
        'LHR': 'London',
        'EDI': 'Edinburgh',
        'LPL': 'Liverpool',
        'BER': 'Berlin',
        'MUC': 'Munich',
        'FRA': 'Frankfurt',
        'AMS': 'Amsterdam',
        'RTM': 'Rotterdam',
        'ZRH': 'Zurich',
        'GVA': 'Geneva',
        'ATH': 'Athens',
        'JTR': 'Santorini',
        'JMK': 'Mykonos',
        'LIS': 'Lisbon',
        'OPO': 'Porto',
        'PRG': 'Prague',

        // Americas
        'JFK': 'New York',
        'EWR': 'New York',
        'LAX': 'Los Angeles',
        'SFO': 'San Francisco',
        'LAS': 'Las Vegas',
        'MIA': 'Miami',
        'MCO': 'Orlando',
        'YYZ': 'Toronto',
        'YVR': 'Vancouver',
        'YUL': 'Montreal',
        'GIG': 'Rio de Janeiro',
        'GRU': 'São Paulo',
        'CUN': 'Cancun',
        'MEX': 'Mexico City',
        'GDL': 'Guadalajara',
        'CUZ': 'Cusco',
        'LIM': 'Lima',
        'EZE': 'Buenos Aires',

        // Middle East & Africa
        'DXB': 'Dubai',
        'AUH': 'Abu Dhabi',
        'IST': 'Istanbul',
        'ASR': 'Cappadocia',
        'NAV': 'Cappadocia',
        'CAI': 'Cairo',
        'LXR': 'Luxor',
        'SSH': 'Sharm El Sheikh',
        'RAK': 'Marrakech',
        'CMN': 'Casablanca',
        'CPT': 'Cape Town',

        // Oceania
        'SYD': 'Sydney',
        'MEL': 'Melbourne',
        'OOL': 'Gold Coast',
        'AKL': 'Auckland',
        'ZQN': 'Queenstown'
    };
    return cities[code] || code;
}

// Helper: Get airport full name
function getAirportName(code) {
    const airports = {
        // 🌏 ASIA - Malaysia
        'KUL': 'Kuala Lumpur International Airport',
        'PEN': 'Penang International Airport',
        'LGK': 'Langkawi International Airport',

        // Singapore
        'SIN': 'Singapore Changi Airport',

        // Thailand
        'BKK': 'Suvarnabhumi Airport',
        'HKT': 'Phuket International Airport',
        'CNX': 'Chiang Mai International Airport',
        'KBV': 'Krabi International Airport',

        // Indonesia
        'DPS': 'Ngurah Rai International Airport',
        'CGK': 'Soekarno-Hatta International Airport',
        'JOG': 'Yogyakarta International Airport',

        // Japan
        'NRT': 'Narita International Airport',
        'HND': 'Tokyo Haneda Airport',
        'KIX': 'Kansai International Airport',
        'HIJ': 'Hiroshima Airport',

        // South Korea
        'ICN': 'Incheon International Airport',
        'PUS': 'Gimhae International Airport',
        'CJU': 'Jeju International Airport',

        // Vietnam
        'HAN': 'Noi Bai International Airport',
        'SGN': 'Tan Son Nhat International Airport',
        'DAD': 'Da Nang International Airport',

        // Cambodia
        'REP': 'Siem Reap Angkor International Airport',

        // 🌍 EUROPE - France
        'CDG': 'Paris Charles de Gaulle Airport',
        'NCE': 'Nice Côte d\'Azur Airport',
        'LYS': 'Lyon-Saint Exupéry Airport',
        'MRS': 'Marseille Provence Airport',

        // Italy
        'FCO': 'Leonardo da Vinci-Fiumicino Airport',
        'VCE': 'Venice Marco Polo Airport',
        'FLR': 'Florence Airport',
        'MXP': 'Milan Malpensa Airport',
        'NAP': 'Naples International Airport',

        // Spain
        'BCN': 'Barcelona-El Prat Airport',
        'MAD': 'Adolfo Suárez Madrid-Barajas Airport',
        'SVQ': 'Seville Airport',
        'VLC': 'Valencia Airport',

        // United Kingdom
        'LHR': 'London Heathrow Airport',
        'EDI': 'Edinburgh Airport',
        'LPL': 'Liverpool John Lennon Airport',

        // Germany
        'BER': 'Berlin Brandenburg Airport',
        'MUC': 'Munich Airport',
        'FRA': 'Frankfurt Airport',

        // Netherlands
        'AMS': 'Amsterdam Airport Schiphol',
        'RTM': 'Rotterdam The Hague Airport',

        // Switzerland
        'ZRH': 'Zurich Airport',
        'GVA': 'Geneva Airport',

        // Greece
        'ATH': 'Athens International Airport',
        'JTR': 'Santorini (Thira) Airport',
        'JMK': 'Mykonos Airport',

        // Portugal
        'LIS': 'Lisbon Portela Airport',
        'OPO': 'Porto Airport',

        // Czech Republic
        'PRG': 'Václav Havel Airport Prague',

        // 🌎 AMERICAS - United States
        'JFK': 'John F. Kennedy International Airport',
        'EWR': 'Newark Liberty International Airport',
        'LAX': 'Los Angeles International Airport',
        'SFO': 'San Francisco International Airport',
        'LAS': 'Harry Reid International Airport',
        'MIA': 'Miami International Airport',
        'MCO': 'Orlando International Airport',

        // Canada
        'YYZ': 'Toronto Pearson International Airport',
        'YVR': 'Vancouver International Airport',
        'YUL': 'Montréal-Pierre Elliott Trudeau International Airport',

        // Brazil
        'GIG': 'Rio de Janeiro-Galeão International Airport',
        'GRU': 'São Paulo-Guarulhos International Airport',

        // Mexico
        'CUN': 'Cancún International Airport',
        'MEX': 'Mexico City International Airport',
        'GDL': 'Guadalajara International Airport',

        // Peru
        'CUZ': 'Alejandro Velasco Astete International Airport',
        'LIM': 'Jorge Chávez International Airport',

        // Argentina
        'EZE': 'Ministro Pistarini International Airport',

        // 🌍 MIDDLE EAST & AFRICA - UAE
        'DXB': 'Dubai International Airport',
        'AUH': 'Abu Dhabi International Airport',

        // Turkey
        'IST': 'Istanbul Airport',
        'ASR': 'Kayseri Erkilet Airport',
        'NAV': 'Nevşehir Kapadokya Airport',

        // Egypt
        'CAI': 'Cairo International Airport',
        'LXR': 'Luxor International Airport',
        'SSH': 'Sharm El Sheikh International Airport',

        // Morocco
        'RAK': 'Marrakesh Menara Airport',
        'CMN': 'Mohammed V International Airport',

        // South Africa
        'CPT': 'Cape Town International Airport',

        // 🌏 OCEANIA - Australia
        'SYD': 'Sydney Kingsford Smith Airport',
        'MEL': 'Melbourne Airport',
        'OOL': 'Gold Coast Airport',

        // New Zealand
        'AKL': 'Auckland Airport',
        'ZQN': 'Queenstown Airport'
    };
    return airports[code] || code;
}

// Helper: Format time from ISO string
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Helper: Format date
function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Helper: Format duration (PT1H30M -> 1 hour 30 min)
function formatDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?/);
    let result = '';
    if (match[1]) result += match[1].replace('H', ' hour ');
    if (match[2]) result += match[1] ? match[2].replace('M', ' min') : match[2].replace('M', ' minutes');
    return result.trim();
}

/* ==== INIT ==== */
document.addEventListener('DOMContentLoaded', () => {
    // ===== ALL DOM ELEMENT REFERENCES (CONSOLIDATED) =====
    const profileTrigger = document.querySelector('.profile-trigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const hotelForm = document.getElementById('hotelInlineForm');
    const flightForm = document.getElementById('flightInlineForm');
    const checkInInput = document.getElementById('hotelCheckInSearch');
    const checkOutInput = document.getElementById('hotelCheckOutSearch');
    const resultsGrid = document.getElementById('resultsGrid');
    const searchTabs = document.querySelectorAll('.search-tab');
    const filtersSidebar = document.querySelector('.filters-sidebar');
    const searchPrompt = document.getElementById('searchPrompt');
    const promptIcon = document.getElementById('promptIcon');
    const promptTitle = document.getElementById('promptTitle');
    const promptText = document.getElementById('promptText');
    const sortSelect = document.getElementById('sortSelect');
    const returnDateInput = document.getElementById('flightReturnSearch');
    const returnDateSeparator = document.getElementById('returnDateSeparator');
    const hotelFilters = document.getElementById('hotelFilters');
    const flightFilters = document.getElementById('flightFilters');
    const flightFromSearch = document.getElementById('flightFromSearch');
    const flightToSearch = document.getElementById('flightToSearch');

    // ===== PROFILE DROPDOWN =====
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

    // ===== HOTEL FORM SUBMISSION =====
    if (hotelForm) {
        hotelForm.addEventListener('submit', (e) => {
            e.preventDefault();
            searchHotels();
        });
    }

    // When user selects origin airport
    flightFromSearch.addEventListener('autocomplete:select', (e) => {
        selectedOriginData = {
            code: e.detail.code,
            name: e.detail.name,
            city: e.detail.city
        };
    });

    // When user selects destination airport
    flightToSearch.addEventListener('autocomplete:select', (e) => {
        selectedDestinationData = {
            code: e.detail.code,
            name: e.detail.name,
            city: e.detail.city
        };
    });

    // ===== SETUP FUNCTIONS =====
    setupGuestsCounter();
    setupNightCalculator();
    setupFilters();
    setupDateValidation();
    setupClearFilters();
    setupFlightFilters();

    // ===== DATE INPUT MIN VALUES =====
    if (checkInInput && checkOutInput) {
        const today = new Date().toISOString().split('T')[0];
        checkInInput.min = today;
        checkOutInput.min = today;

        checkInInput.addEventListener('change', () => {
            checkOutInput.min = checkInInput.value;
        });
    }

    // ===== HOTEL CARD CLICK HANDLER =====
    if (resultsGrid) {
        resultsGrid.addEventListener('click', (e) => {
            const viewHotelBtn = e.target.closest('.view-hotel-btn');
            if (viewHotelBtn) {
                const hotelId = viewHotelBtn.dataset.hotelId;
                const hotelData = allHotels.find(h =>
                    (h.hotel?.hotelId || h.hotel?.id) === hotelId
                );

                if (hotelData && hotelId !== 'unknown' && hotelId !== 'undefined') {
                    const hotel = hotelData.hotel;
                    const checkIn = document.getElementById('hotelCheckInSearch')?.value;
                    const checkOut = document.getElementById('hotelCheckOutSearch')?.value;
                    const searchCity = document.getElementById('hotelDestSearch')?.value.trim() || '';
                    const adults = parseInt(document.getElementById('adultsInlineCount')?.textContent || '2');
                    const childrens = parseInt(document.getElementById('childrenInlineCount')?.textContent || '0');
                    const rooms = parseInt(document.getElementById('roomsInlineCount')?.textContent || '1');

                    const params = new URLSearchParams({
                        hotel_key: hotelId,
                        location_key: hotel.address?.cityCode || 'unknown',
                        chk_in: checkIn,
                        chk_out: checkOut,
                        name: hotel.name || 'Hotel',
                        image: hotel.image || 'https://via.placeholder.com/800x400',
                        rating: hotel.rating || 0,
                        reviews: hotel.reviewCount || 0,
                        location: hotel.address?.cityName || 'Unknown',
                        mentions: (hotel.mentions || []).join(','),
                        search_city: searchCity,
                        adults: adults,
                        childrens: childrens,
                        rooms: rooms
                    });

                    window.location.href = `hotelDetails.html?${params.toString()}`;
                } else {
                    showToast('Hotel information unavailable', true);
                }
            }
        });
    }

    // ===== TAB SWITCHING (Hotels vs Flights) =====
    searchTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            searchTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            const type = this.dataset.type;

            // Get filter sections
            const hotelFilters = document.getElementById('hotelFilters');
            const flightFilters = document.getElementById('flightFilters');

            if (type === 'hotel') {
                console.log('Switching to HOTEL tab');

                // Show hotel form, hide flight
                if (hotelForm) hotelForm.classList.remove('hidden');
                if (flightForm) flightForm.classList.add('hidden');

                // Show filters sidebar and hotel filters
                if (filtersSidebar) filtersSidebar.style.display = 'block';
                if (hotelFilters) hotelFilters.style.display = 'block';
                if (flightFilters) flightFilters.style.display = 'none';

                // Update sort options for hotels
                if (sortSelect) {
                    sortSelect.innerHTML = `
                    <option value="recommended">Recommended</option>
                    <option value="rating-high">Rating: High to Low</option>
                    <option value="rating-low">Rating: Low to High</option>
                `;
                }

                if (resultsGrid && resultsCount) {
                    if (allHotels.length > 0) {
                        // Restore hotel results
                        const hotelsToShow = filteredHotels.length > 0 ? filteredHotels : allHotels;
                        resultsCount.textContent = `${hotelsToShow.length} properties found in ${document.getElementById('hotelDestSearch')?.value || 'selected city'}`;
                        displayFilteredHotels(hotelsToShow);
                    } else {
                        // Show hotel search prompt
                        if (promptIcon) promptIcon.className = 'gg-search';
                        if (promptTitle) promptTitle.textContent = 'Ready to find your perfect stay?';
                        if (promptText) promptText.textContent = 'Enter your destination, dates, and number of guests above to search for hotels.';
                        resultsGrid.innerHTML = '';
                        resultsGrid.appendChild(searchPrompt);
                        resultsCount.textContent = '';
                    }
                }

            } else if (type === 'flight') {
                console.log('Switching to FLIGHT tab');

                // Show flight form, hide hotel
                if (hotelForm) hotelForm.classList.add('hidden');
                if (flightForm) flightForm.classList.remove('hidden');

                // Show filters sidebar and flight filters
                if (filtersSidebar) filtersSidebar.style.display = 'block';
                if (hotelFilters) hotelFilters.style.display = 'none';
                if (flightFilters) flightFilters.style.display = 'block';

                // Update sort options for flights
                if (sortSelect) {
                    sortSelect.innerHTML = `
                        <option value="price-low">Price: Low to High</option>
                        <option value="price-high">Price: High to Low</option>
                        <option value="duration-short">Duration: Shortest</option>
                        <option value="departure-early">Departure: Earliest</option>
                        <option value="departure-late">Departure: Latest</option>
                    `;
                }

                // Restore flight data if exists
                if (resultsGrid && resultsCount) {
                    if (allFlights.length > 0) {
                        // Restore flight results
                        const flightsToShow = filteredFlights.length > 0 ? filteredFlights : allFlights;
                        resultsCount.textContent = `${flightsToShow.length} flights found`;
                        displayFlightResults(flightsToShow, 'round-trip');
                    } else {
                        // Show flight search prompt
                        if (promptIcon) promptIcon.className = 'gg-airplane';
                        if (promptTitle) promptTitle.textContent = 'Ready to fly?';
                        if (promptText) promptText.textContent = 'Enter your departure city, destination, and travel dates above to search for flights.';
                        resultsGrid.innerHTML = '';
                        resultsGrid.appendChild(searchPrompt);
                        resultsCount.textContent = '';
                    }
                }
            }
        });
    });


    // ===== TRIP TYPE SELECT =====
    const tripTypeSelect = document.getElementById('tripTypeSelect');

    if (tripTypeSelect) {
        tripTypeSelect.addEventListener('change', (e) => {
            const value = e.target.value;

            if (value === 'round-trip') {
                if (returnDateInput) {
                    returnDateInput.style.display = 'block';
                    returnDateInput.required = true;
                }
                if (returnDateSeparator) {
                    returnDateSeparator.style.display = 'inline';
                }
            } else {
                if (returnDateInput) {
                    returnDateInput.style.display = 'none';
                    returnDateInput.required = false;
                    returnDateInput.value = '';
                }
                if (returnDateSeparator) {
                    returnDateSeparator.style.display = 'none';
                }
            }
        });
    }

    // ===== FLIGHT FORM SUBMISSION =====
    if (flightForm) {
        flightForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const originCode = document.getElementById('flightFromSearch')?.value;
            const destinationCode = document.getElementById('flightToSearch')?.value;

            if (!originCode || !destinationCode) {
                showToast('Please select origin and destination cities', true);
                return;
            }

            if (originCode === destinationCode) {
                showToast('Origin and destination cannot be the same', true);
                return;
            }

            const tripType = tripTypeSelect ? tripTypeSelect.value : 'round-trip';
            const departureDate = document.getElementById('flightDepartSearch')?.value;
            const returnDate = document.getElementById('flightReturnSearch')?.value;

            if (!departureDate) {
                showToast('Please select a departure date', true);
                return;
            }

            if (tripType === 'round-trip' && !returnDate) {
                showToast('Please select a return date for round-trip', true);
                return;
            }

            const searchData = {
                origin: originCode,
                destination: destinationCode,
                departureDate: departureDate,
                adults: parseInt(document.getElementById('flightTravelersSearch')?.value || 1),
                travelClass: document.getElementById('flightClassSearch')?.value || 'ECONOMY'
            };

            if (tripType === 'round-trip') {
                searchData.returnDate = returnDate;
            }

            showLoading();

            try {
                const response = await fetch('http://127.0.0.1:5000/search-flights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(searchData)
                });

                const data = await response.json();

                if (data.success) {
                    console.log('🔍 API Response:', data);
                    console.log('🔍 Number of flights from API:', data.flights?.length);

                    // ✅ Save to allFlights AND window.allFlights
                    allFlights = data.flights ? [...data.flights] : [];
                    filteredFlights = data.flights ? [...data.flights] : [];

                    // Make accessible globally for debugging
                    window.allFlights = allFlights;
                    window.filteredFlights = filteredFlights;

                    console.log('✅ Saved', allFlights.length, 'flights to allFlights');
                    console.log('✅ window.allFlights.length:', window.allFlights.length);

                    await displayFlightResults(data.flights, tripType);
                }
                else {
                    if (resultsGrid) {
                        resultsGrid.innerHTML = `
                        <div class="error-message">
                            <i class="gg-danger"></i>
                            <p>${data.error || 'Failed to search flights'}</p>
                        </div>
                    `;
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('Failed to search flights. Please try again.', true);
            } finally {
                hideLoading();
            }
        });
    }

    // ===== SORT DROPDOWN =====
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const sortBy = e.target.value;
            console.log(`Sorting by: ${sortBy}`);

            const activeTab = document.querySelector('.search-tab.active');
            const tabType = activeTab?.dataset.type;

            if (tabType === 'hotel') {
                console.log('Sorting HOTELS');
                // Sort hotels
                const currentHotels = filteredHotels.length > 0 ? filteredHotels : allHotels;
                const sortedHotels = sortHotels(currentHotels, sortBy);
                displayFilteredHotels(sortedHotels);

            } else if (tabType === 'flight') {
                console.log('Sorting FLIGHTS');
                const baseFlights = filteredFlights.length > 0 ? filteredFlights : allFlights;
                const sortedFlights = sortFlights(baseFlights, sortBy);
                displayFlightResults(sortedFlights, 'round-trip');
            }
        });
    }

    // ===== FAVORITE BUTTON HANDLER =====
    document.addEventListener('click', async (e) => {
        const favoriteBtn = e.target.closest('.favorite-btn');
        if (favoriteBtn) {
            e.stopPropagation();

            const hotelId = favoriteBtn.dataset.hotelId;
            const hotelData = allHotels.find(h =>
                (h.hotel?.hotelId || h.hotel?.id) === hotelId
            );

            if (!hotelData) {
                showToast('Hotel data not found', true);
                return;
            }

            const isFavorited = await toggleFavorite(hotelId, hotelData);
            const icon = favoriteBtn.querySelector('i');

            if (isFavorited) {
                favoriteBtn.classList.add('favorited');
                icon.style.color = 'red';
            } else {
                favoriteBtn.classList.remove('favorited');
                icon.style.color = '#ccc';
            }
        }
    });

    // ===== FLIGHT DETAILS BUTTON HANDLER =====
    if (resultsGrid) {
        resultsGrid.addEventListener('click', (e) => {
            const viewDetailsBtn = e.target.closest('.view-details-btn');
            if (viewDetailsBtn) {
                e.preventDefault();
                e.stopPropagation();

                const flightIndex = parseInt(viewDetailsBtn.dataset.flightIndex);

                // Get flight data from the current displayed flights
                const activeTab = document.querySelector('.search-tab.active');
                const tabType = activeTab?.dataset.type;

                if (tabType === 'flight') {
                    const currentFlights = filteredFlights.length > 0 ? filteredFlights : allFlights;
                    const flightData = currentFlights[flightIndex];

                    console.log('Flight Index:', flightIndex);
                    console.log('Flight Data:', flightData);

                    if (flightData) {
                        openFlightModal(flightData);
                    } else {
                        showToast('Flight data not found', true);
                    }
                }
            }
        });
    }

    // ===== RESTORE LAST SEARCH =====
    const lastSearch = sessionStorage.getItem('lastSearch');
    if (lastSearch) {
        try {
            const searchData = JSON.parse(lastSearch);
            console.log('✓ Restoring last search:', searchData);

            const destInput = document.getElementById('hotelDestSearch');
            if (destInput && searchData.destination) {
                destInput.value = searchData.destination;
            }

            if (checkInInput && searchData.checkIn) {
                checkInInput.value = searchData.checkIn;
            }

            if (checkOutInput && searchData.checkOut) {
                checkOutInput.value = searchData.checkOut;
            }

            const roomsCount = document.getElementById('roomsInlineCount');
            const adultsCount = document.getElementById('adultsInlineCount');
            const childrenCount = document.getElementById('childrenInlineCount');
            const guestsDisplay = document.getElementById('guestsInlineDisplay');

            if (roomsCount && searchData.rooms) {
                roomsCount.textContent = searchData.rooms;
            }

            if (adultsCount && searchData.adults) {
                adultsCount.textContent = searchData.adults;
            }

            if (childrenCount && searchData.children) {
                childrenCount.textContent = searchData.children;
            }

            if (guestsDisplay) {
                const rooms = parseInt(roomsCount?.textContent || '1');
                const adults = parseInt(adultsCount?.textContent || '2');
                const children = parseInt(childrenCount?.textContent || '0');
                guestsDisplay.textContent = `${rooms} room${rooms > 1 ? 's' : ''}, ${adults} adult${adults > 1 ? 's' : ''}, ${children} ${children === 1 ? 'child' : 'children'}`;
            }

            updateNightCount();

            setTimeout(() => {
                searchHotels();
                sessionStorage.removeItem('lastSearch');
            }, 500);
        } catch (error) {
            console.error('Error restoring search:', error);
            sessionStorage.removeItem('lastSearch');
        }
    }

    // DATE VALIDATION
    function setupDateValidation() {
        const today = new Date().toISOString().split('T')[0];

        // ===== HOTEL DATES =====
        const hotelCheckIn = document.getElementById('hotelCheckInSearch');
        const hotelCheckOut = document.getElementById('hotelCheckOutSearch');

        if (hotelCheckIn) {
            hotelCheckIn.min = today;
            hotelCheckIn.addEventListener('change', () => {
                const selectedDate = new Date(hotelCheckIn.value);
                const todayDate = new Date(today);

                if (selectedDate < todayDate) {
                    showToast('Check-in date cannot be in the past', true);
                    hotelCheckIn.value = today;
                }

                // Update check-out minimum date
                if (hotelCheckOut) {
                    hotelCheckOut.min = hotelCheckIn.value;
                }
            });
        }

        if (hotelCheckOut) {
            hotelCheckOut.min = today;
            hotelCheckOut.addEventListener('change', () => {
                if (hotelCheckIn && hotelCheckOut.value <= hotelCheckIn.value) {
                    showToast('Check-out date must be after check-in date', true);
                    hotelCheckOut.value = '';
                }
            });
        }

        // ===== FLIGHT DATES =====
        const flightDepart = document.getElementById('flightDepartSearch');
        const flightReturn = document.getElementById('flightReturnSearch');
        const tripTypeSelect = document.getElementById('tripTypeSelect');

        if (flightDepart) {
            flightDepart.min = today;

            flightDepart.addEventListener('change', () => {
                const selectedDate = new Date(flightDepart.value);
                const todayDate = new Date(today);

                // Prevent past dates
                if (selectedDate < todayDate) {
                    showToast('Departure date cannot be in the past', true);
                    flightDepart.value = today;
                }

                // Update return date minimum (must be same or after departure)
                if (flightReturn) {
                    flightReturn.min = flightDepart.value;

                    // Clear return date if it's now before departure
                    if (flightReturn.value && flightReturn.value < flightDepart.value) {
                        showToast('Return date updated to match new departure date', false);
                        flightReturn.value = '';
                    }
                }
            });
        }

        if (flightReturn) {
            flightReturn.min = today;

            flightReturn.addEventListener('change', () => {
                // Only validate if trip type is round-trip
                const tripType = tripTypeSelect ? tripTypeSelect.value : 'round-trip';

                if (tripType === 'round-trip') {
                    // Check if return date is before departure
                    if (flightDepart && flightReturn.value < flightDepart.value) {
                        showToast('Return date must be on or after departure date', true);
                        flightReturn.value = '';
                        return;
                    }

                    // Check if return date is same as departure (warn but allow)
                    if (flightDepart && flightReturn.value === flightDepart.value) {
                        showToast('Same-day return flight selected', true);
                    }
                }
            });
        }

        // Handle trip type change (one-way vs round-trip)
        if (tripTypeSelect) {
            tripTypeSelect.addEventListener('change', (e) => {
                if (e.target.value === 'one-way') {
                    // Clear return date for one-way trips
                    if (flightReturn) {
                        flightReturn.value = '';
                    }
                }
            });
        }
    }

    // Close via X button
    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.modal-close-btn');
        if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            closeFlightModal();
            console.log('✓ Close button clicked');
        }
    });

    // Close via overlay click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeFlightModal();
            console.log('✓ Overlay clicked');
        }
    });

    // Call it in DOMContentLoaded
    setupDateValidation();

});
