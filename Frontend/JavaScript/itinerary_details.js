import { db, auth } from './firebase-config.js';
import {
    doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs,
    addDoc, query, orderBy, deleteDoc, setDoc, serverTimestamp, increment, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

let itineraryData = null;
let currentUser = null;
let galleryImages = [];
let currentGalleryIndex = 0;
let allReviews = [];
let selectedRating = 0;
let uploadedPhotos = [];
let reviewsLoaded = false;
let userProfile = null;
let userInterestStatus = null;

// ===== GET ITINERARY ID FROM URL =====
function getItineraryIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    console.log('🔍 Full URL:', window.location.href);
    console.log('🔍 Extracted ID:', id);

    return id;
}

// ==== Check if User Already Expressed Interest ====
async function checkUserInterestStatus() {
    if (!currentUser || !itineraryData) return;
    try {
        const interestsRef = collection(db, 'users', currentUser.uid, 'interests');
        const q = query(interestsRef, where('itineraryId', '==', itineraryData.id));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            userInterestStatus = snapshot.docs[0].data();
        } else {
            userInterestStatus = null;
        }
        updateActionButton();
    } catch (error) {
        console.error("Error checking interest status", error);
    }
}

// ===== UPDATE ACTION BUTTON =====
async function updateActionButton() {
    const actionBtn = document.getElementById('actionBtn');
    const interestInfoText = document.getElementById('interestInfoText');
    if (!actionBtn || !itineraryData) return;
    
    let newBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newBtn, actionBtn);

    // ✅ CHECK IF USER HAS ALREADY PAID FOR THIS ITINERARY
    if (currentUser) {
        try {
            const bookingsRef = collection(db, 'users', currentUser.uid, 'bookings');
            const q = query(
                bookingsRef, 
                where('itineraryId', '==', itineraryData.id),
                where('bookingType', '==', 'itinerary')
            );
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                const booking = snapshot.docs[0].data();
                
                // User has paid for this itinerary
                if (booking.status === 'confirmed' || booking.status === 'active') {
                    newBtn.innerHTML = '<i class="fa fa-check-circle"></i> Paid';
                    newBtn.className = 'btn-primary btn-paid';
                    newBtn.disabled = true;
                    
                    if (interestInfoText) {
                        const bookedDate = new Date(booking.createdAt?.toDate ? booking.createdAt.toDate() : booking.createdAt);
                        interestInfoText.textContent = `You booked this on ${bookedDate.toLocaleDateString()}`;
                    }
                    return; // Exit early
                }
            }
        } catch (error) {
            console.error('Error checking booking status:', error);
        }
    }

    // EXISTING LOGIC - Only runs if user hasn't paid
    const count = itineraryData.interestCount || 0;
    const threshold = itineraryData.interestThreshold || 10;
    const paymentStatus = itineraryData.paymentStatus || 'closed';
    const publishStatus = itineraryData.publishStatus || 'draft';

    if (publishStatus === 'published' && paymentStatus === 'open' && userInterestStatus?.notifiedToPurchaseAt) {
        newBtn.innerHTML = '<i class="fa fa-credit-card"></i> Purchase Now';
        newBtn.className = 'btn-primary btn-purchase';
        newBtn.onclick = purchaseItinerary;
        if (interestInfoText)
            interestInfoText.textContent = "This itinerary is now available!";
    } else if (userInterestStatus?.expressedInterestAt) {
        newBtn.innerHTML = '<i class="fa fa-check-circle"></i> Interest Expressed';
        newBtn.className = 'btn-primary btn-disabled';
        newBtn.disabled = true;
        if (interestInfoText)
            interestInfoText.textContent = `${count}/${threshold} people interested. We'll notify you when available!`;
    } else {
        newBtn.innerHTML = '<i class="fa fa-thumbs-up"></i> Express Interest';
        newBtn.className = 'btn-primary btn-express';
        newBtn.onclick = expressInterest;
        if (interestInfoText)
            interestInfoText.textContent = `${count}/${threshold} people interested. Be one of them!`;
    }
}

