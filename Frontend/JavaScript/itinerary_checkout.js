import { db, auth } from './firebase-config.js';
import { doc, collection, getDoc, setDoc, updateDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState } from './auth.js';
import { showToast, showError, hideError } from './utils.js';

// ===== BOOKING STATE =====
let currentStep = 1;
let currentUser = null;
let itineraryData = null;
let itineraryId = null;
let wishlistItemId = null;
let numberOfPeople = 1;

// ===== LOAD ITINERARY FROM SESSION =====
async function loadItineraryFromSession() {
    try {
        const purchaseData = JSON.parse(sessionStorage.getItem('purchaseItinerary'));
        
        if (!purchaseData || !purchaseData.itineraryId) {
            showToast('No itinerary selected for purchase', true);
            setTimeout(() => window.location.href = 'wishlist.html', 2000);
            return;
        }

        itineraryId = purchaseData.itineraryId;
        wishlistItemId = purchaseData.wishlistItemId;

        // Fetch itinerary details from Firestore
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        const itinerarySnap = await getDoc(itineraryRef);

        if (itinerarySnap.exists()) {
            itineraryData = { id: itinerarySnap.id, ...itinerarySnap.data() };
            console.log('✅ Loaded itinerary:', itineraryData);
            
            // CHECK PAYMENT STATUS
            if (!itineraryData.paymentEnabled || itineraryData.paymentStatus !== 'open') {
                showToast('Payment is not currently available for this itinerary', true);
                setTimeout(() => window.location.href = 'wishlist.html', 2000);
                return;
            }

            // CHECK IF BOOKINGS ARE FULL
            const currentBookings = itineraryData.currentBookings || 0;
            const maxBookings = itineraryData.maxBookings || 20;
            if (currentBookings >= maxBookings) {
                showToast('Sorry, this itinerary is fully booked', true);
                setTimeout(() => window.location.href = 'wishlist.html', 2000);
                return;
            }

            // CHECK DEADLINE
            if (itineraryData.paymentDeadline) {
                const deadline = itineraryData.paymentDeadline.toDate();
                const now = new Date();
                if (now > deadline) {
                    showToast('Payment deadline has passed for this itinerary', true);
                    setTimeout(() => window.location.href = 'wishlist.html', 2000);
                    return;
                }
            }

            displayItineraryDetails();
            updateOrderSummary();
        } else {
            showToast('Itinerary not found', true);
            setTimeout(() => window.location.href = 'wishlist.html', 2000);
        }

    } catch (error) {
        console.error('❌ Error loading itinerary:', error);
        showToast('Error loading itinerary', true);
    }
}

// ===== DISPLAY ITINERARY DETAILS =====
function displayItineraryDetails() {
    const summaryItems = document.getElementById('summaryItems');
    if (!summaryItems || !itineraryData) return;

    const city = itineraryData.destination?.city || 'Unknown';
    const country = itineraryData.destination?.country || 'Unknown';
    const days = itineraryData.duration?.days || 0;
    const nights = itineraryData.duration?.nights || 0;
    const coverImage = itineraryData.coverImage || 'https://via.placeholder.com/400x300';
    const maxBookings = itineraryData.maxBookings || 20;
    const currentBookings = itineraryData.currentBookings || 0;
    const availableSlots = maxBookings - currentBookings;

    summaryItems.innerHTML = `
        <div class="summary-item">
            <div class="summary-item-header">
                <img src="${coverImage}" alt="${itineraryData.title}" class="summary-item-image">
                <div class="summary-item-info">
                    <strong>${itineraryData.title}</strong>
                    <p><i class="fa fa-map-marker-alt"></i> ${city}, ${country}</p>
                    <p><i class="fa fa-clock"></i> ${days}D ${nights}N</p>
                    <p><i class="fa fa-users"></i> ${availableSlots} slots available (${currentBookings}/${maxBookings} booked)</p>
                </div>
            </div>
            <div class="summary-item-footer">
                <div class="people-selector">
                    <label for="numberOfPeople">Number of people:</label>
                    <div class="quantity-control">
                        <button type="button" class="qty-btn" id="decreasePeople">
                            <i class="fa fa-minus"></i>
                        </button>
                        <input type="number" id="numberOfPeople" value="1" min="1" max="${Math.min(availableSlots, 8)}" readonly>
                        <button type="button" class="qty-btn" id="increasePeople">
                            <i class="fa fa-plus"></i>
                        </button>
                    </div>
                </div>
                <div class="summary-item-price">RM${itineraryData.price.toLocaleString()} × <span id="peopleCount">1</span></div>
            </div>
        </div>
    `;

    // Setup people selector
    setupPeopleSelector();
}

