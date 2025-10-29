// Frontend/JavaScript/bookingCheckout.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState } from './auth.js';
import { showToast, showError, hideError } from './utils.js';

// ===== BOOKING STATE =====
let currentStep = 1;
const totalSteps = 3;

// Booking data from session storage (from hotel details page)
let bookingData = {
    hotelKey: '',
    hotelName: '',
    hotelImage: '',
    hotelRating: 0,
    hotelReviews: 0,
    hotelLocation: '',
    roomName: '',
    roomImage: '',
    roomGuests: 0,
    roomBed: '',
    roomAmenities: [],
    checkIn: '',
    checkOut: '',
    nights: 0,
    pricePerNight: 0,
    totalPrice: 0
};

// User booking details
let bookingDetails = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    smoking: 'non-smoking',
    bedPreference: 'large',
    specialRequests: '',
    paymentMethod: 'card',
    cardName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCVV: ''
};

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Booking Checkout Page Loaded');

    // Load booking data from session storage
    loadBookingData();

    // Populate booking summary
    populateBookingSummary();

    // Setup event listeners
    setupEventListeners();

    // Show initial step
    showStep(1);
});

// ===== LOAD BOOKING DATA =====
function loadBookingData() {
    try {
        // Get data from sessionStorage (set by hotelDetails.js)
        const selectedRoom = sessionStorage.getItem('selectedRoom');

        if (selectedRoom) {
            const data = JSON.parse(selectedRoom);
            console.log('✓ Loaded booking data:', data);

            bookingData = {
                hotelKey: data.hotelKey || '',
                hotelName: data.hotelName || 'Hotel',
                hotelImage: data.hotelImage || '',
                hotelRating: data.hotelRating || 0,
                hotelReviews: data.hotelReviews || 0,
                hotelLocation: data.hotelLocation || '',
                roomName: data.roomName || 'Room',
                roomImage: data.roomImage || data.hotelImage || '',
                roomGuests: data.roomGuests || 2,
                roomBed: data.roomBed || '1 King Bed',
                roomAmenities: data.roomAmenities || ['Free WiFi', 'Air Conditioning'],
                checkIn: data.checkIn || '',
                checkOut: data.checkOut || '',
                nights: data.nights || calculateNights(data.checkIn, data.checkOut),
                pricePerNight: data.roomPrice || 0,
                totalPrice: data.roomPrice * calculateNights(data.checkIn, data.checkOut) || 0
            };

        } else {
            // Fallback mock data for testing
            console.log('⚠️ No booking data found, using mock data');
            bookingData = {
                hotelKey: 'test-hotel',
                hotelName: 'MOV Hotel',
                hotelImage: 'https://via.placeholder.com/400x300',
                hotelRating: 4.7,
                hotelReviews: 1469,
                hotelLocation: 'Kuala Lumpur',
                roomName: 'Enclave (No Window)',
                roomImage: 'https://via.placeholder.com/400x300',
                roomGuests: 2,
                roomBed: '1 King Bed',
                roomAmenities: ['Free WiFi', '204 sq ft', 'Sleeps 2'],
                checkIn: '2025-10-30',
                checkOut: '2025-11-01',
                nights: 2,
                pricePerNight: 630,
                totalPrice: 1260
            };
        }
    } catch (error) {
        console.error('Error loading booking data:', error);
        showToast('Error loading booking details', true);
    }
}

// ===== CALCULATE NIGHTS =====
function calculateNights(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 1;

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    return nights > 0 ? nights : 1;
}

