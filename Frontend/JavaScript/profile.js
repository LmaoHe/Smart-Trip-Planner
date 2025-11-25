// --- Imports ---
import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { showToast, setLoading, showError, hideError } from './utils.js';

// --- Global Variables ---
let currentUser = null;
let originalProfileData = null;
let allItineraries = [];

// --- Profile Page Specific Utility Functions ---
function showStatusMessage(message, isError = true) {
    const statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? 'error-message show' : 'success-message show';
    statusEl.style.display = 'block';
    setTimeout(() => {
        if (statusEl) {
            statusEl.style.display = 'none';
            statusEl.classList.remove('show');
        }
    }, 5000);
}

function hideStatusMessage() {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) statusEl.style.display = 'none';
}

function updateNavigationUI(userRole) {
    const registerAdminNav = document.getElementById('registerAdminNav');

    if (registerAdminNav) {
        if (userRole === 'superadmin') {
            registerAdminNav.style.display = 'block';
        } else {
            registerAdminNav.style.display = 'none';
        }
    }
}

// --- UI Population Functions ---
function populateProfileHeader(userData) {
    const headerAvatar = document.getElementById('headerAvatar');
    const headerName = document.getElementById('headerName');
    const profilePageAvatar = document.getElementById('profilePageAvatar');
    const profilePageName = document.getElementById('profilePageName');
    const memberSinceEl = document.getElementById('memberSince');

    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'User';
    const photoURL = userData.profilePhotoURL;
    const createdAt = userData.createdAt;

    // Update Header
    if (headerName) headerName.textContent = fullName;
    if (headerAvatar) {
        headerAvatar.innerHTML = '';
        if (photoURL) {
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = "Avatar";
            img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
            headerAvatar.appendChild(img);
        } else {
            headerAvatar.textContent = (firstName?.[0]?.toUpperCase() || '') + (lastName?.[0]?.toUpperCase() || '') || 'U';
        }
    }

    // Update Profile Page Header
    if (profilePageName) profilePageName.textContent = fullName;
    if (profilePageAvatar) {
        profilePageAvatar.innerHTML = '';
        if (photoURL) {
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = "Profile";
            img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
            profilePageAvatar.appendChild(img);
        } else {
            profilePageAvatar.textContent = (firstName?.[0]?.toUpperCase() || '') + (lastName?.[0]?.toUpperCase() || '') || '👤';
        }
    }

    // Update Member Since
    if (memberSinceEl && createdAt && createdAt.toDate) {
        const joinDate = createdAt.toDate();
        memberSinceEl.textContent = joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (memberSinceEl) {
        memberSinceEl.textContent = 'N/A';
    }
}

function populateProfileForm(userData) {
    const form = document.getElementById('profileForm');
    if (!form) return;

    form.firstName.value = userData.firstName || '';
    form.lastName.value = userData.lastName || '';

    // Correctly format birthDate
    if (userData.birthDate && typeof userData.birthDate === 'string') {
        form.birthDate.value = userData.birthDate;
    } else if (userData.birthDate && userData.birthDate.toDate) {
        const date = userData.birthDate.toDate();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        form.birthDate.value = `${year}-${month}-${day}`;
    } else {
        form.birthDate.value = '';
    }

    form.gender.value = userData.gender || '';
    form.phone.value = userData.phone || '';
    form.email.value = userData.email || '';

    // Store original data for cancellation
    originalProfileData = {
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        birthDate: form.birthDate.value,
        gender: form.gender.value,
        phone: form.phone.value,
        email: userData.email,
        createdAt: userData.createdAt,
        profilePhotoURL: userData.profilePhotoURL,
    };
    console.log("Original profile data stored for cancel:", originalProfileData);
}

// --- Event Handlers ---
async function handleProfileSave(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast("Authentication error. Please log in again.", true);
        return;
    }

    const saveBtn = document.getElementById('saveChangesBtn');
    setLoading(saveBtn, true, 'Saving...', 'Save Changes');
    hideStatusMessage();

    // Hide field errors
    hideError('firstNameError');
    hideError('lastNameError');
    hideError('birthDateError');
    hideError('genderError');
    hideError('phoneError');

    const form = document.getElementById('profileForm');
    const updatedData = {
        firstName: form.firstName.value.trim(),
        lastName: form.lastName.value.trim(),
        birthDate: form.birthDate.value,
        gender: form.gender.value,
        phone: form.phone.value.trim(),
    };

    // --- Frontend Validation ---
    let isValid = true;
    if (!updatedData.firstName) {
        showError('firstNameError', 'First name required.');
        isValid = false;
    }
    if (!updatedData.lastName) {
        showError('lastNameError', 'Last name required.');
        isValid = false;
    }
    if (!updatedData.birthDate) {
        showError('birthDateError', 'Birth date required.');
        isValid = false;
    } else {
        const birth = new Date(updatedData.birthDate);
        if (isNaN(birth.getTime())) {
            showError('birthDateError', 'Invalid birth date format.');
            isValid = false;
        } else {
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            if (age < 13) {
                showError('birthDateError', 'Must be 13+ years old.');
                isValid = false;
            }
        }
    }
    if (!updatedData.gender) {
        showError('genderError', 'Gender required.');
        isValid = false;
    }
    if (!updatedData.phone) {
        showError('phoneError', 'Phone number required.');
        isValid = false;
    } else if (!/^\d{7,}$/.test(updatedData.phone)) {
        showError('phoneError', 'Valid phone (min 7 digits).');
        isValid = false;
    }

    if (!isValid) {
        setLoading(saveBtn, false, 'Saving...', 'Save Changes');
        return;
    }

    try {
        console.log("Sending update data to backend:", updatedData);
        const idToken = await currentUser.getIdToken();
        const response = await fetch('http://127.0.0.1:5000/update-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(updatedData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to save profile via backend.");
        }

        console.log("Profile updated successfully via backend.");
        showToast("Profile saved successfully!", false);

        originalProfileData = { ...originalProfileData, ...updatedData };
        populateProfileHeader(originalProfileData);

    } catch (error) {
        console.error("Error saving profile:", error);
        showStatusMessage(`Error saving profile: ${error.message}`, true);
    } finally {
        setLoading(saveBtn, false, 'Saving...', 'Save Changes');
    }
}

