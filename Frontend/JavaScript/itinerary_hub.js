// Import Firebase modules
import { db, auth } from './firebase-config.js';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState } from './auth.js';

// ===== GLOBAL VARIABLES =====
let allItineraries = [];
let filteredItineraries = [];
let currentUser = null;
let selectedItineraryId = null;
let currentPaymentItineraryId = null;
let currentPage = 1;
const itemsPerPage = 12;

// ===== SHOW TOAST MESSAGE =====
function showToast(message, isError = false) {
    const toast = document.getElementById('messageToast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `message-toast ${isError ? 'error' : 'success'}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// ===== UPDATE USER PROFILE UI =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameElement || !profileAvatarElement || !profileDropdown) return;

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'Admin';

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
            const initials = `${firstInitial}${lastInitial}` || 'A';
            profileAvatarElement.textContent = initials;
        }

        profileDropdown.style.display = 'flex';
    }
}

// ===== LOAD ITINERARIES =====
async function loadItineraries() {
    try {
        console.log('📍 Loading itineraries...');
        showLoadingState();

        const itinerariesSnapshot = await getDocs(collection(db, 'itineraries'));
        console.log(`✅ Loaded ${itinerariesSnapshot.size} itineraries`);

        allItineraries = [];

        for (const docSnap of itinerariesSnapshot.docs) {
            const itineraryData = {
                id: docSnap.id,
                ...docSnap.data()
            };

            if (itineraryData.publishStatus !== 'deleted') {
                allItineraries.push(itineraryData);
            }
        }

        console.log(`✅ Loaded ${allItineraries.length} itineraries (excluding deleted)`);

        filteredItineraries = [...allItineraries];
        populateDestinationFilter();
        updateStats();
        applyFilters();

    } catch (error) {
        console.error('❌ Error loading itineraries:', error);
        showToast('Error loading itineraries. Please refresh the page.', true);
        hideLoadingState();
    }
}

// ===== SHOW/HIDE LOADING STATE =====
function showLoadingState() {
    const loadingState = document.getElementById('loadingState');
    const itinerariesGrid = document.getElementById('itinerariesGrid');
    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');

    if (loadingState) loadingState.style.display = 'block';
    if (itinerariesGrid) itinerariesGrid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (noResultsState) noResultsState.style.display = 'none';
}

function hideLoadingState() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
}

// ===== UPDATE STATISTICS - WITH PAYMENT STATS =====
function updateStats() {
    const publishedItineraries = allItineraries.filter(i => i.publishStatus === 'published');
    const draftItineraries = allItineraries.filter(i => i.publishStatus === 'draft');
    const totalInterests = allItineraries.reduce((sum, i) => sum + (i.interestCount || 0), 0);

    // ✅ NEW: Payment stats
    const paymentOpen = allItineraries.filter(i =>
        i.paymentEnabled && i.paymentStatus === 'open'
    ).length;

    const thresholdReached = allItineraries.filter(i =>
        (i.interestCount || 0) >= (i.interestThreshold || 10)
    ).length;

    document.getElementById('totalTrips').textContent = allItineraries.length;
    document.getElementById('publishedTrips').textContent = publishedItineraries.length;
    document.getElementById('draftTrips').textContent = draftItineraries.length;
    document.getElementById('totalInterests').textContent = totalInterests;
    document.getElementById('paymentOpenCount').textContent = paymentOpen;
    document.getElementById('thresholdReachedCount').textContent = thresholdReached;
}

// ===== POPULATE DESTINATION FILTER =====
function populateDestinationFilter() {
    const destinationFilter = document.getElementById('destinationFilter');
    if (!destinationFilter) return;

    const destinations = new Set();
    allItineraries.forEach(itinerary => {
        if (itinerary.destination && itinerary.destination.country) {
            destinations.add(itinerary.destination.country);
        }
    });

    destinationFilter.innerHTML = '<option value="all">All Destinations</option>';

    Array.from(destinations).sort().forEach(destination => {
        const option = document.createElement('option');
        option.value = destination;
        option.textContent = destination;
        destinationFilter.appendChild(option);
    });
}

