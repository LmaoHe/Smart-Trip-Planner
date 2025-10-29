// --- Imports ---
import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { showToast, setLoading, showError, hideError } from './utils.js';

// --- Global Variables ---
let currentUser = null;
let originalProfileData = null;

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

    // Show loading state
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

        if (querySnapshot.empty) {
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

        // Display bookings
        const bookingsHTML = [];
        querySnapshot.forEach((doc) => {
            const booking = doc.data();
            bookingsHTML.push(createBookingCard(booking));
        });

        hotelsContainer.innerHTML = bookingsHTML.join('');
        console.log(`✓ Loaded ${querySnapshot.size} hotel bookings`);

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

// ===== LOAD FLIGHT BOOKINGS (PLACEHOLDER) =====
async function loadFlightBookings() {
    const flightsContainer = document.getElementById('flightsContainer');
    if (!flightsContainer) return;

    // For now, show empty state (implement later when you add flights)
    flightsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-plane-slash"></i>
            <h3>No Flight Bookings Yet</h3>
            <p>Flight booking feature coming soon! Stay tuned.</p>
        </div>
    `;
}

// ===== CREATE BOOKING CARD =====
function createBookingCard(booking) {
    const checkInDate = new Date(booking.checkIn);
    const checkOutDate = new Date(booking.checkOut);
    const bookingDate = booking.createdAt && booking.createdAt.toDate ? booking.createdAt.toDate() : new Date();

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Status configuration
    const statusConfig = {
        'confirmed': { class: 'status-confirmed', text: 'Confirmed' },
        'cancelled': { class: 'status-cancelled', text: 'Cancelled' },
        'completed': { class: 'status-completed', text: 'Completed' }
    };

    const status = statusConfig[booking.status] || statusConfig['confirmed'];

    // Show cancel button only for confirmed bookings
    const cancelButton = booking.status === 'confirmed' ? `
        <button class="btn-cancel" onclick="cancelBooking('${booking.bookingId}')">
            <i class="fa-solid fa-times-circle"></i>
            Cancel Booking
        </button>
    ` : '';

    // Get room/hotel image (fallback to placeholder if not available)
    const roomImage = booking.roomImage || booking.hotelImage || 'https://via.placeholder.com/300x300?text=Hotel';

    return `
        <div class="booking-card">
            <!-- Small Thumbnail Image -->
            <div class="booking-image">
                <img src="${roomImage}" alt="${booking.roomName}" onerror="this.src='https://via.placeholder.com/300x300?text=Hotel'">
            </div>

            <!-- Booking Content -->
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
                            <i class="fa-solid fa-location-dot"></i>
                            ${booking.hotelLocation}
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
                                <span class="detail-value">${booking.guests}</span>
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
                </div>

                <div class="booking-footer">
                    <div class="booking-info">
                        <div class="booking-price">
                            <span class="price-label">Total Paid</span>
                            <span class="price-value">${booking.currency} ${booking.totalPrice.toLocaleString()}</span>
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

// ===== CANCEL BOOKING =====
async function cancelBooking(bookingId) {
    if (!currentUser) {
        showToast('Please log in to cancel bookings', true);
        return;
    }

    // Show modal
    const modal = document.getElementById('cancelModal');
    const modalBookingId = document.getElementById('modalBookingId');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    if (!modal) {
        console.error('Cancel modal not found');
        return;
    }

    // Set booking ID in modal
    if (modalBookingId) {
        modalBookingId.textContent = `#${bookingId}`;
    }

    // Show modal
    modal.classList.add('show');

    // Handle confirm button click
    const handleConfirm = async () => {
        try {
            // Hide modal
            modal.classList.remove('show');

            // Show loading toast
            showToast('Cancelling booking...', false);

            const { updateDoc, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

            const bookingRef = doc(db, 'users', currentUser.uid, 'bookings', bookingId);

            // Update status to cancelled
            await updateDoc(bookingRef, {
                status: 'cancelled',
                cancelledAt: serverTimestamp()
            });

            console.log('✓ Booking cancelled:', bookingId);
            showToast('Booking cancelled successfully', false);

            // Reload hotel bookings
            loadHotelBookings();

        } catch (error) {
            console.error('Error cancelling booking:', error);
            showToast('Failed to cancel booking. Please try again.', true);
        } finally {
            // Remove event listeners
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        }
    };

    // Handle cancel button click
    const handleCancel = () => {
        modal.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    // Attach event listeners
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            handleCancel();
        }
    });
}

// Make cancelBooking globally accessible
window.cancelBooking = cancelBooking;

// --- Main Execution Logic ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Profile page DOM fully loaded");

    // Get elements
    const profileForm = document.getElementById('profileForm');
    const saveBtn = document.getElementById('saveChangesBtn');
    const cancelBtn = document.getElementById('cancelChangesBtn');
    const changePhotoBtn = document.getElementById('changePhotoButton');
    const photoUploadInput = document.getElementById('photoUploadInput');

    // Attach listeners
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

    // Initialize tabs
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

                    // Cache-bust profile photo if it exists
                    if (userData.profilePhotoURL) {
                        userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                    }

                    originalProfileData = userData;
                    populateProfileHeader(originalProfileData);
                    populateProfileForm(originalProfileData);

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
