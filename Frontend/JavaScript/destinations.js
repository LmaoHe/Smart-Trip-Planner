import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState } from './auth.js';

// ===== GLOBAL VARIABLES =====
let userWishlist = [];
let currentUser = null;
let allItineraries = [];
let filteredItineraries = [];

// ===== USER PROFILE UI =====
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
        const fullName = `${firstName} ${lastName}`.trim() || 'User';

        profileNameElement.textContent = fullName;

        const photoURL = userData.profilePhotoURL;
        profileAvatarElement.innerHTML = '';

        if (photoURL) {
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = `${fullName}'s profile picture`;
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
            profileAvatarElement.appendChild(img);
        } else {
            const firstInitial = firstName ? firstName[0].toUpperCase() : '';
            const lastInitial = lastName ? lastName[0].toUpperCase() : '';
            const initials = `${firstInitial}${lastInitial}` || 'U';
            profileAvatarElement.textContent = initials;
        }

        profileDropdown.style.display = 'flex';
    } else {
        profileDropdown.style.display = 'none';
    }
}

// ===== LOAD USER WISHLIST (SUBCOLLECTION METHOD) =====
async function loadUserWishlist(userId) {
    try {
        const wishlistRef = collection(db, 'users', userId, 'wishlist');
        const snapshot = await getDocs(wishlistRef);
        userWishlist = snapshot.docs.map(doc => doc.data().itineraryId);
    } catch (error) {
        console.error('❌ Error loading wishlist:', error);
        userWishlist = [];
    }
}

// ===== FILTER & SORT FUNCTIONALITY =====
function initializeFilters() {
    const sortBySelect = document.getElementById('sortBy');
    const filterCountrySelect = document.getElementById('filterCountry');
    const filterRatingSelect = document.getElementById('filterRating');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    sortBySelect?.addEventListener('change', applyFiltersAndSort);
    filterCountrySelect?.addEventListener('change', applyFiltersAndSort);
    filterRatingSelect?.addEventListener('change', applyFiltersAndSort);
    clearFiltersBtn?.addEventListener('click', resetFilters);
}

// ===== POPULATE COUNTRY FILTER =====
function populateCountryFilter(itineraries) {
    const filterCountrySelect = document.getElementById('filterCountry');
    if (!filterCountrySelect) return;

    while (filterCountrySelect.options.length > 1) {
        filterCountrySelect.remove(1);
    }
    const countries = [...new Set(itineraries.map(i => i.destination?.country).filter(Boolean))].sort();
    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        filterCountrySelect.appendChild(option);
    });
}

// ===== APPLY FILTERS AND SORT =====
function applyFiltersAndSort() {
    const sortBy = document.getElementById('sortBy')?.value || 'newest';
    const filterCountry = document.getElementById('filterCountry')?.value || '';
    const filterRating = document.getElementById('filterRating')?.value || '';

    let filtered = [...allItineraries];

    // Filter by country
    if (filterCountry) {
        filtered = filtered.filter(i => i.destination?.country === filterCountry);
    }
    // Filter by rating 
    if (filterRating) {
        filtered = filtered.filter(i => (i.rating || 0) >= parseFloat(filterRating));
    }

    // Sort
    switch (sortBy) {
        case 'price-low':
            filtered.sort((a, b) => {
                let priceA = a.budget?.min || 0;
                let priceB = b.budget?.min || 0;
                priceA = typeof priceA === 'string' ? parseFloat(priceA) : priceA;
                priceB = typeof priceB === 'string' ? parseFloat(priceB) : priceB;
                return priceA - priceB;
            });
            break;
        case 'price-high':
            filtered.sort((a, b) => {
                let priceA = a.budget?.max || 0;
                let priceB = b.budget?.max || 0;
                priceA = typeof priceA === 'string' ? parseFloat(priceA) : priceA;
                priceB = typeof priceB === 'string' ? parseFloat(priceB) : priceB;
                return priceB - priceA;
            });
            break;
        case 'rating-high':
            filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'rating-low':
            filtered.sort((a, b) => (a.rating || 0) - (b.rating || 0));
            break;
        case 'newest':
        default:
            filtered.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                return dateB - dateA;
            });
    }

    filteredItineraries = filtered;
    updateResultsInfo(filteredItineraries.length);
    displayItineraries(filteredItineraries);
}

// ===== RESET FILTERS =====
function resetFilters() {
    document.getElementById('sortBy').value = 'newest';
    document.getElementById('filterCountry').value = '';
    document.getElementById('filterRating').value = '';

    const sorted = [...allItineraries].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateB - dateA;
    });

    filteredItineraries = sorted;
    updateResultsInfo(filteredItineraries.length);
    displayItineraries(filteredItineraries);
}

// ===== UPDATE RESULTS INFO =====
function updateResultsInfo(count) {
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        if (count === 0) {
            resultsCount.textContent = 'No itineraries match your filters';
        } else if (count === 1) {
            resultsCount.textContent = 'Showing 1 itinerary';
        } else {
            resultsCount.textContent = `Showing ${count} itineraries`;
        }
    }
}