// ===== SETUP PEOPLE SELECTOR =====
function setupPeopleSelector() {
    const decreaseBtn = document.getElementById('decreasePeople');
    const increaseBtn = document.getElementById('increasePeople');
    const peopleInput = document.getElementById('numberOfPeople');
    
    // Calculate max based on available slots
    const currentBookings = itineraryData.currentBookings || 0;
    const maxBookings = itineraryData.maxBookings || 20;
    const availableSlots = maxBookings - currentBookings;
    const maxPeople = Math.min(availableSlots, 8); 

    if (decreaseBtn) {
        decreaseBtn.addEventListener('click', () => {
            if (numberOfPeople > 1) {
                numberOfPeople--;
                peopleInput.value = numberOfPeople;
                document.getElementById('peopleCount').textContent = numberOfPeople;
                updateOrderSummary();
            }
        });
    }

    if (increaseBtn) {
        increaseBtn.addEventListener('click', () => {
            if (numberOfPeople < maxPeople) {
                numberOfPeople++;
                peopleInput.value = numberOfPeople;
                document.getElementById('peopleCount').textContent = numberOfPeople;
                updateOrderSummary();
            } else {
                showToast(`Maximum ${maxPeople} people per booking`, true);
            }
        });
    }
}

// ===== UPDATE ORDER SUMMARY =====
function updateOrderSummary() {
    if (!itineraryData) return;

    const pricePerPerson = itineraryData.price;
    const subtotal = pricePerPerson * numberOfPeople;
    const serviceFee = Math.round(subtotal * 0.10);
    const total = subtotal + serviceFee;

    document.getElementById('summarySubtotal').textContent = `RM${subtotal.toLocaleString()}`;
    document.getElementById('summaryServiceFee').textContent = `RM${serviceFee.toLocaleString()}`;
    document.getElementById('summaryTotal').textContent = `RM${total.toLocaleString()}`;
}

// ===== GO TO STEP =====
function goToStep(stepNumber) {
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'none';

    document.getElementById(`step${stepNumber}`).style.display = 'block';

    document.querySelectorAll('.progress-step').forEach(step => {
        const stepNum = parseInt(step.getAttribute('data-step'));
        step.classList.remove('active');
        
        if (stepNum < stepNumber) {
            step.classList.add('completed');
        } else if (stepNum === stepNumber) {
            step.classList.add('active');
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== SHOW FIELD ERROR =====
function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(`${fieldId}Error`);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
}

// ===== CLEAR ERRORS =====
function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.remove('show');
    });
}

// ===== VALIDATE PASSENGER INFO =====
function validatePassengerInfo() {
    let isValid = true;

    hideError('firstNameError');
    hideError('lastNameError');
    hideError('emailError');
    hideError('phoneError');

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();

    if (!firstName) {
        showFieldError('firstName', 'First name is required');
        isValid = false;
    }
    if (!lastName) {
        showFieldError('lastName', 'Last name is required');
        isValid = false;
    }
    if (!email || !email.includes('@')) {
        showFieldError('email', 'Valid email is required');
        isValid = false;
    }
    if (!phone) {
        showFieldError('phone', 'Phone number is required');
        isValid = false;
    }

    return isValid;
}

// ===== VALIDATE PAYMENT INFO =====
function validatePaymentInfo() {
    let isValid = true;
    const termsCheckbox = document.getElementById('termsCheckbox').checked;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

    hideError('termsCheckboxError');
    hideError('cardHolderError');
    hideError('cardNumberError');
    hideError('expiryDateError');
    hideError('cvvError');

    if (!termsCheckbox) {
        showFieldError('termsCheckbox', 'You must agree to terms and conditions');
        isValid = false;
    }

    if (paymentMethod === 'card') {
        const cardHolder = document.getElementById('cardHolder').value.trim();
        const cardNumber = document.getElementById('cardNumber').value.trim();
        const expiryDate = document.getElementById('expiryDate').value.trim();
        const cvv = document.getElementById('cvv').value.trim();

        if (!cardHolder) {
            showFieldError('cardHolder', 'Card holder name is required');
            isValid = false;
        }
        if (!cardNumber || cardNumber.length < 13) {
            showFieldError('cardNumber', 'Valid card number is required');
            isValid = false;
        }
        if (!expiryDate) {
            showFieldError('expiryDate', 'Expiry date is required');
            isValid = false;
        }
        if (!cvv || cvv.length < 3) {
            showFieldError('cvv', 'Valid CVV is required');
            isValid = false;
        }
    }

    return isValid;
}