// ===== EXPRESS INTEREST - UPDATED FIELD NAMES =====
async function expressInterest() {
    if (!currentUser) {
        showToast("Please login to express interest", true);
        setTimeout(() => window.location.href = "login.html", 1500);
        return;
    }
    if (!itineraryData) return;
    const actionBtn = document.getElementById('actionBtn');
    if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Processing...';
    }

    try {
        const interestsRef = collection(db, 'users', currentUser.uid, 'interests');
        const q = query(interestsRef, where('itineraryId', '==', itineraryData.id));
        const existingSnapshot = await getDocs(q);

        if (!existingSnapshot.empty) {
            showToast("You have already expressed interest!", true);
            await checkUserInterestStatus();
            return;
        }

        const interestRef = doc(interestsRef);
        await setDoc(interestRef, {
            interestId: interestRef.id,
            itineraryId: itineraryData.id,
            userId: currentUser.uid,
            status: "expressed",
            expressedInterestAt: serverTimestamp(),
            notifiedToPurchaseAt: null,
            purchasedAt: null,
            title: itineraryData.title,
            destination: itineraryData.destination,
            duration: itineraryData.duration,
            price: itineraryData.price,
            coverImage: itineraryData.coverImage
        });

        const itineraryRef = doc(db, 'itineraries', itineraryData.id);
        await updateDoc(itineraryRef, {
            interestedUsers: arrayUnion(currentUser.uid),
            interestCount: increment(1)
        });

        showToast("Interest expressed! We'll notify you when this itinerary is available.", false);
        itineraryData.interestCount = (itineraryData.interestCount || 0) + 1;
        updateInterestCountDisplay();
        await checkUserInterestStatus();
    } catch (error) {
        console.error("Error expressing interest", error);
        showToast("Failed to express interest. Please try again.", true);
    }

    if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.innerHTML = '<i class="fa fa-thumbs-up"></i> Express Interest';
    }
}

// ===== PURCHASE ITINERARY =====
function purchaseItinerary() {
    sessionStorage.setItem('purchaseItinerary', JSON.stringify({
        itineraryId: itineraryData.id,
        interestId: userInterestStatus?.interestId
    }));
    window.location.href = 'itineraryPayment.html';
}

// ===== UPDATE INTEREST COUNT DISPLAY =====
function updateInterestCountDisplay() {
    const el = document.getElementById('interestCount');
    if (el && itineraryData) {
        const count = itineraryData.interestCount || 0;
        el.textContent = `${count} ${count === 1 ? "person" : "people"}`;
    }
}