// ===== POPULATE BOOKING SUMMARY =====
function populateBookingSummary() {
    // Hotel info
    const summaryImage = document.getElementById('summaryHotelImage');
    const summaryName = document.getElementById('summaryHotelName');
    const summaryRating = document.getElementById('summaryRating');
    const summaryReviews = document.getElementById('summaryReviews');
    const summaryLocation = document.getElementById('summaryLocation');

    if (summaryImage) summaryImage.src = bookingData.hotelImage;
    if (summaryName) summaryName.textContent = bookingData.hotelName;
    if (summaryRating) summaryRating.textContent = `⭐ ${bookingData.hotelRating}`;
    if (summaryReviews) summaryReviews.textContent = `(${bookingData.hotelReviews.toLocaleString()} reviews)`;
    if (summaryLocation) summaryLocation.textContent = bookingData.hotelLocation;

    // Room info with image
    const summaryRoomImage = document.getElementById('summaryRoomImage');
    const summaryRoomName = document.getElementById('summaryRoomName');
    const summaryGuests = document.getElementById('summaryGuests');
    const summaryBed = document.getElementById('summaryBed');
    const summaryAmenities = document.getElementById('summaryAmenities');

    if (summaryRoomImage) summaryRoomImage.src = bookingData.roomImage || bookingData.hotelImage;
    if (summaryRoomName) summaryRoomName.textContent = bookingData.roomName;
    if (summaryGuests) summaryGuests.textContent = `${bookingData.roomGuests} guests`;
    if (summaryBed) summaryBed.textContent = bookingData.roomBed;

    if (summaryAmenities) {
        summaryAmenities.innerHTML = bookingData.roomAmenities
            .map(amenity => `<span class="amenity-tag">${amenity}</span>`)
            .join('');
    }

    // Dates
    const summaryCheckIn = document.getElementById('summaryCheckIn');
    const summaryCheckOut = document.getElementById('summaryCheckOut');
    const summaryNights = document.getElementById('summaryNights');

    if (summaryCheckIn) summaryCheckIn.textContent = formatDate(bookingData.checkIn);
    if (summaryCheckOut) summaryCheckOut.textContent = formatDate(bookingData.checkOut);
    if (summaryNights) summaryNights.textContent = `${bookingData.nights} night${bookingData.nights > 1 ? 's' : ''}`;

    // Price
    const pricePerNightAmount = document.getElementById('pricePerNightAmount');
    const pricePerNightCalc = document.getElementById('pricePerNightCalc');
    const priceNightCount = document.getElementById('priceNightCount');
    const priceSubtotal = document.getElementById('priceSubtotal');
    const priceTotal = document.getElementById('priceTotal');

    if (pricePerNightAmount) pricePerNightAmount.textContent = `MYR ${bookingData.pricePerNight}`;
    if (pricePerNightCalc) pricePerNightCalc.textContent = `MYR ${bookingData.pricePerNight}`;
    if (priceNightCount) priceNightCount.textContent = `${bookingData.nights} night${bookingData.nights > 1 ? 's' : ''}`;
    if (priceSubtotal) priceSubtotal.textContent = `MYR ${bookingData.totalPrice.toLocaleString()}`;
    if (priceTotal) priceTotal.textContent = `MYR ${bookingData.totalPrice.toLocaleString()}`;
}

// ===== FORMAT DATE =====
function formatDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// ===== SETUP EVENT LISTENERS =====
function setupEventListeners() {
    // Step navigation buttons
    const nextToPayment = document.getElementById('nextToPayment');
    const backToPersonal = document.getElementById('backToPersonal');
    const confirmBooking = document.getElementById('confirmBooking');

    if (nextToPayment) {
        nextToPayment.addEventListener('click', () => {
            if (validateStep1()) {
                saveStep1Data();
                goToStep(2);
            }
        });
    }

    if (backToPersonal) {
        backToPersonal.addEventListener('click', () => goToStep(1));
    }

    if (confirmBooking) {
        confirmBooking.addEventListener('click', () => {
            if (validateStep2()) {
                saveStep2Data();
                processBooking();
            }
        });
    }

    // Payment method toggle
    const paymentMethodRadios = document.querySelectorAll('input[name="paymentMethod"]');
    paymentMethodRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const cardContent = document.getElementById('cardPaymentContent');
            const digitalContent = document.getElementById('digitalPaymentContent');

            if (e.target.value === 'card') {
                if (cardContent) cardContent.style.display = 'block';
                if (digitalContent) digitalContent.style.display = 'none';
            } else {
                if (cardContent) cardContent.style.display = 'none';
                if (digitalContent) digitalContent.style.display = 'block';
            }
        });
    });

    // Card number formatting
    const cardNumberInput = document.getElementById('cardNumber');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s/g, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });
    }

    // Expiry date formatting
    const cardExpiryInput = document.getElementById('cardExpiry');
    if (cardExpiryInput) {
        cardExpiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.slice(0, 2) + '/' + value.slice(2, 4);
            }
            e.target.value = value;
        });
    }

    // CVV - numbers only
    const cardCVVInput = document.getElementById('cardCVV');
    if (cardCVVInput) {
        cardCVVInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
        });
    }

    // Clear errors on input
    const formInputs = document.querySelectorAll('.form-input');
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            const errorId = input.id + 'Error';
            hideError(errorId);
        });
    });
}

