import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleLogout } from './auth.js';
import { showToast } from './utils.js';

// ===== GLOBAL VARIABLES =====
let currentUser = null;
let currentUserRole = null;
let currentPeriod = 'week';
let currentStats = null;

// Chart instances
let registrationsChartInstance = null;
let userActivityChartInstance = null;

// User table data
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 10;

// ===== UTILITY FUNCTIONS =====
function getInitials(firstName = '', lastName = '') {
    const firstInitial = firstName ? firstName[0].toUpperCase() : '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';
    return `${firstInitial}${lastInitial}` || 'U';
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
        img.onerror = () => {
            profileAvatarEl.textContent = getInitials(firstName, lastName);
        };
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

function updateNavigationUI(userRole) {
    const registerAdminNav = document.getElementById('registerAdminNav');
    
    if (registerAdminNav) {
        if (userRole === 'superadmin') {
            registerAdminNav.style.display = 'block';
            console.log('✅ Register Admin link shown (superadmin access)');
        } else {
            registerAdminNav.style.display = 'none';
            console.log('🔒 Register Admin link hidden (admin access)');
        }
    }
}

// ===== FETCH USER STATS =====
async function fetchDashboardStats(period) {
    console.log(`\n========== FETCHING USER STATS (${period}) ==========`);
    
    // Show loading state
    const loadingCards = [
        'totalUsersCount',
        'newRegistrationsCount',
        'activeLoginsCount',
        'userEngagementRate'
    ];
    
    loadingCards.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "...";
    });

    try {
        const now = new Date();
        let startDate;
        
        if (period === 'week') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === 'month') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else if (period === 'year') {
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        } else {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }
        
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // Initialize stats object
        const stats = {
            totalUsers: 0,
            newRegistrations: 0,
            activeLogins: 0,
            registrationsOverTime: {},
            usersByRole: {}
        };

        // Fetch ALL users
        console.log("\n📊 Fetching all users...");
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        stats.totalUsers = usersSnapshot.size;
        allUsers = [];
        
        usersSnapshot.forEach((docSnap) => {
            const userData = docSnap.data();
            const userId = docSnap.id;
            
            // Store user for table
            allUsers.push({ id: userId, ...userData });
            
            // Count by role
            const role = userData.role || 'traveler';
            stats.usersByRole[role] = (stats.usersByRole[role] || 0) + 1;
            
            // New Registrations (based on period)
            const createdAt = userData.createdAt;
            if (createdAt && createdAt.toDate) {
                const createdDate = createdAt.toDate();
                
                if (createdDate >= startDate) {
                    stats.newRegistrations++;
                }
                
                // For chart - all registrations
                const dateKey = createdDate.toISOString().split('T')[0];
                stats.registrationsOverTime[dateKey] = (stats.registrationsOverTime[dateKey] || 0) + 1;
            }
            
            // Active Logins (last 2 weeks)
            const lastLoginAt = userData.lastLoginAt;
            if (lastLoginAt && lastLoginAt.toDate) {
                const loginDate = lastLoginAt.toDate();
                
                if (loginDate >= twoWeeksAgo) {
                    stats.activeLogins++;
                }
            }
        });

        console.log(`✅ Total users: ${stats.totalUsers}`);
        console.log(`✅ New registrations (${period}): ${stats.newRegistrations}`);

        currentStats = stats;
        updateDashboardUI(stats);
        
        // Populate user table (only once)
        if (filteredUsers.length === 0) {
            filteredUsers = [...allUsers];
            renderUserTable();
        }

    } catch (error) {
        console.error("❌ Error fetching user stats:", error);
        showToast(`Error loading stats: ${error.message}`, true);
        
        loadingCards.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "Error";
        });
    }
}

// ===== UPDATE UI =====
function updateDashboardUI(stats) {
    console.log(`\n📈 Updating UI...`);
    
    // USER STATS
    const totalUsers = stats.totalUsers ?? 0;
    const newReg = stats.newRegistrations ?? 0;
    const activeLogins = stats.activeLogins ?? 0;
    const engagementRate = totalUsers > 0 ? ((activeLogins / totalUsers) * 100).toFixed(1) : 0;
    
    safeSetText('totalUsersCount', totalUsers);
    safeSetText('newRegistrationsCount', newReg);
    safeSetText('activeLoginsCount', activeLogins);
    safeSetText('userEngagementRate', `${engagementRate}%`);
    
    console.log(`✅ UI Updated!`);

    // RENDER CHARTS
    renderAllCharts(stats);
}