// ===== UPDATE APPROVAL STATUS BANNER =====
function updateApprovalStatusBanner() {
    const banner = document.getElementById('approvalStatusBanner');
    if (!banner || !itineraryData) return;
    const publishStatus = itineraryData.publishStatus || 'draft';
    const paymentStatus = itineraryData.paymentStatus || 'closed';
    const interestCount = itineraryData.interestCount || 0;
    const threshold = itineraryData.interestThreshold || 10;

    if (publishStatus === 'published' && paymentStatus === 'open') {
        banner.className = 'approval-status-banner approved';
        banner.innerHTML = `<i class="fa fa-check-circle"></i><span><strong>Available Now!</strong> This itinerary is ready for booking.</span>`;
        banner.style.display = 'flex';
    } else if (publishStatus === 'draft' || paymentStatus === 'closed') {
        banner.className = 'approval-status-banner pending';
        banner.innerHTML = `<i class="fa fa-hourglass-half"></i><span><strong>Coming Soon!</strong> ${interestCount}/${threshold} people interested. Express your interest to get notified when available!</span>`;
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}

// ===== LOAD ITINERARY DETAILS =====
async function loadItineraryDetails() {
    const itineraryId = getItineraryIdFromURL();

    if (!itineraryId) {
        console.error('❌ No ID found in URL');
        showToast('Itinerary not found', true);
        setTimeout(() => window.location.href = 'destinations.html', 2000);
        return;
    }

    try {
        console.log('📍 Loading itinerary by ID:', itineraryId);

        const docRef = doc(db, 'itineraries', itineraryId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            itineraryData = docSnap.data();
            itineraryData.id = docSnap.id;

            console.log('✅ Loaded itinerary:', itineraryData);
            console.log('✅ Itinerary ID stored:', itineraryData.id);

            displayItineraryDetails(itineraryData);
            updateInterestCountDisplay();
            updateApprovalStatusBanner();

            if (currentUser) {
                await checkUserInterestStatus();
            }

            await loadReviews();
            reviewsLoaded = true;
        } else {
            console.error('❌ No itinerary found with ID:', itineraryId);
            showToast('Itinerary not found', true);
            setTimeout(() => window.location.href = 'destinations.html', 2000);
        }
    } catch (error) {
        console.error('❌ Error loading itinerary:', error);
        console.error('❌ Error details:', error.message);
        showToast('Error loading itinerary', true);
        setTimeout(() => window.location.href = 'destinations.html', 2000);
    }
}

// ===== DISPLAY ITINERARY DETAILS =====
function displayItineraryDetails(itinerary) {
    console.log('✅ Displaying itinerary:', itinerary);

    // Helper function to safely set text
    const safeSetText = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        } else {
            console.warn(`⚠️ Element not found: ${id}`);
        }
    };

    // Title
    safeSetText('itineraryTitle', itinerary.title);

    const statusBadge = document.getElementById('approvalStatusBanner');
    if (statusBadge) {
        const publishStatus = itinerary.publishStatus || 'draft';
        const paymentStatus = itinerary.paymentStatus || 'closed';

        if (publishStatus === 'published' && paymentStatus === 'open') {
            statusBadge.className = 'publish-badge published';
            statusBadge.innerHTML = '<i class="fa fa-check-circle"></i> Available Now';
            statusBadge.style.display = 'inline-flex';
        } else {
            statusBadge.className = 'publish-badge coming-soon';
            statusBadge.innerHTML = '<i class="fa fa-hourglass-half"></i> Coming Soon';
            statusBadge.style.display = 'inline-flex';
        }
    }

    // Duration
    const durationText = `${itinerary.duration.days}D${itinerary.duration.nights}N`;
    safeSetText('itineraryDuration', durationText);

    // Location
    safeSetText('metaLocation', `${itinerary.destination.city}, ${itinerary.destination.country}`);

    // Min People
    const minPeopleText = itinerary.minPeople
        ? `${itinerary.minPeople}-${itinerary.maxBookings} people`
        : `Up to ${itinerary.maxBookings} people`;
    safeSetText('minPeople', minPeopleText);

    // Tour Type
    safeSetText('tourType', itinerary.tags?.[0] || 'Tour');

    // Gallery
    galleryImages = itinerary.galleryImages && itinerary.galleryImages.length > 0
        ? itinerary.galleryImages
        : [itinerary.coverImage];
    initializeGallery();
    setupGalleryNavigation();

    // Tags
    const tagsEl = document.getElementById('tagsList');
    if (tagsEl && itinerary.tags) {
        tagsEl.innerHTML = itinerary.tags.map(tag => `
            <span class="tag">${tag}</span>
        `).join('');
    }

    // Description
    safeSetText('itineraryDescription', itinerary.detailedDescription);

    const bestSeasonEl = document.getElementById('bestSeason');
    if (bestSeasonEl) {
        bestSeasonEl.textContent = itinerary.seasonSuitability === 'all-year' ? 'Year-round' : itinerary.seasonSuitability;
    }

    const suitableForEl = document.getElementById('suitableFor');
    if (suitableForEl && itinerary.suitableFor) {
        suitableForEl.textContent = itinerary.suitableFor.join(', ');
    }

    const pricePerPersonEl = document.getElementById('pricePerPerson');
    if (pricePerPersonEl) {
        pricePerPersonEl.textContent = `RM${itinerary.price.toLocaleString()}`;
    }

    // Highlights
    const highlightsEl = document.getElementById('highlightsList');
    if (highlightsEl && itinerary.highlights) {
        highlightsEl.innerHTML = itinerary.highlights
            .map(h => `<div class="highlight-item"><i class="fa fa-check-circle"></i> ${h}</div>`)
            .join('');
    }

    // Itinerary Days
    const detailsEl = document.getElementById('itineraryDetails');
    if (detailsEl && itinerary.days) {
        detailsEl.innerHTML = itinerary.days
            .map(day => `
                <div class="day-itinerary">
                    <div class="day-title">Day ${day.dayNumber}: ${day.title}</div>
                    <p class="day-description">${day.description}</p>
                    ${day.activities.map(act => `
                        <div class="activity">
                            <div class="activity-time">${act.time}</div>
                            <div class="activity-details">
                                <strong>${act.name}</strong>
                                <p>${act.description}</p>
                                ${act.cost && act.cost !== null ? `<span class="activity-cost">Cost: RM${act.cost}</span>` : '<span class="activity-cost">Free</span>'}
                                <span class="activity-category">${act.category}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `)
            .join('');
    }

    // Includes/Not Includes
    const includesEl = document.getElementById('includesList');
    if (includesEl && itinerary.includes) {
        includesEl.innerHTML = itinerary.includes.map(item => `
        <div class="include-item"><i class="fa fa-check-circle"></i> ${item}</div>
    `).join('');
    }

    const notIncludesEl = document.getElementById('notIncludesList');
    if (notIncludesEl && itinerary.notIncludes) {
        notIncludesEl.innerHTML = itinerary.notIncludes.map(item => `
        <div class="include-item"><i class="fa fa-times-circle"></i> ${item}</div>
    `).join('');
    }

    const packagePriceEl = document.getElementById('packagePrice');
    if (packagePriceEl) {
        packagePriceEl.textContent = itinerary.price.toLocaleString();
    }

    const tripDaysEl = document.getElementById('tripDays');
    if (tripDaysEl) {
        tripDaysEl.textContent = itinerary.duration.days;
    }

    const tripNightsEl = document.getElementById('tripNights');
    if (tripNightsEl) {
        tripNightsEl.textContent = itinerary.duration.nights;
    }

    const pricePerNightEl = document.getElementById('pricePerNight');
    if (pricePerNightEl && itinerary.duration.nights > 0) {
        const perNight = Math.round(itinerary.price / itinerary.duration.nights);
        pricePerNightEl.textContent = `RM${perNight.toLocaleString()}`;
    }

    const maxBookingsEl = document.getElementById('maxBookings');
    const maxBookings2El = document.getElementById('maxBookings2');
    if (maxBookingsEl) maxBookingsEl.textContent = itinerary.maxBookings;
    if (maxBookings2El) maxBookings2El.textContent = itinerary.maxBookings;

    const currentBookingsEl = document.getElementById('currentBookings');
    if (currentBookingsEl) {
        currentBookingsEl.textContent = itinerary.currentBookings;
    }

    // Populate pricing highlights from itinerary highlights
    const pricingHighlightsEl = document.getElementById('pricingHighlights');
    if (pricingHighlightsEl && itinerary.includes) {
        pricingHighlightsEl.innerHTML = itinerary.includes.slice(0, 6).map(item => `
        <li><i class="fa fa-check"></i> ${item}</li>
    `).join('');
    }

    // Hotel Location
    const hotelLocationEl = document.getElementById('hotelLocation');
    if (hotelLocationEl) {
        hotelLocationEl.textContent = itinerary.destination.city;
    }

    // Populate Hotel Table
    populateHotelTable(itinerary.hotel || null);

    initializeTabs();
    console.log('✅ Itinerary display complete');
}

function populateHotelTable(hotel) {
    const hotelTableBody = document.getElementById('hotelTableBody');

    if (!hotelTableBody) return;

    // NEW: Single hotel display
    if (!hotel || !hotel.name) {
        hotelTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fa fa-hotel" style="font-size: 48px; display: block; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>Hotel accommodation details will be available soon.</p>
                    <p style="font-size: 14px; margin-top: 8px;">Contact us for more information.</p>
                </td>
            </tr>
        `;
        return;
    }

    // Display single hotel as the package accommodation
    hotelTableBody.innerHTML = `
        <tr class="hotel-row ${hotel.category.toLowerCase()}">
            <td><span class="category-badge ${hotel.category.toLowerCase()}">${hotel.category}</span></td>
            <td><strong>${hotel.name}</strong></td>
            <td>${hotel.roomType}</td>
            <td class="price-cell">Included</td>
            <td><span class="rating">⭐ ${hotel.rating}</span></td>
        </tr>
        ${hotel.description ? `
        <tr>
            <td colspan="5" style="padding: 16px; background: var(--bg-light); border-top: 1px solid var(--border-color);">
                <div style="display: flex; align-items: start; gap: 16px;">
                    ${hotel.image ? `
                        <img src="${hotel.image}" alt="${hotel.name}" 
                             style="width: 120px; height: 80px; object-fit: cover; border-radius: 8px;">
                    ` : ''}
                    <div>
                        <p style="margin: 0; color: var(--text-dark); line-height: 1.6;">${hotel.description}</p>
                        ${hotel.location ? `
                            <p style="margin-top: 8px; color: var(--text-gray); font-size: 14px;">
                                <i class="fa fa-map-marker-alt"></i> ${hotel.location}
                            </p>
                        ` : ''}
                    </div>
                </div>
            </td>
        </tr>
        ` : ''}
    `;
}