// ===== SETUP STEP NAVIGATION =====
function setupStepNavigation() {
    const backToCartBtn = document.getElementById('backToCart');
    const nextBtn = document.getElementById('nextToPayment');
    const backBtn = document.getElementById('backToPassenger');
    const confirmBtn = document.getElementById('confirmPayment');

    if (backToCartBtn) {
        backToCartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'wishlist.html';
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearErrors();
            if (!validatePassengerInfo()) return;
            goToStep(2);
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            goToStep(1);
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearErrors();
            if (!validatePaymentInfo()) return;
            processPayment();
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
    const cardExpiryInput = document.getElementById('expiryDate');
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
    const cardCVVInput = document.getElementById('cvv');
    if (cardCVVInput) {
        cardCVVInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
        });
    }
}

// ===== PROCESS PAYMENT =====
async function processPayment() {
    try {
        showLoading();

        // ✅ RE-CHECK AVAILABILITY BEFORE PROCESSING
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        const freshItinerary = await getDoc(itineraryRef);
        
        if (!freshItinerary.exists()) {
            throw new Error('Itinerary not found');
        }

        const freshData = freshItinerary.data();
        const currentBookings = freshData.currentBookings || 0;
        const maxBookings = freshData.maxBookings || 20;

        if (currentBookings + numberOfPeople > maxBookings) {
            hideLoading();
            showToast('Sorry, not enough slots available', true);
            setTimeout(() => window.location.reload(), 2000);
            return;
        }

        const subtotal = itineraryData.price * numberOfPeople;
        const serviceFee = Math.round(subtotal * 0.10);
        const totalPrice = subtotal + serviceFee;

        const bookingData = {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
            itineraryId: itineraryId,
            itineraryTitle: itineraryData.title,
            itineraryCity: itineraryData.destination?.city || '',
            itineraryCountry: itineraryData.destination?.country || '',
            itineraryDuration: `${itineraryData.duration?.days || 0}D ${itineraryData.duration?.nights || 0}N`,
            itineraryImage: itineraryData.coverImage || '',
            numberOfPeople: numberOfPeople,
            pricePerPerson: itineraryData.price,
            subtotal: subtotal,
            serviceFee: serviceFee,
            totalPrice: totalPrice
        };

        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        const bookingId = generateBookingId();
        
        // ✅ SAVE BOOKING AND UPDATE COUNTS
        await saveBookingToFirebase(bookingData, bookingId);
        await incrementBookingCount();
        await updateInterestToPaid();

        hideLoading();
        showToast('✅ Payment successful!', false);
        showConfirmation(bookingId, bookingData.email);
        
        sessionStorage.removeItem('purchaseItinerary');
        goToStep(3);

    } catch (error) {
        console.error('❌ Error processing payment:', error);
        hideLoading();
        showToast('Error processing payment: ' + error.message, true);
    }
}

// ===== INCREMENT BOOKING COUNT =====
async function incrementBookingCount() {
    try {
        const itineraryRef = doc(db, 'itineraries', itineraryId);
        await updateDoc(itineraryRef, {
            currentBookings: increment(numberOfPeople),
            updatedAt: serverTimestamp()
        });
        console.log(`✅ Incremented booking count by ${numberOfPeople}`);
    } catch (error) {
        console.error('❌ Error incrementing booking count:', error);
        throw error;
    }
}

// ===== UPDATE INTEREST TO PAID =====
async function updateInterestToPaid() {
    const user = auth.currentUser;
    if (!user || !wishlistItemId) return;

    try {
        const interestRef = doc(db, 'users', user.uid, 'interests', wishlistItemId);
        await updateDoc(interestRef, {
            status: 'paid',
            purchasedAt: serverTimestamp(),
            numberOfPeople: numberOfPeople
        });
        console.log('✅ Updated interest to paid status');
    } catch (error) {
        console.error('❌ Error updating interest:', error);
    }
}

// ===== GENERATE BOOKING ID =====
function generateBookingId() {
    const prefix = 'BK';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
}