async function loadItineraries() {
    try {
        const itinerariesRef = collection(db, 'itineraries');
        const snapshot = await getDocs(itinerariesRef);

        // Only include published itineraries for user display
        allItineraries = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(itinerary => itinerary.publishStatus === 'published');

        populateCountryFilter(allItineraries);

        // Sort by newest by default
        filteredItineraries = [...allItineraries].sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
        });

        displayItineraries(filteredItineraries);
        updateResultsInfo(allItineraries.length);

    } catch (error) {
        console.error('❌ Error loading itineraries:', error);
    }
}

function displayItineraries(itineraries) {
    const container = document.getElementById('itinerariesContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!itineraries.length) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
            <p style="color: #999; font-size: 16px;">No itineraries available at the moment</p>
        </div>`;
        return;
    }

    itineraries.forEach((itinerary, index) => {
        // Payment badge
        let paymentBadge = '';
        if (itinerary.paymentStatus === "open") {
            paymentBadge = `<span class="status-badge badge-payment-open">Payment Open</span>`;
        }

        // Tags
        let tagsHTML = '';
        if (Array.isArray(itinerary.tags)) {
            tagsHTML = itinerary.tags.map(tag =>
                `<span class="tag">${tag}</span>`
            ).join('');
        }

        // Destination
        const city = itinerary.destination?.city || '';
        const country = itinerary.destination?.country || '';
        const destinationStr = city && country ? `${city}, ${country}` : city || country || '';

        // Price (fixed price)
        let fixedPrice = itinerary.pricePerPerson ?? itinerary.price;
        fixedPrice = (typeof fixedPrice === 'number' && !isNaN(fixedPrice)) ? fixedPrice : null;

        const card = document.createElement('div');
        card.className = 'user-itinerary-card';
        card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `
            <div class="user-card-image-container">
                <img src="${itinerary.coverImage || './images/placeholder.png'}"
                     class="user-card-image" alt="${itinerary.title || 'Itinerary cover'}"/>
                <div class="user-card-badges">${paymentBadge}</div>
            </div>
            <div class="user-card-content">
                <div class="user-card-header">
                    <h3 class="user-card-title">${itinerary.title || ''}</h3>
                    <div class="user-card-destination">
                        <i class="fa fa-map-marker-alt"></i>
                        ${destinationStr}
                    </div>
                </div>
                <div class="user-card-summary">${itinerary.shortSummary || ''}</div>
                <div class="user-card-meta">
                    <span><i class="fa fa-calendar"></i>
                        ${itinerary.duration?.days ? itinerary.duration.days + ' Days' : ''}
                        ${itinerary.duration?.nights ? "/ " + itinerary.duration.nights + ' Nights' : ''}
                    </span>
                    <span><i class="fa fa-users"></i>
                        Interest: ${itinerary.interestCount ?? 0}/${itinerary.interestThreshold ?? 0}
                    </span>
                </div>
                <div class="user-card-tags">${tagsHTML}</div>
                    <div class="user-card-footer">
                        <div class="user-card-price">
                            ${fixedPrice ? 'RM' + fixedPrice : 'Price on request'}
                        </div>
                        <a class="user-details-btn" href="itineraryDetails.html?id=${encodeURIComponent(itinerary.id)}">
                            View Details <i class="fa fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
            </div>
        `;
        card.onclick = (e) => {
            if (!e.target.closest('.user-details-btn')) {
                window.location.href = `itineraryDetails.html?id=${encodeURIComponent(itinerary.id)}`;
            }
        };
        container.appendChild(card);
    });
}


// ===== VIEW DETAILS BUTTON HANDLER FOR MODAL OR NAVIGATION =====
window.viewDetails = function (itineraryId) {
    window.location.href = `itineraryDetails.html?id=${encodeURIComponent(itineraryId)}`;
};

// ===== INITIALIZE EVENT LISTENERS =====
function initializeEventListeners() {
    // Profile dropdown
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) {
        profileDropdown.addEventListener('click', function (e) {
            e.stopPropagation();
            this.classList.toggle('active');
        });
    }

    document.addEventListener('click', function () {
        if (profileDropdown) {
            profileDropdown.classList.remove('active');
        }
    });

    // Logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async function (e) {
            e.preventDefault();
            try {
                await auth.signOut();
                window.location.href = 'login.html';
            } catch (error) {
                console.error('❌ Logout error:', error);
            }
        });
    }
}

// ===== AUTH STATE OBSERVER =====
observeAuthState(async (user) => {
    currentUser = user;

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
                await loadUserWishlist(user.uid);
            }

            loadItineraries();

        } catch (error) {
            console.error("❌ Error fetching user data:", error);
        }
    } else {
        window.location.href = 'login.html';
    }
});

// ===== INITIALIZE ON PAGE LOAD =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeEventListeners();
        initializeFilters();
    });
} else {
    initializeEventListeners();
    initializeFilters();
}