// ===== GALLERY FUNCTIONS =====
function initializeGallery() {
    if (galleryImages.length > 0) {
        displayGalleryImage(0);
        displayThumbnails();
    }
}

function displayGalleryImage(index) {
    const mainImage = document.getElementById('mainGalleryImage');
    if (mainImage && galleryImages[index]) {
        mainImage.src = galleryImages[index];
        currentGalleryIndex = index;

        const thumbnails = document.querySelectorAll('.thumbnail');
        thumbnails.forEach((thumb, i) => {
            thumb.classList.toggle('active', i === index);
        });
    }
}

function displayThumbnails() {
    const container = document.getElementById('galleryThumbnails');
    if (!container) return;

    container.innerHTML = '';
    galleryImages.forEach((image, index) => {
        const thumb = document.createElement('div');
        thumb.className = `thumbnail ${index === 0 ? 'active' : ''}`;
        thumb.innerHTML = `<img src="${image}" alt="Gallery ${index + 1}">`;
        thumb.addEventListener('click', () => displayGalleryImage(index));
        container.appendChild(thumb);
    });
}

function setupGalleryNavigation() {
    const prevBtn = document.getElementById('prevGalleryBtn');
    const nextBtn = document.getElementById('nextGalleryBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentGalleryIndex = (currentGalleryIndex - 1 + galleryImages.length) % galleryImages.length;
            displayGalleryImage(currentGalleryIndex);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentGalleryIndex = (currentGalleryIndex + 1) % galleryImages.length;
            displayGalleryImage(currentGalleryIndex);
        });
    }
}

