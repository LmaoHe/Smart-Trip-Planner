// Frontend/JavaScript/flightCheckout.js
import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast, showError, hideError } from './utils.js';

// ===== BACK BUTTON FUNCTIONS =====
function backToFlightBooking() {
    saveFlightCheckoutData();
    window.location.href = 'booking.html';
}

function saveFlightCheckoutData() {
    const flightData = {
        firstName: document.getElementById('firstName')?.value || '',
        lastName: document.getElementById('lastName')?.value || '',
        email: document.getElementById('email')?.value || '',
        phone: document.getElementById('phone')?.value || '',
        baggageOption: document.querySelector('input[name="baggageOption"]:checked')?.value || 'standard'
    };

    sessionStorage.setItem('flightCheckoutData', JSON.stringify(flightData));
    console.log('✓ Flight checkout data saved');
}

function restoreFlightCheckoutData() {
    const savedData = sessionStorage.getItem('flightCheckoutData');
    if (savedData) {
        try {
            const data = JSON.parse(savedData);

            const firstNameInput = document.getElementById('firstName');
            const lastNameInput = document.getElementById('lastName');
            const emailInput = document.getElementById('email');
            const phoneInput = document.getElementById('phone');

            if (firstNameInput && !firstNameInput.value) firstNameInput.value = data.firstName || '';
            if (lastNameInput && !lastNameInput.value) lastNameInput.value = data.lastName || '';
            if (emailInput && !emailInput.value) emailInput.value = data.email || '';
            if (phoneInput && !phoneInput.value) phoneInput.value = data.phone || '';

            if (data.baggageOption) {
                const baggageRadio = document.querySelector(`input[name="baggageOption"][value="${data.baggageOption}"]`);
                if (baggageRadio) baggageRadio.checked = true;
            }

            console.log('✓ Flight checkout data restored');
        } catch (error) {
            console.error('Error restoring flight checkout data:', error);
        }
    }
}

// ===== FLIGHT CHECKOUT STATE =====
let currentStep = 1;
let selectedFlightData = null;
let selectedBaggageData = null;

// Baggage prices
const baggagePrices = {
    'standard': 0,
    'extra20': 80,
    'extra30': 120
};

// Booking details
let bookingDetails = {
    leadPassenger: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        seatPreference: 'any'
    },
    passengers: [],
    baggage: 'standard',
    paymentMethod: 'card',
    cardName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCVV: ''
};

