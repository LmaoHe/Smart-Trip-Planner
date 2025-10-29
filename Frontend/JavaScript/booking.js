// Frontend/JavaScript/booking.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';
import apiService from './api_service.js';

// ===== GLOBAL STATE =====
let allHotels = [];
let filteredHotels = [];
let currentFilters = {
    rating: null,
    priceMin: 0,
    priceMax: 10000,
};

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

    // Clear filters
    const clearFiltersBtn = document.getElementById('clearFilters');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            console.log('Clearing all filters...');

            currentFilters = {
                rating: null,
                priceMin: 0,
                priceMax: 10000
            };

            ratingCheckboxes.forEach(cb => cb.checked = false);

            if (priceSlider) priceSlider.value = 750;
            if (priceRangeLabel) priceRangeLabel.textContent = '(RM 0 - RM 750+)';
            priceButtons.forEach(b => b.classList.remove('active'));

            console.log(`Showing all ${allHotels.length} hotels`);
            displayFilteredHotels(allHotels);
        });
    }
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

async function checkIfFavorited(hotelId) {
    const user = auth.currentUser;
    if (!user) return false;

    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

        const favoriteRef = doc(db, 'users', user.uid, 'favorites', hotelId);
        const favoriteSnap = await getDoc(favoriteRef);

        return favoriteSnap.exists();
    } catch (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
}

// ===== DISPLAY FLIGHT RESULTS =====
async function displayFlightResults(flights, tripType) {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');

    if (!resultsGrid) {
        console.error('resultsGrid not found');
        return;
    }

    resultsGrid.innerHTML = '';

    if (!flights || flights.length === 0) {
        if (resultsCount) resultsCount.textContent = 'No flights found';
        resultsGrid.innerHTML = `
            <div class="no-results">
                <i class="gg-airplane" style="font-size: 48px; color: var(--text-light); margin-bottom: 16px;"></i>
                <h3>No flights found</h3>
                <p style="color: var(--text-gray);">Try different search criteria</p>
            </div>
        `;
        return;
    }

    if (resultsCount) {
        resultsCount.textContent = `${flights.length} ${flights.length === 1 ? 'flight' : 'flights'} found`;
    }

    flights.forEach((flight, index) => {
        const flightCard = createFlightCard(flight, index, tripType);
        resultsGrid.appendChild(flightCard);
    });
}

function createFlightSegmentHTML(label, itinerary) {
    const segments = itinerary.segments.map(seg => `
        <div class="segment">
            <div class="airline">
                <strong>${seg.airline} ${seg.flightNumber}</strong>
            </div>
            <div class="route">
                <div class="departure">
                    <span class="time">${formatTime(seg.departure.time)}</span>
                    <span class="airport">${seg.departure.airport}</span>
                </div>
                <div class="duration">
                    <i class="gg-airplane"></i>
                    <span>${formatDuration(seg.duration)}</span>
                </div>
                <div class="arrival">
                    <span class="time">${formatTime(seg.arrival.time)}</span>
                    <span class="airport">${seg.arrival.airport}</span>
                </div>
            </div>
        </div>
    `).join('<div class="layover"><i class="gg-sync"></i> Layover</div>');

    return `
        <div class="flight-segment">
            <h4><i class="gg-airplane"></i> ${label}</h4>
            ${segments}
            <p class="total-duration">Total Duration: ${formatDuration(itinerary.duration)}</p>
        </div>
    `;
}