// ===== TAB FUNCTIONALITY WITH LAZY LOADING =====
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.querySelector(`.tab-content[data-tab="${tabName}"]`)?.classList.add('active');

            if (tabName === 'reviews' && !reviewsLoaded) {
                loadReviews();
                reviewsLoaded = true;
            }
        });
    });
}

// ===== LOAD REVIEWS =====
async function loadReviews() {
    if (!itineraryData || !itineraryData.id) {
        console.error('❌ Cannot load reviews: itineraryData.id is missing');
        console.log('📍 itineraryData:', itineraryData);
        return;
    }

    console.log('📍 Loading reviews for itinerary ID:', itineraryData.id);

    try {
        console.log('📍 Loading reviews for itinerary:', itineraryData.id);

        const reviewsRef = collection(db, 'itineraries', itineraryData.id, 'reviews');
        const reviewsQuery = query(reviewsRef, orderBy('createdAt', 'desc'));
        const reviewsSnapshot = await getDocs(reviewsQuery);

        allReviews = [];
        reviewsSnapshot.forEach((doc) => {
            allReviews.push({ id: doc.id, ...doc.data() });
        });

        console.log('✅ Loaded', allReviews.length, 'reviews');

        displayReviewsOverview();
        displayReviews(allReviews);

    } catch (error) {
        console.error('❌ Error loading reviews:', error);
        displayReviewsOverview();
        displayReviews([]);
    }
}

// ===== DISPLAY REVIEWS OVERVIEW =====
function displayReviewsOverview() {
    const averageRatingEl = document.getElementById('averageRating');
    const averageStarsEl = document.getElementById('averageStars');
    const totalReviewsEl = document.getElementById('totalReviews');
    const reviewCountEl = document.getElementById('reviewCount');
    const ratingBreakdownEl = document.getElementById('ratingBreakdown');

    if (!averageRatingEl || !averageStarsEl || !totalReviewsEl || !reviewCountEl || !ratingBreakdownEl) {
        console.log('⏳ Review elements not loaded yet');
        return;
    }

    if (allReviews.length === 0) {
        averageRatingEl.textContent = '0.0';
        averageStarsEl.innerHTML = '';
        totalReviewsEl.textContent = 'No reviews yet';
        reviewCountEl.textContent = '0';
        ratingBreakdownEl.innerHTML = '<p>Be the first to review!</p>';
        return;
    }

    const totalStars = allReviews.reduce((sum, review) => sum + review.rating, 0);
    const average = (totalStars / allReviews.length).toFixed(1);

    averageRatingEl.textContent = average;
    averageStarsEl.innerHTML = generateStars(parseFloat(average));
    totalReviewsEl.textContent = `${allReviews.length} review${allReviews.length !== 1 ? 's' : ''}`;
    reviewCountEl.textContent = allReviews.length;

    const breakdown = [5, 4, 3, 2, 1].map(star => {
        const count = allReviews.filter(r => r.rating === star).length;
        const percentage = (count / allReviews.length) * 100;
        return { star, count, percentage };
    });

    ratingBreakdownEl.innerHTML = breakdown.map(item => `
        <div class="rating-bar">
            <span class="rating-bar-label">${item.star} ★</span>
            <div class="rating-bar-fill">
                <div class="rating-bar-inner" style="width: ${item.percentage}%"></div>
            </div>
            <span class="rating-bar-count">(${item.count})</span>
        </div>
    `).join('');
}

