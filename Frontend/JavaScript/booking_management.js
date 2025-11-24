import { db, auth } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState } from './auth.js';

let currentItineraryId = null;
let allBookings = [];

// ===== GET ITINERARY ID FROM URL =====
function getItineraryIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('itineraryId');
    console.log('📍 Itinerary ID from URL:', id);
    return id;
}

// ===== SHOW TOAST =====
function showToast(message, isError = false) {
    console.log(`🔔 Toast: ${message}`);
    const toast = document.getElementById('messageToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `message-toast ${isError ? 'error' : 'success'}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ===== LOAD ITINERARY INFO =====
async function loadItineraryInfo() {
    try {
        console.log('🔍 Loading itinerary info for:', currentItineraryId);
        const itineraryRef = doc(db, 'itineraries', currentItineraryId);
        const itinerarySnap = await getDoc(itineraryRef);
        
        if (itinerarySnap.exists()) {
            const data = itinerarySnap.data();
            console.log('✅ Itinerary data loaded:', data);
            
            document.getElementById('itineraryTitle').textContent = `Bookings: ${data.title}`;
            document.getElementById('itinerarySubtitle').textContent = 
                `${data.destination?.city}, ${data.destination?.country} • ${data.duration?.days}D ${data.duration?.nights}N`;
            
            const currentBookings = data.currentBookings || 0;
            const maxBookings = data.maxBookings || 20;
            document.getElementById('capacityStatus').textContent = `${currentBookings}/${maxBookings}`;
        } else {
            console.error('❌ Itinerary not found');
            showToast('Itinerary not found', true);
        }
    } catch (error) {
        console.error('❌ Error loading itinerary info:', error);
        showToast('Error loading itinerary info: ' + error.message, true);
    }
}

// ===== LOAD ALL BOOKINGS =====
async function loadBookings() {
    try {
        console.log('📦 Starting to load bookings for itinerary:', currentItineraryId);
        showLoadingState();

        // Query all users' bookings subcollections
        const usersRef = collection(db, 'users');
        console.log('👥 Fetching all users...');
        const usersSnap = await getDocs(usersRef);
        
        console.log(`✅ Found ${usersSnap.size} users to check`);
        
        allBookings = [];
        let totalRevenue = 0;
        let confirmedCount = 0;
        let usersChecked = 0;

        for (const userDoc of usersSnap.docs) {
            usersChecked++;
            console.log(`🔍 Checking user ${usersChecked}/${usersSnap.size}: ${userDoc.id}`);
            
            try {
                const bookingsRef = collection(db, 'users', userDoc.id, 'bookings');
                
                // Query WITHOUT orderBy to avoid composite index requirement
                const q = query(
                    bookingsRef,
                    where('itineraryId', '==', currentItineraryId)
                );
                
                const bookingsSnap = await getDocs(q);
                
                if (bookingsSnap.size > 0) {
                    console.log(`  ✅ User ${userDoc.id}: Found ${bookingsSnap.size} booking(s)`);
                }
                
                bookingsSnap.forEach(bookingDoc => {
                    const bookingData = { 
                        id: bookingDoc.id, 
                        userId: userDoc.id,
                        ...bookingDoc.data() 
                    };
                    allBookings.push(bookingData);
                    
                    totalRevenue += bookingData.totalPrice || 0;
                    if (bookingData.status === 'confirmed') {
                        confirmedCount++;
                    }
                });
            } catch (userError) {
                console.warn(`⚠️ Error querying bookings for user ${userDoc.id}:`, userError);
                // Continue with next user
            }
        }

        // Sort bookings by date in JavaScript (newest first)
        allBookings.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });

        console.log(`✅ TOTAL BOOKINGS FOUND: ${allBookings.length}`);
        console.log('📊 Bookings data:', allBookings);
        console.log(`💰 Total Revenue: RM ${totalRevenue}`);
        console.log(`✔️ Confirmed: ${confirmedCount}`);

        // Update stats
        document.getElementById('totalBookings').textContent = allBookings.length;
        document.getElementById('confirmedBookings').textContent = confirmedCount;
        document.getElementById('totalRevenue').textContent = `RM ${totalRevenue.toLocaleString()}`;

        displayBookings();

    } catch (error) {
        console.error('❌❌❌ FATAL ERROR loading bookings:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        showToast('Error loading bookings: ' + error.message, true);
        hideLoadingState();
    }
}

// ===== DISPLAY BOOKINGS =====
function displayBookings() {
    console.log('🎨 Displaying bookings...');
    hideLoadingState();

    const tableBody = document.getElementById('bookingsTableBody');
    const bookingsTable = document.getElementById('bookingsTable');
    const emptyState = document.getElementById('emptyState');

    if (allBookings.length === 0) {
        console.log('📭 No bookings to display - showing empty state');
        bookingsTable.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    console.log(`✅ Displaying ${allBookings.length} bookings in table`);
    emptyState.style.display = 'none';
    bookingsTable.style.display = 'block';

    tableBody.innerHTML = allBookings.map(booking => {
        const bookingDate = booking.createdAt?.toDate().toLocaleDateString() || 'N/A';
        const statusClass = booking.status === 'confirmed' ? 'status-confirmed' : 'status-pending';
        
        return `
            <tr>
                <td><strong>${booking.bookingId}</strong></td>
                <td>${booking.firstName} ${booking.lastName}</td>
                <td>${booking.email}</td>
                <td>${booking.phone}</td>
                <td><span class="badge badge-blue">${booking.numberOfPeople} people</span></td>
                <td><strong>RM ${booking.totalPrice.toLocaleString()}</strong></td>
                <td><span class="badge badge-gray">${booking.paymentMethod}</span></td>
                <td>${bookingDate}</td>
                <td><span class="status-badge ${statusClass}">${booking.status}</span></td>
            </tr>
        `;
    }).join('');
}

// ===== EXPORT TO CSV =====
function exportToCSV() {
    if (allBookings.length === 0) {
        showToast('No bookings to export', true);
        return;
    }

    const headers = ['Booking ID', 'First Name', 'Last Name', 'Email', 'Phone', 'People', 'Price Per Person', 'Subtotal', 'Service Fee', 'Total Price', 'Payment Method', 'Status', 'Booking Date'];
    
    const rows = allBookings.map(booking => [
        booking.bookingId,
        booking.firstName,
        booking.lastName,
        booking.email,
        booking.phone,
        booking.numberOfPeople,
        booking.pricePerPerson,
        booking.subtotal,
        booking.serviceFee,
        booking.totalPrice,
        booking.paymentMethod,
        booking.status,
        booking.createdAt?.toDate().toLocaleString() || 'N/A'
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings_${currentItineraryId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('Bookings exported successfully!', false);
}

// ===== LOADING STATES =====
function showLoadingState() {
    console.log('⏳ Showing loading state');
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) loadingEl.style.display = 'block';
}

function hideLoadingState() {
    console.log('✅ Hiding loading state');
    const loadingEl = document.getElementById('loadingState');
    if (loadingEl) loadingEl.style.display = 'none';
}

// ===== UPDATE USER PROFILE UI =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'Admin';

        if (profileNameElement) profileNameElement.textContent = fullName;

        if (profileAvatarElement) {
            profileAvatarElement.innerHTML = '';
            if (userData.profilePhotoURL) {
                const img = document.createElement('img');
                img.src = userData.profilePhotoURL;
                img.alt = fullName;
                img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
                profileAvatarElement.appendChild(img);
            } else {
                const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'A';
                profileAvatarElement.textContent = initials;
            }
        }

        if (profileDropdown) profileDropdown.style.display = 'flex';
    }
}

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Page loaded - Initializing booking management...');
    
    currentItineraryId = getItineraryIdFromURL();
    
    if (!currentItineraryId) {
        console.error('❌ No itinerary ID in URL');
        showToast('No itinerary specified', true);
        setTimeout(() => window.location.href = 'itineraryHub.html', 2000);
        return;
    }

    console.log('✅ Itinerary ID set:', currentItineraryId);

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
        console.log('✅ Export button listener attached');
    }

    // Profile dropdown
    const profileTrigger = document.getElementById('profileTrigger');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if (profileTrigger) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
        console.log('✅ Profile dropdown listener attached');
    }

    document.addEventListener('click', () => {
        if (profileDropdown) profileDropdown.classList.remove('active');
    });

    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await auth.signOut();
            window.location.href = 'login.html';
        });
        console.log('✅ Logout button listener attached');
    }
});

// ===== AUTH STATE =====
observeAuthState(async (user) => {
    console.log('🔐 Auth state changed:', user ? `User: ${user.uid}` : 'No user');
    
    if (!user) {
        console.log('❌ No user logged in - redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    try {
        console.log('👤 Fetching user data...');
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const userRole = userData.role?.toLowerCase();
            console.log('✅ User data loaded. Role:', userRole);

            if (userRole !== 'admin' && userRole !== 'superadmin') {
                console.error('❌ Access denied - not an admin');
                showToast('Access denied', true);
                setTimeout(() => window.location.href = 'home.html', 2000);
                return;
            }

            console.log('✅ Admin access granted');
            updateUserProfileUI(userData);
            
            console.log('📥 Starting to load itinerary info and bookings...');
            await loadItineraryInfo();
            await loadBookings();
            console.log('✅✅ All data loaded successfully!');
        } else {
            console.error('❌ User document does not exist');
            showToast('User data not found', true);
        }
    } catch (error) {
        console.error('❌❌❌ ERROR in auth state handler:', error);
        console.error('Error details:', error.message);
        showToast('Error loading data: ' + error.message, true);
        hideLoadingState();
    }
});
