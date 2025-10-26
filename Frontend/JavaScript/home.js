import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

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
        // Update Name
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        profileNameElement.textContent = `${firstName} ${lastName}`.trim() || 'User';

        // Update Avatar (Image or Initials)
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

        // Make dropdown visible
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

// ===== DESTINATION NAVIGATION =====
function viewDestination(destinationId) {
    window.location.href = `destinationDetail.html?id=${destinationId}`;
}

// Make viewDestination globally accessible for onclick handlers
window.viewDestination = viewDestination;

// ===== BOOKING SEARCH BAR FUNCTIONALITY =====
function initBookingSearchBar() {
    // Tab Switching
    const bookingTabs = document.querySelectorAll('.booking-tab');
    const hotelForm = document.getElementById('hotelSearchForm');
    const flightForm = document.getElementById('flightSearchForm');

    if (bookingTabs.length > 0) {
        bookingTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Remove active class from all tabs
                bookingTabs.forEach(t => t.classList.remove('active'));
                // Add active class to clicked tab
                this.classList.add('active');

                // Show/hide forms
                const type = this.dataset.type;
                if (type === 'hotel' && hotelForm && flightForm) {
                    hotelForm.classList.remove('hidden');
                    flightForm.classList.add('hidden');
                } else if (type === 'flight' && hotelForm && flightForm) {
                    hotelForm.classList.add('hidden');
                    flightForm.classList.remove('hidden');
                }
            });
        });
    }

    // Guests Dropdown
    const guestsDropdown = document.querySelector('.guests-dropdown');
    const guestsTrigger = document.getElementById('guestsTrigger');
    const guestsDisplay = document.getElementById('guestsDisplay');
    
    if (guestsTrigger) {
        guestsTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            if (guestsDropdown) {
                guestsDropdown.classList.toggle('active');
            }
        });
    }

    // Counter Buttons
    const counterBtns = document.querySelectorAll('.counter-btn');
    counterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            const target = this.dataset.target;
            const countElement = document.getElementById(`${target}Count`);
            
            if (countElement) {
                let currentValue = parseInt(countElement.textContent);

                if (action === 'plus') {
                    currentValue++;
                } else if (action === 'minus') {
                    const minValue = (target === 'rooms' || target === 'adults') ? 1 : 0;
                    if (currentValue > minValue) {
                        currentValue--;
                    }
                }

                countElement.textContent = currentValue;
                updateGuestsDisplay();
            }
        });
    });

    function updateGuestsDisplay() {
        const roomsCount = document.getElementById('roomsCount');
        const adultsCount = document.getElementById('adultsCount');
        const childrenCount = document.getElementById('childrenCount');
        
        if (roomsCount && adultsCount && childrenCount && guestsDisplay) {
            const rooms = roomsCount.textContent;
            const adults = adultsCount.textContent;
            const children = childrenCount.textContent;
            guestsDisplay.textContent = `${rooms} room, ${adults} adults, ${children} children`;
        }
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (guestsDropdown && !guestsDropdown.contains(e.target)) {
            guestsDropdown.classList.remove('active');
        }
    });

    // Calculate nights for hotel booking
    const checkinInput = document.getElementById('hotelCheckin');
    const checkoutInput = document.getElementById('hotelCheckout');
    const nightCount = document.querySelector('.night-count');

    function calculateNights() {
        if (checkinInput && checkoutInput && nightCount) {
            if (checkinInput.value && checkoutInput.value) {
                const checkin = new Date(checkinInput.value);
                const checkout = new Date(checkoutInput.value);
                const nights = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));
                
                if (nights > 0) {
                    nightCount.textContent = `${nights} night${nights > 1 ? 's' : ''}`;
                } else {
                    nightCount.textContent = '1 night';
                }
            }
        }
    }

    if (checkinInput) {
        checkinInput.addEventListener('change', calculateNights);
    }
    if (checkoutInput) {
        checkoutInput.addEventListener('change', calculateNights);
    }

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    if (checkinInput) checkinInput.setAttribute('min', today);
    if (checkoutInput) checkoutInput.setAttribute('min', today);
    
    const flightDeparture = document.getElementById('flightDeparture');
    const flightReturn = document.getElementById('flightReturn');
    if (flightDeparture) flightDeparture.setAttribute('min', today);
    if (flightReturn) flightReturn.setAttribute('min', today);

    // Auto-update checkout min date when checkin changes
    if (checkinInput && checkoutInput) {
        checkinInput.addEventListener('change', function() {
            checkoutInput.setAttribute('min', this.value);
            if (checkoutInput.value && checkoutInput.value <= this.value) {
                checkoutInput.value = '';
            }
        });
    }

    // Auto-update return min date when departure changes
    if (flightDeparture && flightReturn) {
        flightDeparture.addEventListener('change', function() {
            flightReturn.setAttribute('min', this.value);
            if (flightReturn.value && flightReturn.value <= this.value) {
                flightReturn.value = '';
            }
        });
    }

    // Hotel Form Submission
    if (hotelForm) {
        hotelForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const destination = document.getElementById('hotelDestination')?.value;
            const checkin = document.getElementById('hotelCheckin')?.value;
            const checkout = document.getElementById('hotelCheckout')?.value;
            const rooms = document.getElementById('roomsCount')?.textContent;
            const adults = document.getElementById('adultsCount')?.textContent;
            const children = document.getElementById('childrenCount')?.textContent;

            if (!destination || !checkin || !checkout) {
                showToast('Please fill in all required fields', true);
                return;
            }

            // Validate dates
            if (new Date(checkout) <= new Date(checkin)) {
                showToast('Check-out date must be after check-in date', true);
                return;
            }

            const params = new URLSearchParams({
                type: 'hotel',
                destination: destination,
                checkin: checkin,
                checkout: checkout,
                rooms: rooms || '1',
                adults: adults || '2',
                children: children || '0'
            });

            window.location.href = `booking.html?${params.toString()}`;
        });
    }

    // Flight Form Submission
    if (flightForm) {
        flightForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const origin = document.getElementById('flightOrigin')?.value;
            const destination = document.getElementById('flightDestination')?.value;
            const departure = document.getElementById('flightDeparture')?.value;
            const returnDate = document.getElementById('flightReturn')?.value;
            const travelers = document.getElementById('flightTravelers')?.value;

            if (!origin || !destination || !departure) {
                showToast('Please fill in all required fields', true);
                return;
            }

            // Validate dates if return date is provided
            if (returnDate && new Date(returnDate) <= new Date(departure)) {
                showToast('Return date must be after departure date', true);
                return;
            }

            const params = new URLSearchParams({
                type: 'flight',
                origin: origin,
                destination: destination,
                departure: departure,
                return: returnDate || '',
                travelers: travelers || '1'
            });

            window.location.href = `booking.html?${params.toString()}`;
        });
    }
}