// ===== DISPLAY REVIEWS - WITH EDIT/DELETE BUTTONS =====
function displayReviews(reviews) {
    const reviewsList = document.getElementById('reviewsList');

    if (!reviewsList) {
        console.log('⏳ Reviews list element not loaded yet');
        return;
    }

    if (reviews.length === 0) {
        reviewsList.innerHTML = '<p style="text-align: center; color: #6B7280; padding: 40px;">No reviews match your filter.</p>';
        return;
    }

    reviewsList.innerHTML = reviews.map(review => {
        const isOwnReview = currentUser && review.userId === currentUser.uid;

        const avatarHTML = review.userPhotoURL
            ? `<img src="${review.userPhotoURL}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="${review.userName}">`
            : review.userName.charAt(0).toUpperCase();

        return `
            <div class="review-item">
                <div class="review-header">
                    <div class="reviewer-info">
                        <div class="reviewer-avatar">${avatarHTML}</div>
                        <div class="reviewer-details">
                            <h4>${review.userName}</h4>
                            <span class="review-date">${new Date(review.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="review-rating">${generateStars(review.rating)}</div>
                        ${isOwnReview ? `
                            <div class="review-actions">
                                <button class="btn-icon" onclick="editReview('${review.id}')" title="Edit review">
                                    <i class="fa fa-edit"></i>
                                </button>
                                <button class="btn-icon btn-icon-danger" onclick="deleteReview('${review.id}')" title="Delete review">
                                    <i class="fa fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <p class="review-text">${review.text}</p>
                ${review.photos && review.photos.length > 0 ? `
                    <div class="review-photos">
                        ${review.photos.map(photo => `
                            <img src="${photo}" class="review-photo" onclick="openPhotoModal('${photo}')" alt="Review photo">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// ===== GENERATE STARS =====
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';

    for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
            stars += '<i class="fa fa-star"></i>';
        } else if (i === fullStars && hasHalfStar) {
            stars += '<i class="fa fa-star-half-alt"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }

    return stars;
}

// ===== FILTER REVIEWS =====
window.filterReviews = function (rating) {
    if (rating === 'all') {
        displayReviews(allReviews);
    } else {
        const filtered = allReviews.filter(r => r.rating === parseInt(rating));
        displayReviews(filtered);
    }
}

// ===== SETUP STAR RATING INPUT =====
function setupStarRating() {
    const stars = document.querySelectorAll('#starRatingInput i');

    if (stars.length === 0) {
        console.warn('⚠️ Star rating elements not found');
        return;
    }

    stars.forEach(star => {
        // Remove old listeners by cloning
        const newStar = star.cloneNode(true);
        star.parentNode.replaceChild(newStar, star);
    });

    // Re-select after cloning
    const newStars = document.querySelectorAll('#starRatingInput i');

    newStars.forEach(star => {
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.rating);
            document.getElementById('ratingValue').value = selectedRating;

            newStars.forEach((s, index) => {
                if (index < selectedRating) {
                    s.classList.add('active');
                    s.style.color = '#F39C12';
                } else {
                    s.classList.remove('active');
                    s.style.color = '#E0E6ED';
                }
            });
        });

        star.addEventListener('mouseenter', () => {
            const hoverRating = parseInt(star.dataset.rating);
            newStars.forEach((s, index) => {
                if (index < hoverRating) {
                    s.style.color = '#F39C12';
                } else {
                    s.style.color = '#E0E6ED';
                }
            });
        });
    });

    const ratingInput = document.getElementById('starRatingInput');
    if (ratingInput) {
        ratingInput.addEventListener('mouseleave', () => {
            newStars.forEach((s, index) => {
                if (index < selectedRating) {
                    s.style.color = '#F39C12';
                } else {
                    s.style.color = '#E0E6ED';
                }
            });
        });
    }
}

// === INLINE REVIEW FORM TOGGLE ===
window.toggleReviewForm = function () {
    if (!currentUser) {
        showToast('Please log in to write a review', true);
        return;
    }
    const formContainer = document.getElementById('reviewFormContainer');
    const toggleBtn = document.getElementById('toggleReviewFormBtn');

    if (formContainer.style.display === 'none' || formContainer.style.display === '') {
        formContainer.style.display = 'block';
        toggleBtn.innerHTML = '<i class="fa fa-times"></i> Cancel';
        setupStarRating();
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        formContainer.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fa fa-pen"></i> Write a Review';
        resetReviewForm();
    }
};