// ===== STEP NAVIGATION =====
function goToStep(step) {
    currentStep = step;
    showStep(step);
    updateProgress(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(stepEl => {
        stepEl.classList.remove('active');
    });

    // Show current step
    const currentStepEl = document.getElementById(`step-${step}`);
    if (currentStepEl) {
        currentStepEl.classList.add('active');
    }
}

function updateProgress(step) {
    const progressSteps = document.querySelectorAll('.progress-step');

    progressSteps.forEach((progressStep, index) => {
        const stepNumber = index + 1;

        if (stepNumber < step) {
            progressStep.classList.add('completed');
            progressStep.classList.remove('active');
        } else if (stepNumber === step) {
            progressStep.classList.add('active');
            progressStep.classList.remove('completed');
        } else {
            progressStep.classList.remove('active', 'completed');
        }
    });
}

// ===== VALIDATION =====
function validateStep1() {
    let isValid = true;

    // Clear all errors first
    hideError('firstNameError');
    hideError('lastNameError');
    hideError('emailError');

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!firstName) {
        showError('firstNameError', 'Please enter your first name');
        isValid = false;
    }

    if (!lastName) {
        showError('lastNameError', 'Please enter your last name');
        isValid = false;
    }

    if (!email) {
        showError('emailError', 'Please enter your email');
        isValid = false;
    } else {
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError('emailError', 'Please enter a valid email address');
            isValid = false;
        }
    }

    return isValid;
}

function validateStep2() {
    let isValid = true;

    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;

    // Clear errors
    hideError('agreeTermsError');
    hideError('cardNameError');
    hideError('cardNumberError');
    hideError('cardExpiryError');
    hideError('cardCVVError');

    // Check terms
    if (!agreeTerms) {
        showError('agreeTermsError', 'Please agree to the terms and conditions');
        isValid = false;
    }

    if (paymentMethod === 'card') {
        const cardName = document.getElementById('cardName').value.trim();
        const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
        const cardExpiry = document.getElementById('cardExpiry').value.trim();
        const cardCVV = document.getElementById('cardCVV').value.trim();

        if (!cardName) {
            showError('cardNameError', 'Please enter card holder name');
            isValid = false;
        }

        if (!cardNumber || cardNumber.length < 15) {
            showError('cardNumberError', 'Please enter a valid card number');
            isValid = false;
        }

        if (!cardExpiry || cardExpiry.length < 5) {
            showError('cardExpiryError', 'Please enter card expiry date');
            isValid = false;
        }

        if (!cardCVV || cardCVV.length < 3) {
            showError('cardCVVError', 'Please enter card CVV');
            isValid = false;
        }
    }

    return isValid;
}

// ===== SAVE FORM DATA =====
function saveStep1Data() {
    bookingDetails.firstName = document.getElementById('firstName').value.trim();
    bookingDetails.lastName = document.getElementById('lastName').value.trim();
    bookingDetails.email = document.getElementById('email').value.trim();
    bookingDetails.phone = document.getElementById('phone').value.trim();
    bookingDetails.smoking = document.querySelector('input[name="smoking"]:checked').value;
    bookingDetails.bedPreference = document.querySelector('input[name="bed"]:checked').value;
    bookingDetails.specialRequests = document.getElementById('requests').value.trim();

    console.log('✓ Step 1 data saved:', bookingDetails);
}

function saveStep2Data() {
    bookingDetails.paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

    if (bookingDetails.paymentMethod === 'card') {
        bookingDetails.cardName = document.getElementById('cardName').value.trim();
        bookingDetails.cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
        bookingDetails.cardExpiry = document.getElementById('cardExpiry').value.trim();
        bookingDetails.cardCVV = document.getElementById('cardCVV').value.trim();
    }

    console.log('✓ Step 2 data saved:', bookingDetails);
}