// ===== AUTH STATE OBSERVER =====
observeAuthState(async (user) => {
    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                console.log("User data from Firestore: ", userData);

                if (userData.profilePhotoURL) {
                    userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                }

                updateUserProfileUI(userData);
            } else {
                console.error("Firestore document missing...", user.uid);
                showToast("Error: Your profile data could not be found. Logging out", true);
                await handleLogout();
            }

        } catch (error) {
            console.error("Error fetching user data...", error);
            showToast("Error loading your profile. Please try again later.", true);
            const profileDropdown = document.getElementById('profileDropdown');
            if (profileDropdown) profileDropdown.style.display = 'none';
        }
    } else {
        console.log("Auth state: User signed out. Redirecting to login");
        window.location.href = 'login.html';
    }
});

// ===== DOM CONTENT LOADED =====
document.addEventListener('DOMContentLoaded', () => {
    const profileTrigger = document.querySelector('.profile-trigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');

    // 1. Profile Dropdown Toggle
    if (profileTrigger) {
        profileTrigger.removeAttribute('onclick');
        profileTrigger.addEventListener('click', toggleDropdown);
    } else {
        console.error("Profile trigger element not found");
    }

    // 2. Close Dropdown when clicking outside
    document.addEventListener('click', function (event) {
        if (profileDropdown && !profileDropdown.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    // 3. Logout Button
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    } else {
        console.error("Logout button not found");
    }

    // 4. Initialize Booking Search Bar
    initBookingSearchBar();

    // 5. Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            try {
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                } else {
                    console.warn(`Smooth scroll target not found: ${targetId}`);
                }
            } catch (error) {
                console.error(`Error finding smooth scroll target ${targetId}:`, error);
            }
        });
    });
});