// ===== RENDER CHARTS =====
function renderAllCharts(stats) {
    console.log(`\n🎨 Rendering charts for ${currentPeriod}...`);
    
    const now = new Date();
    let days = currentPeriod === 'week' ? 7 : (currentPeriod === 'month' ? 30 : 365);
    let startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    // Filter registrations for selected period
    const periodData = {};
    Object.keys(stats.registrationsOverTime).forEach(dateStr => {
        const date = new Date(dateStr);
        if (date >= startDate) {
            periodData[dateStr] = stats.registrationsOverTime[dateStr];
        }
    });
    
    if (Object.keys(periodData).length > 0) {
        const sortedLabels = Object.keys(periodData).sort();
        const chartData = sortedLabels.map(label => periodData[label]);
        const formattedLabels = sortedLabels.map(dateStr => 
            dateFns.format(new Date(dateStr), currentPeriod === 'year' ? 'MMM yyyy' : 'MMM dd')
        );
        
        renderLineChart('registrationsChart', formattedLabels, chartData, `New Registrations (${currentPeriod})`);
    } else {
        renderEmptyChart('registrationsChart', `No registrations in this ${currentPeriod}`);
    }
    
    // User Activity by Role (always shows all)
    if (stats.usersByRole && Object.keys(stats.usersByRole).length > 0) {
        const labels = Object.keys(stats.usersByRole).map(role => role.charAt(0).toUpperCase() + role.slice(1));
        const data = Object.values(stats.usersByRole);
        renderBarChart('userActivityChart', labels, data, 'Users by Role');
    }
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

// ===== CHART RENDERING =====
function renderLineChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (registrationsChartInstance) {
        registrationsChartInstance.destroy();
    }

    registrationsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                fill: true,
                backgroundColor: 'rgba(61, 155, 243, 0.1)',
                borderColor: 'rgba(61, 155, 243, 1)',
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: 'rgba(61, 155, 243, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: true }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                },
                x: {}
            }
        }
    });
}

function renderBarChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (userActivityChartInstance) {
        userActivityChartInstance.destroy();
    }

    userActivityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: 'rgba(147, 51, 234, 0.6)',
                borderColor: 'rgba(147, 51, 234, 1)',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { 
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                } 
            }
        }
    });
}