// ===== LOAD FLIGHT DATA =====
function loadFlightData() {
    try {
        const flightDataStr = sessionStorage.getItem('selectedFlight');

        if (flightDataStr) {
            selectedFlightData = JSON.parse(flightDataStr);
            console.log('✓ Loaded flight data:', selectedFlightData);
        } else {
            console.log('⚠️ No flight data found');
            showToast('Flight data not found. Please go back and select a flight.', true);
            setTimeout(() => {
                window.location.href = 'booking.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Error loading flight data:', error);
        showToast('Error loading flight details', true);
    }
}

// ===== DISPLAY FLIGHT SUMMARY (UPDATED FOR NEW HTML) =====
function displayFlightSummary() {
    if (!selectedFlightData) return;

    console.log('📦 selectedFlightData:', selectedFlightData);
    console.log('🛫 outbound.stops:', selectedFlightData.outbound?.stops);
    console.log('🛫 outbound.toAirport:', selectedFlightData.outbound?.toAirport);
    console.log('🛬 return.stops:', selectedFlightData.return?.stops);
    console.log('🛬 return.toAirport:', selectedFlightData.return?.toAirport);

    const { outbound, return: returnFlight, passengers, pricePerPerson, currency, tripType, travelClass } = selectedFlightData;

    // Populate outbound flight
    if (outbound) {
        const outboundRouteEl = document.getElementById('summaryOutboundRoute');
        const outboundTimeEl = document.getElementById('summaryOutboundTime');
        const outboundArrivalEl = document.getElementById('summaryOutboundArrival');
        const outboundClassEl = document.getElementById('summaryOutboundClass');

        if (outboundTimeEl) outboundTimeEl.textContent = outbound.departTime;
        if (outboundArrivalEl) outboundArrivalEl.textContent = outbound.arriveTime;
        if (outboundRouteEl) outboundRouteEl.textContent = buildFullRoute(outbound);
        if (outboundClassEl) outboundClassEl.textContent = formatTravelClass(travelClass);
    }

    // Populate return flight if round-trip
    if (tripType === 'round-trip' && returnFlight) {
        const returnRouteEl = document.getElementById('summaryReturnRoute');
        const returnTimeEl = document.getElementById('summaryReturnTime');
        const returnArrivalEl = document.getElementById('summaryReturnArrival');
        const returnClassEl = document.getElementById('summaryReturnClass');
        const returnFlightLegEl = document.getElementById('returnFlightLeg');

        if (returnTimeEl) returnTimeEl.textContent = returnFlight.departTime;
        if (returnArrivalEl) returnArrivalEl.textContent = returnFlight.arriveTime;
        if (returnRouteEl) returnRouteEl.textContent = buildFullRoute(returnFlight);
        if (returnClassEl) returnClassEl.textContent = formatTravelClass(travelClass);

        if (returnFlightLegEl) returnFlightLegEl.style.display = 'block';
    } else if (tripType === 'one-way') {
        const returnFlightLegEl = document.getElementById('returnFlightLeg');
        if (returnFlightLegEl) returnFlightLegEl.style.display = 'none';
    }

    // Rest of price calculation...
    const currencySymbol = currency === 'MYR' ? 'RM' : currency;
    const baseFlightTotal = pricePerPerson * passengers;

    const pricePerPersonEl = document.getElementById('pricePerPersonDisplay');
    const pricePerPersonCalcEl = document.getElementById('pricePerPersonCalc');
    const pricePassengerCountEl = document.getElementById('pricePassengerCount');
    const baseFlightTotalEl = document.getElementById('baseFlightTotal');

    if (pricePerPersonEl) pricePerPersonEl.textContent = `${currencySymbol} ${pricePerPerson.toFixed(2)}`;
    if (pricePerPersonCalcEl) pricePerPersonCalcEl.textContent = `${currencySymbol} ${pricePerPerson.toFixed(2)}`;
    if (pricePassengerCountEl) pricePassengerCountEl.textContent = `${passengers} passenger${passengers > 1 ? 's' : ''}`;
    if (baseFlightTotalEl) baseFlightTotalEl.textContent = `${currencySymbol} ${baseFlightTotal.toFixed(2)}`;

    calculateTotal();
}

// ✅ Format travel class display
function formatTravelClass(travelClass) {
    const classMap = {
        'ECONOMY': 'Economy Class',
        'PREMIUM_ECONOMY': 'Premium Economy',
        'BUSINESS': 'Business Class',
        'FIRST': 'First Class'
    };
    return classMap[travelClass] || 'Economy Class';
}

function buildFullRoute(flightLeg) {
    let route = flightLeg.fromAirport;

    if (flightLeg.stops && Array.isArray(flightLeg.stops) && flightLeg.stops.length > 0) {
        const stopAirports = flightLeg.stops.map(stop => stop.airport || stop).filter(Boolean);
        if (stopAirports.length > 0) {
            route += ' → ' + stopAirports.join(' → ');
        }
    }

    route += ' → ' + flightLeg.toAirport;

    return route;
}

function generateAuthenticationForms() {
    const container = document.getElementById('authenticationFormsContainer');
    const numPassengers = selectedFlightData?.passengers || 1;

    // Get today's date in YYYY-MM-DD format for min attribute
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];

    container.innerHTML = '';

    for (let i = 0; i < numPassengers; i++) {
        const isLeadPassenger = i === 0;
        const passengerSection = document.createElement('div');
        passengerSection.className = 'passenger-auth-card';
        passengerSection.innerHTML = `
            <div class="form-section">
                <h3 class="section-title">Passenger ${i + 1} Authentication ${isLeadPassenger ? '(Lead)' : ''}</h3>
                <p class="section-subtitle">Verify identity for flight check-in</p>

                <div class="form-row">
                    <div class="form-group">
                        <label for="firstName${i}">First Name *</label>
                        <input type="text" id="firstName${i}" class="form-input passenger-auth-input" placeholder="Enter first name" data-passenger="${i}" required>
                        <span id="firstNameError${i}" class="error-message" style="display: none;"></span>
                    </div>
                    <div class="form-group">
                        <label for="lastName${i}">Last Name *</label>
                        <input type="text" id="lastName${i}" class="form-input passenger-auth-input" placeholder="Enter last name" data-passenger="${i}" required>
                        <span id="lastNameError${i}" class="error-message" style="display: none;"></span>
                    </div>
                </div>

                <div class="form-group">
                    <label for="passportNumber${i}">Passport Number *</label>
                    <input type="text" id="passportNumber${i}" class="form-input passenger-auth-input" placeholder="Enter passport number" data-passenger="${i}" required style="text-transform: uppercase;">
                    <span id="passportNumberError${i}" class="error-message" style="display: none;"></span>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="passportExpiry${i}">Passport Expiry *</label>
                        <input type="date" id="passportExpiry${i}" class="form-input passenger-auth-input" data-passenger="${i}" min="${todayString}" required>
                        <small class="form-hint">Must be valid for at least 6 months</small>
                        <span id="passportExpiryError${i}" class="error-message" style="display: none;"></span>
                    </div>
                    <div class="form-group">
                        <label for="nationality${i}">Nationality *</label>
                        <input type="text" id="nationality${i}" class="form-input passenger-auth-input" placeholder="e.g., Malaysian" data-passenger="${i}" required>
                        <span id="nationalityError${i}" class="error-message" style="display: none;"></span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(passengerSection);
    }

    // Optional: Prefill lead passenger name from step 1
    setTimeout(() => {
        const leadFirstName = document.getElementById('firstName')?.value || '';
        const leadLastName = document.getElementById('lastName')?.value || '';
        const firstName0 = document.getElementById('firstName0');
        const lastName0 = document.getElementById('lastName0');
        if (firstName0 && leadFirstName) firstName0.value = leadFirstName;
        if (lastName0 && leadLastName) lastName0.value = leadLastName;
    }, 100);

    setupAuthInputListeners();
}

// ===== BAGGAGE SELECTION HANDLER =====
function setupBaggageSelection() {
    const baggageOptions = document.querySelectorAll('.baggage-option');

    baggageOptions.forEach(option => {
        const radio = option.querySelector('input[type="radio"]');

        if (radio) {
            // ✅ Make entire card clickable
            option.addEventListener('click', (e) => {
                // Prevent double triggering if clicking directly on radio
                if (e.target.tagName !== 'INPUT') {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });

            // Handle radio change
            radio.addEventListener('change', (e) => {
                const selectedBaggage = e.target.value;
                handleBaggageChange(selectedBaggage);
                updateBaggageDisplay(selectedBaggage);
            });
        }
    });

    console.log('✓ Baggage selection listeners setup');
}

// ===== UPDATE BAGGAGE DISPLAY (UI FEEDBACK) =====
function updateBaggageDisplay(selectedBaggage) {
    const baggageOptions = document.querySelectorAll('.baggage-option');

    baggageOptions.forEach(option => {
        const radio = option.querySelector('input[type="radio"]');

        if (radio && radio.value === selectedBaggage) {
            option.style.borderColor = '#4A90E2';
            option.style.backgroundColor = '#F0F5FF';
            console.log('✓ Updated UI for:', selectedBaggage);
        } else {
            option.style.borderColor = '#E0E0E0';
            option.style.backgroundColor = 'white';
        }
    });
}

// ===== CALCULATE TOTAL WITH BAGGAGE AND SERVICE CHARGE =====
function calculateTotal() {
    if (!selectedFlightData) return;

    const { pricePerPerson, passengers, currency } = selectedFlightData;
    const baggagePrice = selectedBaggageData?.totalPrice || 0;

    const baseFlightTotal = pricePerPerson * passengers;

    // ADD 10% SERVICE CHARGE
    const serviceChargeRate = 0.10;
    const serviceCharge = baseFlightTotal * serviceChargeRate;

    const total = baseFlightTotal + baggagePrice + serviceCharge;

    const currencySymbol = currency === 'MYR' ? 'RM' : currency;

    // Update baggage price row
    const baggagePriceRow = document.getElementById('baggagePriceRow');
    if (baggagePrice > 0) {
        if (baggagePriceRow) baggagePriceRow.style.display = 'flex';
        const baggagePriceDisplay = document.getElementById('baggagePriceDisplay');
        if (baggagePriceDisplay) {
            baggagePriceDisplay.textContent = `${currencySymbol} ${baggagePrice.toFixed(2)}`;
        }
    } else {
        if (baggagePriceRow) baggagePriceRow.style.display = 'none';
    }

    // UPDATE SERVICE CHARGE ROW
    const serviceChargeRow = document.getElementById('serviceChargeRow');
    const serviceChargeDisplay = document.getElementById('serviceChargeDisplay');
    if (serviceChargeRow) serviceChargeRow.style.display = 'flex';
    if (serviceChargeDisplay) {
        serviceChargeDisplay.textContent = `${currencySymbol} ${serviceCharge.toFixed(2)}`;
    }

    // Update total price
    const totalElement = document.getElementById('priceTotal');
    if (totalElement) {
        totalElement.textContent = `${currencySymbol} ${total.toFixed(2)}`;
    }

    console.log('✓ Total calculated:', {
        baseFlightTotal,
        baggagePrice,
        serviceCharge,
        total
    });

    return total;
}

// ===== SETUP PAYMENT INPUT LISTENERS =====
function setupPaymentInputListeners() {
    const paymentFields = [
        { id: 'cardName', errorId: 'cardNameError' },
        { id: 'cardNumber', errorId: 'cardNumberError' },
        { id: 'cardExpiry', errorId: 'cardExpiryError' },
        { id: 'cardCVV', errorId: 'cardCVVError' },
        { id: 'agreeTerms', errorId: 'agreeTermsError' }
    ];

    paymentFields.forEach(field => {
        const input = document.getElementById(field.id);
        if (input) {
            input.addEventListener('input', () => {
                const errorElement = document.getElementById(field.errorId);
                if (errorElement) {
                    errorElement.style.display = 'none';
                }
            });

            // For checkbox, also listen to change event
            if (field.id === 'agreeTerms') {
                input.addEventListener('change', () => {
                    const errorElement = document.getElementById(field.errorId);
                    if (errorElement) {
                        errorElement.style.display = 'none';
                    }
                });
            }
        }
    });

    console.log('✓ Payment input listeners setup');
}

// ===== SETUP EVENT LISTENERS =====
function setupEventListeners() {
    // Back to Flight Booking (from Step 1)
    const backToFlightBooking2 = document.getElementById('backToFlightBooking2');
    if (backToFlightBooking2) {
        backToFlightBooking2.addEventListener('click', backToFlightBooking);
    }

    // Lead Passenger → Authentication
    const nextToAuthBtn = document.getElementById('nextToAuth');
    if (nextToAuthBtn) {
        nextToAuthBtn.addEventListener('click', () => {
            if (validateStep1()) {
                saveStep1Data();
                saveFlightCheckoutData();
                generateAuthenticationForms();
                goToStep('auth');
            }
        });
    }

    // Authentication → Baggage
    const nextToBaggageBtn = document.getElementById('nextToBaggage');
    if (nextToBaggageBtn) {
        nextToBaggageBtn.addEventListener('click', () => {
            if (validateAuthStep()) {
                saveAuthStep();
                goToStep('baggage');
                setTimeout(() => setupBaggageSelection(), 100);
            }
        });
    }

    // Baggage → Step 2 Payment
    const nextToPaymentBtn = document.getElementById('nextToPayment');
    if (nextToPaymentBtn) {
        nextToPaymentBtn.addEventListener('click', () => {
            saveBaggageStep();
            saveFlightCheckoutData();
            goToStep(2);
        });
    }

    // Back to Passengers
    const backToPassengersBtn = document.getElementById('backToPassengers');
    if (backToPassengersBtn) {
        backToPassengersBtn.addEventListener('click', () => {
            goToStep(1);
        });
    }

    // Back to Auth
    const backToAuthBtn = document.getElementById('backToAuth');
    if (backToAuthBtn) {
        backToAuthBtn.addEventListener('click', () => {
            goToStep('auth');
        });
    }

    // Back to Baggage
    const backToBaggageBtn = document.getElementById('backToBaggage');
    if (backToBaggageBtn) {
        backToBaggageBtn.addEventListener('click', () => {
            goToStep('baggage');
            setTimeout(() => setupBaggageSelection(), 100);
        });
    }

    setupPaymentInputListeners();

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

    // Card formatting...
    const cardNumberInput = document.getElementById('cardNumber');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s/g, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });
    }

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

    const cardCVVInput = document.getElementById('cardCVV');
    if (cardCVVInput) {
        cardCVVInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
        });
    }

    // Step 2: Confirm booking button
    const confirmBookingBtn = document.getElementById('confirmBooking');
    if (confirmBookingBtn) {
        confirmBookingBtn.addEventListener('click', () => {
            if (validateStep2Payment()) {
                saveStep2Data();
                processBooking();
            }
        });
    }
}

// ===== VALIDATION =====
function validateStep1() {
    let isValid = true;

    const firstName = document.getElementById('firstName')?.value.trim() || '';
    const lastName = document.getElementById('lastName')?.value.trim() || '';
    const email = document.getElementById('email')?.value.trim() || '';
    const phone = document.getElementById('phone')?.value.trim() || '';

    // Clear all previous errors
    document.getElementById('firstNameError').style.display = 'none';
    document.getElementById('lastNameError').style.display = 'none';
    document.getElementById('emailError').style.display = 'none';
    document.getElementById('phoneError').style.display = 'none';

    // First Name Validation
    if (!firstName) {
        showErrorMessage('firstNameError', 'First name is required');
        isValid = false;
    } else if (!/^[a-zA-Z\s'-]{2,}$/.test(firstName)) {
        showErrorMessage('firstNameError', 'Enter a valid first name (letters only)');
        isValid = false;
    }

    // Last Name Validation
    if (!lastName) {
        showErrorMessage('lastNameError', 'Last name is required');
        isValid = false;
    } else if (!/^[a-zA-Z\s'-]{2,}$/.test(lastName)) {
        showErrorMessage('lastNameError', 'Enter a valid last name (letters only)');
        isValid = false;
    }

    // Email Validation
    if (!email) {
        showErrorMessage('emailError', 'Email is required');
        isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showErrorMessage('emailError', 'Enter a valid email address');
        isValid = false;
    }

    // Phone Validation
    if (!phone) {
        showErrorMessage('phoneError', 'Phone number is required');
        isValid = false;
    } else if (!/^[0-9+\-\s()]{7,}$/.test(phone)) {
        showErrorMessage('phoneError', 'Enter a valid phone number');
        isValid = false;
    }

    return isValid;
}

function showErrorMessage(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function validateAuthStep() {
    let isValid = true;
    const numPassengers = selectedFlightData?.passengers || 1;

    for (let i = 0; i < numPassengers; i++) {
        const firstName = document.getElementById(`firstName${i}`)?.value.trim();
        const lastName = document.getElementById(`lastName${i}`)?.value.trim();
        const passportNumber = document.getElementById(`passportNumber${i}`)?.value.trim();
        const passportExpiry = document.getElementById(`passportExpiry${i}`)?.value;
        const nationality = document.getElementById(`nationality${i}`)?.value.trim();

        // First Name
        if (!firstName || !/^[a-zA-Z\s'-]{2,}$/.test(firstName)) {
            showErrorMessage(`firstNameError${i}`, 'Enter a valid first name (letters only, min 2)');
            isValid = false;
        } else {
            hideError(`firstNameError${i}`);
        }

        // Last Name
        if (!lastName || !/^[a-zA-Z\s'-]{2,}$/.test(lastName)) {
            showErrorMessage(`lastNameError${i}`, 'Enter a valid last name (letters only, min 2)');
            isValid = false;
        } else {
            hideError(`lastNameError${i}`);
        }

        // Passport Number
        if (!passportNumber || !/^[A-Za-z0-9]{6,15}$/.test(passportNumber)) {
            showErrorMessage(`passportNumberError${i}`, 'Enter a valid passport number');
            isValid = false;
        } else {
            hideError(`passportNumberError${i}`);
        }

        // Passport Expiry (must be at least 6 months from today)
        if (!passportExpiry) {
            showErrorMessage(`passportExpiryError${i}`, 'Passport expiry date is required');
            isValid = false;
        } else {
            const expiryDate = new Date(passportExpiry + 'T23:59:59');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const sixMonthsFromNow = new Date(today);
            sixMonthsFromNow.setMonth(today.getMonth() + 6);

            if (expiryDate < today) {
                showErrorMessage(`passportExpiryError${i}`, 'Passport expiry date cannot be in the past');
                isValid = false;
            } else if (expiryDate < sixMonthsFromNow) {
                showErrorMessage(`passportExpiryError${i}`, 'Passport must be valid for at least 6 months from today');
                isValid = false;
            } else {
                hideError(`passportExpiryError${i}`);
            }
        }

        // Nationality
        if (!nationality) {
            showErrorMessage(`nationalityError${i}`, 'Nationality is required');
            isValid = false;
        } else {
            hideError(`nationalityError${i}`);
        }
    }

    return isValid;
}

function validateStep2Payment() {
    let isValid = true;

    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    const agreeTerms = document.getElementById('agreeTerms')?.checked;

    // Check terms first (always required)
    if (!agreeTerms) {
        showErrorMessage('agreeTermsError', 'You must agree to terms and conditions');
        isValid = false;
    }

    // Only validate card fields if CARD payment is selected
    if (paymentMethod === 'card') {
        const cardName = document.getElementById('cardName')?.value.trim();
        const cardNumber = document.getElementById('cardNumber')?.value.replace(/\s/g, '');
        const cardExpiry = document.getElementById('cardExpiry')?.value.trim();
        const cardCVV = document.getElementById('cardCVV')?.value.trim();

        if (!cardName) {
            showErrorMessage('cardNameError', 'Card holder name is required');
            isValid = false;
        }

        if (!cardNumber || cardNumber.length < 15) {
            showErrorMessage('cardNumberError', 'Please enter a valid card number');
            isValid = false;
        }

        if (!cardExpiry || cardExpiry.length < 5) {
            showErrorMessage('cardExpiryError', 'Please enter card expiry date (MM/YY)');
            isValid = false;
        }

        if (!cardCVV || cardCVV.length < 3) {
            showErrorMessage('cardCVVError', 'Please enter a valid CVV');
            isValid = false;
        }
    }

    return isValid;
}

// ===== SAVE FORM DATA =====
function saveStep1Data() {
    bookingDetails.leadPassenger = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
    };

    console.log('✓ Step 1 - Lead passenger data saved:', bookingDetails.leadPassenger);
}

function saveAuthStep() {
    bookingDetails.passengers = [];
    const numPassengers = selectedFlightData?.passengers || 1;

    for (let i = 0; i < numPassengers; i++) {
        bookingDetails.passengers.push({
            passengerNumber: i + 1,
            passportNumber: document.getElementById(`passportNumber${i}`).value.trim(),
            passportExpiry: document.getElementById(`passportExpiry${i}`).value,
            nationality: document.getElementById(`nationality${i}`).value.trim()
        });
    }

    console.log('✓ Step 1 - Authentication data saved:', bookingDetails.passengers);
}

function saveBaggageStep() {
    bookingDetails.baggage = document.querySelector('input[name="baggageOption"]:checked')?.value || 'standard';
    console.log('✓ Step 1 - Baggage data saved:', bookingDetails.baggage);
}

function saveStep2Data() {
    bookingDetails.paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'card';
    bookingDetails.cardName = document.getElementById('cardName')?.value.trim() || '';
    bookingDetails.cardNumber = document.getElementById('cardNumber')?.value.replace(/\s/g, '') || '';
    bookingDetails.cardExpiry = document.getElementById('cardExpiry')?.value.trim() || '';
    bookingDetails.cardCVV = document.getElementById('cardCVV')?.value.trim() || '';

    console.log('✓ Step 2 - Payment data saved:', bookingDetails);
}

// ===== HANDLE BAGGAGE CHANGE =====
function handleBaggageChange(selectedBaggage) {
    const baggagePrice = baggagePrices[selectedBaggage] || 0;
    const passengers = selectedFlightData?.passengers || 1;
    const totalBaggagePrice = baggagePrice * passengers;

    selectedBaggageData = {
        type: selectedBaggage,
        pricePerPerson: baggagePrice,
        totalPrice: totalBaggagePrice
    };

    sessionStorage.setItem('selectedBaggage', JSON.stringify(selectedBaggageData));

    calculateTotal();

    console.log('✓ Baggage selected:', {
        type: selectedBaggage,
        pricePerPerson: baggagePrice,
        totalPrice: totalBaggagePrice,
        passengers: passengers
    });
}

// ===== STEP NAVIGATION =====
function goToStep(step) {
    currentStep = step;
    showStep(step);
    updateProgress(step);

    if (step === 'baggage') {
        setTimeout(() => setupBaggageSelection(), 100);
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

// ===== UPDATED PROGRESS BAR LOGIC =====
function updateProgress(step) {
    const progressSteps = document.querySelectorAll('.progress-step');

    progressSteps.forEach((progressStep, index) => {
        const stepNumber = index + 1;

        let currentProgressStep;
        if (step === 1 || step === 'auth' || step === 'baggage') {
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

    console.log('✓ Progress bar updated for step:', step);
}

// ===== POPULATE CONFIRMATION PAGE =====
function populateConfirmationPage(bookingId) {
    const { pricePerPerson, passengers, outbound, return: returnFlight } = selectedFlightData;
    const baseFlightTotal = pricePerPerson * passengers;
    const baggageTotal = selectedBaggageData?.totalPrice || 0;
    const serviceCharge = baseFlightTotal * 0.10;
    const total = baseFlightTotal + baggageTotal + serviceCharge;
    const currencySymbol = selectedFlightData.currency === 'MYR' ? 'RM' : selectedFlightData.currency;

    const bookingIdEl = document.getElementById('bookingId');
    if (bookingIdEl) bookingIdEl.textContent = `#${bookingId}`;

    const confirmEmailEl = document.getElementById('confirmEmail');
    if (confirmEmailEl) confirmEmailEl.textContent = bookingDetails.leadPassenger.email;

    const finalPassengerNameEl = document.getElementById('finalPassengerName');
    if (finalPassengerNameEl) {
        finalPassengerNameEl.textContent = `${bookingDetails.leadPassenger.firstName} ${bookingDetails.leadPassenger.lastName}`;
    }

    const finalOutboundEl = document.getElementById('finalOutbound');
    if (finalOutboundEl && outbound) {
        const outDate = outbound.departDate ? `${outbound.departDate}` : 'TBD';
        finalOutboundEl.textContent = `${outDate} • ${outbound.departTime}-${outbound.arriveTime}`;
    }

    const finalReturnEl = document.getElementById('finalReturn');
    if (finalReturnEl && returnFlight) {
        const retDate = returnFlight.departDate ? `${returnFlight.departDate}` : 'TBD';
        finalReturnEl.textContent = `${retDate} • ${returnFlight.departTime}-${returnFlight.arriveTime}`;
    }

    const finalRouteEl = document.getElementById('finalRoute');
    if (finalRouteEl && outbound) {
        finalRouteEl.textContent = `${outbound.fromAirport} ↔ ${outbound.toAirport}`;
    }

    const finalTotalEl = document.getElementById('finalTotal');
    if (finalTotalEl) finalTotalEl.textContent = `${currencySymbol} ${total.toFixed(2)}`;

    console.log('✓ Confirmation page populated');
}

// ===== PROCESS BOOKING =====
async function processBooking() {
    try {
        showLoading();
        await new Promise(resolve => setTimeout(resolve, 2000));

        const bookingId = generateBookingId();
        await saveBookingToFirebase(bookingId);

        hideLoading();

        populateConfirmationPage(bookingId);

        goToStep(3);

        showToast('Flight booking confirmed!');

        sessionStorage.removeItem('selectedFlight');
        sessionStorage.removeItem('selectedBaggage');
        sessionStorage.removeItem('flightCheckoutData');

    } catch (error) {
        console.error('Payment error:', error);
        hideLoading();
        showToast('Payment failed. Please try again', true);
    }
}

// ===== GENERATE BOOKING ID =====
function generateBookingId() {
    const prefix = 'FLT';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
}

// ===== SAVE TO FIREBASE =====
async function saveBookingToFirebase(bookingId) {
    const user = auth.currentUser;
    if (!user) {
        console.log('⚠️ No user logged in, skipping Firebase save');
        return;
    }

    try {
        const { pricePerPerson, passengers, outbound, return: returnFlight } = selectedFlightData;
        const baseFare = pricePerPerson * passengers;
        const baggageTotal = selectedBaggageData?.totalPrice || 0;
        const serviceCharge = baseFare * 0.10;
        const totalPrice = baseFare + baggageTotal + serviceCharge;

        const bookingRef = doc(db, 'users', user.uid, 'bookings', bookingId);

        await setDoc(bookingRef, {
            bookingId: bookingId,
            bookingType: 'flight',
            flightDetails: {
                outbound: outbound,
                return: returnFlight
            },
            leadPassenger: bookingDetails.leadPassenger,
            passengers: bookingDetails.passengers,
            baggageDetails: selectedBaggageData,
            pricing: {
                pricePerPerson: pricePerPerson,
                baseFareTotal: baseFare,
                baggageCost: baggageTotal,
                serviceCharge: serviceCharge, 
                totalPrice: totalPrice
            },
            totalPassengers: passengers,
            status: 'confirmed',
            createdAt: serverTimestamp()
        });

        console.log('✓ Flight booking saved to Firebase:', bookingId);
    } catch (error) {
        console.error('Error saving to Firebase:', error);
    }
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

// ===== SETUP AUTHENTICATION INPUT LISTENERS =====
function setupAuthInputListeners() {
    const numPassengers = selectedFlightData?.passengers || 1;

    for (let i = 0; i < numPassengers; i++) {
        const fields = [
            { id: `passportNumber${i}`, errorId: `passportNumberError${i}` },
            { id: `passportExpiry${i}`, errorId: `passportExpiryError${i}` },
            { id: `nationality${i}`, errorId: `nationalityError${i}` }
        ];

        fields.forEach(field => {
            const input = document.getElementById(field.id);
            if (input) {
                input.addEventListener('input', () => {
                    const errorElement = document.getElementById(field.errorId);
                    if (errorElement) {
                        errorElement.style.display = 'none';
                    }
                });
            }
        });
    }

    console.log('✓ Auth input listeners setup for', numPassengers, 'passengers');
}

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎯 Flight Checkout Page Loaded');

    // Restore previous form data if returning
    restoreFlightCheckoutData();

    // Load flight data from session storage
    loadFlightData();

    // Populate flight summary
    displayFlightSummary();

    // Setup event listeners
    setupEventListeners();

    // Show initial step
    showStep(1);

    // Load user data AFTER setup is complete
    await loadUserDataFromAuth();
});

// ===== LOAD USER DATA FROM AUTH =====
async function loadUserDataFromAuth() {
    try {
        await new Promise((resolve) => {
            const unsubscribe = observeAuthState(async (user) => {
                unsubscribe();

                if (user) {
                    console.log('✓ User logged in:', user.uid);

                    try {
                        const userDocRef = doc(db, 'users', user.uid);
                        const userDocSnap = await getDoc(userDocRef);

                        if (userDocSnap.exists()) {
                            const userData = userDocSnap.data();
                            console.log('✓ User data retrieved from Firestore:', userData);

                            populateUserFormFields(userData);
                        } else {
                            console.log('⚠️ User document does not exist in Firestore');
                        }
                    } catch (error) {
                        console.error('❌ Error loading user data:', error);
                    }
                } else {
                    console.log('⚠️ No user logged in - redirecting to login');
                    window.location.href = 'login.html';
                }

                resolve();
            });
        });
    } catch (error) {
        console.error('❌ Error in loadUserDataFromAuth:', error);
    }
}

// ===== POPULATE FORM WITH USER DATA =====
function populateUserFormFields(userData) {
    console.log('📝 Starting to populate form with user data:', userData);

    const {
        firstName = '',
        lastName = '',
        email = '',
        phone = '',
    } = userData;

    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');

    if (firstNameInput && firstName && !firstNameInput.value) {
        firstNameInput.value = firstName;
        console.log('✓ Pre-filled: First Name = ' + firstName);
    }

    if (lastNameInput && lastName && !lastNameInput.value) {
        lastNameInput.value = lastName;
        console.log('✓ Pre-filled: Last Name = ' + lastName);
    }

    if (emailInput && email && !emailInput.value) {
        emailInput.value = email;
        console.log('✓ Pre-filled: Email = ' + email);
    }

    if (phoneInput && phone && !phoneInput.value) {
        phoneInput.value = phone;
        console.log('✓ Pre-filled: Phone = ' + phone);
    }

    console.log('✅ All user form fields pre-populated successfully');
}
