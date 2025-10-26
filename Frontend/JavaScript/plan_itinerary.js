// JavaScript/planItinerary.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleLogout } from './auth.js';
import { showToast, setLoading, showError, hideError } from './utils.js';

// --- Header UI Functions (Copied from other admin scripts) ---
function getInitials(firstName = '', lastName = '') {
    const firstInitial = firstName ? firstName[0].toUpperCase() : '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';
    return `${firstInitial}${lastInitial}` || 'U'; // 'U' for User
}

function updateHeaderUI(userData) {
    const profileNameEl = document.getElementById('profileName');
    const profileAvatarEl = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameEl || !profileAvatarEl || !profileDropdown) {
        console.warn("Header profile elements not found.");
        return;
    }

    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    profileNameEl.textContent = `${firstName} ${lastName}`.trim() || 'User';

    const photoURL = userData.profilePhotoURL;
    profileAvatarEl.innerHTML = '';

    if (photoURL) {
        const cacheBustedURL = `${photoURL}?t=${new Date().getTime()}`;
        const img = document.createElement('img');
        img.src = cacheBustedURL;
        img.alt = "Avatar";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
        profileAvatarEl.appendChild(img);
    } else {
        profileAvatarEl.textContent = getInitials(firstName, lastName);
    }
    profileDropdown.style.display = 'flex';
}

function toggleDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}
// --- End Header UI Functions ---

const cityData = {
    "JP": [ // Japan
        { id: "TYO", name: "Tokyo" },
        { id: "KIX", name: "Osaka" },
        { id: "UKB", name: "Kyoto" }
    ],
    "MY": [ // Malaysia
        { id: "KUL", name: "Kuala Lumpur" },
        { id: "PEN", name: "Penang" }
    ],
    "KR": [ // South Korea
        { id: "SEL", name: "Seoul" },
        { id: "PUS", name: "Busan" }
    ],
};

function populateCityDropdown(selectedCountry) {
    const citySelectGroup = document.getElementById('citySelectGroup');
    const citySelect = document.getElementById('citySelect');

    // Clear old options
    citySelect.innerHTML = '<option value="">-- Select City --</option>';

    if (selectedCountry && cityData[selectedCountry]) {
        const cities = cityData[selectedCountry];

        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.name; // e.g., "Bangkok"
            option.textContent = city.name;
            citySelect.appendChild(option);
        });

        citySelectGroup.style.display = 'block';
    } else {
        citySelectGroup.style.display = 'none';
    }
}

function validateTripForm() {
    let isValid = true;

    // 1. Hide all previous errors
    hideError('countryError');
    hideError('cityError');
    hideError('startDateError');
    hideError('endDateError');
    hideError('travelersError');
    hideError('budgetError');
    hideError('interestsError');

    // 2. Get values
    const country = document.getElementById('countrySelect').value;
    const city = document.getElementById('citySelect').value;
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
    const travelers = document.getElementById('travelers').value;
    const budget = document.getElementById('budget').value;
    
    // FIXED: Changed from '.active' to '.selected' to match CSS
    const activeInterests = document.querySelectorAll('.interest-tag.selected').length;

    // 3. Run checks
    if (!country) {
        showError('countryError', 'Please select a country.');
        isValid = false;
    }

    if (!city) {
        showError('cityError', 'Please select a city.');
        isValid = false;
    }

    if (!startDateStr) {
        showError('startDateError', 'Please select a start date.');
        isValid = false;
    }

    if (!endDateStr) {
        showError('endDateError', 'Please select an end date.');
        isValid = false;
    }

    // 4. Check date logic (only if both dates are selected)
    if (startDateStr && endDateStr) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const today = new Date();

        // Set time to 00:00:00 for accurate day comparison
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (startDate < today) {
            showError('startDateError', 'Start date cannot be in the past.');
            isValid = false;
        }

        if (endDate < startDate) {
            showError('endDateError', 'End date cannot be before the start date.');
            isValid = false;
        }
    }

    if (!travelers) {
        showError('travelersError', 'Please select the number of travelers.');
        isValid = false;
    }

    if (!budget) {
        showError('budgetError', 'Please select your budget.');
        isValid = false;
    }

    if (activeInterests === 0) {
        showError('interestsError', 'Please select at least one interest.');
        isValid = false;
    }

    return isValid;
}

