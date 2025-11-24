import { db, auth } from './firebase-config.js';
import { doc, getDoc, collection, query, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

let currentUser = null;

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
        console.warn("Missing user data for UI update.");
        profileDropdown.style.display = 'none';
    }
}

function toggleDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// ===== LOAD FEATURED ITINERARIES FROM FIRESTORE =====
async function loadFeaturedItineraries() {
    try {
        console.log('📍 Loading featured itineraries from Firestore...');

        const itinerariesRef = collection(db, 'itineraries');
        const q = query(itinerariesRef, limit(6));
        const querySnapshot = await getDocs(q);

        const itineraries = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id;
            itineraries.push(data);
        });

        if (itineraries.length > 0) {
            displayItineraries(itineraries);
            console.log(`✅ Loaded ${itineraries.length} featured itineraries from Firestore`);
        } else {
            console.warn('⚠️ No itineraries found in Firestore');
            showNoItinerariesMessage();
        }
    } catch (error) {
        console.error('❌ Error loading itineraries from Firestore:', error);
        showErrorMessage(error);
    }
}

// ===== SHOW NO ITINERARIES MESSAGE =====
function showNoItinerariesMessage() {
    const container = document.getElementById('itinerariesContainer');
    if (container) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <p style="color: #999; font-size: 16px;">No itineraries available at the moment</p>
            </div>
        `;
    }
}

// ===== SHOW ERROR MESSAGE =====
function showErrorMessage(error) {
    const container = document.getElementById('itinerariesContainer');
    const errorContainer = document.getElementById('errorContainer');

    if (container) {
        container.innerHTML = '';
    }

    if (errorContainer) {
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = `
            <p>❌ Failed to load itineraries. Please refresh the page or try again later.</p>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #3D9BF3; color: white; border: none; border-radius: 6px; cursor: pointer;">
                Refresh Page
            </button>
        `;
    }
}

function displayItineraries(itineraries) {
    const container = document.getElementById('itinerariesGrid');
    const errorContainer = document.getElementById('errorContainer');
    if (!container) return;
    if (errorContainer) errorContainer.style.display = 'none';
    container.innerHTML = '';

    // ===== Filter out draft itineraries =====
    const publishedItineraries = itineraries.filter(itinerary => itinerary.publishStatus === 'published');

    if (!publishedItineraries.length) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
            <p style="color: #999; font-size: 16px;">No published itineraries available at the moment</p>
        </div>`;
        return;
    }

    publishedItineraries.forEach((itinerary, index) => {
        // Payment status badge logic
        let paymentBadge = '';
        if (itinerary.paymentStatus === "open") {
            paymentBadge = '<span class="status-badge badge-payment-open">Payment Open</span>';
        }

        // Tags HTML
        let tagsHTML = '';
        if (Array.isArray(itinerary.tags)) {
            tagsHTML = itinerary.tags.map(tag =>
                `<span class="tag">${tag}</span>`
            ).join('');
        }

        // Compose destination string
        const city = itinerary.destination?.city || '';
        const country = itinerary.destination?.country || '';
        const destinationStr = city && country ? `${city}, ${country}` : city || country || '';

        // Price logic (use fixed price or fallback to request)
        let fixedPrice = itinerary.pricePerPerson ?? itinerary.price;
        fixedPrice = (typeof fixedPrice === 'number' && !isNaN(fixedPrice)) ? fixedPrice : null;

        // Card HTML (footer at the bottom)
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
        `;
        card.onclick = (e) => {
            if (!e.target.closest('.user-details-btn')) {
                window.location.href = `itineraryDetails.html?id=${encodeURIComponent(itinerary.id)}`;
            }
        };
        container.appendChild(card);
    });
}


// ===== VIEW ITINERARY DETAILS =====
window.viewItinerary = function (itineraryId) {
    console.log(`🔍 Opening itinerary: ${itineraryId}`);
    window.location.href = `itineraryDetails.html?id=${itineraryId}`;
};

// ===== AUTH STATE OBSERVER =====
observeAuthState(async (user) => {
    currentUser = user;

    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                console.log("✅ User data from Firestore: ", userData);

                if (userData.profilePhotoURL) {
                    userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                }

                updateUserProfileUI(userData);
            } else {
                console.warn("⚠️ User profile not found, creating default...");
                updateUserProfileUI({ firstName: user.displayName || 'User' });
            }

            loadFeaturedItineraries();

        } catch (error) {
            console.error("❌ Error fetching user data...", error);
            showToast('Error loading your profile', true);
            const profileDropdown = document.getElementById('profileDropdown');
            if (profileDropdown) profileDropdown.style.display = 'none';
            loadFeaturedItineraries();
        }
    } else {
        console.log("⚠️ User not logged in - redirecting to login");
        window.location.href = 'login.html';
    }
});

// ===== DOM CONTENT LOADED =====
document.addEventListener('DOMContentLoaded', () => {
    const profileTrigger = document.querySelector('.profile-trigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileTrigger) {
        profileTrigger.removeAttribute('onclick');
        profileTrigger.addEventListener('click', toggleDropdown);
    }

    document.addEventListener('click', function (event) {
        if (profileDropdown && !profileDropdown.contains(event.target) && !event.target.closest('.profile-trigger')) {
            profileDropdown.classList.remove('active');
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            try {
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            } catch (error) {
                console.error(`Error finding smooth scroll target ${targetId}:`, error);
            }
        });
    });
});