// ===== PROCESS BOOKING =====
async function processBooking() {
    try {
        // Show loading
        showLoading();

        // Simulate API call delay (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate booking ID
        const bookingId = generateBookingId();

        // Save to Firebase
        await saveBookingToFirebase(bookingId);

        // Update confirmation page
        populateConfirmationPage(bookingId);

        // Hide loading
        hideLoading();

        // Go to confirmation page
        goToStep(3);

        // Clear session storage
        sessionStorage.removeItem('selectedRoom');

        showToast('Booking confirmed successfully!', false);

    } catch (error) {
        console.error('Error processing booking:', error);
        hideLoading();
        showToast('Failed to process booking. Please try again.', true);
    }
}

// ===== GENERATE BOOKING ID =====
function generateBookingId() {
    const prefix = 'TRV';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
}

// In bookingCheckout.js - Update saveBookingToFirebase function
async function saveBookingToFirebase(bookingId) {
    const user = auth.currentUser;
    if (!user) {
        console.log('⚠️ No user logged in, skipping Firebase save');
        return;
    }

    try {
        const bookingRef = doc(db, 'users', user.uid, 'bookings', bookingId);

        await setDoc(bookingRef, {
            bookingId: bookingId,
            hotelName: bookingData.hotelName,
            hotelImage: bookingData.hotelImage,        // ✅ Add hotel image
            roomImage: bookingData.roomImage,          // ✅ Add room image
            hotelLocation: bookingData.hotelLocation,
            roomName: bookingData.roomName,
            checkIn: bookingData.checkIn,
            checkOut: bookingData.checkOut,
            nights: bookingData.nights,
            guests: bookingData.roomGuests,
            totalPrice: bookingData.totalPrice,
            currency: 'RM',
            firstName: bookingDetails.firstName,
            lastName: bookingDetails.lastName,
            email: bookingDetails.email,
            phone: bookingDetails.phone,
            paymentMethod: bookingDetails.paymentMethod,
            status: 'confirmed',
            createdAt: serverTimestamp()
        });

        console.log('✓ Booking saved to Firebase:', bookingId);
    } catch (error) {
        console.error('Error saving to Firebase:', error);
    }
}

// ===== POPULATE CONFIRMATION PAGE =====
function populateConfirmationPage(bookingId) {
    const bookingIdEl = document.getElementById('bookingId');
    const confirmEmail = document.getElementById('confirmEmail');
    const finalHotelName = document.getElementById('finalHotelName');
    const finalCheckIn = document.getElementById('finalCheckIn');
    const finalCheckOut = document.getElementById('finalCheckOut');
    const finalNights = document.getElementById('finalNights');
    const finalRoomName = document.getElementById('finalRoomName');
    const finalTotal = document.getElementById('finalTotal');

    if (bookingIdEl) bookingIdEl.textContent = `#${bookingId}`;
    if (confirmEmail) confirmEmail.textContent = bookingDetails.email;
    if (finalHotelName) finalHotelName.textContent = bookingData.hotelName;
    if (finalCheckIn) finalCheckIn.textContent = formatDate(bookingData.checkIn);
    if (finalCheckOut) finalCheckOut.textContent = formatDate(bookingData.checkOut);
    if (finalNights) finalNights.textContent = `${bookingData.nights} night${bookingData.nights > 1 ? 's' : ''}`;
    if (finalRoomName) finalRoomName.textContent = bookingData.roomName;
    if (finalTotal) finalTotal.textContent = `MYR ${bookingData.totalPrice.toLocaleString()}`;
}

// ===== LOADING STATE =====
function showLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'flex';
}

function hideLoading() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
}

// ===== AUTH STATE =====
observeAuthState(async (user) => {
    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                updateUserProfileUI(userData);

                // Pre-fill form with user data
                const firstNameInput = document.getElementById('firstName');
                const lastNameInput = document.getElementById('lastName');
                const emailInput = document.getElementById('email');
                const phoneInput = document.getElementById('phone');

                if (firstNameInput && !firstNameInput.value) firstNameInput.value = userData.firstName || '';
                if (lastNameInput && !lastNameInput.value) lastNameInput.value = userData.lastName || '';
                if (emailInput && !emailInput.value) emailInput.value = userData.email || '';
                if (phoneInput && !phoneInput.value) phoneInput.value = userData.phone || '';
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
    } else {
        // Redirect to login if not authenticated
        window.location.href = 'login.html';
    }
});

// ===== UPDATE USER PROFILE UI =====
function updateUserProfileUI(userData) {
    console.log('User logged in:', userData.firstName, userData.lastName);
}
