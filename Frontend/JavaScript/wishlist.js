import { db, auth } from './firebase-config.js';
import { 
    doc, getDoc, collection, getDocs, setDoc, updateDoc, deleteDoc,
    serverTimestamp, increment, arrayUnion, arrayRemove, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

let currentUser = null;
let wishlistItems = [];

// ===== CALCULATE TIME REMAINING =====
function getTimeRemaining(deadline) {
    if (!deadline) return null;
    const now = new Date().getTime();
    const deadlineTime = deadline.toDate().getTime();
    const remaining = deadlineTime - now;
    if (remaining <= 0) return { expired: true };
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return { days, hours, expired: false };
}

function formatTimeRemaining(timeData) {
    if (!timeData || timeData.expired) return 'Expired';
    const { days, hours } = timeData;
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
}

// ===== LOAD WISHLIST FROM FIRESTORE =====
async function loadWishlist() {
    if (!currentUser) {
        console.log('⏳ No user logged in');
        return;
    }
    try {
        const interestsRef = collection(db, 'users', currentUser.uid, 'interests');
        const snapshot = await getDocs(interestsRef);
        wishlistItems = [];
        for (const docSnap of snapshot.docs) {
            const item = docSnap.data();
            const hasPaid = item.status === 'paid' || item.purchasedAt !== null;
            if (hasPaid) continue;
            const itineraryRef = doc(db, 'itineraries', item.itineraryId);
            const itinerarySnap = await getDoc(itineraryRef);
            if (itinerarySnap.exists()) {
                const itineraryData = itinerarySnap.data();
                item.paymentEnabled = itineraryData.paymentEnabled || false;
                item.paymentDeadline = itineraryData.paymentDeadline || null;
                item.interestCount = itineraryData.interestCount || 0;
                item.approvalThreshold = itineraryData.interestThreshold ?? 10;
                item.tripStatus = itineraryData.status || 'active';
                item.city = itineraryData.destination?.city || '';
                item.image = itineraryData.coverImage || '';
                item.price = itineraryData.price || 0;
                item.duration = itineraryData.duration 
                    ? `${itineraryData.duration.days}D${itineraryData.duration.nights}N` 
                    : '';
                item.description = itineraryData.shortSummary || '';
                item.title = itineraryData.title || '';
            }
            item.wishlistItemId = item.interestId;
            item.interestExpressedAt = item.expressedInterestAt;
            wishlistItems.push(item);
        }
        displayWishlist();
        updateWishlistSummary();
    } catch (error) {
        console.error('❌ Error loading wishlist:', error);
        wishlistItems = [];
        displayWishlist();
    }
}

// ===== DISPLAY WISHLIST ITEMS =====
function displayWishlist() {
    const wishlistItemsList = document.getElementById('wishlistItemsList');
    const emptyWishlist = document.getElementById('emptyWishlist');
    const wishlistActionSection = document.getElementById('wishlistActionSection');
    const wishlistCount = document.getElementById('wishlistCount');

    wishlistCount.textContent = `${wishlistItems.length} ${wishlistItems.length === 1 ? 'item' : 'items'}`;
    if (wishlistItems.length === 0) {
        emptyWishlist.style.display = 'block';
        wishlistItemsList.innerHTML = '';
        wishlistActionSection.style.display = 'none';
        return;
    } else {
        emptyWishlist.style.display = 'none';
        wishlistActionSection.style.display = 'block';
    }

    wishlistItemsList.innerHTML = wishlistItems.map((item, index) => {
        const interestCount = item.interestCount || 0;
        const threshold = item.approvalThreshold ?? 10;
        const paymentEnabled = item.paymentEnabled || false;
        const isCancelled = item.tripStatus === 'cancelled';
        const timeRemaining = item.paymentDeadline ? getTimeRemaining(item.paymentDeadline) : null;
        const paymentExpired = timeRemaining && timeRemaining.expired;
        const canPay = paymentEnabled && !paymentExpired && !isCancelled;

        let statusBadge = '', statusClass = '';
        if (isCancelled) {
            statusBadge = '<span class="status-badge" style="background: rgba(231, 76, 60, 0.1); color: #e74c3c;">❌ Trip Cancelled</span>';
            statusClass = 'item-cancelled';
        } else if (canPay) {
            statusBadge = `<span class="status-badge status-available">💳 Payment Available ${timeRemaining ? `- ${formatTimeRemaining(timeRemaining)}` : ''}</span>`;
            statusClass = 'item-available';
        } else if (paymentExpired) {
            statusBadge = '<span class="status-badge" style="background: rgba(149, 165, 166, 0.1); color: #95a5a6;">⏰ Payment Deadline Expired</span>';
            statusClass = 'item-expired';
        } else {
            statusBadge = '<span class="status-badge status-pending">⏳ Interest Expressed</span>';
            statusClass = 'item-pending';
        }

        return `
            <div class="wishlist-item ${statusClass}">
                <img src="${item.image}" alt="${item.title || item.city}" class="wishlist-item-image">
                <div class="wishlist-item-details">
                    <h3 class="wishlist-item-title">${item.title || item.city}</h3>
                    ${statusBadge}
                    <div class="wishlist-item-info">
                        <div class="info-row"><i class="fa fa-map-marker-alt"></i><span>${item.city}</span></div>
                        <div class="info-row"><i class="fa fa-clock"></i><span>${item.duration}</span></div>
                        <div class="info-row"><i class="fa fa-tag"></i><span>RM${item.price?.toLocaleString() || ""}</span></div>
                    </div>
                    ${item.description ? `<p class="wishlist-item-description">${item.description.substring(0, 120)}...</p>` : ''}
                    ${!isCancelled ? `
                        <div class="interest-progress" style="margin: 16px 0;">
                            <p class="interest-text">
                                <i class="fa fa-users"></i> ${interestCount}/${threshold} people interested
                            </p>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${Math.min((interestCount / threshold) * 100, 100)}%"></div>
                            </div>
                            ${!paymentEnabled ? '<p class="waiting-text">We\'ll notify you when payment is available!</p>' : ''}
                        </div>
                    ` : ''}
                    <div class="wishlist-item-actions">
                        ${canPay ? `
                            <button class="btn-purchase" data-itinerary-id="${item.itineraryId}" data-wishlist-id="${item.wishlistItemId}">
                                <i class="fa fa-credit-card"></i> Pay Now - RM${item.price.toLocaleString()}
                            </button>
                        ` : ''}
                        <button class="btn-view" onclick="window.location.href='itineraryDetails.html?id=${item.itineraryId}'">
                            <i class="fa fa-eye"></i> View Details
                        </button>
                        <button class="btn-remove" data-index="${index}">
                            <i class="fa fa-trash"></i> Remove
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Add button listeners
    document.querySelectorAll('.btn-purchase').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itineraryId = e.currentTarget.getAttribute('data-itinerary-id');
            const wishlistId = e.currentTarget.getAttribute('data-wishlist-id');
            purchaseItinerary(itineraryId, wishlistId);
        });
    });
    document.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            await removeFromWishlist(index);
        });
    });
}

// ===== PURCHASE ITINERARY =====
function purchaseItinerary(itineraryId, wishlistId) {
    sessionStorage.setItem('purchaseItinerary', JSON.stringify({
        itineraryId,
        wishlistItemId: wishlistId
    }));
    window.location.href = 'itineraryCheckout.html';
}

// ===== REMOVE FROM WISHLIST =====
async function removeFromWishlist(index) {
    if (!currentUser) return;
    const item = wishlistItems[index];
    const confirmed = confirm(`Remove "${item.title || item.city}" from your wishlist?`);
    if (!confirmed) return;
    
    try {
        // Delete from user's interests subcollection
        const interestItemRef = doc(db, 'users', currentUser.uid, 'interests', item.wishlistItemId);
        await deleteDoc(interestItemRef);
        
        // Only update itinerary if it still exists
        if (!item.isDeleted) {
            try {
                const itineraryRef = doc(db, 'itineraries', item.itineraryId);
                const itinerarySnap = await getDoc(itineraryRef);
                
                if (itinerarySnap.exists()) {
                    await updateDoc(itineraryRef, {
                        interestCount: increment(-1),
                        interestedUsers: arrayRemove(currentUser.uid)
                    });
                }
            } catch (updateError) {
                console.log('⚠️ Itinerary already deleted, skipping update');
            }
        }
        
        showToast(`Removed "${item.title || item.city}" from wishlist`, false);
        wishlistItems.splice(index, 1);
        displayWishlist();
        updateWishlistSummary();
    } catch (error) {
        console.error('❌ Error removing from wishlist:', error);
        showToast('Failed to remove from wishlist', true);
    }
}

// ===== UPDATE WISHLIST SUMMARY =====
function updateWishlistSummary() {
    const totalItemsEl = document.getElementById('totalItems');
    const availableItemsEl = document.getElementById('availableItems');
    const pendingItemsEl = document.getElementById('pendingItems');
    if (!totalItemsEl || !availableItemsEl || !pendingItemsEl) return;
    const totalItems = wishlistItems.length;
    const availableItems = wishlistItems.filter(item => {
        const timeRemaining = item.paymentDeadline ? getTimeRemaining(item.paymentDeadline) : null;
        const paymentExpired = timeRemaining && timeRemaining.expired;
        return item.paymentEnabled && !paymentExpired;
    }).length;
    const pendingItems = wishlistItems.filter(item => !item.paymentEnabled).length;
    totalItemsEl.textContent = totalItems;
    availableItemsEl.textContent = availableItems;
    pendingItemsEl.textContent = pendingItems;
}

// ===== USER PROFILE UI & RELATED =====
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
            profileAvatarElement.textContent = `${firstInitial}${lastInitial}` || 'U';
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
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
}

document.addEventListener('DOMContentLoaded', () => {
    setupProfileDropdown();
});

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
                updateUserProfileUI(userData);
            }
            await loadWishlist();
        } catch (error) {
            console.error("Error fetching user data:", error);
        }
    } else {
        window.location.href = 'login.html';
    }
});