function formatTime(datetime) {
    return new Date(datetime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDuration(duration) {
    const match = duration.match(/PT(\d+)H(\d+)?M?/);
    if (!match) return duration;
    const hours = match[1];
    const minutes = match[2] || '0';
    return `${hours}h ${minutes}m`;
}

window.selectFlight = function (flight) {
    sessionStorage.setItem('selectedFlight', JSON.stringify(flight));
    window.location.href = 'flightCheckout.html';
};


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

            if (action === 'plus') {
                currentValue++;
            } else if (action === 'minus' && currentValue > 0) {
                if (target === 'adultsInline' && currentValue <= 1) return;
                if (target === 'roomsInline' && currentValue <= 1) return;
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

// ===== CREATE FLIGHT CARD =====
function createFlightCard(flightData, index, tripType) {
    const card = document.createElement('div');
    card.className = 'flight-card-horizontal';

    // Extract flight information
    const itineraries = flightData.itineraries || [];
    const price = flightData.price || {};

    if (itineraries.length === 0) {
        card.innerHTML = '<p>No flight data available</p>';
        return card;
    }

    // Get outbound flight (first itinerary)
    const outbound = itineraries[0];
    const segments = outbound.segments || [];
    
    if (segments.length === 0) {
        card.innerHTML = '<p>No segments available</p>';
        return card;
    }

    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    // ✅ FIX: Use 'time' instead of 'at', 'airport' instead of 'iataCode'
    const departureDateTime = firstSegment.departure?.time;
    const arrivalDateTime = lastSegment.arrival?.time;

    if (!departureDateTime || !arrivalDateTime) {
        card.innerHTML = '<p>Invalid flight data - missing dates</p>';
        return card;
    }

    // Parse dates
    const departureDate = new Date(departureDateTime);
    const arrivalDate = new Date(arrivalDateTime);

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
    const departureDateStr = departureDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
    });
    const arrivalDateStr = arrivalDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
    });

    // Duration
    const duration = outbound.duration?.replace('PT', '').replace('H', 'h ').replace('M', 'm') || 'N/A';

    // Stops
    const stops = segments.length - 1;
    const stopsText = stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`;
    const stopsClass = stops === 0 ? 'direct' : '';

    // ✅ FIX: Use 'airline' instead of 'carrierCode'
    const airlineCode = firstSegment.airline || 'Unknown';
    const airlineName = airlineCode;

    // Price
    const totalPrice = parseFloat(price.total || 0);
    const currency = price.currency || 'MYR';
    const priceInMYR = currency === 'MYR' ? totalPrice : convertToMYR(totalPrice, currency);

    // Travel class (not in your data, default to ECONOMY)
    const travelClass = 'ECONOMY';

    // ✅ FIX: Use 'flightNumber' directly
    const flightNumber = firstSegment.flightNumber || 'N/A';

    card.innerHTML = `
        <!-- Airline Logo Section -->
        <div class="flight-logo-section">
            <div class="airline-logo">
                ✈️
            </div>
            <div class="airline-name">${airlineName}</div>
            <div class="flight-number">${flightNumber}</div>
        </div>

        <!-- Flight Details Section -->
        <div class="flight-details-section">
            <!-- Route -->
            <div class="flight-route">
                <!-- Departure -->
                <div class="flight-time-block departure">
                    <div class="flight-time">${departureTime}</div>
                    <div class="flight-airport">${firstSegment.departure?.airport || 'N/A'}</div>
                    <div class="flight-date">${departureDateStr}</div>
                </div>

                <!-- Duration & Stops -->
                <div class="flight-duration-block">
                    <div class="flight-duration">${duration}</div>
                    <div class="flight-line"></div>
                    <div class="flight-stops ${stopsClass}">${stopsText}</div>
                </div>

                <!-- Arrival -->
                <div class="flight-time-block arrival">
                    <div class="flight-time">${arrivalTime}</div>
                    <div class="flight-airport">${lastSegment.arrival?.airport || 'N/A'}</div>
                    <div class="flight-date">${arrivalDateStr}</div>
                </div>
            </div>

            <!-- Meta Info -->
            <div class="flight-meta">
                <div class="flight-class-badge">
                    <i class="gg-briefcase"></i>
                    ${travelClass}
                </div>
            </div>
        </div>

        <!-- Price Section -->
        <div class="flight-price-section">
            <div class="price-container">
                <div class="price-main">RM ${priceInMYR.toFixed(0)}</div>
                <div class="price-label">per person</div>
                <div class="price-details">${stopsText}</div>
            </div>
            <button class="select-flight-btn" data-flight-index="${index}">
                Select Flight
            </button>
        </div>
    `;

    return card;
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

    // ===== SETUP FUNCTIONS =====
    setupGuestsCounter();
    setupNightCalculator();
    setupFilters();

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
                        search_city: searchCity
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
                // Show hotel form, hide flight
                hotelForm?.classList.remove('hidden');
                flightForm?.classList.add('hidden');

                // Show filters sidebar and hotel filters
                if (filtersSidebar) filtersSidebar.style.display = 'block';
                if (hotelFilters) hotelFilters.style.display = 'block';
                if (flightFilters) flightFilters.style.display = 'none';

                // Update sort options for hotels
                sortSelect.innerHTML = `
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating-high">Rating: High to Low</option>
                <option value="rating-low">Rating: Low to High</option>
            `;

                // Update search prompt for hotels
                promptIcon.className = 'gg-search';
                promptTitle.textContent = 'Ready to find your perfect stay?';
                promptText.textContent = 'Enter your destination, dates, and number of guests above to search for hotels.';

                // Clear results grid
                resultsGrid.innerHTML = '';
                resultsGrid.appendChild(searchPrompt);

            } else if (type === 'flight') {
                // Show flight form, hide hotel
                hotelForm?.classList.add('hidden');
                flightForm?.classList.remove('hidden');

                // Show filters sidebar and flight filters
                if (filtersSidebar) filtersSidebar.style.display = 'block';
                if (hotelFilters) hotelFilters.style.display = 'none';
                if (flightFilters) flightFilters.style.display = 'block';

                // Update sort options for flights
                sortSelect.innerHTML = `
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="duration-short">Duration: Shortest</option>
                <option value="departure-early">Departure: Earliest</option>
                <option value="departure-late">Departure: Latest</option>
            `;

                // Update search prompt for flights
                promptIcon.className = 'gg-airplane';
                promptTitle.textContent = 'Ready to fly?';
                promptText.textContent = 'Enter your departure city, destination, and travel dates above to search for flights.';

                // Clear results grid
                resultsGrid.innerHTML = '';
                resultsGrid.appendChild(searchPrompt);
            }
        });
    });

    // ===== TRIP TYPE SELECT (SIMPLIFIED) =====
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
                adults: parseInt(document.getElementById('flightTravelersSearch')?.value || '1'),
                travelClass: document.getElementById('flightClassSearch')?.value || 'ECONOMY'
            };

            if (tripType === 'round-trip') {
                searchData.returnDate = returnDate;
            }

            // ✅ Use unified elements
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.style.display = 'block';
            if (resultsGrid) resultsGrid.innerHTML = '';

            try {
                const response = await fetch('http://127.0.0.1:5000/search-flights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(searchData)
                });

                const data = await response.json();
                if (loadingState) loadingState.style.display = 'none';

                if (data.success) {
                    await displayFlightResults(data.flights, tripType);
                } else {
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
                if (loadingState) loadingState.style.display = 'none';
                console.error('Error:', error);
                showToast('Failed to search flights. Please try again.', true);
            }
        });
    }

    // ===== SORT DROPDOWN =====
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const sortBy = e.target.value;
            console.log(`Sorting by: ${sortBy}`);

            const currentHotels = filteredHotels.length > 0 ? filteredHotels : allHotels;
            const sortedHotels = sortHotels(currentHotels, sortBy);
            displayFilteredHotels(sortedHotels);
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
});