// ===== SAVE BOOKING TO FIREBASE =====
async function saveBookingToFirebase(bookingData, bookingId) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('No user logged in');
    }

    try {
        const bookingRef = doc(db, 'users', user.uid, 'bookings', bookingId);
        
        await setDoc(bookingRef, {
            // Booking Info
            bookingId: bookingId,
            bookingType: 'itinerary',
            status: 'confirmed',
            createdAt: serverTimestamp(),
            userId: user.uid,
            
            // Customer Info
            firstName: bookingData.firstName,
            lastName: bookingData.lastName,
            email: bookingData.email,
            phone: bookingData.phone,
            
            // Itinerary Info
            itineraryId: bookingData.itineraryId,
            itineraryTitle: bookingData.itineraryTitle,
            itineraryCity: bookingData.itineraryCity,
            itineraryCountry: bookingData.itineraryCountry,
            itineraryDuration: bookingData.itineraryDuration,
            itineraryImage: bookingData.itineraryImage,
            
            // Pricing Info
            numberOfPeople: bookingData.numberOfPeople,
            pricePerPerson: bookingData.pricePerPerson,
            subtotal: bookingData.subtotal,
            serviceFee: bookingData.serviceFee,
            totalPrice: bookingData.totalPrice,
            currency: 'RM',
            
            // Payment Info
            paymentMethod: bookingData.paymentMethod,
            paymentStatus: 'completed'
        });
        
        console.log('✅ Booking saved:', bookingId);
    } catch (error) {
        console.error('❌ Firebase error:', error);
        throw error;
    }
}

// ===== SHOW CONFIRMATION =====
function showConfirmation(bookingId, email) {
    document.getElementById('bookingRef').textContent = `#${bookingId}`;
    document.getElementById('confirmEmail').textContent = email;
    
    const days = itineraryData.duration?.days || 0;
    const nights = itineraryData.duration?.nights || 0;
    const city = itineraryData.destination?.city || '';
    const country = itineraryData.destination?.country || '';
    
    const confirmationItinerary = document.getElementById('confirmationItinerary');
    confirmationItinerary.innerHTML = `
        <div class="itinerary-item">
            <div class="itinerary-info">
                <strong>${itineraryData.title}</strong>
                <p>${city}, ${country}</p>
                <p>${days}D ${nights}N • ${numberOfPeople} ${numberOfPeople === 1 ? 'person' : 'people'}</p>
            </div>
            <div class="itinerary-price">RM${(itineraryData.price * numberOfPeople).toLocaleString()}</div>
        </div>
    `;
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

// ===== UPDATE USER PROFILE UI =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameElement || !profileAvatarElement) {
        console.warn('⚠️ Profile UI elements not found');
        return;
    }

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'User';

        profileNameElement.textContent = fullName;
        profileAvatarElement.innerHTML = '';

        if (userData.profilePhotoURL) {
            const img = document.createElement('img');
            img.src = userData.profilePhotoURL;
            img.alt = fullName;
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
            profileAvatarElement.appendChild(img);
        } else {
            const firstInitial = firstName ? firstName[0].toUpperCase() : '';
            const lastInitial = lastName ? lastName[0].toUpperCase() : '';
            const initials = `${firstInitial}${lastInitial}` || 'U';
            profileAvatarElement.textContent = initials;
        }

        if (profileDropdown) profileDropdown.style.display = 'flex';
        console.log('✅ Profile UI updated:', fullName);
    } else {
        if (profileDropdown) profileDropdown.style.display = 'none';
    }
}

// ===== SETUP PROFILE DROPDOWN =====
function setupProfileDropdown() {
    const profileTrigger = document.querySelector('.profile-trigger');
    const profileDropdown = document.getElementById('profileDropdown');
    const logoutButton = document.getElementById('logoutButton');

    if (profileTrigger) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
    }

    document.addEventListener('click', () => {
        if (profileDropdown) profileDropdown.classList.remove('active');
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await auth.signOut();
                console.log('✅ User logged out');
                window.location.href = 'login.html';
            } catch (error) {
                console.error('❌ Logout error:', error);
            }
        });
    }
}

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Payment Page Loaded');
    loadItineraryFromSession();
    setupStepNavigation();
    setupProfileDropdown();
    goToStep(1);
});

// ===== AUTH STATE & USER DATA FETCH =====
observeAuthState(async (user) => {
    currentUser = user;
    
    if (!user) {
        console.log('⚠️ No user logged in - redirecting');
        window.location.href = 'login.html';
        return;
    }

    console.log('✅ User logged in:', user.uid);

    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            console.log('✅ User data retrieved:', userData);

            updateUserProfileUI(userData);

            const firstNameInput = document.getElementById('firstName');
            const lastNameInput = document.getElementById('lastName');
            const emailInput = document.getElementById('email');
            const phoneInput = document.getElementById('phone');

            if (firstNameInput) firstNameInput.value = userData.firstName || '';
            if (lastNameInput) lastNameInput.value = userData.lastName || '';
            if (emailInput) emailInput.value = userData.email || '';
            if (phoneInput) phoneInput.value = userData.phone || '';

            console.log('✅ Form fields pre-filled');

        } else {
            console.warn('⚠️ User document does not exist');
        }

    } catch (error) {
        console.error('❌ Error loading user data:', error);
    }
});