// ===== APPLY FILTERS - WITH PAYMENT & INTEREST FILTERS =====
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const destinationFilter = document.getElementById('destinationFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;
    const paymentStatusFilter = document.getElementById('paymentStatusFilter')?.value || 'all';
    const interestFilter = document.getElementById('interestFilter')?.value || 'all';

    let filtered = allItineraries.filter(itinerary => {
        const matchesSearch = !searchTerm ||
            itinerary.title?.toLowerCase().includes(searchTerm) ||
            itinerary.destination?.country?.toLowerCase().includes(searchTerm) ||
            itinerary.destination?.city?.toLowerCase().includes(searchTerm) ||
            itinerary.shortSummary?.toLowerCase().includes(searchTerm) ||
            itinerary.tags?.some(tag => tag.toLowerCase().includes(searchTerm));

        const matchesStatus = statusFilter === 'all' || itinerary.publishStatus === statusFilter;
        const matchesDestination = destinationFilter === 'all' ||
            itinerary.destination?.country === destinationFilter;

        // Payment status filter
        let matchesPaymentStatus = true;
        if (paymentStatusFilter !== 'all') {
            matchesPaymentStatus = (itinerary.paymentStatus || 'closed') === paymentStatusFilter;
        }

        // Interest level filter
        let matchesInterest = true;
        if (interestFilter === 'threshold-reached') {
            const interestCount = itinerary.interestCount || 0;
            const threshold = itinerary.interestThreshold || 10;
            matchesInterest = interestCount >= threshold;
        } else if (interestFilter === 'below-threshold') {
            const interestCount = itinerary.interestCount || 0;
            const threshold = itinerary.interestThreshold || 10;
            matchesInterest = interestCount < threshold;
        }

        return matchesSearch && matchesStatus && matchesDestination && matchesPaymentStatus && matchesInterest;
    });

    // Sorting
    if (sortFilter === 'newest') {
        filtered.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });
    } else if (sortFilter === 'oldest') {
        filtered.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateA - dateB;
        });
    } else if (sortFilter === 'title-asc') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortFilter === 'title-desc') {
        filtered.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (sortFilter === 'budget-high') {
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortFilter === 'budget-low') {
        filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortFilter === 'days-high') {
        filtered.sort((a, b) => (b.duration?.days || 0) - (a.duration?.days || 0));
    } else if (sortFilter === 'days-low') {
        filtered.sort((a, b) => (a.duration?.days || 0) - (b.duration?.days || 0));
    } else if (sortFilter === 'interest-high') { // ✅ NEW
        filtered.sort((a, b) => (b.interestCount || 0) - (a.interestCount || 0));
    } else if (sortFilter === 'interest-low') { // ✅ NEW
        filtered.sort((a, b) => (a.interestCount || 0) - (b.interestCount || 0));
    }

    filteredItineraries = filtered;
    currentPage = 1;
    displayItineraries();
}