async function handleItineraryGenerate(event) {
    event.preventDefault();
    console.log("Generating itinerary...");

    if (!validateTripForm()) {
        console.warn("Form is invalid. Please check errors.");
        return;
    }

    const generateBtn = document.getElementById('generateBtn');
    setLoading(generateBtn, true, 'Generating...', '✨ Generate Itinerary');

    try {
        const destinationCity = document.getElementById('citySelect').value;
        const startDate = document.getElementById('startDate').value;

        const interests = [];
        // FIXED: Changed from '.active' to '.selected' to match CSS
        document.querySelectorAll('.interest-tag.selected').forEach(tag => {
            interests.push(tag.dataset.interest);
        });

        // --- (TODO: Call your backend recommender) ---
        // const idToken = await auth.currentUser.getIdToken();
        // const response = await fetch('http://127.0.0.1:5000/get-recommendation', { ... });

        // --- SIMULATION ---
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log("Pretend-recommendation complete for:", destinationCity);
        console.log("Selected interests:", interests);
        // --- END SIMULATION ---

        showToast("Itinerary generated successfully!", false);
        // --- (TODO: Redirect to the results page) ---
        // window.location.href = 'viewItinerary.html?id=...';

    } catch (error) {
        console.error("Error generating itinerary:", error);
        showToast(`Error: ${error.message}`, true);
    } finally {
        setLoading(generateBtn, false, 'Generating...', '✨ Generate Itinerary');
    }
}

function clearForm() {
    const form = document.getElementById('tripForm');
    form.reset();
    
    // FIXED: Changed from '.active' to '.selected' to match CSS
    document.querySelectorAll('.interest-tag.selected').forEach(tag => {
        tag.classList.remove('selected');
    });
    
    populateCityDropdown(''); // Hide city dropdown
    
    // Clear all error messages
    document.querySelectorAll('.error-message').forEach(err => {
        err.classList.remove('show');
    });
    
    console.log("Form cleared.");
}

// --- Main Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Plan Itinerary page loaded.");

    // --- Get Elements ---
    const countrySelect = document.getElementById('countrySelect');
    const profileTrigger = document.getElementById('profileTrigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const tripForm = document.getElementById('tripForm');
    const clearFormBtn = document.getElementById('clearFormBtn');

    // --- Authentication Check (for header) ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    updateHeaderUI(docSnap.data());
                } else {
                    console.error("User document missing:", user.uid);
                    window.location.href = 'login.html'; // Redirect if profile is broken
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                window.location.href = 'login.html'; // Redirect on error
            }
        } else {
            console.log("User signed out. Redirecting to login.");
            window.location.href = 'login.html';
        }
    });

    // --- Attach Event Listeners ---
    if (profileTrigger) profileTrigger.addEventListener('click', toggleDropdown);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    // Close dropdown on click outside
    document.addEventListener('click', (event) => {
        if (profileDropdown && !profileDropdown.contains(event.target) && event.target !== profileTrigger && !profileTrigger.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    // Country dropdown listener
    if (countrySelect) {
        countrySelect.addEventListener('change', () => {
            populateCityDropdown(countrySelect.value);
        });
    }

    // Interest tag toggle listener
    // FIXED: Changed from '.active' to '.selected' to match CSS
    document.querySelectorAll('.interest-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('selected');
            console.log('Interest tag clicked:', tag.dataset.interest);
        });
    });

    // Form listeners
    if (tripForm) tripForm.addEventListener('submit', handleItineraryGenerate);
    if (clearFormBtn) clearFormBtn.addEventListener('click', clearForm);

}); // End DOMContentLoaded
