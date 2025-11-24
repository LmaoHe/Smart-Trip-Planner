import { db, auth } from './firebase-config.js';
import { 
    doc, 
    getDoc,
    setDoc, 
    collection, 
    serverTimestamp,
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// ===== GLOBAL VARIABLES =====
let packageData = null;
let currentStep = 1;
let baggageCost = 0;
let totalPassengers = 1;


// Booking details
let bookingDetails = {
    leadPassenger: {},
    passengers: [],
    baggage: 'standard',
    paymentMethod: 'card'
};


// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', () => {
    const storedPackage = sessionStorage.getItem('packageCheckout');
    
    if (!storedPackage) {
        showToast('No package data found. Redirecting...', true);
        setTimeout(() => {
            window.location.href = 'aiItinerary.html';
        }, 2000);
        return;
    }
    
    packageData = JSON.parse(storedPackage);
    console.log('📦 Package data loaded:', packageData);
    
    // Get total passengers from package data
    totalPassengers = packageData.flight?.passengers || 1;
    console.log(`👥 Total passengers: ${totalPassengers}`);
    
    // Display package summary
    displayPackageSummary();
    
    // Setup navigation
    setupNavigation();
    
    // Setup payment method toggle
    setupPaymentMethodToggle();
    
    // Setup card formatting
    setupCardFormatting();
    
    // Show initial step
    showStep(1);
    
    // Wait for auth state before auto-filling
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await autoFillUserInfo();
        } else {
            console.log('No user logged in');
        }
    });
});


// ===== DISPLAY PACKAGE SUMMARY =====
function displayPackageSummary() {
    const { flight, hotel } = packageData;
    
    // Flight section
    if (flight) {
        // Outbound flight - using YOUR actual HTML IDs
        const summaryOutboundFrom = document.getElementById('summaryOutboundFrom');
        const summaryOutboundTo = document.getElementById('summaryOutboundTo');
        const summaryOutboundTime = document.getElementById('summaryOutboundTime');
        const summaryOutboundDate = document.getElementById('summaryOutboundDate');
        const summaryPassengers = document.getElementById('summaryPassengers');
        const summaryClass = document.getElementById('summaryClass');
        
        if (summaryOutboundFrom) summaryOutboundFrom.textContent = flight.fromAirport;
        if (summaryOutboundTo) summaryOutboundTo.textContent = flight.toAirport;
        if (summaryOutboundTime) summaryOutboundTime.textContent = `${flight.departure} - ${flight.arrival}`;
        if (summaryOutboundDate) summaryOutboundDate.textContent = formatDate(flight.departureDate);
        if (summaryPassengers) summaryPassengers.textContent = flight.passengers;
        if (summaryClass) summaryClass.textContent = flight.class || 'Economy';
        
        // Return flight
        if (flight.hasReturn && flight.returnFlight) {
            const summaryReturnFrom = document.getElementById('summaryReturnFrom');
            const summaryReturnTo = document.getElementById('summaryReturnTo');
            const summaryReturnTime = document.getElementById('summaryReturnTime');
            const summaryReturnDate = document.getElementById('summaryReturnDate');
            
            if (summaryReturnFrom) summaryReturnFrom.textContent = flight.toAirport;
            if (summaryReturnTo) summaryReturnTo.textContent = flight.fromAirport;
            if (summaryReturnTime) summaryReturnTime.textContent = `${flight.returnFlight.departure} - ${flight.returnFlight.arrival}`;
            if (summaryReturnDate) summaryReturnDate.textContent = formatDate(flight.returnDate || flight.departureDate);
        } else {
            const returnSection = document.getElementById('returnFlightSection');
            if (returnSection) returnSection.style.display = 'none';
        }
    }
    
    // Hotel section
    if (hotel) {
        const summaryHotelImage = document.getElementById('summaryHotelImage');
        const summaryHotelName = document.getElementById('summaryHotelName');
        const summaryRating = document.getElementById('summaryRating');
        const summaryLocation = document.getElementById('summaryLocation');
        const summaryRoomName = document.getElementById('summaryRoomName');
        const summaryBed = document.getElementById('summaryBed');
        const summaryNights = document.getElementById('summaryNights');
        const summaryRooms = document.getElementById('summaryRooms');
        const summaryCheckIn = document.getElementById('summaryCheckIn');
        const summaryCheckOut = document.getElementById('summaryCheckOut');
        
        if (summaryHotelImage) summaryHotelImage.src = hotel.hotelImage || '';
        if (summaryHotelName) summaryHotelName.textContent = hotel.hotelName;
        if (summaryRating) summaryRating.textContent = `⭐ ${hotel.hotelRating}`;
        if (summaryLocation) summaryLocation.textContent = hotel.hotelLocation;
        if (summaryRoomName) summaryRoomName.textContent = hotel.roomName;
        if (summaryBed) summaryBed.textContent = hotel.roomBed || '1 King Bed';
        if (summaryNights) summaryNights.textContent = `${hotel.nights} night(s)`;
        if (summaryRooms) summaryRooms.textContent = `${hotel.rooms} room(s)`;
        if (summaryCheckIn) summaryCheckIn.textContent = formatDate(hotel.checkIn);
        if (summaryCheckOut) summaryCheckOut.textContent = formatDate(hotel.checkOut);
    }
    
    updateTotalPrice();
}

