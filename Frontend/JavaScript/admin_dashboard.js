import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, getIdToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleLogout } from './auth.js';
import { showToast } from './utils.js';

// --- Global Variables ---
let currentUserRole = null;
let currentAuthToken = null;
let destinationsChartInstance = null;
let registrationsChartInstance = null;
let currentPeriod = 'week';

// --- UI Utility Functions ---
function getInitials(firstName = '', lastName = '') {
    const firstInitial = firstName ? firstName[0].toUpperCase() : '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';
    return `${firstInitial}${lastInitial}` || 'A';
}

function updateHeaderUI(userData) {
    const profileNameEl = document.getElementById('profileName');
    const profileAvatarEl = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameEl || !profileAvatarEl || !profileDropdown) {
        console.warn("Header profile elements not found.");
        return;
    }

    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    profileNameEl.textContent = `${firstName} ${lastName}`.trim() || 'Admin';

    const photoURL = userData.profilePhotoURL;
    profileAvatarEl.innerHTML = '';

    if (photoURL) {
        const cacheBustedURL = `${photoURL}?t=${new Date().getTime()}`;
        const img = document.createElement('img');
        img.src = cacheBustedURL;
        img.alt = "Avatar";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
        profileAvatarEl.appendChild(img);
    } else {
        profileAvatarEl.textContent = getInitials(firstName, lastName);
    }
    profileDropdown.style.display = 'flex';
}

function toggleDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// --- Dashboard Specific Functions ---
async function fetchDashboardStats(token, period) {
    console.log(`Fetching dashboard stats for period: ${period}...`);
    // Show loading state on cards
    document.getElementById('totalUsersCount').textContent = "...";
    document.getElementById('newRegistrationsCount').textContent = "...";
    document.getElementById('activeLoginsCount').textContent = "...";

    try {
        const response = await fetch(`http://127.0.0.1:5000/api/admin/dashboard-stats?period=${period}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'success') {
            console.log('Dashboard stats received:', data.stats);
            updateDashboardUI(data.stats); // Call the update function
        } else {
            throw new Error(data.message || "Failed to fetch stats.");
        }

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        showToast(`Error loading stats: ${error.message}`, true);
        document.getElementById('totalUsersCount').textContent = "Error";
        document.getElementById('newRegistrationsCount').textContent = "Error";
        document.getElementById('activeLoginsCount').textContent = "Error";
    }
}

function updateDashboardUI(stats) {
    // 1. Update Number Cards
    document.getElementById('totalUsersCount').textContent = stats.totalUsers ?? '0';
    document.getElementById('newRegistrationsCount').textContent = stats.newRegistrations ?? '0';
    document.getElementById('activeLoginsCount').textContent = stats.activeLogins ?? '0';

    // 2. Render User Registrations Chart
    if (stats.registrationsOverTime) {
        // Sort keys to ensure chart labels are in order
        const sortedLabels = Object.keys(stats.registrationsOverTime).sort();
        const chartData = sortedLabels.map(label => stats.registrationsOverTime[label]);
        // Format labels for display (e.g., 'Oct 24' from '2025-10-24')
        const formattedLabels = sortedLabels.map(dateStr => {
            const date = dateFns.addDays(new Date(dateStr), 1);
            return dateFns.format(date, 'MMM dd');
        });
        renderRegistrationChart(formattedLabels, chartData);
    } else {
        renderRegistrationChart([], []);
    }

    // 3. Render Destinations Chart
    if (stats.topDestinations && stats.topDestinations.length > 0) {
        const labels = stats.topDestinations.map(item => item[0]);
        const data = stats.topDestinations.map(item => item[1]);
        renderDestinationChart(labels, data);
    } else {
        renderDestinationChart([], []);
    }
}


function renderRegistrationChart(labels, data) {
    const ctx = document.getElementById('registrationsChart');
    if (!ctx) { console.error("Canvas 'registrationsChart' not found."); return; }

    if (registrationsChartInstance) {
        registrationsChartInstance.destroy();
    }

    registrationsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'New Registrations',
                data: data,
                fill: true,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'New Users' } },
                x: { title: { display: true, text: 'Date' } }
            }
        }
    });
}


function renderDestinationChart(labels, data) {
    const ctx = document.getElementById('destinationsChart');
    if (!ctx) { console.error("Canvas 'destinationsChart' not found."); return; }

    if (destinationsChartInstance) {
        destinationsChartInstance.destroy();
    }

    destinationsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '# of Itineraries',
                data: data,
                backgroundColor: ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)', 'rgba(75, 192, 192, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(153, 102, 255, 0.6)'],
                borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(255, 206, 86, 1)', 'rgba(153, 102, 255, 1)'],
                borderWidth: 1, borderRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Itineraries' } },
                x: { title: { display: true, text: 'Destinations (SEA)' } }
            }
        }
    });
}


// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Admin Dashboard page loaded.");

    const profileTrigger = document.getElementById('profileTrigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const filterBar = document.getElementById('time-filter');

    // --- Authentication Check ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                currentAuthToken = await user.getIdToken(); // Store token
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    currentUserRole = userData.role;
                    updateHeaderUI(userData);

                    if (currentUserRole === 'admin' || currentUserRole === 'superadmin') {
                        // User is authorized, fetch initial stats (default 'week')
                        fetchDashboardStats(currentAuthToken, currentPeriod);
                    } else {
                        console.warn("Access denied. User is not an admin.");
                        showToast("You do not have permission to view this page.", true);
                        setTimeout(() => window.location.href = 'home.html', 2000);
                    }
                } else {
                    console.error("Critical: Admin user data missing from Firestore.");
                    showToast("Error: Your profile data not found. Logging out.", true);
                    await handleLogout();
                }
            } catch (error) {
                console.error("Error during auth check:", error);
                showToast("An error occurred. Logging out.", true);
                await handleLogout();
            }
        } else {
            console.log("User is signed out. Redirecting to login.");
            window.location.href = 'login.html';
        }
    });

    // --- Attach Event Listeners ---
    if (profileTrigger) profileTrigger.addEventListener('click', toggleDropdown);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    document.addEventListener('click', (event) => {
        if (profileDropdown && !profileDropdown.contains(event.target) && event.target !== profileTrigger && !profileTrigger.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    // Time Period Filter Buttons
    if (filterBar) {
        filterBar.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                // Remove 'active' class from all buttons
                filterBar.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                // Add 'active' class to clicked button
                e.target.classList.add('active');

                const newPeriod = e.target.dataset.period;
                if (newPeriod !== currentPeriod) {
                    currentPeriod = newPeriod;
                    // Re-fetch data with the new period
                    if (currentAuthToken) {
                        fetchDashboardStats(currentAuthToken, currentPeriod);
                    } else {
                        showToast("Authentication token not ready, please wait.", true);
                    }
                }
            }
        });
    }

    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            console.log("Export to PDF clicked...");
            showToast("Export to PDF is not yet implemented.", true);
        });
    }
});