// ===== DISPLAY ITINERARIES =====
function displayItineraries() {
    hideLoadingState();

    const itinerariesGrid = document.getElementById('itinerariesGrid');
    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');
    const resultsCount = document.getElementById('resultsCount');

    if (!itinerariesGrid) return;

    if (resultsCount) {
        resultsCount.textContent = `${filteredItineraries.length} itinerary${filteredItineraries.length !== 1 ? 's' : ''} found`;
    }

    if (allItineraries.length === 0) {
        itinerariesGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (noResultsState) noResultsState.style.display = 'none';
        return;
    }

    if (filteredItineraries.length === 0) {
        itinerariesGrid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
        if (noResultsState) noResultsState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (noResultsState) noResultsState.style.display = 'none';
    itinerariesGrid.style.display = 'grid';

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItineraries = filteredItineraries.slice(startIndex, endIndex);

    itinerariesGrid.innerHTML = '';
    paginatedItineraries.forEach(itinerary => {
        const card = createItineraryCard(itinerary);
        itinerariesGrid.appendChild(card);
    });

    updatePagination();
}

// ===== CREATE ITINERARY CARD - CLEAN VERSION =====
function createItineraryCard(itinerary) {
    const card = document.createElement('div');
    card.className = 'itinerary-card';

    const coverImage = itinerary.coverImage || 'https://via.placeholder.com/400x300?text=No+Image';
    const title = itinerary.title || 'Untitled Itinerary';
    const destination = `${itinerary.destination?.city || 'Unknown'}, ${itinerary.destination?.country || 'Unknown'}`;
    const summary = itinerary.shortSummary || 'No description available';
    const days = itinerary.duration?.days || 0;
    const nights = itinerary.duration?.nights || 0;
    const price = itinerary.price || 0;
    const tags = itinerary.tags || [];
    const publishStatus = itinerary.publishStatus || 'draft';
    const createdAt = itinerary.createdAt?.toDate().toLocaleDateString() || 'Unknown date';

    // Payment status calculations (for badges only)
    const interestCount = itinerary.interestCount || 0;
    const interestThreshold = itinerary.interestThreshold || 10;
    const thresholdReached = interestCount >= interestThreshold;
    const isPaymentOpen = itinerary.paymentEnabled && itinerary.paymentStatus === 'open';
    const isBookingClosed = itinerary.paymentStatus === 'booking_closed' ||
        (itinerary.currentBookings || 0) >= (itinerary.maxBookings || 20);
    const paymentDeadline = itinerary.paymentDeadline;
    const maxBookings = itinerary.maxBookings || 20;
    const currentBookings = itinerary.currentBookings || 0;

    // Calculate deadline status
    let daysLeft = 0;
    if (paymentDeadline && isPaymentOpen) {
        const now = new Date();
        const deadline = paymentDeadline.toDate();
        const timeDiff = deadline - now;
        daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    }

    // Determine status badge
    let statusBadgeHTML = '';
    if (isBookingClosed) {
        statusBadgeHTML = '<span class="status-badge status-booking-closed"><i class="fa fa-lock"></i> Booking Closed</span>';
    } else if (isPaymentOpen) {
        if (daysLeft <= 3 && daysLeft > 0) {
            statusBadgeHTML = `<span class="status-badge status-deadline-warning"><i class="fa fa-clock"></i> ${daysLeft} day${daysLeft > 1 ? 's' : ''} left</span>`;
        } else if (daysLeft <= 0) {
            statusBadgeHTML = '<span class="status-badge status-expired"><i class="fa fa-exclamation-circle"></i> Deadline Passed</span>';
        } else {
            statusBadgeHTML = '<span class="status-badge status-payment-open"><i class="fa fa-dollar-sign"></i> Payment Open</span>';
        }
    } else if (thresholdReached) {
        statusBadgeHTML = '<span class="status-badge status-ready"><i class="fa fa-flag-checkered"></i> Ready for Payment</span>';
    } else {
        statusBadgeHTML = `<span class="status-badge status-pending"><i class="fa fa-users"></i> ${interestCount}/${interestThreshold} interested</span>`;
    }

    card.innerHTML = `
        <div class="card-image-container">
            <img src="${coverImage}" alt="${title}" class="card-image">
            <div class="card-overlay"></div>
            <div class="card-badges">
                <span class="status-badge ${publishStatus === 'published' ? 'badge-published' : 'badge-draft'}">
                    <i class="fa fa-${publishStatus === 'published' ? 'check-circle' : 'file-alt'}"></i>
                    ${publishStatus === 'published' ? 'Published' : 'Draft'}
                </span>
                ${statusBadgeHTML}
                <span class="duration-badge">
                    <i class="fa fa-calendar"></i>
                    ${days}D ${nights}N
                </span>
            </div>
        </div>
        <div class="card-content">
            <div class="card-header">
                <h3 class="card-title">${title}</h3>
                <div class="card-destination">
                    <i class="fa fa-map-marker-alt"></i>
                    ${destination}
                </div>
            </div>
            <p class="card-summary">${summary}</p>

            <!-- Interest Progress Bar -->
            <div class="interest-progress-container">
                <div class="interest-info">
                    <span class="interest-text">
                        <i class="fa fa-heart"></i> ${interestCount} interested
                    </span>
                    <span class="threshold-text">${interestCount}/${interestThreshold}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${thresholdReached ? 'reached' : ''}" 
                         style="width: ${Math.min((interestCount / interestThreshold) * 100, 100)}%">
                    </div>
                </div>
            </div>

            ${isPaymentOpen ? `
                <div class="booking-status">
                    <i class="fa fa-shopping-cart"></i>
                    <span>Bookings: ${currentBookings}/${maxBookings}</span>
                    ${paymentDeadline ? `
                        <span class="deadline-date">
                            <i class="fa fa-calendar"></i>
                            Deadline: ${paymentDeadline.toDate().toLocaleDateString()}
                        </span>
                    ` : ''}
                </div>
            ` : ''}

            <div class="card-meta">
                <div class="meta-item">
                    <i class="fa fa-clock"></i>
                    <span>${days} day${days !== 1 ? 's' : ''}</span>
                </div>
                <div class="meta-item">
                    <i class="fa fa-wallet"></i>
                    <span><strong>RM ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                </div>
            </div>

            ${tags.length > 0 ? `
                <div class="card-tags">
                    ${tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                    ${tags.length > 3 ? `<span class="tag">+${tags.length - 3}</span>` : ''}
                </div>
            ` : ''}

            <!-- Date and Action Buttons (ONLY View, Edit, Delete) -->
            <div class="card-footer-row">
                <span class="created-date">
                    <i class="fa fa-calendar-plus"></i> ${createdAt}
                </span>
                <div class="card-actions">
                    <button class="card-action-btn btn-view-details" onclick="window.viewItineraryDetails('${itinerary.id}')" title="View Details">
                        <i class="fa fa-eye"></i> View
                    </button>
                    <button class="card-action-btn btn-edit" onclick="window.editItinerary('${itinerary.id}')" title="Edit">
                        <i class="fa fa-edit"></i> Edit
                    </button>
                    <button class="card-action-btn btn-delete" onclick="window.deleteItinerary('${itinerary.id}')" title="Delete">
                        <i class="fa fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>
    `;

    return card;
}

// Open Payment Modal
async function openPaymentModal(itineraryId) {
    try {
        currentPaymentItineraryId = itineraryId;

        const itinerary = allItineraries.find(i => i.id === itineraryId);
        if (!itinerary) {
            showToast('Itinerary not found', true);
            return;
        }

        document.getElementById('paymentItineraryTitle').textContent = itinerary.title;
        document.getElementById('paymentInterestCount').textContent = itinerary.interestCount || 0;
        document.getElementById('paymentThreshold').textContent = itinerary.interestThreshold || 10;
        document.getElementById('paymentPrice').textContent = `RM ${itinerary.price.toLocaleString()}`;

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('paymentDeadlineDate').setAttribute('min', today);
        document.getElementById('paymentDeadlineDate').value = '';

        document.getElementById('paymentModal').classList.add('show');
    } catch (error) {
        console.error('Error opening payment modal:', error);
        showToast('Failed to open payment modal', true);
    }
}

// Handle Open Payment
async function handleOpenPayment(e) {
    e.preventDefault();
    if (!currentPaymentItineraryId) return;

    const deadlineDate = document.getElementById('paymentDeadlineDate').value;
    const deadlineTime = document.getElementById('paymentDeadlineTime').value;

    if (!deadlineDate || !deadlineTime) {
        showToast('Please select payment deadline', true);
        return;
    }

    const deadlineDateTime = new Date(`${deadlineDate}T${deadlineTime}`);

    if (deadlineDateTime <= new Date()) {
        showToast('Deadline must be in the future', true);
        return;
    }

    try {
        const submitBtn = document.querySelector('#paymentConfigForm button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Opening...';

        const itineraryRef = doc(db, 'itineraries', currentPaymentItineraryId);
        await updateDoc(itineraryRef, {
            paymentEnabled: true,
            paymentStatus: 'open',
            paymentDeadline: Timestamp.fromDate(deadlineDateTime),
            paymentOpenedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        showToast('Payment window opened successfully!', false);
        document.getElementById('paymentModal').classList.remove('show');

        await loadItineraries();
    } catch (error) {
        console.error('Error opening payment:', error);
        showToast('Failed to open payment window', true);
    } finally {
        const submitBtn = document.querySelector('#paymentConfigForm button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa fa-unlock"></i> Open Payment Window';
    }
}

// ===== CONFIRM CLOSE PAYMENT =====
function confirmClosePayment(itineraryId) {
    const itinerary = allItineraries.find(i => i.id === itineraryId);
    if (!itinerary) {
        showToast('Itinerary not found', true);
        return;
    }

    selectedItineraryId = itineraryId;

    const currentBookings = itinerary.currentBookings || 0;
    const maxBookings = itinerary.maxBookings || 20;

    // Show confirmation modal
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="confirm-message">
            <div class="confirm-icon-warning">
                <i class="fa fa-exclamation-triangle"></i>
            </div>
            <p class="confirm-text-bold">Close Payment Window?</p>
            <p class="confirm-details">${itinerary.title}</p>
            
            <div class="payment-config-info" style="margin: 20px 0; text-align: left;">
                <div class="info-row">
                    <span class="info-label">Current Bookings</span>
                    <span class="info-value">${currentBookings} / ${maxBookings}</span>
                </div>
            </div>

            <div class="alert-warning" style="text-align: left;">
                <i class="fa fa-info-circle"></i>
                <div>
                    <p style="margin: 0;"><strong>This will:</strong></p>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li>Stop accepting new bookings</li>
                        <li>Close the payment window</li>
                        <li>Preserve all existing bookings</li>
                    </ul>
                </div>
            </div>

            <p class="confirm-warning" style="margin-top: 16px;">
                You can reopen bookings later if needed.
            </p>
        </div>
    `;

    const modalHeader = document.querySelector('#tripModal .modal-header');
    modalHeader.className = 'modal-header modal-header-warning';
    modalHeader.querySelector('h2').innerHTML = '<i class="fa fa-exclamation-triangle"></i> Close Payment Window';

    const modalActions = document.querySelector('#tripModal .modal-actions');
    modalActions.style.display = 'flex'; 
    modalActions.innerHTML = `
        <button class="btn btn-cancel" onclick="closeTripModal()">
            <i class="fa fa-times"></i> Cancel
        </button>
        <button class="btn btn-warning" onclick="executeClosePayment()">
            <i class="fa fa-lock"></i> Close Payment
        </button>
    `;

    document.getElementById('tripModal').classList.add('show');
}

// ===== CLOSE TRIP MODAL =====
window.closeTripModal = function () {
    const modal = document.getElementById('tripModal');
    const modalActions = document.querySelector('#tripModal .modal-actions');
    
    // Reset modal
    modal.classList.remove('show');
    if (modalActions) {
        modalActions.style.display = 'none';
    }
    
    // Reset header to default
    const modalHeader = document.querySelector('#tripModal .modal-header');
    if (modalHeader) {
        modalHeader.className = 'modal-header';
        modalHeader.querySelector('h2').innerHTML = '<i class="fa fa-info-circle"></i> Itinerary Details';
    }
    
    selectedItineraryId = null;
}

// ===== EXECUTE CLOSE PAYMENT =====
window.executeClosePayment = async function () {
    try {
        const itineraryRef = doc(db, 'itineraries', selectedItineraryId);
        await updateDoc(itineraryRef, {
            paymentStatus: 'booking_closed',
            paymentClosedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        showToast('✅ Payment window closed successfully', false);
        closeTripModal();
        await loadItineraries();

    } catch (error) {
        console.error('❌ Error closing payment:', error);
        showToast('Error closing payment: ' + error.message, true);
    }
};

// ===== VIEW PAYMENTS =====
window.viewPayments = function (itineraryId) {
    window.location.href = `booking_management.html?itineraryId=${itineraryId}`;
};

// ===== REOPEN BOOKING =====
function reopenBooking(itineraryId) {
    const itinerary = allItineraries.find(i => i.id === itineraryId);
    if (!itinerary) {
        showToast('Itinerary not found', true);
        return;
    }

    currentPaymentItineraryId = itineraryId;

    const currentBookings = itinerary.currentBookings || 0;
    const oldMaxBookings = itinerary.maxBookings || 20;

    // Set current values in modal
    document.getElementById('reopenCurrentBookings').textContent = currentBookings;
    document.getElementById('reopenOldMaxBookings').textContent = oldMaxBookings;

    // Set suggested values
    const suggestedMax = Math.max(currentBookings + 10, 30);
    document.getElementById('reopenMaxBookings').value = suggestedMax;
    document.getElementById('reopenMaxBookings').min = currentBookings;

    // Set suggested deadline
    const today = new Date();
    const suggestedDate = new Date(today.setDate(today.getDate() + 14));
    const suggestedDateString = suggestedDate.toISOString().split('T')[0];
    document.getElementById('reopenDeadline').value = suggestedDateString;
    document.getElementById('reopenDeadline').min = new Date().toISOString().split('T')[0];

    // Show modal
    document.getElementById('reopenModal').classList.add('show');
}

// ===== CLOSE REOPEN MODAL =====
window.closeReopenModal = function () {
    document.getElementById('reopenModal').classList.remove('show');
    document.getElementById('reopenForm').reset();
    currentPaymentItineraryId = null;
};

// ===== SUBMIT REOPEN =====
window.submitReopen = async function () {
    try {
        const itinerary = allItineraries.find(i => i.id === currentPaymentItineraryId);
        if (!itinerary) {
            showToast('Itinerary not found', true);
            return;
        }

        const currentBookings = itinerary.currentBookings || 0;
        const newMaxBookings = parseInt(document.getElementById('reopenMaxBookings').value);
        const newDeadlineInput = document.getElementById('reopenDeadline').value;

        // Validate max bookings
        if (isNaN(newMaxBookings) || newMaxBookings < 1) {
            showToast('Please enter a valid maximum booking number', true);
            return;
        }

        if (newMaxBookings < currentBookings) {
            showToast(`New capacity must be at least ${currentBookings} (current bookings)`, true);
            return;
        }

        // Validate deadline
        const newDeadline = new Date(newDeadlineInput);
        if (isNaN(newDeadline.getTime())) {
            showToast('Please enter a valid deadline date', true);
            return;
        }

        if (newDeadline <= new Date()) {
            showToast('Deadline must be in the future', true);
            return;
        }

        // Convert to Firestore Timestamp
        const deadlineTimestamp = Timestamp.fromDate(newDeadline);

        // Update itinerary
        const itineraryRef = doc(db, 'itineraries', currentPaymentItineraryId);
        await updateDoc(itineraryRef, {
            paymentStatus: 'open',
            paymentEnabled: true,
            maxBookings: newMaxBookings,
            paymentDeadline: deadlineTimestamp,
            paymentReopenedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        showToast(`✅ Booking reopened with capacity of ${newMaxBookings}`, false);
        closeReopenModal();
        await loadItineraries();

    } catch (error) {
        console.error('❌ Error reopening booking:', error);
        showToast('Error reopening booking: ' + error.message, true);
    }
};

// ===== CLOSE REOPEN MODAL ON BACKGROUND CLICK =====
document.addEventListener('click', (e) => {
    const reopenModal = document.getElementById('reopenModal');
    if (e.target === reopenModal) {
        closeReopenModal();
    }
});

// ===== UPDATE PAGINATION =====
function updatePagination() {
    const paginationContainer = document.getElementById('paginationContainer');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');

    if (!paginationContainer) return;

    const totalPages = Math.ceil(filteredItineraries.length / itemsPerPage);

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';
    currentPageSpan.textContent = currentPage;
    totalPagesSpan.textContent = totalPages;

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

// ===== COUNT ACTUAL BOOKINGS FROM ALL USERS =====
async function calculateActualBookings(itineraryId) {
    try {
        let totalPeople = 0;
        
        // Get all users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        
        // Loop through each user and check their bookings
        for (const userDoc of usersSnapshot.docs) {
            const bookingsRef = collection(db, 'users', userDoc.id, 'bookings');
            const q = query(
                bookingsRef,
                where('itineraryId', '==', itineraryId),
                where('bookingType', '==', 'itinerary'),
                where('status', 'in', ['confirmed', 'active'])  // Only count active bookings
            );
            
            const bookingsSnapshot = await getDocs(q);
            
            // Sum up the numberOfPeople from each booking
            bookingsSnapshot.forEach(bookingDoc => {
                const bookingData = bookingDoc.data();
                totalPeople += (bookingData.numberOfPeople || 0);
            });
        }
        
        return totalPeople;
        
    } catch (error) {
        console.error('Error calculating bookings:', error);
        return 0;
    }
}

// ===== VIEW ITINERARY DETAILS =====
window.viewItineraryDetails = async function (itineraryId) {
    try {
        const itinerary = allItineraries.find(i => i.id === itineraryId);
        if (!itinerary) {
            showToast('Itinerary not found', true);
            return;
        }

        const modal = document.getElementById('tripModal');
        const modalBody = document.getElementById('modalBody');

        const days = itinerary.duration?.days || 0;
        const nights = itinerary.duration?.nights || 0;
        const destination = `${itinerary.destination?.city || 'Unknown'}, ${itinerary.destination?.country || 'Unknown'}`;
        const price = itinerary.price || 0;

        // Payment status calculations
        const interestCount = itinerary.interestCount || 0;
        const interestThreshold = itinerary.interestThreshold || 10;
        const thresholdReached = interestCount >= interestThreshold;
        const isPaymentOpen = itinerary.paymentEnabled && itinerary.paymentStatus === 'open';
        const paymentDeadline = itinerary.paymentDeadline;
        const maxBookings = itinerary.maxBookings || 20;
        
        // CALCULATE REAL BOOKINGS FROM ALL USERS
        const currentBookings = await calculateActualBookings(itineraryId);
        
        // UPDATE THE ITINERARY DOCUMENT WITH REAL COUNT
        if (currentBookings !== itinerary.currentBookings) {
            try {
                await updateDoc(doc(db, 'itineraries', itineraryId), {
                    currentBookings: currentBookings,
                    updatedAt: serverTimestamp()
                });
                // Update local data
                itinerary.currentBookings = currentBookings;
            } catch (error) {
                console.error('Error updating booking count:', error);
            }
        }
        
        const isBookingClosed = itinerary.paymentStatus === 'booking_closed' || currentBookings >= maxBookings;

        // Calculate deadline
        let daysLeft = 0;
        if (paymentDeadline && isPaymentOpen) {
            const now = new Date();
            const deadline = paymentDeadline.toDate();
            const timeDiff = deadline - now;
            daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        }

        // Generate payment section HTML
        let paymentSectionHTML = '';
        if (isBookingClosed) {
            paymentSectionHTML = `
                <div style="background: #fef2f2; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #ef4444;">
                                <i class="fa fa-lock"></i> Booking Closed
                            </h4>
                            <p style="color: #666; margin: 0;">
                                Payment window has been closed for this itinerary.
                            </p>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; padding: 16px; background: white; border-radius: 8px;">
                        <div>
                            <div style="font-size: 12px; color: #666;">Total Bookings</div>
                            <div style="font-weight: 600; font-size: 20px; color: #ef4444;">${currentBookings} / ${maxBookings}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #666;">Status</div>
                            <div style="font-weight: 600; font-size: 16px; color: #ef4444;">Closed</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-view-bookings" onclick="viewPayments('${itinerary.id}')"
                                style="flex: 1; padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                            <i class="fa fa-receipt"></i> View Bookings (${currentBookings})
                        </button>
                        <button class="btn-reopen-booking" data-id="${itinerary.id}" 
                                style="padding: 12px 24px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                            <i class="fa fa-undo"></i> Reopen
                        </button>
                    </div>
                </div>
            `;
        } else if (isPaymentOpen) {
            const deadlineText = paymentDeadline ? paymentDeadline.toDate().toLocaleDateString('en-MY', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : 'Not set';

            const deadlineWarning = daysLeft <= 3 && daysLeft > 0 ?
                `<div style="background: #fef3c7; padding: 8px 12px; border-radius: 6px; margin-top: 8px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa fa-exclamation-triangle" style="color: #f59e0b;"></i>
                    <span style="color: #92400e; font-weight: 600; font-size: 13px;">${daysLeft} day${daysLeft > 1 ? 's' : ''} left until deadline!</span>
                </div>` : '';

            const progressPercent = maxBookings > 0 ? Math.round((currentBookings / maxBookings) * 100) : 0;

            paymentSectionHTML = `
                <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #3b82f6;">
                                <i class="fa fa-dollar-sign"></i> Payment Window Open
                            </h4>
                            <p style="color: #666; margin: 0;">
                                Users can now complete their bookings for this trip.
                            </p>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; padding: 16px; background: white; border-radius: 8px;">
                        <div>
                            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Current Bookings</div>
                            <div style="font-weight: 700; font-size: 24px; color: #3b82f6;">${currentBookings} <span style="font-size: 16px; color: #666;">/ ${maxBookings}</span></div>
                            <div style="margin-top: 8px;">
                                <div style="height: 6px; background: #e5e7eb; border-radius: 10px; overflow: hidden;">
                                    <div style="height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb); width: ${progressPercent}%; transition: width 0.3s ease;"></div>
                                </div>
                                <div style="font-size: 11px; color: #666; margin-top: 4px;">${progressPercent}% filled</div>
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">Payment Deadline</div>
                            <div style="font-weight: 600; font-size: 14px; color: #1e40af; line-height: 1.4;">
                                <i class="fa fa-calendar-alt"></i> ${deadlineText}
                            </div>
                            ${deadlineWarning}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button onclick="viewPayments('${itinerary.id}')"
                                style="flex: 1; padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                            <i class="fa fa-receipt"></i> View Payments & Bookings (${currentBookings})
                        </button>
                        <button class="btn-close-payment" data-id="${itinerary.id}" 
                                style="padding: 12px 24px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">
                            <i class="fa fa-times-circle"></i> Close Payment
                        </button>
                    </div>
                </div>
            `;
        } else if (thresholdReached) {
            paymentSectionHTML = `
                <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #10b981;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #10b981;">
                                <i class="fa fa-flag-checkered"></i> Ready to Open Payment
                            </h4>
                            <p style="color: #666; margin: 0;">
                                Interest threshold has been reached. You can now open the payment window.
                            </p>
                        </div>
                    </div>
                    
                    <div style="padding: 16px; background: white; border-radius: 8px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #666;">Interest Progress</span>
                            <span style="font-weight: 600; color: #10b981;">${interestCount} / ${interestThreshold} people</span>
                        </div>
                        <div style="height: 8px; background: #e5e7eb; border-radius: 10px; overflow: hidden;">
                            <div style="height: 100%; background: linear-gradient(90deg, #10b981, #059669); width: 100%;"></div>
                        </div>
                        <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa fa-check-circle" style="color: #10b981; font-size: 14px;"></i>
                            <span style="font-size: 12px; color: #059669; font-weight: 600;">Threshold reached!</span>
                        </div>
                    </div>
                    
                    <button class="btn-open-payment" data-id="${itinerary.id}" 
                            style="padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; width: 100%;">
                        <i class="fa fa-unlock"></i> Open Payment Window
                    </button>
                </div>
            `;
        } else {
            const progressPercent = interestThreshold > 0 ? Math.round((interestCount / interestThreshold) * 100) : 0;

            paymentSectionHTML = `
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-left: 4px solid #6b7280;">
                    <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #6b7280;">
                        <i class="fa fa-users"></i> Interest Tracking
                    </h4>
                    
                    <div style="padding: 16px; background: white; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #666; font-size: 14px;">
                                <i class="fa fa-heart" style="color: #ef4444;"></i> ${interestCount} people interested
                            </span>
                            <span style="color: #666; font-size: 14px; font-weight: 600;">${progressPercent}%</span>
                        </div>
                        <div style="height: 8px; background: #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
                            <div style="height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb); width: ${progressPercent}%; transition: width 0.3s ease;"></div>
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            Need ${interestThreshold - interestCount} more to reach threshold (${interestThreshold} total)
                        </div>
                    </div>
                    
                    <div style="margin-top: 12px; padding: 12px; background: #fff3cd; border-radius: 8px; display: flex; gap: 10px; align-items: start;">
                        <i class="fa fa-info-circle" style="color: #f59e0b; font-size: 16px; flex-shrink: 0; margin-top: 2px;"></i>
                        <span style="font-size: 13px; color: #856404; line-height: 1.5;">
                            Payment window can be opened once the interest threshold is reached. Users who expressed interest will be notified.
                        </span>
                    </div>
                </div>
            `;
        }

        modalBody.innerHTML = `
            <div style="margin-bottom: 20px;">
                <img src="${itinerary.coverImage || 'https://via.placeholder.com/800x400'}" 
                     alt="${itinerary.title}" 
                     style="width: 100%; height: 250px; object-fit: cover; border-radius: 12px; margin-bottom: 20px;">

                <div style="margin-bottom: 16px;">
                    <span class="status-badge ${itinerary.publishStatus === 'published' ? 'badge-published' : 'badge-draft'}" style="margin-right: 8px;">
                        ${itinerary.publishStatus === 'published' ? 'Published' : 'Draft'}
                    </span>
                    <span style="color: #666;"><i class="fa fa-calendar"></i> Created: ${itinerary.createdAt?.toDate().toLocaleDateString() || 'Unknown'}</span>
                </div>

                <h3 style="font-size: 24px; margin-bottom: 8px;">${itinerary.title}</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    <i class="fa fa-map-marker-alt"></i> ${destination}
                </p>

                <!-- PAYMENT MANAGEMENT SECTION -->
                ${paymentSectionHTML}

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #666;">Duration</div>
                        <div style="font-weight: 600;">${days}D ${nights}N</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #666;">Price</div>
                        <div style="font-weight: 600; color: #3D9BF3;">RM ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 12px; color: #666;">Suitable For</div>
                        <div style="font-weight: 600;">${(itinerary.suitableFor || []).join(', ') || 'N/A'}</div>
                    </div>
                </div>

                ${itinerary.highlights && itinerary.highlights.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">✨ Highlights</h4>
                        <ul style="margin-left: 20px; color: #666;">
                            ${itinerary.highlights.map(h => `<li style="margin-bottom: 6px;">${h}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Description</h4>
                    <p style="color: #666; line-height: 1.6;">${itinerary.detailedDescription || itinerary.shortSummary || 'No description available'}</p>
                </div>

                ${itinerary.days && itinerary.days.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">📅 Itinerary (${itinerary.days.length} Days)</h4>
                        ${itinerary.days.map((day, index) => `
                            <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 12px;">
                                <h5 style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Day ${index + 1}: ${day.title || `Day ${index + 1}`}</h5>
                                <p style="font-size: 14px; color: #666; margin-bottom: 8px;">${day.description || ''}</p>
                                ${day.activities && day.activities.length > 0 ? `
                                    <div style="margin-top: 12px;">
                                        <strong style="font-size: 13px;">Activities (${day.activities.length}):</strong>
                                        <ul style="margin-left: 20px; margin-top: 6px; font-size: 13px; color: #666;">
                                            ${day.activities.map(activity => `
                                                <li style="margin-bottom: 4px;">
                                                    ${activity.time ? `<strong>${activity.time}</strong> - ` : ''}
                                                    ${activity.name}
                                                    ${activity.cost ? ` (RM ${activity.cost})` : ''}
                                                </li>
                                            `).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${itinerary.tags && itinerary.tags.length > 0 ? `
                    <div style="margin-bottom: 20px;">
                        <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">🏷️ Tags</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${itinerary.tags.map(tag => `
                                <span style="background: #e3f2fd; color: #1976d2; padding: 6px 12px; border-radius: 16px; font-size: 13px; text-transform: capitalize;">${tag}</span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        modal.classList.add('show');

    } catch (error) {
        console.error('❌ Error viewing itinerary details:', error);
        showToast('Error loading itinerary details', true);
    }
};

// ===== EDIT & DELETE =====
window.editItinerary = function (itineraryId) {
    window.location.href = `add_trip.html?id=${itineraryId}`;
};

window.deleteItinerary = async function (itineraryId) {
    try {
        const itinerary = allItineraries.find(i => i.id === itineraryId);
        if (!itinerary) return;

        selectedItineraryId = itineraryId;

        const deleteModal = document.getElementById('deleteModal');
        const deleteDetails = document.getElementById('deleteDetails');

        deleteDetails.textContent = `"${itinerary.title}" - ${itinerary.destination?.city}, ${itinerary.destination?.country}`;

        deleteModal.classList.add('show');

    } catch (error) {
        console.error('❌ Error preparing delete:', error);
        showToast('Error preparing delete', true);
    }
};

async function confirmDelete() {
    if (!selectedItineraryId) return;

    try {
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Deleting...';

        await deleteDoc(doc(db, 'itineraries', selectedItineraryId));

        document.getElementById('deleteModal').classList.remove('show');
        showToast('Itinerary deleted successfully!');

        await loadItineraries();

        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fa fa-trash"></i> Delete Permanently';
        selectedItineraryId = null;

    } catch (error) {
        console.error('❌ Error deleting itinerary:', error);
        showToast('Error deleting itinerary. Please try again.', true);

        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fa fa-trash"></i> Delete Permanently';
    }
}

// ===== RESET FILTERS =====
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('destinationFilter').value = 'all';
    document.getElementById('sortFilter').value = 'newest';
    if (document.getElementById('paymentStatusFilter')) {
        document.getElementById('paymentStatusFilter').value = 'all';
    }
    if (document.getElementById('interestFilter')) {
        document.getElementById('interestFilter').value = 'all';
    }
    applyFilters();
}

// ===== PAGINATION =====
function nextPage() {
    const totalPages = Math.ceil(filteredItineraries.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayItineraries();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        displayItineraries();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Profile Dropdown
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) {
        const profileTrigger = document.getElementById('profileTrigger');
        if (profileTrigger) {
            profileTrigger.addEventListener('click', function (e) {
                e.stopPropagation();
                profileDropdown.classList.toggle('active');
            });
        }
    }

    document.addEventListener('click', function () {
        if (profileDropdown) {
            profileDropdown.classList.remove('active');
        }
    });

    // Logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async function (e) {
            e.preventDefault();
            try {
                await auth.signOut();
                window.location.href = 'login.html';
            } catch (error) {
                console.error('❌ Logout error:', error);
            }
        });
    }

    // Search and Filters
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    const statusFilter = document.getElementById('statusFilter');
    const destinationFilter = document.getElementById('destinationFilter');
    const sortFilter = document.getElementById('sortFilter');
    const paymentStatusFilter = document.getElementById('paymentStatusFilter');
    const interestFilter = document.getElementById('interestFilter');

    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (destinationFilter) destinationFilter.addEventListener('change', applyFilters);
    if (sortFilter) sortFilter.addEventListener('change', applyFilters);
    if (paymentStatusFilter) paymentStatusFilter.addEventListener('change', applyFilters);
    if (interestFilter) interestFilter.addEventListener('change', applyFilters);

    const resetFiltersBtn = document.getElementById('resetFilters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFilters);
    }

    // Modals
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', function () {
            document.getElementById('tripModal').classList.remove('show');
        });
    }

    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', confirmDelete);
    }

    // Payment Modal Event Listeners
    const closePaymentModal = document.getElementById('closePaymentModal');
    if (closePaymentModal) {
        closePaymentModal.addEventListener('click', () => {
            document.getElementById('paymentModal').classList.remove('show');
        });
    }

    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    if (cancelPaymentBtn) {
        cancelPaymentBtn.addEventListener('click', () => {
            document.getElementById('paymentModal').classList.remove('show');
        });
    }

    const paymentConfigForm = document.getElementById('paymentConfigForm');
    if (paymentConfigForm) {
        paymentConfigForm.addEventListener('submit', handleOpenPayment);
    }

    // Payment Action Buttons 
    document.addEventListener('click', (e) => {
        // Open Payment Button
        if (e.target.closest('.btn-open-payment')) {
            const itineraryId = e.target.closest('.btn-open-payment').dataset.id;
            openPaymentModal(itineraryId);
        }

        // Close Payment Button
        if (e.target.closest('.btn-close-payment')) {
            const itineraryId = e.target.closest('.btn-close-payment').dataset.id;
            confirmClosePayment(itineraryId);
        }

        // View Payments Button
        if (e.target.closest('.btn-view-payments')) {
            const itineraryId = e.target.closest('.btn-view-payments').dataset.id;
            viewPayments(itineraryId);
        }

        // Reopen Booking Button
        if (e.target.closest('.btn-reopen-booking')) {
            const itineraryId = e.target.closest('.btn-reopen-booking').dataset.id;
            reopenBooking(itineraryId);
        }
    });

    // Pagination
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');

    if (prevPageBtn) prevPageBtn.addEventListener('click', prevPage);
    if (nextPageBtn) nextPageBtn.addEventListener('click', nextPage);

    // Close modals on background click
    window.addEventListener('click', function (e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });
}

// ===== AUTH STATE OBSERVER =====
observeAuthState(async (user) => {
    currentUser = user;

    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();

                const userRole = userData.role?.toLowerCase();
                const isAuthorized = userRole === 'admin' || userRole === 'superadmin';

                if (!isAuthorized) {
                    console.warn('⚠️ Unauthorized access attempt - User role:', userRole || 'none');
                    showToast('Access denied. Admin privileges required.', true);
                    setTimeout(() => {
                        window.location.href = 'home.html';
                    }, 2000);
                    return;
                }

                console.log(`✅ Admin authenticated: ${userRole}`);

                const registerAdminNav = document.getElementById('registerAdminNav');
                if (registerAdminNav && userRole === 'superadmin') {
                    registerAdminNav.style.display = 'block';
                }

                updateUserProfileUI(userData);
                await loadItineraries();

            } else {
                console.warn('⚠️ User profile not found');
                window.location.href = 'login.html';
            }

        } catch (error) {
            console.error('❌ Error fetching user data:', error);
            showToast('Error loading your profile', true);
        }
    } else {
        console.log('⚠️ User not logged in - redirecting to login');
        window.location.href = 'login.html';
    }
});

// ===== INITIALIZE ON PAGE LOAD =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEventListeners);
} else {
    initializeEventListeners();
}