// ===== RESET REVIEW FORM =====
function resetReviewForm() {
    const form = document.getElementById('reviewForm');
    if (form) {
        form.reset();
        form.removeAttribute('data-edit-id');
    }

    selectedRating = 0;
    uploadedPhotos = [];

    const reviewText = document.getElementById('reviewText');
    if (reviewText) reviewText.value = '';

    const photoInput = document.getElementById('reviewPhotos');
    if (photoInput) photoInput.value = '';

    const photoPreview = document.getElementById('photoPreview');
    if (photoPreview) photoPreview.innerHTML = '';

    const stars = document.querySelectorAll('#starRatingInput i');
    stars.forEach(star => {
        star.classList.remove('active');
        star.style.color = '#E0E6ED';
    });

    const ratingValue = document.getElementById('ratingValue');
    if (ratingValue) ratingValue.value = '';

    const formTitle = document.getElementById('reviewFormTitle');
    if (formTitle) formTitle.textContent = 'Write Your Review';

    const submitBtn = document.getElementById('submitReviewBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> Submit Review';
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM Content Loaded - itinerary_details.js');

    // Profile Dropdown
    const profileTrigger = document.querySelector('.profile-trigger');
    const profileDropdown = document.getElementById('profileDropdown');
    const logoutButton = document.getElementById('logoutButton');

    if (profileTrigger && profileDropdown) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });

        document.addEventListener('click', () => profileDropdown.classList.remove('active'));
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // Review Form Toggle Button - REMOVE INLINE onclick, use JS only
    const toggleBtn = document.getElementById('toggleReviewFormBtn');
    if (toggleBtn) {
        console.log('✅ Found toggleReviewFormBtn');
        // Remove any existing onclick
        toggleBtn.onclick = null;
        // Add our event listener
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖱️ Toggle button clicked');
            window.toggleReviewForm();
        });
    } else {
        console.warn('⚠️ toggleReviewFormBtn not found');
    }

    // Photo Upload in Review Form
    const photoInput = document.getElementById('reviewPhotos');
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);

            if (files.length + uploadedPhotos.length > 5) {
                showToast('Maximum 5 photos allowed', true);
                e.target.value = ''; // Reset input
                return;
            }

            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedPhotos.push(e.target.result);
                    displayPhotoPreview();
                };
                reader.readAsDataURL(file);
            });
        });
    }

    const reviewForm = document.getElementById('reviewForm');
    if (reviewForm) {
        reviewForm.addEventListener('submit', window.submitReview);
        console.log('✅ Review form submit listener attached');
    } else {
        console.warn('⚠️ reviewForm not found');
    }

    // Initialize page
    console.log('📍 Loading itinerary details...');
    loadItineraryDetails();
});

function displayPhotoPreview() {
    const preview = document.getElementById('photoPreview');
    if (!preview) return;

    preview.innerHTML = uploadedPhotos.map((photo, index) => `
        <div class="photo-preview-item">
            <img src="${photo}" alt="Preview ${index + 1}">
            <button type="button" class="remove-photo" onclick="removePhoto(${index})">
                <i class="fa fa-times"></i>
            </button>
        </div>
    `).join('');
}

window.removePhoto = function (index) {
    uploadedPhotos.splice(index, 1);
    displayPhotoPreview();
};

// Cancel button
const cancelBtn = document.getElementById('cancelReviewBtn');
if (cancelBtn) {
    cancelBtn.addEventListener('click', window.toggleReviewForm);
}

// Form submit
const reviewForm = document.getElementById('reviewForm');
if (reviewForm) {
    reviewForm.addEventListener('submit', window.submitReview);
}

// Character counter for textarea
const reviewTextarea = document.getElementById('reviewText');
if (reviewTextarea) {
    reviewTextarea.addEventListener('input', (e) => {
        const charCounter = document.querySelector('.char-counter');
        if (charCounter) {
            const length = e.target.value.length;
            charCounter.textContent = `${length}/1000`;

            if (length > 900) {
                charCounter.style.color = 'var(--color-error)';
            } else {
                charCounter.style.color = 'var(--text-tertiary)';
            }
        }
    });
}

