import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleLogout } from './auth.js';
import { showToast, setLoading, showError, hideError } from './utils.js';

// ===== LOCATION DATA (COMPLETE - ALL 84 CITIES) =====
const LOCATIONS = {
    // ASIA
    'Malaysia': ['Kuala Lumpur', 'Penang', 'Langkawi'],
    'Singapore': ['Singapore'],
    'Thailand': ['Bangkok', 'Phuket', 'Chiang Mai', 'Krabi'],
    'Indonesia': ['Bali', 'Jakarta', 'Yogyakarta'],
    'Japan': ['Tokyo', 'Kyoto', 'Osaka', 'Hiroshima'],
    'South Korea': ['Seoul', 'Busan', 'Jeju Island'],
    'Vietnam': ['Hanoi', 'Ho Chi Minh City', 'Da Nang'],
    'Cambodia': ['Siem Reap'],

    // EUROPE
    'France': ['Paris', 'Nice', 'Lyon', 'Marseille'],
    'Italy': ['Rome', 'Venice', 'Florence', 'Milan', 'Naples'],
    'Spain': ['Barcelona', 'Madrid', 'Seville', 'Valencia'],
    'United Kingdom': ['London', 'Edinburgh', 'Liverpool'],
    'Germany': ['Berlin', 'Munich', 'Frankfurt'],
    'Netherlands': ['Amsterdam', 'Rotterdam'],
    'Switzerland': ['Zurich', 'Geneva', 'Interlaken'],
    'Greece': ['Athens', 'Santorini', 'Mykonos'],
    'Portugal': ['Lisbon', 'Porto'],
    'Czech Republic': ['Prague'],

    // AMERICAS
    'United States': ['New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Miami', 'Orlando'],
    'Canada': ['Toronto', 'Vancouver', 'Montreal'],
    'Brazil': ['Rio de Janeiro', 'São Paulo'],
    'Mexico': ['Cancun', 'Mexico City', 'Playa del Carmen'],
    'Peru': ['Cusco', 'Lima'],
    'Argentina': ['Buenos Aires'],

    // MIDDLE EAST & AFRICA
    'UAE': ['Dubai', 'Abu Dhabi'],
    'Turkey': ['Istanbul', 'Cappadocia'],
    'Egypt': ['Cairo', 'Luxor', 'Sharm El Sheikh'],
    'Morocco': ['Marrakech', 'Casablanca'],
    'South Africa': ['Cape Town'],

    // OCEANIA
    'Australia': ['Sydney', 'Melbourne', 'Gold Coast'],
    'New Zealand': ['Auckland', 'Queenstown']
};

