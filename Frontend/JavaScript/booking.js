// Frontend/JavaScript/booking.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';
import apiService from './api_service.js';

// ===== PROFILE UI (existing code) =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameElement || !profileAvatarElement || !profileDropdown) {
        console.error("Profile UI elements not found!");
        return;
    }

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        profileNameElement.textContent = `${firstName} ${lastName}`.trim() || 'User';

        const photoURL = userData.profilePhotoURL;
        profileAvatarElement.innerHTML = '';

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
        console.warn("Missing user data for UI update.");
        profileDropdown.style.display = 'none';
    }
}

// ===== HOTEL SEARCH (NEW) =====
async function searchHotels() {
    // Get form values
    const cityName = document.getElementById('hotelDestSearch')?.value;
    const checkIn = document.getElementById('hotelCheckInSearch')?.value;
    const checkOut = document.getElementById('hotelCheckOutSearch')?.value;
    const adults = parseInt(document.getElementById('adultsInlineCount')?.textContent || '2');
    const rooms = parseInt(document.getElementById('roomsInlineCount')?.textContent || '1');

    // Validate
    if (!cityName || !checkIn || !checkOut) {
        showToast('Please fill in all required fields', true);
        return;
    }

    // Validate dates
    if (new Date(checkOut) <= new Date(checkIn)) {
        showToast('Check-out date must be after check-in date', true);
        return;
    }

    // Show loading
    showLoading();

    try {
        // Call backend API
        const results = await apiService.searchHotels(
            cityName,
            checkIn,
            checkOut,
            adults,
            rooms
        );

        console.log('Hotel results:', results);

        // Display results
        displayHotelResults(results);

    } catch (error) {
        console.error('Search error:', error);
        showError('Failed to search hotels: ' + error.message);
    } finally {
        hideLoading();
    }
}

// ===== DISPLAY RESULTS =====
function displayHotelResults(data) {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!resultsGrid || !resultsCount) {
        console.error('Results elements not found');
        return;
    }

    // Clear previous results
    resultsGrid.innerHTML = '';

    // Check if we have results
    if (!data.data || data.data.length === 0) {
        resultsCount.textContent = 'No hotels found';
        resultsGrid.innerHTML = `
            <div class="no-results">
                <i class="gg-search"></i>
                <h3>No hotels found</h3>
                <p>Try adjusting your search criteria</p>
            </div>
        `;
        return;
    }

    // Update count
    resultsCount.textContent = `${data.data.length} properties found`;

    // Display each hotel
    data.data.forEach(hotelData => {
        const hotelCard = createHotelCard(hotelData);
        resultsGrid.appendChild(hotelCard);
    });
}

// ===== CREATE HOTEL CARD =====
function createHotelCard(hotelData) {
    const card = document.createElement('div');
    card.className = 'hotel-card';
    
    const hotel = hotelData.hotel;
    const offer = hotelData.offers?.[0];
    
    const hotelName = hotel.name || 'Hotel Name Unavailable';
    const cityName = hotel.address?.cityName || 'Location not available';
    const rating = hotel.rating || 'N/A';
    
    // Price info
    let priceHTML = '<p class="price-unavailable">Price not available</p>';
    if (offer && offer.price) {
        const currency = offer.price.currency || 'MYR';
        const total = parseFloat(offer.price.total || 0).toFixed(2);
        priceHTML = `
            <div class="hotel-price">
                <span class="price-amount">${currency} ${total}</span>
                <span class="price-label">Total</span>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="hotel-image" style="background: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.4)), url('https://source.unsplash.com/400x300/?hotel,${encodeURIComponent(hotelName)}') center/cover;">
            ${rating !== 'N/A' ? `<span class="hotel-rating"><i class="gg-star"></i> ${rating}</span>` : ''}
        </div>
        <div class="hotel-info">
            <h3 class="hotel-name">${hotelName}</h3>
            <p class="hotel-address">
                <i class="gg-pin"></i> ${cityName}
            </p>
            ${priceHTML}
            <button class="book-btn" onclick="viewHotelDetails('${hotel.hotelId}', '${offer?.id || ''}')">
                View Details
            </button>
        </div>
    `;
    
    return card;
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
    if (resultsGrid) resultsGrid.style.display = 'flex';
}

function showError(message) {
    const resultsGrid = document.getElementById('resultsGrid');
    if (!resultsGrid) return;
    
    resultsGrid.innerHTML = `
        <div class="error-message">
            <i class="gg-danger"></i>
            <h3>Error</h3>
            <p>${message}</p>
        </div>
    `;
    hideLoading();
}

// ===== MAKE FUNCTIONS GLOBAL =====
window.viewHotelDetails = function(hotelId, offerId) {
    console.log('View hotel:', hotelId, offerId);
    // Navigate to hotel details page
    window.location.href = `hotelDetails.html?hotelId=${hotelId}&offerId=${offerId}`;
};

// ===== AUTH STATE (existing code) =====
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
                showToast("Error: Your profile data could not be found. Logging out", true);
                await handleLogout();
            }
        } catch (error) {
            console.error("Error fetching user data...", error);
            showToast("Error loading your profile. Please try again later.", true);
        }
    } else {
        window.location.href = 'login.html';
    }
});

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
    // Profile dropdown
    const profileTrigger = document.querySelector('.profile-trigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileTrigger) {
        profileTrigger.addEventListener('click', () => {
            profileDropdown?.classList.toggle('active');
        });
    }

    document.addEventListener('click', function (event) {
        if (profileDropdown && !profileDropdown.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // Hotel search form
    const hotelForm = document.getElementById('hotelInlineForm');
    if (hotelForm) {
        hotelForm.addEventListener('submit', (e) => {
            e.preventDefault();
            searchHotels();
        });
    }

    // Tab switching (if you have flight tabs)
    const searchTabs = document.querySelectorAll('.search-tab');
    searchTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            searchTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const type = this.dataset.type;
            const hotelForm = document.getElementById('hotelInlineForm');
            const flightForm = document.getElementById('flightInlineForm');
            
            if (type === 'hotel' && hotelForm && flightForm) {
                hotelForm.classList.remove('hidden');
                flightForm.classList.add('hidden');
            } else if (type === 'flight' && hotelForm && flightForm) {
                hotelForm.classList.add('hidden');
                flightForm.classList.remove('hidden');
            }
        });
    });
});