// ===== TOGGLE REVIEW FORM (SINGLE DEFINITION) =====
window.toggleReviewForm = function () {
    console.log('🔍 toggleReviewForm called');
    console.log('👤 Current user:', currentUser);

    if (!currentUser) {
        showToast('Please log in to write a review', true);
        return;
    }

    const formContainer = document.getElementById('reviewFormContainer');
    const toggleBtn = document.getElementById('toggleReviewFormBtn');

    if (!formContainer) {
        console.error('❌ reviewFormContainer not found in DOM');
        return;
    }

    if (!toggleBtn) {
        console.error('❌ toggleReviewFormBtn not found in DOM');
        return;
    }

    const isHidden = formContainer.style.display === 'none' || formContainer.style.display === '';
    console.log('📦 Form currently hidden?', isHidden);

    if (isHidden) {
        // Show form
        formContainer.style.display = 'block';
        toggleBtn.innerHTML = '<i class="fa fa-times"></i> Cancel';
        setupStarRating();

        setTimeout(() => {
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);

        console.log('✅ Review form shown');
    } else {
        // Hide form
        formContainer.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fa fa-pen"></i> Write a Review';
        resetReviewForm();

        console.log('✅ Review form hidden');
    }
};

// ===== SUBMIT REVIEW - WITH USER PROFILE DATA =====
window.submitReview = async function (event) {
    event.preventDefault();

    console.log('📝 Submit review called');
    console.log('👤 Current user:', currentUser);
    console.log('⭐ Selected rating:', selectedRating);

    if (!currentUser) {
        showToast('Please log in to submit a review', true);
        return;
    }

    if (selectedRating === 0) {
        showToast('Please select a rating', true);
        return;
    }

    if (!itineraryData || !itineraryData.id) {
        console.error('❌ Cannot submit review: itineraryData.id is missing');
        showToast('Error: Itinerary data not loaded', true);
        return;
    }

    const submitBtn = document.getElementById('submitReviewBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Submitting...';
    }

    try {
        const reviewText = document.getElementById('reviewText').value;
        const editId = document.getElementById('reviewForm').getAttribute('data-edit-id');

        const firstName = userProfile?.firstName || '';
        const lastName = userProfile?.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || currentUser.displayName || currentUser.email.split('@')[0];

        const reviewData = {
            userId: currentUser.uid,
            userName: fullName,
            userPhotoURL: userProfile?.profilePhotoURL || '',
            rating: selectedRating,
            text: reviewText,
            photos: uploadedPhotos,
            createdAt: editId ? allReviews.find(r => r.id === editId).createdAt : Date.now(),
            updatedAt: Date.now()
        };

        console.log('💾 Saving review:', reviewData);
        console.log('📍 Path:', `itineraries/${itineraryData.id}/reviews`);

        if (editId) {
            const reviewRef = doc(db, 'itineraries', itineraryData.id, 'reviews', editId);
            await updateDoc(reviewRef, reviewData);
            showToast('Review updated successfully!', false);
        } else {
            const reviewsRef = collection(db, 'itineraries', itineraryData.id, 'reviews');
            await addDoc(reviewsRef, reviewData);
            showToast('Review submitted successfully!', false);
        }

        // Hide form and reset
        window.toggleReviewForm();
        await loadReviews();

    } catch (error) {
        console.error('❌ Error submitting review:', error);
        showToast('Error submitting review: ' + error.message, true);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> Submit Review';
        }
    }
};

// ===== EDIT REVIEW =====
window.editReview = async function (reviewId) {
    const review = allReviews.find(r => r.id === reviewId);
    if (!review) return;

    // Show form if hidden
    const formContainer = document.getElementById('reviewFormContainer');
    if (formContainer.style.display === 'none' || formContainer.style.display === '') {
        window.toggleReviewForm();
    }

    document.getElementById('reviewText').value = review.text;
    selectedRating = review.rating;
    uploadedPhotos = review.photos || [];

    const stars = document.querySelectorAll('#starRatingInput i');
    stars.forEach((s, index) => {
        if (index < selectedRating) {
            s.classList.add('active');
            s.style.color = '#F39C12';
        } else {
            s.classList.remove('active');
            s.style.color = '#E0E6ED';
        }
    });

    displayPhotoPreview();

    document.getElementById('reviewForm').setAttribute('data-edit-id', reviewId);
    document.getElementById('reviewFormTitle').textContent = 'Edit Your Review';
    document.getElementById('submitReviewBtn').innerHTML = '<i class="fa fa-save"></i> Update Review';

    setupStarRating();

    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// ===== DELETE REVIEW =====
window.deleteReview = async function (reviewId) {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
        const reviewRef = doc(db, 'itineraries', itineraryData.id, 'reviews', reviewId);
        await deleteDoc(reviewRef);
        showToast('Review deleted successfully', false);
        await loadReviews();
    } catch (error) {
        console.error('❌ Error deleting review:', error);
        showToast('Error deleting review', true);
    }
};

window.openPhotoModal = function (photoUrl) {
    window.open(photoUrl, '_blank');
}

// ===== USER PROFILE UI =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameElement || !profileAvatarElement || !profileDropdown) return;

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'User';

        profileNameElement.textContent = fullName;
        profileAvatarElement.innerHTML = '';

        if (userData.profilePhotoURL) {
            const img = document.createElement('img');
            img.src = userData.profilePhotoURL;
            img.alt = `${fullName}'s profile picture`;
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
            profileAvatarElement.appendChild(img);
        } else {
            const firstInitial = firstName ? firstName[0].toUpperCase() : '';
            const lastInitial = lastName ? lastName[0].toUpperCase() : '';
            const initials = `${firstInitial}${lastInitial}` || 'U';
            profileAvatarElement.textContent = initials;
        }

        profileDropdown.style.display = 'flex';
    } else {
        profileDropdown.style.display = 'none';
    }
}

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
        logoutButton.addEventListener('click', handleLogout);
    }
}

// ===== AUTH OBSERVER =====
observeAuthState(async (user) => {
    currentUser = user;
    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                const userData = docSnap.data();
                if (userData.profilePhotoURL) {
                    userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                }
                userProfile = userData;
                updateUserProfileUI(userData);
                await checkUserInterestStatus();
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        }
    } else {
        window.location.href = 'login.html';
    }
});