// ===== GENERATE DYNAMIC PASSENGER PASSPORT FORMS =====
function generatePassengerForms() {
    console.log('🔍 generatePassengerForms() called');
    console.log('👥 totalPassengers:', totalPassengers);
    
    const container = document.getElementById('passengersContainer');
    
    if (!container) {
        console.error('❌ Passengers container NOT FOUND in DOM');
        return;
    }
    
    console.log('✅ Container found:', container);
    
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    container.innerHTML = '';
    
    console.log(`✅ Generating ${totalPassengers} passenger passport forms...`);
    
    for (let i = 0; i < totalPassengers; i++) {
        const isLeadPassenger = i === 0;
        const passengerSection = document.createElement('div');
        passengerSection.className = 'passenger-auth-card';
        passengerSection.innerHTML = `
            <div class="form-section">
                <h3 class="section-title">Passenger ${i + 1} Authentication ${isLeadPassenger ? '(Lead)' : ''}</h3>
                <p class="section-subtitle">Verify identity for flight check-in</p>

                <div class="form-row">
                    <div class="form-group">
                        <label for="passenger${i}FirstName">First Name *</label>
                        <input type="text" id="passenger${i}FirstName" class="form-input passenger-auth-input" placeholder="Enter first name" data-passenger="${i}" required>
                        <span id="passenger${i}FirstNameError" class="error-message" style="display: none;"></span>
                    </div>
                    <div class="form-group">
                        <label for="passenger${i}LastName">Last Name *</label>
                        <input type="text" id="passenger${i}LastName" class="form-input passenger-auth-input" placeholder="Enter last name" data-passenger="${i}" required>
                        <span id="passenger${i}LastNameError" class="error-message" style="display: none;"></span>
                    </div>
                </div>

                <div class="form-group">
                    <label for="passenger${i}PassportNumber">Passport Number *</label>
                    <input type="text" id="passenger${i}PassportNumber" class="form-input passenger-auth-input" placeholder="Enter passport number" data-passenger="${i}" style="text-transform: uppercase;" required>
                    <span id="passenger${i}PassportNumberError" class="error-message" style="display: none;"></span>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="passenger${i}PassportExpiry">Passport Expiry *</label>
                        <input type="date" id="passenger${i}PassportExpiry" class="form-input passenger-auth-input" data-passenger="${i}" min="${todayString}" required>
                        <small class="form-hint">Must be valid for at least 6 months</small>
                        <span id="passenger${i}PassportExpiryError" class="error-message" style="display: none;"></span>
                    </div>
                    <div class="form-group">
                        <label for="passenger${i}Nationality">Nationality *</label>
                        <input type="text" id="passenger${i}Nationality" class="form-input passenger-auth-input" placeholder="e.g., Malaysian" data-passenger="${i}" required>
                        <span id="passenger${i}NationalityError" class="error-message" style="display: none;"></span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(passengerSection);
        console.log(`✅ Added passenger ${i + 1} card to container`);
    }
    
    // Auto-fill lead passenger (Passenger 0) with data from Step 1
    setTimeout(() => {
        const firstName = bookingDetails.leadPassenger?.firstName || document.getElementById('firstName')?.value || '';
        const lastName = bookingDetails.leadPassenger?.lastName || document.getElementById('lastName')?.value || '';
        
        const passenger0FirstName = document.getElementById('passenger0FirstName');
        const passenger0LastName = document.getElementById('passenger0LastName');
        
        if (passenger0FirstName && firstName) {
            passenger0FirstName.value = firstName;
            console.log('✅ Auto-filled Passenger 1 first name:', firstName);
        }
        if (passenger0LastName && lastName) {
            passenger0LastName.value = lastName;
            console.log('✅ Auto-filled Passenger 1 last name:', lastName);
        }
    }, 100);
    
    // Update passenger count display
    const countDisplay = document.getElementById('passengerCountDisplay');
    if (countDisplay) {
        countDisplay.textContent = totalPassengers;
    }
    
    setupPassengerInputListeners();
    
    console.log(`✅ Generated ${totalPassengers} passenger forms successfully`);
}

// ===== SETUP PASSENGER INPUT LISTENERS =====
function setupPassengerInputListeners() {
    for (let i = 0; i < totalPassengers; i++) {
        const fields = [
            { id: `passenger${i}FirstName`, errorId: `passenger${i}FirstNameError` },
            { id: `passenger${i}LastName`, errorId: `passenger${i}LastNameError` },
            { id: `passenger${i}PassportNumber`, errorId: `passenger${i}PassportNumberError` },
            { id: `passenger${i}PassportExpiry`, errorId: `passenger${i}PassportExpiryError` },
            { id: `passenger${i}Nationality`, errorId: `passenger${i}NationalityError` }
        ];

        fields.forEach(field => {
            const input = document.getElementById(field.id);
            if (input) {
                input.addEventListener('input', () => {
                    hideError(field.errorId);
                });
            }
        });
    }

    console.log('✓ Passenger input listeners setup for', totalPassengers, 'passengers');
}


// ===== VALIDATE ALL PASSENGER PASSPORTS =====
function validatePassengerPassports() {
    let allValid = true;
    
    console.log(`🔍 Validating ${totalPassengers} passenger passports...`);
    
    for (let i = 0; i < totalPassengers; i++) {
        const isValid = validateSinglePassengerPassport(i);
        if (!isValid) {
            allValid = false;
            console.log(`❌ Passenger ${i + 1} validation failed`);
        } else {
            console.log(`✅ Passenger ${i + 1} validated`);
        }
    }
    
    if (!allValid) {
        showToast('Please fill in all passenger details correctly', true);
    }
    
    return allValid;
}

function validateSinglePassengerPassport(passengerIndex) {
    let isValid = true;
    
    // First name
    const firstName = document.getElementById(`passenger${passengerIndex}FirstName`)?.value.trim();
    if (!firstName || !/^[a-zA-Z\s'-]{2,}$/.test(firstName)) {
        showError(`passenger${passengerIndex}FirstNameError`, 'Enter a valid first name');
        isValid = false;
    } else {
        hideError(`passenger${passengerIndex}FirstNameError`);
    }
    
    // Last name
    const lastName = document.getElementById(`passenger${passengerIndex}LastName`)?.value.trim();
    if (!lastName || !/^[a-zA-Z\s'-]{2,}$/.test(lastName)) {
        showError(`passenger${passengerIndex}LastNameError`, 'Enter a valid last name');
        isValid = false;
    } else {
        hideError(`passenger${passengerIndex}LastNameError`);
    }
    
    // Passport number
    const passportNumber = document.getElementById(`passenger${passengerIndex}PassportNumber`)?.value.trim();
    if (!passportNumber || !/^[A-Za-z0-9]{6,15}$/.test(passportNumber)) {
        showError(`passenger${passengerIndex}PassportNumberError`, 'Enter a valid passport number');
        isValid = false;
    } else {
        hideError(`passenger${passengerIndex}PassportNumberError`);
    }
    
    // Passport expiry
    const passportExpiry = document.getElementById(`passenger${passengerIndex}PassportExpiry`)?.value;
    if (!passportExpiry) {
        showError(`passenger${passengerIndex}PassportExpiryError`, 'Passport expiry date is required');
        isValid = false;
    } else {
        const expiryDate = new Date(passportExpiry + 'T23:59:59');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (expiryDate < today) {
            showError(`passenger${passengerIndex}PassportExpiryError`, 'Passport expiry date cannot be in the past');
            isValid = false;
        } else {
            const sixMonthsFromNow = new Date();
            sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

            if (expiryDate < sixMonthsFromNow) {
                console.warn(`⚠️ Passenger ${passengerIndex + 1}: Passport expires within 6 months`);
            }
            hideError(`passenger${passengerIndex}PassportExpiryError`);
        }
    }
    
    // Nationality
    const nationality = document.getElementById(`passenger${passengerIndex}Nationality`)?.value.trim();
    if (!nationality) {
        showError(`passenger${passengerIndex}NationalityError`, 'Nationality is required');
        isValid = false;
    } else {
        hideError(`passenger${passengerIndex}NationalityError`);
    }
    
    return isValid;
}


// ===== COLLECT ALL PASSENGER DATA =====
function collectPassengerData() {
    const passengers = [];
    
    console.log(`📝 Collecting data for ${totalPassengers} passengers...`);
    
    for (let i = 0; i < totalPassengers; i++) {
        const passengerData = {
            passengerNumber: i + 1,
            firstName: document.getElementById(`passenger${i}FirstName`)?.value.trim(),
            lastName: document.getElementById(`passenger${i}LastName`)?.value.trim(),
            passportNumber: document.getElementById(`passenger${i}PassportNumber`)?.value.trim().toUpperCase(),
            passportExpiry: document.getElementById(`passenger${i}PassportExpiry`)?.value,
            nationality: document.getElementById(`passenger${i}Nationality`)?.value.trim()
        };
        
        passengers.push(passengerData);
        console.log(`✅ Passenger ${i + 1}:`, passengerData.firstName, passengerData.lastName);
    }
    
    return passengers;
}


// ===== UPDATE TOTAL PRICE =====
function updateTotalPrice() {
    const { flight, hotel } = packageData;
    
    const flightPrice = flight.price.total || 0;
    const hotelPrice = hotel.roomPricePerNight * hotel.nights * hotel.rooms;
    const subtotal = flightPrice + hotelPrice + baggageCost;
    const serviceCharge = subtotal * 0.10;
    const total = subtotal + serviceCharge;
    
    document.getElementById('priceFlightTotal').textContent = `MYR ${flightPrice.toFixed(2)}`;
    document.getElementById('priceRoomsNights').textContent = `${hotel.rooms} room(s) × ${hotel.nights} night(s)`;
    document.getElementById('priceHotelTotal').textContent = `MYR ${hotelPrice.toFixed(2)}`;
    
    // Show/hide baggage row
    const baggageRow = document.getElementById('baggagePriceRow');
    if (baggageCost > 0) {
        baggageRow.style.display = 'flex';
        document.getElementById('priceBaggageTotal').textContent = `MYR ${baggageCost.toFixed(2)}`;
    } else {
        baggageRow.style.display = 'none';
    }
    
    document.getElementById('serviceChargeDisplay').textContent = `MYR ${serviceCharge.toFixed(2)}`;
    document.getElementById('priceTotal').textContent = `MYR ${total.toFixed(2)}`;
}


// ===== BAGGAGE CALCULATION =====
function initializeBaggageListeners() {
    const baggageOptions = document.querySelectorAll('.baggage-option');
    
    baggageOptions.forEach(option => {
        const radio = option.querySelector('input[type="radio"]');
        
        if (radio) {
            // Make entire card clickable
            option.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            
            // Handle radio change
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const price = parseFloat(e.target.dataset.price) || 0;
                    
                    // Calculate total baggage cost (price × total passengers)
                    baggageCost = price * totalPassengers;
                    
                    console.log('✓ Baggage selected:', {
                        type: e.target.value,
                        pricePerPerson: price,
                        totalPassengers: totalPassengers,
                        totalCost: baggageCost
                    });
                    
                    updateTotalPrice();
                }
            });
        }
    });
    
    console.log('✓ Baggage selection listeners setup');
}


// ===== SETUP NAVIGATION =====
function setupNavigation() {
    // Back to hotel selection
    const backToPackageBtn = document.getElementById('backToPackage');
    if (backToPackageBtn) {
        backToPackageBtn.addEventListener('click', () => {
            window.location.href = 'hotelRoomSelection.html';
        });
    }
    
    // Lead Passenger → Passengers Passports
    const nextToPassengersBtn = document.getElementById('nextToPassengers');
    if (nextToPassengersBtn) {
        nextToPassengersBtn.addEventListener('click', () => {
            if (validateStep1()) {
                saveStep1Data();
                goToStep('passengers');
            }
        });
    }
    
    // Passengers → Baggage
    const nextToBaggageBtn = document.getElementById('nextToBaggage');
    if (nextToBaggageBtn) {
        nextToBaggageBtn.addEventListener('click', () => {
            if (validatePassengerPassports()) {
                savePassengersData();
                goToStep('baggage');
            }
        });
    }
    
    // Baggage → Payment
    const nextToPaymentBtn = document.getElementById('nextToPayment');
    if (nextToPaymentBtn) {
        nextToPaymentBtn.addEventListener('click', () => {
            saveBaggageData();
            goToStep(2);
        });
    }
    
    // Back buttons
    const backToLeadPassengerBtn = document.getElementById('backToLeadPassenger');
    if (backToLeadPassengerBtn) {
        backToLeadPassengerBtn.addEventListener('click', () => goToStep(1));
    }
    
    const backToPassengersBtn = document.getElementById('backToPassengers');
    if (backToPassengersBtn) {
        backToPassengersBtn.addEventListener('click', () => goToStep('passengers'));
    }
    
    const backToBaggageBtn = document.getElementById('backToBaggage');
    if (backToBaggageBtn) {
        backToBaggageBtn.addEventListener('click', () => goToStep('baggage'));
    }
    
    // Confirm booking
    const confirmBookingBtn = document.getElementById('confirmBooking');
    if (confirmBookingBtn) {
        confirmBookingBtn.addEventListener('click', () => {
            if (validatePayment()) {
                processBooking();
            }
        });
    }
}


// ===== VALIDATION =====
function validateStep1() {
    let isValid = true;
    
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    
    hideError('firstNameError');
    hideError('lastNameError');
    hideError('emailError');
    hideError('phoneError');
    
    if (!firstName || !/^[a-zA-Z\s'-]{2,}$/.test(firstName)) {
        showError('firstNameError', 'Enter a valid first name (letters only)');
        isValid = false;
    }
    
    if (!lastName || !/^[a-zA-Z\s'-]{2,}$/.test(lastName)) {
        showError('lastNameError', 'Enter a valid last name (letters only)');
        isValid = false;
    }
    
    if (!email || !isValidEmail(email)) {
        showError('emailError', 'Enter a valid email address');
        isValid = false;
    }
    
    if (!phone || !/^[0-9+\-\s()]{7,}$/.test(phone)) {
        showError('phoneError', 'Enter a valid phone number');
        isValid = false;
    }
    
    if (!isValid) {
        showToast('Please fill in all required fields correctly', true);
    }
    
    return isValid;
}


function validatePayment() {
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    let isValid = true;
    
    if (paymentMethod === 'card') {
        const cardName = document.getElementById('cardName').value.trim();
        const cardNumber = document.getElementById('cardNumber').value.trim().replace(/\s/g, '');
        const cardExpiry = document.getElementById('cardExpiry').value.trim();
        const cardCVV = document.getElementById('cardCVV').value.trim();
        
        if (!cardName) {
            showError('cardNameError', 'Card holder name is required');
            isValid = false;
        } else {
            hideError('cardNameError');
        }
        
        if (!cardNumber || cardNumber.length < 13) {
            showError('cardNumberError', 'Valid card number is required');
            isValid = false;
        } else {
            hideError('cardNumberError');
        }
        
        if (!cardExpiry || !isValidExpiry(cardExpiry)) {
            showError('cardExpiryError', 'Valid expiry date is required (MM/YY)');
            isValid = false;
        } else {
            hideError('cardExpiryError');
        }
        
        if (!cardCVV || cardCVV.length < 3) {
            showError('cardCVVError', 'Valid CVV is required');
            isValid = false;
        } else {
            hideError('cardCVVError');
        }
    }
    
    const agreeTerms = document.getElementById('agreeTerms').checked;
    if (!agreeTerms) {
        showError('agreeTermsError', 'You must agree to the terms and conditions');
        isValid = false;
    } else {
        hideError('agreeTermsError');
    }
    
    return isValid;
}


// ===== SAVE FORM DATA =====
function saveStep1Data() {
    bookingDetails.leadPassenger = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim()
    };
    
    console.log('✓ Step 1 - Lead passenger data saved');
}

function savePassengersData() {
    bookingDetails.passengers = collectPassengerData();
    console.log('✓ Passengers data saved');
}

function saveBaggageData() {
    const selectedBaggage = document.querySelector('input[name="baggage"]:checked');
    bookingDetails.baggage = selectedBaggage ? selectedBaggage.value : 'standard';
    console.log('✓ Baggage data saved');
}


// ===== SETUP PAYMENT METHOD TOGGLE =====
function setupPaymentMethodToggle() {
    const paymentMethods = document.querySelectorAll('input[name="paymentMethod"]');
    const cardContent = document.getElementById('cardPaymentContent');
    const digitalContent = document.getElementById('digitalPaymentContent');
    
    paymentMethods.forEach(method => {
        method.addEventListener('change', (e) => {
            if (e.target.value === 'card') {
                cardContent.style.display = 'block';
                digitalContent.style.display = 'none';
            } else {
                cardContent.style.display = 'none';
                digitalContent.style.display = 'block';
            }
        });
    });
}


// ===== AUTO-FILL USER INFO =====
async function autoFillUserInfo() {
    if (!auth.currentUser) {
        console.log('❌ No current user');
        return;
    }
    
    console.log('✅ Attempting to auto-fill lead passenger...');
    
    try {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('✅ User data found:', userData);
            
            const firstNameField = document.getElementById('firstName');
            const lastNameField = document.getElementById('lastName');
            const emailField = document.getElementById('email');
            const phoneField = document.getElementById('phone');
            
            if (firstNameField) firstNameField.value = userData.firstName || '';
            if (lastNameField) lastNameField.value = userData.lastName || '';
            if (emailField) emailField.value = userData.email || auth.currentUser.email || '';
            if (phoneField) phoneField.value = userData.phone || '';
            
            console.log('✅ Form fields pre-filled successfully');
        } else {
            console.log('⚠️ User document not found in Firestore');
            
            const emailField = document.getElementById('email');
            if (emailField && auth.currentUser.email) {
                emailField.value = auth.currentUser.email;
            }
        }
    } catch (error) {
        console.error('❌ Error auto-filling user info:', error);
    }
}


// ===== PROCESS BOOKING =====
async function processBooking() {
    if (!auth.currentUser) {
        showToast('Please log in to complete booking', true);
        return;
    }
    
    showLoading();
    
    try {
        const userId = auth.currentUser.uid;
        const { flight, hotel, packageInfo } = packageData;
        
        const packageBookingId = `PKG${Date.now()}`;
        const flightBookingId = `FLT${Date.now()}`;
        const hotelBookingId = `TRV${Date.now()}`;
        
        const firstName = bookingDetails.leadPassenger.firstName;
        const lastName = bookingDetails.leadPassenger.lastName;
        const email = bookingDetails.leadPassenger.email;
        const phone = bookingDetails.leadPassenger.phone;
        
        const passengersData = bookingDetails.passengers;
        
        const selectedBaggage = document.querySelector('input[name="baggage"]:checked');
        const baggageWeight = selectedBaggage ? selectedBaggage.value : null;
        const baggagePrice = selectedBaggage ? parseFloat(selectedBaggage.dataset.price) : 0;
        
        const smoking = document.querySelector('input[name="smoking"]:checked')?.value || 'non-smoking';
        const bedType = document.querySelector('input[name="bed"]:checked')?.value || 'large';
        const specialRequests = document.getElementById('requests')?.value.trim() || '';
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'card';
        
        const flightPrice = flight.price.total || 0;
        const hotelPrice = hotel.roomPrice * hotel.nights * hotel.rooms;
        const subtotal = flightPrice + hotelPrice + baggageCost;
        const serviceCharge = subtotal * 0.10;
        const totalPrice = subtotal + serviceCharge;
        
        const destination = packageInfo?.city || hotel?.hotelLocation || 'Unknown';
        
        const batch = writeBatch(db);
        
        // Flight booking
        const flightRef = doc(db, 'users', userId, 'bookings', flightBookingId);
        batch.set(flightRef, {
            bookingId: flightBookingId,
            bookingType: 'flight',
            
            flightDetails: {
                outbound: {
                    airline: flight.airline || 'N/A',
                    departTime: flight.departure,
                    arriveTime: flight.arrival,
                    departDate: flight.departureDate,
                    duration: flight.duration || 'N/A',
                    flightNumber: flight.flightNumber || 'N/A',
                    fromAirport: flight.fromAirport,
                    toAirport: flight.toAirport,
                    stops: []
                },
                return: flight.hasReturn ? {
                    airline: flight.airline || 'N/A',
                    departTime: flight.returnFlight.departure,
                    arriveTime: flight.returnFlight.arrival,
                    departDate: flight.returnDate || flight.departureDate,
                    duration: flight.returnFlight.duration || 'N/A',
                    flightNumber: flight.flightNumber || 'N/A',
                    fromAirport: flight.toAirport,
                    toAirport: flight.fromAirport,
                    stops: []
                } : null
            },
            
            leadPassenger: {
                firstName: passengersData[0].firstName,
                lastName: passengersData[0].lastName,
                email: email,
                phone: phone,
                passportNumber: passengersData[0].passportNumber,
                passportExpiry: passengersData[0].passportExpiry,
                nationality: passengersData[0].nationality
            },
            
            passengers: passengersData,
            totalPassengers: totalPassengers,
            
            pricing: {
                pricePerPerson: flightPrice / totalPassengers,
                baseFareTotal: flightPrice,
                baggageCost: baggageCost,
                totalPrice: flightPrice + baggageCost
            },
            
            baggageDetails: {
                weight: baggageWeight,
                pricePerPerson: baggagePrice,
                totalPrice: baggageCost
            },
            
            status: 'confirmed',
            packageBookingId: packageBookingId,
            createdAt: serverTimestamp()
        });
        
        // Hotel booking
        const hotelRef = doc(db, 'users', userId, 'bookings', hotelBookingId);
        batch.set(hotelRef, {
            bookingId: hotelBookingId,
            bookingType: 'hotel',
            
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            
            hotelName: hotel.hotelName,
            hotelImage: hotel.hotelImage || '',
            hotelLocation: hotel.hotelLocation,
            
            roomName: hotel.roomName,
            roomImage: hotel.roomImage || '',
            
            checkIn: hotel.checkIn,
            checkOut: hotel.checkOut,
            nights: hotel.nights,
            
            rooms: hotel.rooms,
            guests: hotel.totalGuests,
            adults: hotel.adults || totalPassengers,
            children: hotel.children || 0,
            totalGuests: hotel.totalGuests,
            
            smoking: smoking,
            bedPreference: bedType,
            specialRequests: specialRequests,
            
            pricePerNight: hotel.roomPrice,
            subtotal: hotelPrice,
            totalPrice: hotelPrice,
            currency: 'MYR',
            
            paymentMethod: paymentMethod,
            status: 'confirmed',
            
            packageBookingId: packageBookingId,
            createdAt: serverTimestamp()
        });
        
        // Package booking
        const packageRef = doc(db, 'users', userId, 'bookings', packageBookingId);
        batch.set(packageRef, {
            bookingId: packageBookingId,
            bookingType: 'package',
            
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone,
            
            flightBookingId: flightBookingId,
            hotelBookingId: hotelBookingId,
            
            packageSummary: {
                destination: destination,
                passengers: totalPassengers,
                nights: hotel.nights,
                rooms: hotel.rooms
            },
            
            pricing: {
                flightTotal: flightPrice,
                hotelTotal: hotelPrice,
                baggageTotal: baggageCost,
                subtotal: subtotal,
                serviceCharge: serviceCharge,
                totalPrice: totalPrice,
                currency: 'MYR'
            },
            
            totalPrice: totalPrice,
            serviceCharge: serviceCharge,
            currency: 'MYR',
            
            paymentMethod: paymentMethod,
            status: 'confirmed',
            
            createdAt: serverTimestamp()
        });
        
        await batch.commit();
        
        console.log('✅ Package booking created:', packageBookingId);
        console.log(`✅ ${totalPassengers} passengers stored`);
        
        // Update confirmation page
        document.getElementById('bookingId').textContent = packageBookingId;
        document.getElementById('confirmEmail').textContent = email;
        document.getElementById('finalPassengers').textContent = totalPassengers;
        document.getElementById('finalRoute').textContent = `${flight.fromAirport} ↔ ${flight.toAirport}`;
        document.getElementById('finalHotelName').textContent = hotel.hotelName;
        document.getElementById('finalCheckIn').textContent = formatDate(hotel.checkIn);
        document.getElementById('finalCheckOut').textContent = formatDate(hotel.checkOut);
        document.getElementById('finalRoomName').textContent = hotel.roomName;
        document.getElementById('finalTotal').textContent = `MYR ${totalPrice.toFixed(2)}`;
        
        sessionStorage.removeItem('packageCheckout');
        sessionStorage.removeItem('travelPackage');
        
        hideLoading();
        goToStep(3);
        showToast('Package booking confirmed!', false);
        
    } catch (error) {
        console.error('❌ Error creating booking:', error);
        hideLoading();
        showToast('Failed to complete booking. Please try again.', true);
    }
}


// ===== STEP NAVIGATION =====
function goToStep(step) {
    currentStep = step;
    showStep(step);
    updateProgress(step);
    
    // Generate passenger forms when navigating to passengers step
    if (step === 'passengers') {
        setTimeout(() => {
            generatePassengerForms();
        }, 100);
    }
    
    // Initialize baggage listeners when navigating to baggage step
    if (step === 'baggage') {
        setTimeout(() => {
            initializeBaggageListeners();
        }, 100);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStep(step) {
    document.querySelectorAll('.form-step').forEach(section => {
        section.classList.remove('active');
    });
    
    const stepId = typeof step === 'number' ? `step-${step}` : `step-${step}`;
    const stepEl = document.getElementById(stepId);
    if (stepEl) {
        stepEl.classList.add('active');
    }
}

function updateProgress(step) {
    const progressSteps = document.querySelectorAll('.progress-step');
    
    progressSteps.forEach((progressStep, index) => {
        const stepNumber = index + 1;
        
        let currentProgressStep;
        if (step === 1 || step === 'passengers' || step === 'baggage') {
            currentProgressStep = 1;
        } else if (step === 2) {
            currentProgressStep = 2;
        } else if (step === 3) {
            currentProgressStep = 3;
        }
        
        if (stepNumber < currentProgressStep) {
            progressStep.classList.add('completed');
            progressStep.classList.remove('active');
        } else if (stepNumber === currentProgressStep) {
            progressStep.classList.add('active');
            progressStep.classList.remove('completed');
        } else {
            progressStep.classList.remove('active', 'completed');
        }
    });
}


// ===== CARD FORMATTING =====
function setupCardFormatting() {
    const cardNumberInput = document.getElementById('cardNumber');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s/g, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });
    }

    const expiryInput = document.getElementById('cardExpiry');
    if (expiryInput) {
        expiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value;
        });
    }
}


// ===== UTILITY FUNCTIONS =====
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidExpiry(expiry) {
    return /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
}

function showError(errorId, message) {
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideError(errorId) {
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function showLoading() {
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) loadingEl.style.display = 'flex';
}

function hideLoading() {
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) loadingEl.style.display = 'none';
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast ${isError ? 'error' : 'success'}`;
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}