function handleCancelChanges() {
    if (originalProfileData) {
        console.log("Cancelling changes, restoring form data.");
        populateProfileForm(originalProfileData);
        document.querySelectorAll('.profile-form .error-message').forEach(el => el.style.display = 'none');
        hideStatusMessage();
    } else {
        console.warn("Original profile data not available to cancel.");
        showToast("Could not restore original data.", true);
    }
}

function handleChangePhotoClick() {
    const fileInput = document.getElementById('photoUploadInput');
    if (fileInput) {
        fileInput.click();
    } else {
        console.error("File input #photoUploadInput not found.");
        showToast("Could not initiate photo change.", true);
    }
}

async function handlePhotoSelected(event) {
    const file = event.target.files[0];
    if (!file || !currentUser || !originalProfileData) {
        if (!originalProfileData) {
            showToast("Profile data is still loading.", true);
        } else if (!currentUser) {
            showToast("Auth error.", true);
        }
        event.target.value = null;
        return;
    }

    const changePhotoBtn = document.getElementById('changePhotoButton');
    setLoading(changePhotoBtn, true, 'Uploading...', 'Change Photo');
    console.log("New photo selected...");

    const reader = new FileReader();
    reader.onloadend = async function () {
        const profilePicDataURL = reader.result;
        try {
            const idToken = await currentUser.getIdToken();
            const response = await fetch('http://127.0.0.1:5000/update-profile-picture', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ profilePicDataURL: profilePicDataURL })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed photo upload.");
            }

            const result = await response.json();
            const originalPhotoURL = result.photoURL;
            const cacheBustedURL = `${originalPhotoURL}?t=${new Date().getTime()}`;

            console.log("Photo updated. New cache-busted URL:", cacheBustedURL);
            showToast("Picture updated!", false);

            originalProfileData.profilePhotoURL = cacheBustedURL;
            const updatedDisplayData = { ...originalProfileData };
            populateProfileHeader(updatedDisplayData);
            populateProfileForm(updatedDisplayData);

        } catch (error) {
            console.error("Error updating picture:", error);
            showToast(`Error: ${error.message}`, true);
        } finally {
            setLoading(changePhotoBtn, false, 'Uploading...', 'Change Photo');
        }
    };

    reader.onerror = function () {
        console.error("FileReader error.");
        showToast("Could not read photo.", true);
        setLoading(changePhotoBtn, false, 'Uploading...', 'Change Photo');
    };

    reader.readAsDataURL(file);
    event.target.value = null;
}

// ===== TAB SWITCHING =====
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // Load data when tab is clicked
            if (targetTab === 'hotels') {
                loadHotelBookings();
            } else if (targetTab === 'flights') {
                loadFlightBookings();
            } else if (targetTab === 'itineraries') {
                loadUserItineraries();
            }
        });
    });

    // Load hotels on initial page load if hotels tab is active
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'hotels') {
        loadHotelBookings();
    }
}