function renderEmptyChart(canvasId, message) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const now = new Date();
    const labels = [];
    const data = [];
    
    let days = currentPeriod === 'week' ? 7 : (currentPeriod === 'month' ? 30 : 365);
    let step = currentPeriod === 'year' ? 30 : 1;
    
    for (let i = days; i >= 0; i -= step) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        labels.push(dateFns.format(date, currentPeriod === 'year' ? 'MMM' : 'MMM dd'));
        data.push(0);
    }

    if (registrationsChartInstance) {
        registrationsChartInstance.destroy();
    }

    registrationsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: message,
                data: data,
                borderColor: 'rgba(200, 200, 200, 0.5)',
                backgroundColor: 'rgba(200, 200, 200, 0.1)',
                borderDash: [5, 5],
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                tooltip: { enabled: false }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    max: 5,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// ===== USER TABLE =====
function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) {
        console.warn('❌ Table body not found');
        return;
    }

    console.log(`📊 Rendering table with ${filteredUsers.length} users`);

    // Calculate pagination
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const usersToShow = filteredUsers.slice(startIndex, endIndex);

    // Clear table
    tbody.innerHTML = '';

    if (usersToShow.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="7" style="text-align: center; padding: 2rem;">
                    <div class="loading-state">
                        <i class="fa fa-inbox"></i>
                        <span>No users found</span>
                    </div>
                </td>
            </tr>
        `;
        updatePaginationUI(0, 0, 0, 1, 1);
        return;
    }

    // Populate rows
    usersToShow.forEach(user => {
        const row = createUserRow(user);
        tbody.appendChild(row);
    });

    // Update pagination
    updatePaginationUI(filteredUsers.length, startIndex + 1, Math.min(endIndex, filteredUsers.length), currentPage, totalPages);
    
    console.log(`✅ Table rendered with ${usersToShow.length} users on page ${currentPage}/${totalPages}`);
}

function createUserRow(user) {
    const tr = document.createElement('tr');
    tr.className = 'user-row';

    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
    const userInitials = getInitials(user.firstName, user.lastName);
    const photoURL = user.profilePhotoURL;

    let avatarHTML = `<div class="user-avatar">${userInitials}</div>`;
    if (photoURL) {
        avatarHTML = `<div class="user-avatar"><img src="${photoURL}" alt="${userName}" onerror="this.parentElement.innerHTML='${userInitials}'"></div>`;
    }

    const email = user.email || 'No email';
    const role = (user.role || 'traveler').toLowerCase();

    let joinedDate = 'N/A';
    if (user.createdAt && user.createdAt.toDate) {
        joinedDate = dateFns.format(user.createdAt.toDate(), 'MMM dd, yyyy');
    }

    let lastLogin = 'Never';
    if (user.lastLoginAt && user.lastLoginAt.toDate) {
        lastLogin = dateFns.formatDistanceToNow(user.lastLoginAt.toDate(), { addSuffix: true });
    }

    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    let isActive = false;
    if (user.lastLoginAt && user.lastLoginAt.toDate) {
        isActive = user.lastLoginAt.toDate() >= twoWeeksAgo;
    }

    tr.innerHTML = `
        <td>
            <div class="user-cell">
                ${avatarHTML}
                <div class="user-info">
                    <div class="user-name">${userName}</div>
                </div>
            </div>
        </td>
        <td>
            <div class="email-cell">${email}</div>
        </td>
        <td>
            <span class="role-badge ${role}">${role}</span>
        </td>
        <td>
            <div class="date-cell">${joinedDate}</div>
        </td>
        <td>
            <div class="date-cell">${lastLogin}</div>
        </td>
        <td>
            <span class="status-badge ${isActive ? 'active' : 'inactive'}">
                <i class="fa fa-circle"></i> ${isActive ? 'Active' : 'Inactive'}
            </span>
        </td>
        <td>
            <div class="action-btns">
                <button class="btn-view" data-user-id="${user.id}">
                    <i class="fa fa-eye"></i> View
                </button>
            </div>
        </td>
    `;

    const viewBtn = tr.querySelector('.btn-view');
    viewBtn.addEventListener('click', () => showUserDetailsModal(user));

    return tr;
}

function updatePaginationUI(total, start, end, page, totalPages) {
    safeSetText('totalCount', total);
    safeSetText('showingStart', start);
    safeSetText('showingEnd', end);
    safeSetText('currentPage', page);
    safeSetText('totalPages', totalPages);

    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
}

// ===== USER DETAILS MODAL =====
function showUserDetailsModal(user) {
    const modal = document.getElementById('userDetailsModal');
    const modalBody = document.getElementById('modalBody');

    if (!modal || !modalBody) return;

    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
    const email = user.email || 'No email';
    const role = (user.role || 'traveler').toUpperCase();
    const phone = user.phone || 'Not provided';
    const gender = user.gender || 'Not specified';
    const birthDate = user.birthDate || 'Not provided';
    
    let joinedDate = 'N/A';
    if (user.createdAt && user.createdAt.toDate) {
        joinedDate = dateFns.format(user.createdAt.toDate(), 'MMMM dd, yyyy h:mm a');
    }

    let lastLogin = 'Never';
    if (user.lastLoginAt && user.lastLoginAt.toDate) {
        lastLogin = dateFns.format(user.lastLoginAt.toDate(), 'MMMM dd, yyyy h:mm a');
    }

    const favoriteCount = user.favoriteItineraries ? user.favoriteItineraries.length : 0;

    modalBody.innerHTML = `
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-user"></i> Name:</div>
            <div class="user-detail-value">${userName}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-envelope"></i> Email:</div>
            <div class="user-detail-value">${email}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-shield-alt"></i> Role:</div>
            <div class="user-detail-value">${role}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-phone"></i> Phone:</div>
            <div class="user-detail-value">${phone}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-venus-mars"></i> Gender:</div>
            <div class="user-detail-value">${gender}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-birthday-cake"></i> Birth Date:</div>
            <div class="user-detail-value">${birthDate}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-calendar-plus"></i> Joined:</div>
            <div class="user-detail-value">${joinedDate}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-clock"></i> Last Login:</div>
            <div class="user-detail-value">${lastLogin}</div>
        </div>
        <div class="user-detail-row">
            <div class="user-detail-label"><i class="fa fa-heart"></i> Favorite Itineraries:</div>
            <div class="user-detail-value">${favoriteCount} saved</div>
        </div>
    `;

    modal.classList.add('active');
}

function closeUserDetailsModal() {
    const modal = document.getElementById('userDetailsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ===== FILTERS =====
function applyFilters() {
    const searchQuery = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('adminFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';

    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    filteredUsers = allUsers.filter(user => {
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
        const email = (user.email || '').toLowerCase();
        const matchesSearch = userName.includes(searchQuery) || email.includes(searchQuery);

        const role = (user.role || 'traveler').toLowerCase();
        let matchesRole = true;
        if (roleFilter === 'admins') {
            matchesRole = role === 'admin' || role === 'superadmin';
        } else if (roleFilter === 'non-admins') {
            matchesRole = role === 'traveler';
        }

        let matchesStatus = true;
        if (statusFilter !== 'all') {
            let isActive = false;
            if (user.lastLoginAt && user.lastLoginAt.toDate) {
                isActive = user.lastLoginAt.toDate() >= twoWeeksAgo;
            }
            matchesStatus = (statusFilter === 'active' && isActive) || (statusFilter === 'inactive' && !isActive);
        }

        return matchesSearch && matchesRole && matchesStatus;
    });

    currentPage = 1;
    renderUserTable();
}

// ===== AUTH STATE OBSERVER =====
function observeAuthState() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        
        if (user) {
            console.log("✅ User logged in:", user.uid);
            
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    console.log("✅ User data from Firestore:", userData);
                    
                    currentUserRole = userData.role;

                    // Check if user is admin or superadmin
                    if (currentUserRole === 'admin' || currentUserRole === 'superadmin') {
                        updateHeaderUI(userData);
                        updateNavigationUI(currentUserRole); // ← ADD THIS
                        fetchDashboardStats(currentPeriod);
                    } else {
                        console.warn("⚠️ User does not have admin access");
                        showToast("You do not have permission to view this page.", true);
                        setTimeout(() => {
                            window.location.href = 'home.html';
                        }, 2000);
                    }
                } else {
                    console.warn("⚠️ User profile not found in Firestore");
                    showToast("Error: Your profile data not found.", true);
                    await handleLogout();
                }
            } catch (error) {
                console.error("❌ Error fetching user data:", error);
                showToast("An error occurred while loading your profile.", true);
                await handleLogout();
            }
        } else {
            console.log("⚠️ User not logged in - redirecting to login");
            window.location.href = 'login.html';
        }
    });
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 User Management Dashboard loaded");

    const profileTrigger = document.getElementById('profileTrigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const filterBar = document.getElementById('time-filter');

    // Search & Filter listeners
    const searchInput = document.getElementById('userSearchInput');
    const adminFilter = document.getElementById('adminFilter');
    const statusFilter = document.getElementById('statusFilter');

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (adminFilter) adminFilter.addEventListener('change', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);

    // Pagination
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderUserTable();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderUserTable();
            }
        });
    }

    // Modal
    const closeModal = document.getElementById('closeModal');
    const modal = document.getElementById('userDetailsModal');

    if (closeModal) closeModal.addEventListener('click', closeUserDetailsModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeUserDetailsModal();
        });
    }

    // Time Period Filter
    if (filterBar) {
        filterBar.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.classList.contains('filter-btn')) {
                filterBar.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');

                const newPeriod = e.target.dataset.period;
                if (newPeriod !== currentPeriod) {
                    currentPeriod = newPeriod;
                    fetchDashboardStats(currentPeriod);
                }
            }
        });
    }

    // Event Listeners
    if (profileTrigger) profileTrigger.addEventListener('click', toggleDropdown);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    // Close dropdown on outside click
    document.addEventListener('click', (event) => {
        if (profileDropdown && !profileDropdown.contains(event.target) && 
            event.target !== profileTrigger && !profileTrigger.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    // Start auth observer
    observeAuthState();
});