// ===== HEADER UI FUNCTIONS =====
function getInitials(firstName = '', lastName = '') {
    const firstInitial = firstName ? firstName[0].toUpperCase() : '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';
    return `${firstInitial}${lastInitial}` || 'U';
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

// ===== FORM VALIDATION =====
function validateTripForm() {
    let isValid = true;

    // Hide all previous errors
    hideError('departingFromError');
    hideError('destinationError');
    hideError('startDateError');
    hideError('endDateError');
    hideError('travelStyleError');

    // Get values
    const departingFrom = document.getElementById('departingFrom').value;
    const destination = document.getElementById('destination').value;
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;

    // Run checks
    if (!departingFrom) {
        showError('departingFromError', 'Please select your departure city.');
        isValid = false;
    }

    if (!destination) {
        showError('destinationError', 'Please select a destination city.');
        isValid = false;
    }

    // Check if departure and destination are different
    if (departingFrom && destination && departingFrom === destination) {
        showError('destinationError', 'Destination must be different from departure city.');
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

    // Check date logic
    if (startDateStr && endDateStr) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const today = new Date();

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (startDate < today) {
            showError('startDateError', 'Start date cannot be in the past.');
            isValid = false;
        }

        if (endDate <= startDate) {
            showError('endDateError', 'End date must be after the start date.');
            isValid = false;
        }
    }

    const selectedTravelStyles = document.querySelectorAll('input[name="travelStyle"]:checked');

    if (selectedTravelStyles.length === 0) {
        showError('travelStyleError', 'Please select at least one travel style preference.');
        isValid = false;
    } else {
        const styleValues = Array.from(selectedTravelStyles).map(cb => cb.value);
        console.log('✅ Selected Travel Styles:', styleValues);
    }

    return isValid;
}

// ===== GET COUNTRY FROM CITY =====
function getCityCountry(city) {
    for (const [country, cities] of Object.entries(LOCATIONS)) {
        if (cities.includes(city)) {
            return country;
        }
    }
    return null;
}

// ===== CALCULATE NIGHTS =====
function calculateNights(checkIn, checkOut) {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// ===== HANDLE ITINERARY GENERATE =====
async function handleItineraryGenerate(event) {
    event.preventDefault();
    console.log("🚀 Generating itinerary...");

    if (!validateTripForm()) {
        console.warn("❌ Form is invalid. Please check errors.");
        showToast('Please fill all required fields', true);
        return;
    }

    const generateBtn = document.getElementById('generateBtn');

    try {
        setLoading(generateBtn, true, 'Generating...', '✨ Plan a Trip');

        // Get form values
        const departingFrom = document.getElementById('departingFrom').value;
        const destinationCity = document.getElementById('destination').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        // GET ALL SELECTED TRAVEL STYLES 
        const selectedTravelStyles = [];
        document.querySelectorAll('input[name="travelStyle"]:checked').forEach(checkbox => {
            selectedTravelStyles.push(checkbox.value);
        });

        console.log('🏷️ Selected Travel Styles:', selectedTravelStyles);

        // Get selected "With Whom" preference
        const withWhom = document.querySelector('input[name="withWhom"]:checked')?.value || 'solo';

        console.log('👥 Traveling With:', withWhom);

        // Get country from city
        const country = getCityCountry(destinationCity);

        if (!country) {
            throw new Error('Could not determine country for selected city');
        }

        // Calculate nights
        const nights = calculateNights(startDate, endDate);

        // Prepare data
        const itineraryFormData = {
            departingFrom: departingFrom,
            destination: destinationCity,
            country: country,
            startDate: startDate,
            endDate: endDate,
            nights: nights,
            withWhom: withWhom,
            travelStyles: selectedTravelStyles,
            timestamp: new Date().toISOString()
        };

        console.log('📋 Form data prepared:', itineraryFormData);

        // Store in sessionStorage
        sessionStorage.setItem('itineraryFormData', JSON.stringify(itineraryFormData));

        // Redirect to AI Itinerary page
        setTimeout(() => {
            window.location.href = 'aiItinerary.html';
        }, 1000);

    } catch (error) {
        console.error("❌ Error generating itinerary:", error);
        showToast(`Error: ${error.message}`, true);
    } finally {
        setLoading(generateBtn, false, 'Generating...', '✨ Plan a Trip');
    }
}

// ===== CLEAR FORM =====
function clearForm() {
    const form = document.getElementById('tripForm');
    form.reset();

    // Clear all error messages
    document.querySelectorAll('.error-message').forEach(err => {
        err.classList.remove('show');
    });

    // Reset preferences dropdown to expanded state
    const preferencesContent = document.getElementById('preferencesContent');
    const expandPreferencesBtn = document.getElementById('expandPreferences');
    if (preferencesContent) {
        preferencesContent.classList.remove('collapsed');
    }
    if (expandPreferencesBtn) {
        expandPreferencesBtn.classList.remove('active');
    }

    console.log("✅ Form cleared.");
}

// ===== MAIN PAGE INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log("📄 Plan Itinerary page loaded.");

    // Get Elements
    const profileTrigger = document.getElementById('profileTrigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const tripForm = document.getElementById('tripForm');
    const clearFormBtn = document.getElementById('clearFormBtn');

    // Authentication Check
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    updateHeaderUI(docSnap.data());
                    console.log('✅ User authenticated:', user.email);
                } else {
                    console.error("❌ User document missing:", user.uid);
                    window.location.href = 'login.html';
                }
            } catch (error) {
                console.error("❌ Error fetching user data:", error);
                window.location.href = 'login.html';
            }
        } else {
            console.log("⚠️ User signed out. Redirecting to login.");
            window.location.href = 'login.html';
        }
    });

    // Attach Event Listeners
    if (profileTrigger) {
        profileTrigger.addEventListener('click', toggleDropdown);
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // Close dropdown on click outside
    document.addEventListener('click', (event) => {
        if (profileDropdown &&
            !profileDropdown.contains(event.target) &&
            event.target !== profileTrigger &&
            !profileTrigger?.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    // ===== PREFERENCES DROPDOWN TOGGLE =====
    const expandPreferencesBtn = document.getElementById('expandPreferences');
    const preferencesContent = document.getElementById('preferencesContent');

    if (expandPreferencesBtn && preferencesContent) {
        expandPreferencesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            preferencesContent.classList.toggle('collapsed');
            expandPreferencesBtn.classList.toggle('active');
            console.log('🔄 Preferences toggled');
        });

        const sectionHeader = document.querySelector('.section-header');
        if (sectionHeader) {
            sectionHeader.addEventListener('click', (e) => {
                if (!e.target.closest('.expand-btn')) {
                    preferencesContent.classList.toggle('collapsed');
                    expandPreferencesBtn.classList.toggle('active');
                    console.log('🔄 Preferences toggled (header click)');
                }
            });
        }
    }

    // Travel Style Preference change handler
    document.querySelectorAll('input[name="travelStyle"]').forEach(input => {
        input.addEventListener('change', () => {
            const preference = input.value;
            console.log('🎯 Travel Style Preference selected:', preference);
        });
    });

    // With Whom Preference change handler
    document.querySelectorAll('input[name="withWhom"]').forEach(input => {
        input.addEventListener('change', () => {
            const preference = input.value;
            console.log('👥 With Whom Preference selected:', preference);
        });
    });

    // Form submission
    if (tripForm) {
        tripForm.addEventListener('submit', handleItineraryGenerate);
    }

    // Clear form button
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', clearForm);
    }

    // Set minimum date to today
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    if (startDateInput) {
        const today = new Date().toISOString().split('T')[0];
        startDateInput.min = today;

        startDateInput.addEventListener('change', () => {
            if (endDateInput) {
                endDateInput.min = startDateInput.value;

                if (endDateInput.value && endDateInput.value <= startDateInput.value) {
                    endDateInput.value = '';
                }
            }
        });
    }

    if (endDateInput) {
        const today = new Date().toISOString().split('T')[0];
        endDateInput.min = today;
    }

    // For all input fields
    const formInputs = document.querySelectorAll('input[type="text"], input[type="date"], select');

    formInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const inputId = e.target.id;
            const errorId = `${inputId}Error`;
            hideError(errorId);
        });

        input.addEventListener('change', (e) => {
            const inputId = e.target.id;
            const errorId = `${inputId}Error`;
            hideError(errorId);
        });
    });

    // ===== DESTINATION CITY - SPECIAL HANDLING ===== 
    const destinationSelect = document.getElementById('destination');
    const departingFromSelect = document.getElementById('departingFrom');

    if (destinationSelect) {
        destinationSelect.addEventListener('change', () => {
            hideError('destinationError');
            console.log('✅ Destination city error cleared');

            if (departingFromSelect.value && destinationSelect.value === departingFromSelect.value) {
                showError('destinationError', 'Destination must be different from departure city.');
                console.log('⚠️ Destination matches departure - showing error');
            }
        });
    }

    if (departingFromSelect) {
        departingFromSelect.addEventListener('change', () => {
            hideError('departingFromError');
            console.log('✅ Departure city error cleared');

            if (destinationSelect.value && destinationSelect.value !== departingFromSelect.value) {
                hideError('destinationError');
                console.log('✅ Cities are different - destination error cleared');
            }
        });
    }

    // For radio buttons (With Whom)
    document.querySelectorAll('input[name="withWhom"]').forEach(radio => {
        radio.addEventListener('change', () => {
            hideError('withWhomError');
            console.log('✅ "With Whom" error cleared');
        });
    });

    // For checkboxes (Travel Style)
    document.querySelectorAll('input[name="travelStyle"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            hideError('travelStyleError');
            console.log('✅ "Travel Style" error cleared');
        });
    });

    console.log('✅ Event listeners attached successfully');

    // ===== REGENERATE TRIP HANDLING =====
    const regenerateData = sessionStorage.getItem('regenerateTrip');

    if (regenerateData) {
        const data = JSON.parse(regenerateData);
        console.log('🔄 Pre-filling form with regenerate data:', data);

        const departingFromInput = document.getElementById('departingFrom');
        if (departingFromInput && data.departingFrom) {
            departingFromInput.value = data.departingFrom;
        }

        const destinationInput = document.getElementById('destination');
        if (destinationInput && data.destination) {
            destinationInput.value = data.destination;
        }

        const startDateInput = document.getElementById('startDate');
        if (startDateInput && data.startDate) {
            startDateInput.value = data.startDate;
        }

        const endDateInput = document.getElementById('endDate');
        if (endDateInput && data.endDate) {
            endDateInput.value = data.endDate;
        }

        if (data.travelStyles && data.travelStyles.length > 0) {
            data.travelStyles.forEach(style => {
                const checkbox = document.querySelector(`input[name="travelStyle"][value="${style}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        }

        if (data.withWhom) {
            const withWhomRadio = document.querySelector(`input[name="withWhom"][value="${data.withWhom}"]`);
            if (withWhomRadio) {
                withWhomRadio.checked = true;
            }
        }

        showToast('Ready to generate a new itinerary!', false);
        sessionStorage.removeItem('regenerateTrip');
    }
});