// ===== LOAD HOTEL BOOKINGS =====
async function loadHotelBookings() {
    if (!currentUser) {
        console.error('No user logged in');
        return;
    }

    const hotelsContainer = document.getElementById('hotelsContainer');
    if (!hotelsContainer) {
        console.error('Hotels container not found');
        return;
    }

    hotelsContainer.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading your hotel bookings...</p>
        </div>
    `;

    try {
        const { collection, query, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

        const bookingsRef = collection(db, 'users', currentUser.uid, 'bookings');
        const q = query(bookingsRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        // Filter for hotels
        const hotelBookings = [];
        querySnapshot.forEach((doc) => {
            const booking = doc.data();
            if (booking.bookingType === 'hotel') {
                hotelBookings.push(booking);
            }
        });

        if (hotelBookings.length === 0) {
            hotelsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-hotel"></i>
                    <h3>No Hotel Bookings Yet</h3>
                    <p>You haven't made any hotel bookings. Start exploring hotels and make your first booking!</p>
                    <a href="booking.html" class="btn-primary">Browse Hotels</a>
                </div>
            `;
            return;
        }

        // Sort: Confirmed first, then cancelled
        hotelBookings.sort((a, b) => {
            const statusOrder = { 'confirmed': 1, 'completed': 2, 'cancelled': 3 };
            return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
        });

        const bookingsHTML = hotelBookings.map(booking => createBookingCard(booking));
        hotelsContainer.innerHTML = bookingsHTML.join('');
        console.log(`✓ Loaded ${hotelBookings.length} hotel bookings (sorted by status)`);

    } catch (error) {
        console.error('Error loading hotel bookings:', error);
        hotelsContainer.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <h3>Error Loading Bookings</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ===== LOAD FLIGHT BOOKINGS =====
async function loadFlightBookings() {
    if (!currentUser) {
        console.error('No user logged in');
        return;
    }

    const flightsContainer = document.getElementById('flightsContainer');
    if (!flightsContainer) {
        console.error('Flights container not found');
        return;
    }

    flightsContainer.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading your flight bookings...</p>
        </div>
    `;

    try {
        const { collection, query, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

        const bookingsRef = collection(db, 'users', currentUser.uid, 'bookings');
        const q = query(bookingsRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        // Filter for flights
        const flightBookings = [];
        querySnapshot.forEach((doc) => {
            const booking = doc.data();
            if (booking.bookingType === 'flight') {
                flightBookings.push(booking);
            }
        });

        if (flightBookings.length === 0) {
            flightsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-plane-slash"></i>
                    <h3>No Flight Bookings Yet</h3>
                    <p>You haven't booked any flights. Start planning your next adventure!</p>
                    <a href="booking.html" class="btn-primary">Browse Flights</a>
                </div>
            `;
            return;
        }

        // Sort: Confirmed first, then cancelled
        flightBookings.sort((a, b) => {
            const statusOrder = { 'confirmed': 1, 'completed': 2, 'cancelled': 3 };
            return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
        });

        const bookingsHTML = flightBookings.map(booking => createFlightBookingCard(booking));
        flightsContainer.innerHTML = bookingsHTML.join('');
        console.log(`✓ Loaded ${flightBookings.length} flight bookings (sorted by status)`);

    } catch (error) {
        console.error('Error loading flight bookings:', error);
        flightsContainer.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <h3>Error Loading Bookings</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// CREATE BOOKING CARD
function createBookingCard(booking) {
    const checkInDate = new Date(booking.checkIn);
    const checkOutDate = new Date(booking.checkOut);

    let bookingDate = new Date();
    if (booking.createdAt) {
        if (typeof booking.createdAt.toDate === 'function') {
            bookingDate = booking.createdAt.toDate();
        } else if (booking.createdAt instanceof Date) {
            bookingDate = booking.createdAt;
        } else if (typeof booking.createdAt === 'string' || typeof booking.createdAt === 'number') {
            bookingDate = new Date(booking.createdAt);
        }
    }

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const statusConfig = {
        confirmed: { class: 'status-confirmed', text: 'Confirmed' },
        cancelled: { class: 'status-cancelled', text: 'Cancelled' },
        completed: { class: 'status-completed', text: 'Completed' }
    };

    const status = statusConfig[booking.status] || statusConfig['confirmed'];

    const cancelButton = booking.status === 'confirmed' ? `
        <button class="btn-cancel" onclick="cancelBooking('${booking.bookingId}')">
            <i class="fa-solid fa-times-circle"></i> Cancel Booking
        </button>
    ` : '';

    const roomImage = booking.roomImage || booking.hotelImage || 'https://via.placeholder.com/300x300?text=Hotel';

    const hasSpecialRequests = booking.smoking || booking.bedPreference || (booking.specialRequests && booking.specialRequests.trim());

    const smokingPref = booking.smoking === 'smoking' ? 'Smoking Room' : 'Non-Smoking Room';
    const bedPref = booking.bedPreference === 'large' ? '1 Large Bed' : '2 Twin Beds';
    const specialRequestsText = booking.specialRequests && booking.specialRequests.trim()
        ? booking.specialRequests
        : 'None';

    const specialRequestsSection = hasSpecialRequests ? `
        <div class="booking-section">
            <h4><i class="fa-solid fa-clipboard-list"></i> Special Requests</h4>
            <div class="booking-details">
                ${booking.smoking ? `
                <div class="booking-detail-item">
                    <i class="fa-solid fa-smoking-ban"></i>
                    <div>
                        <span class="detail-label">Room Type</span>
                        <span class="detail-value">${smokingPref}</span>
                    </div>
                </div>
                ` : ''}
                
                ${booking.bedPreference ? `
                <div class="booking-detail-item">
                    <i class="fa-solid fa-bed"></i>
                    <div>
                        <span class="detail-label">Bed Setup</span>
                        <span class="detail-value">${bedPref}</span>
                    </div>
                </div>
                ` : ''}
                
                ${booking.specialRequests && booking.specialRequests.trim() ? `
                <div class="booking-detail-item special-requests-full">
                    <i class="fa-solid fa-message"></i>
                    <div>
                        <span class="detail-label">Additional Requests</span>
                        <span class="detail-value">${specialRequestsText}</span>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    ` : '';

    return `
        <div class="booking-card">
            <div class="booking-image">
                <img src="${roomImage}" alt="${booking.roomName}" onerror="this.src='https://via.placeholder.com/300x300?text=Hotel'">
            </div>
            <div class="booking-content">
                <div class="booking-header">
                    <div class="booking-id">
                        <i class="fa-solid fa-ticket"></i>
                        <span>${booking.bookingId}</span>
                    </div>
                    <div class="booking-status ${status.class}">${status.text}</div>
                </div>
                
                <div class="booking-body">
                    <div class="booking-hotel">
                        <h3>${booking.hotelName}</h3>
                        <p class="booking-location">
                            <i class="fa-solid fa-location-dot"></i> ${booking.hotelLocation}
                        </p>
                    </div>
                    
                    <div class="booking-details">
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-door-open"></i>
                            <div>
                                <span class="detail-label">Room</span>
                                <span class="detail-value">${booking.roomName}</span>
                            </div>
                        </div>
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-calendar-check"></i>
                            <div>
                                <span class="detail-label">Check-in</span>
                                <span class="detail-value">${formatDate(checkInDate)}</span>
                            </div>
                        </div>
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-calendar-xmark"></i>
                            <div>
                                <span class="detail-label">Check-out</span>
                                <span class="detail-value">${formatDate(checkOutDate)}</span>
                            </div>
                        </div>
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-moon"></i>
                            <div>
                                <span class="detail-label">Duration</span>
                                <span class="detail-value">${booking.nights} night${booking.nights > 1 ? 's' : ''}</span>
                            </div>
                        </div>
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-users"></i>
                            <div>
                                <span class="detail-label">Guests</span>
                                <span class="detail-value">${booking.totalGuests}</span>
                            </div>
                        </div>
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-credit-card"></i>
                            <div>
                                <span class="detail-label">Payment</span>
                                <span class="detail-value">${booking.paymentMethod === 'card' ? 'Credit Card' : 'Digital Payment'}</span>
                            </div>
                        </div>
                    </div>

                    ${specialRequestsSection}
                </div>
                
                <div class="booking-footer">
                    <div class="booking-info">
                        <div class="booking-price">
                            <span class="price-label">Total Paid</span>
                            <span class="price-value">${booking.currency || 'MYR'} ${(booking.totalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="booking-date">
                            <i class="fa-regular fa-clock"></i>
                            Booked on ${formatDate(bookingDate)}
                        </div>
                    </div>
                    <div class="booking-actions">
                        ${cancelButton}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===== CREATE FLIGHT BOOKING CARD =====
function createFlightBookingCard(booking) {
    let bookingDate = new Date();
    if (booking.createdAt) {
        if (typeof booking.createdAt.toDate === 'function') {
            bookingDate = booking.createdAt.toDate();
        } else if (booking.createdAt instanceof Date) {
            bookingDate = booking.createdAt;
        } else if (typeof booking.createdAt === 'string' || typeof booking.createdAt === 'number') {
            bookingDate = new Date(booking.createdAt);
        }
    }

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const statusConfig = {
        'confirmed': { class: 'status-confirmed', text: 'Confirmed' },
        'cancelled': { class: 'status-cancelled', text: 'Cancelled' },
        'completed': { class: 'status-completed', text: 'Completed' }
    };

    const status = statusConfig[booking.status] || statusConfig['confirmed'];

    const cancelButton = booking.status === 'confirmed' ? `
        <button class="btn-cancel" onclick="cancelBooking('${booking.bookingId}')">
            <i class="fa-solid fa-times-circle"></i>
            Cancel Booking
        </button>
    ` : '';

    const outbound = booking.flightDetails?.outbound || {};
    const returnFlight = booking.flightDetails?.return || null;

    const outboundRoute = `${outbound.fromAirport || 'N/A'} → ${outbound.toAirport || 'N/A'}`;
    const returnRoute = returnFlight ? `${returnFlight.fromAirport || 'N/A'} → ${returnFlight.toAirport || 'N/A'}` : null;

    const baggageType = booking.baggageDetails?.type || 'standard';
    const baggageLabels = {
        'standard': 'Standard (7kg)',
        'extra20': 'Extra 20kg',
        'extra30': 'Extra 30kg'
    };

    return `
        <div class="booking-card flight-booking-card">
            <div class="booking-content" style="width: 100%;">
                <div class="booking-header">
                    <div class="booking-id">
                        <i class="fa-solid fa-plane"></i>
                        <span>${booking.bookingId}</span>
                    </div>
                    <div class="booking-status ${status.class}">${status.text}</div>
                </div>

                <div class="booking-body">
                    <div class="flight-routes">
                        <div class="flight-route-section">
                            <h4><i class="fa-solid fa-plane-departure"></i> Outbound</h4>
                            <p class="route-detail">${outboundRoute}</p>
                            <p class="flight-time">${outbound.departDate || 'N/A'} • ${outbound.departTime || 'N/A'} - ${outbound.arriveTime || 'N/A'}</p>
                        </div>

                        ${returnFlight ? `
                        <div class="flight-route-section">
                            <h4><i class="fa-solid fa-plane-arrival"></i> Return</h4>
                            <p class="route-detail">${returnRoute}</p>
                            <p class="flight-time">${returnFlight.departDate || 'N/A'} • ${returnFlight.departTime || 'N/A'} - ${returnFlight.arriveTime || 'N/A'}</p>
                        </div>
                        ` : ''}
                    </div>

                    <div class="booking-details">
                        <div class="booking-detail-item">
                            <i class="fa-solid fa-users"></i>
                            <div>
                                <span class="detail-label">Passengers</span>
                                <span class="detail-value">${booking.totalPassengers || 1}</span>
                            </div>
                        </div>

                        <div class="booking-detail-item">
                            <i class="fa-solid fa-suitcase"></i>
                            <div>
                                <span class="detail-label">Baggage</span>
                                <span class="detail-value">${baggageLabels[baggageType]}</span>
                            </div>
                        </div>

                        <div class="booking-detail-item">
                            <i class="fa-solid fa-user"></i>
                            <div>
                                <span class="detail-label">Lead Passenger</span>
                                <span class="detail-value">${booking.leadPassenger?.firstName || 'N/A'} ${booking.leadPassenger?.lastName || ''}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="booking-footer">
                    <div class="booking-info">
                        <div class="booking-price">
                            <span class="price-label">Total Paid</span>
                            <span class="price-value">MYR ${(booking.pricing?.totalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="booking-date">
                            <i class="fa-regular fa-clock"></i>
                            Booked on ${formatDate(bookingDate)}
                        </div>
                    </div>
                    <div class="booking-actions">
                        ${cancelButton}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===== LOAD ITINERARIES (UPDATED FOR NEW SINGLE-DOCUMENT STRUCTURE) =====
async function loadUserItineraries() {
    if (!currentUser) {
        console.error('No user logged in');
        return;
    }

    const itinerariesGrid = document.getElementById('itinerariesGrid');
    if (!itinerariesGrid) {
        console.error('Itineraries grid not found');
        return;
    }

    itinerariesGrid.innerHTML = `
        <div class="loading-itineraries">
            <p>Loading your itineraries...</p>
        </div>
    `;

    try {
        const { collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

        const bookingsRef = collection(db, 'users', currentUser.uid, 'bookings');
        const bookingsSnapshot = await getDocs(bookingsRef);

        const fetchedItineraries = [];

        for (const bookingDoc of bookingsSnapshot.docs) {
            const bookingData = bookingDoc.data();

            // Only process itinerary bookings
            if (bookingData.bookingType !== 'itinerary') {
                console.log(`⏭️ Skipping non-itinerary booking ${bookingDoc.id} (type: ${bookingData.bookingType})`);
                continue;
            }

            console.log(`📦 Processing itinerary ${bookingDoc.id}:`, bookingData);

            // Check BOTH field patterns (AI uses unprefixed, Paid uses prefixed)
            const title = bookingData.title || bookingData.itineraryTitle || 'Untitled';
            const city = bookingData.city || bookingData.itineraryCity || 'Unknown';
            const country = bookingData.country || bookingData.itineraryCountry || 'Unknown';
            const duration = bookingData.duration || bookingData.itineraryDuration || 'N/A';
            const image = bookingData.image || bookingData.itineraryImage || '';

            console.log(`🔍 Extracted values for ${bookingDoc.id}:`, {
                title, city, country, duration, hasImage: !!image
            });

            fetchedItineraries.push({
                id: bookingDoc.id,
                bookingId: bookingData.bookingId || bookingDoc.id,
                itemBookingId: bookingData.bookingId || bookingDoc.id,
                source: bookingData.isAIGenerated || bookingData.source === 'ai-generated' ? 'ai-generated' : 'purchased',
                hasSubcollection: false,
                isAIGenerated: bookingData.isAIGenerated || bookingData.source === 'ai-generated' || false,
                status: bookingData.status || 'confirmed',
                email: currentUser.email,
                userId: currentUser.uid,
                itineraryId: bookingData.itineraryId,
                itineraryTitle: title,
                itineraryCity: city,
                itineraryCountry: country,
                itineraryDuration: duration,
                itineraryImage: image,
                
                title: title,
                city: city,
                country: country,
                duration: duration,
                image: image,
                
                numberOfPeople: bookingData.numberOfPeople,
                pricePerPerson: bookingData.pricePerPerson,
                subtotal: bookingData.subtotal,
                serviceFee: bookingData.serviceFee,
                totalPrice: bookingData.totalPrice,
                currency: bookingData.currency,
                firstName: bookingData.firstName,
                lastName: bookingData.lastName,
                phone: bookingData.phone,
                paymentMethod: bookingData.paymentMethod,
                createdAt: bookingData.createdAt
            });

            console.log(`✅ Loaded itinerary booking ${bookingDoc.id}`);
        }

        console.log(`📊 Total fetched: ${fetchedItineraries.length} itineraries`);
        console.log('📋 Fetched data:', fetchedItineraries);

        displayItineraries(fetchedItineraries);

    } catch (error) {
        console.error('❌ Error loading itineraries:', error);
        itinerariesGrid.innerHTML = `
            <div class="error-state">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <h3>Error Loading Itineraries</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function displayItineraries(itineraries) {
    const itinerariesGrid = document.getElementById('itinerariesGrid');
    if (!itinerariesGrid) return;
    
    if (!currentUser) {
        itinerariesGrid.innerHTML = `<div class="error-state"><p>Please log in to view your itineraries</p></div>`;
        return;
    }

    allItineraries = itineraries.filter(itinerary => {
        return itinerary.email === currentUser.email || 
               (itinerary.userId && itinerary.userId === currentUser.uid);
    });

    if (allItineraries.length === 0) {
        displayEmptyItineraryState();
        return;
    }

    const itineraryCards = allItineraries.map(itinerary => {
        const isAIGenerated = itinerary.isAIGenerated || itinerary.source === 'ai-generated';
        const isCancelled = itinerary.status === 'cancelled';
        
        const displayCity = itinerary.city || itinerary.itineraryCity || 'Unknown';
        const displayCountry = itinerary.country || itinerary.itineraryCountry || 'Unknown';
        const displayDuration = itinerary.duration || itinerary.itineraryDuration || 'N/A';
        const displayImage = itinerary.image || itinerary.itineraryImage || '';
        const displayTitle = itinerary.title || itinerary.itineraryTitle || 'Itinerary';
        
        const sourceBadge = isAIGenerated 
            ? `<span class="itinerary-source-badge ai">AI-Generated</span>`
            : `<span class="itinerary-source-badge preloaded">Curated</span>`;
        
        const bookingId = itinerary.bookingId || itinerary.id;
        const escapedBookingId = bookingId.replace(/'/g, "\\'");
        
        return `
            <div class="itinerary-card">
                <div class="itinerary-image">
                    ${displayImage ? 
                        `<img src="${displayImage}" alt="${displayTitle}" onerror="this.src='https://via.placeholder.com/300x300?text=Itinerary'">` 
                        : `<i class="fa-solid fa-map"></i>`
                    }
                </div>
                <div class="itinerary-content">
                    <div class="itinerary-top">
                        <div class="itinerary-badges">
                            ${sourceBadge}
                        </div>
                        <span class="itinerary-status status-${itinerary.status}">
                            ${itinerary.status.charAt(0).toUpperCase() + itinerary.status.slice(1)}
                        </span>
                    </div>
                    <h3 class="itinerary-title">${displayTitle}</h3>
                    <p class="itinerary-location">
                        <i class="fa-solid fa-map-marker-alt"></i>
                        ${displayCity}, ${displayCountry}
                    </p>
                    <div class="itinerary-details">
                        <div class="detail-item">
                            <i class="fa-solid fa-calendar"></i>
                            <div>
                                <span class="detail-label">Booked</span>
                                <span class="detail-value">
                                    ${new Date(itinerary.createdAt?.toDate ? itinerary.createdAt.toDate() : itinerary.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i class="fa-solid fa-moon"></i>
                            <div>
                                <span class="detail-label">Duration</span>
                                <span class="detail-value">${displayDuration}</span>
                            </div>
                        </div>
                        ${!isAIGenerated ? `
                            <div class="detail-item">
                                <i class="fa-solid fa-users"></i>
                                <div>
                                    <span class="detail-label">People</span>
                                    <span class="detail-value">${itinerary.numberOfPeople || 1}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="itinerary-footer">
                        ${!isAIGenerated ? `
                            <div class="itinerary-price-section">
                                <span class="itinerary-price-label">Total Paid</span>
                                <span class="itinerary-price-value">
                                    ${itinerary.currency || 'RM'} ${(itinerary.totalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        ` : '<div></div>'}
                        <div class="itinerary-actions">
                            ${!isCancelled ? `
                                <button class="itinerary-btn-view" onclick="viewItineraryDetails('${escapedBookingId}', ${isAIGenerated})">
                                    <i class="fa-solid fa-eye"></i> View
                                </button>
                            ` : ''}
                            
                            ${isAIGenerated && !isCancelled ? `
                                <button class="itinerary-btn-delete" onclick="deleteItinerary('${escapedBookingId}')">
                                    <i class="fa-solid fa-trash"></i> Delete
                                </button>
                            ` : ''}
                            
                            ${!isAIGenerated && !isCancelled ? `
                                <button class="itinerary-btn-cancel" onclick="cancelBooking('${escapedBookingId}')">
                                    <i class="fa-solid fa-times-circle"></i> Cancel
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    itinerariesGrid.innerHTML = itineraryCards;
}

// ===== VIEW ITINERARY DETAILS (SIMPLIFIED) =====
function viewItineraryDetails(bookingId, isAIGenerated) {
    console.log('📍 Viewing itinerary:', { bookingId, isAIGenerated });

    if (isAIGenerated) {
        // AI-generated itinerary
        console.log('🤖 Redirecting to AI itinerary view:', bookingId);
        window.location.href = `ai_itinerary_view.html?id=${bookingId}`;
    } else {
        // Purchased itinerary - use itineraryId from booking
        const itinerary = allItineraries.find(it => 
            (it.bookingId === bookingId || it.id === bookingId)
        );

        if (!itinerary) {
            console.error('❌ Itinerary not found in allItineraries for bookingId:', bookingId);
            showToast('Error: Itinerary not found', true);
            return;
        }

        console.log('📦 Found itinerary:', itinerary);

        if (itinerary.itineraryId) {
            console.log('✅ Using itineraryId:', itinerary.itineraryId);
            window.location.href = `itineraryDetails.html?id=${itinerary.itineraryId}`;
        } else {
            console.error('❌ itineraryId not found in itinerary:', itinerary);
            showToast('Error: Original itinerary details not found', true);
        }
    }
}

// ===== CANCEL BOOKING (SIMPLIFIED FOR SINGLE DOCUMENT) =====
async function cancelBooking(bookingId) {
    if (!currentUser) {
        showToast('Please log in to cancel bookings', true);
        return;
    }

    const modal = document.getElementById('cancelModal');
    const modalBookingId = document.getElementById('modalBookingId');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    if (!modal) {
        console.error('Cancel modal not found');
        return;
    }

    if (modalBookingId) {
        modalBookingId.textContent = `#${bookingId}`;
    }

    modal.classList.add('show');

    const handleConfirm = async () => {
        try {
            modal.classList.remove('show');
            showToast('Cancelling booking...', false);

            const { updateDoc, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

            // ✅ All bookings are now single documents - no subcollections
            const bookingRef = doc(db, 'users', currentUser.uid, 'bookings', bookingId);
            console.log('✓ Cancelling booking:', bookingId);

            await updateDoc(bookingRef, {
                status: 'cancelled',
                cancelledAt: serverTimestamp()
            });

            console.log('✅ Booking cancelled successfully');
            showToast('Booking cancelled successfully', false);

            // Auto-refresh active tab
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const tabType = activeTab.dataset.tab;
                if (tabType === 'hotels') {
                    await loadHotelBookings();
                } else if (tabType === 'flights') {
                    await loadFlightBookings();
                } else if (tabType === 'itineraries') {
                    await loadUserItineraries();
                }
            }

        } catch (error) {
            console.error('❌ Error cancelling booking:', error);
            showToast('Failed to cancel booking. Please try again.', true);
        } finally {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        }
    };

    const handleCancel = () => {
        modal.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            handleCancel();
        }
    });
}

// ===== DISPLAY EMPTY ITINERARY STATE =====
function displayEmptyItineraryState() {
    const itinerariesGrid = document.getElementById('itinerariesGrid');
    if (!itinerariesGrid) return;

    itinerariesGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                <i class="fa-solid fa-hotel"></i>
            </div>
            <h3 class="empty-state-title">No Itineraries Yet</h3>
            <p class="empty-state-text">You haven't booked any itineraries yet. Start exploring and create your first one!</p>
            <a href="booking.html" class="empty-state-btn">Browse Itineraries</a>
        </div>
    `;
}

// Make globally accessible
window.cancelBooking = cancelBooking;

// Make globally accessible
window.viewItineraryDetails = viewItineraryDetails;

// --- Main Execution Logic ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Profile page DOM fully loaded");

    const profileForm = document.getElementById('profileForm');
    const saveBtn = document.getElementById('saveChangesBtn');
    const cancelBtn = document.getElementById('cancelChangesBtn');
    const changePhotoBtn = document.getElementById('changePhotoButton');
    const photoUploadInput = document.getElementById('photoUploadInput');

    if (profileForm && saveBtn) {
        profileForm.addEventListener('submit', handleProfileSave);
    } else {
        console.error("Profile form/save missing");
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelChanges);
    } else {
        console.error("Cancel button missing");
    }

    if (changePhotoBtn && photoUploadInput) {
        changePhotoBtn.addEventListener('click', handleChangePhotoClick);
        photoUploadInput.addEventListener('change', handlePhotoSelected);
    } else {
        console.error("Change photo elements missing");
    }

    setupTabs();

    // --- Authentication Check ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            console.log("Auth State: User signed in (UID:", user.uid + ")");
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    console.log("Fetched user data:", userData);

                    if (userData.profilePhotoURL) {
                        userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                    }

                    originalProfileData = userData;
                    populateProfileHeader(originalProfileData);
                    populateProfileForm(originalProfileData);
                    updateNavigationUI(userData.role);

                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && activeTab.dataset.tab === 'itineraries') {
                        loadUserItineraries();
                    }

                } else {
                    console.error("Firestore document missing:", user.uid);
                    showToast("Error: Profile data not found. Logging out.", true);
                    await signOut(auth);
                    window.location.href = 'login.html';
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                showToast("Error loading profile. Please try again later.", true);
                document.querySelector('.main-content').innerHTML = '<p style="color:red; text-align:center;">Could not load profile data.</p>';
            }
        } else {
            currentUser = null;
            originalProfileData = null;
            console.log("Auth State: User signed out. Redirecting to login.");
            window.location.href = 'login.html';
        }
    });
});

// ===== DELETE AI-GENERATED ITINERARY (WITH MODAL) =====
window.deleteItinerary = function (bookingId) {
    if (!currentUser) {
        showToast('Please log in to delete itineraries', true);
        return;
    }

    const modal = document.getElementById('deleteModal');
    const modalBookingId = document.getElementById('deleteModalBookingId');
    const confirmBtn = document.getElementById('deleteModalConfirmBtn');
    const cancelBtn = document.getElementById('deleteModalCancelBtn');

    if (!modal) {
        console.error('Delete modal not found');
        return;
    }

    // Set booking ID in modal
    if (modalBookingId) {
        modalBookingId.textContent = bookingId;
    }

    // Show modal
    modal.classList.add('show');

    const handleConfirm = async () => {
        try {
            // Hide modal
            modal.classList.remove('show');
            
            showToast('Deleting itinerary...', false);

            const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

            // Delete from Firestore
            const itineraryRef = doc(db, 'users', currentUser.uid, 'bookings', bookingId);
            await deleteDoc(itineraryRef);

            console.log('✅ AI itinerary deleted:', bookingId);
            showToast('Itinerary deleted successfully', false);

            // Refresh the itineraries list
            await loadUserItineraries();

        } catch (error) {
            console.error('❌ Error deleting itinerary:', error);
            showToast('Failed to delete itinerary. Please try again.', true);
        } finally {
            // Clean up event listeners
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdropClick); 
        }
    };

    const handleCancel = () => {
        modal.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.removeEventListener('click', handleBackdropClick); 
    };

    // Named function so we can remove it
    const handleBackdropClick = (e) => {
        if (e.target === modal) {
            handleCancel();
        }
    };

    // Attach event listeners
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackdropClick);
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const cancelModal = document.getElementById('cancelModal');
        if (cancelModal && cancelModal.classList.contains('show')) {
            cancelModal.classList.remove('show');
        }
        
        const deleteModal = document.getElementById('deleteModal');
        if (deleteModal && deleteModal.classList.contains('show')) {
            deleteModal.classList.remove('show');
        }
    }
});
