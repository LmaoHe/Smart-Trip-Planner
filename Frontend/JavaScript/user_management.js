// JavaScript/user_management.js

// Import auth functions we need
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, getIdToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleLogout } from './auth.js';
import { showToast } from './utils.js';

// --- Global State ---
let allUsers = [];
let currentUserRole = null;
let currentPage = 1;
const rowsPerPage = 5;

// --- DOM Elements ---
const userTableBody = document.getElementById('userTableBody');
const userSearchInput = document.getElementById('userSearchInput');
const adminFilter = document.getElementById('adminFilter');
const statusFilter = document.getElementById('statusFilter');
const userModal = document.getElementById('userModal');
const closeButton = userModal?.querySelector('.close-button');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const userForm = document.getElementById('userForm');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');

// Header profile elements (for logged-in admin)
const profileDropdown = document.getElementById('profileDropdown');
const profileNameEl = document.getElementById('profileName');
const profileAvatarEl = document.getElementById('profileAvatarInitials');
const logoutButton = document.getElementById('logoutButton');

// --- Utility Functions ---
function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ').filter(n => n);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return '?';
}

function toggleDropdown() {
    if (profileDropdown) profileDropdown.classList.toggle('active');
}

// --- Render User Table ---
function renderUserTable(page = 1) {
    // Ensure elements exist before proceeding
    if (!userTableBody || !userSearchInput || !adminFilter || !statusFilter) {
        console.error("Table rendering elements are missing.");
        return;
    }

    const searchTerm = userSearchInput.value.toLowerCase();
    const selectedAdminFilter = adminFilter.value;
    const selectedStatus = statusFilter.value;

    const filteredUsers = allUsers.filter(user => {
        const fullName = user.fullName || '';
        const email = user.email || '';
        const role = user.role || 'traveler';
        const status = user.status || 'inactive';

        const matchesSearch = fullName.toLowerCase().includes(searchTerm) ||
            email.toLowerCase().includes(searchTerm);

        const matchesStatus = (selectedStatus === 'all' || status === selectedStatus);

        let matchesAdminFilter = true;
        if (selectedAdminFilter === 'admins') {
            matchesAdminFilter = (role === 'Admin' || role === 'Superadmin');
        } else if (selectedAdminFilter === 'non-admins') {
            matchesAdminFilter = !(role === 'Admin' || role === 'Superadmin');
        }

        return matchesSearch && matchesStatus && matchesAdminFilter;
    });

    // 2. Paginate
    const totalPages = Math.ceil(filteredUsers.length / rowsPerPage);
    currentPage = Math.min(Math.max(1, page), totalPages || 1);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + rowsPerPage);

    // 3. Render
    userTableBody.innerHTML = ''; // Clear existing rows
    if (paginatedUsers.length === 0) {
        userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: #777;">No users found.</td></tr>`;
    } else {
        paginatedUsers.forEach(user => {
            const isAdmin = (user.role === 'Admin' || user.role === 'Superadmin');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="user-info">
                        <div class="user-avatar-small">${getInitials(user.fullName)}</div>
                        <div>
                            <div class="user-name">${user.fullName}</div>
                        </div>
                    </div>
                </td>
                <td><div class="user-email">${user.email}</div></td>
                <td>
                    ${isAdmin ? `<span class="role-badge admin">${user.role}</span>` : `<span class="role-badge user">${user.role}</span>`}
                </td>
                <td><span class="status-badge status-${user.status}">${user.status}</span></td>
                <td>
                    <button class="btn-action-edit" data-id="${user.id}">Edit</button>
                    <button class="btn-action-status" data-id="${user.id}" data-status="${user.status}">
                        ${user.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn-action-delete" data-id="${user.id}">Delete</button>
                </td>
            `;
            userTableBody.appendChild(row);
        });
    }

    // 4. Update Pagination UI
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || filteredUsers.length === 0;
}

// --- Fetch All Users Function ---
async function fetchAllUsers(token) {
    try {
        const response = await fetch('http://127.0.0.1:5000/get-all-users', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'success') {
            allUsers = data.users;
            console.log('Fetched all users:', allUsers);
            renderUserTable(1);
        } else {
            throw new Error(data.message || "Failed to fetch users.");
        }

    } catch (error) {
        console.error("Error fetching all users:", error);
        if (userTableBody) {
            userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: #E74C3C;">Error loading users: ${error.message}</td></tr>`;
        } else {
            showToast(`Error loading users: ${error.message}`, true);
        }
    }
}

// --- Update Header UI ---
function updateHeaderUI(userData) {
    if (profileNameEl) profileNameEl.textContent = `${userData.firstName} ${userData.lastName}`.trim();
    if (profileAvatarEl) {
        if (userData.profilePhotoURL) {
            profileAvatarEl.innerHTML = `<img src="${userData.profilePhotoURL}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            profileAvatarEl.textContent = getInitials(`${userData.firstName} ${userData.lastName}`);
        }
    }
    if (profileDropdown) profileDropdown.style.display = 'flex';
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Admin User Management page loaded.");

    // --- Authentication Check ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const token = await user.getIdToken();
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    currentUserRole = userData.role;

                    if (userData.profilePhotoURL) {
                        userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                    }

                    updateHeaderUI(userData);

                    if (currentUserRole === 'Admin' || currentUserRole === 'Superadmin') {
                        if (currentUserRole === 'Admin') {
                            if (adminFilter) {
                                adminFilter.style.display = 'none';
                            }
                        }
                        fetchAllUsers(token);
                    } else {
                        console.warn("Access denied. User is not an admin.");
                        showToast("You do not have permission to view this page.", true);
                        setTimeout(() => window.location.href = 'home.html', 3000);
                    }
                } else {
                    console.error("Critical: Admin user data missing from Firestore.");
                    showToast("Error: Your profile data could not be found. Logging out.", true);
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
    userSearchInput?.addEventListener('input', () => renderUserTable(1));
    adminFilter?.addEventListener('change', () => renderUserTable(1));
    statusFilter?.addEventListener('change', () => renderUserTable(1));
    prevPageBtn?.addEventListener('click', () => renderUserTable(currentPage - 1));
    nextPageBtn?.addEventListener('click', () => renderUserTable(currentPage + 1));

    document.querySelector('.profile-trigger')?.addEventListener('click', toggleDropdown);
    logoutButton?.addEventListener('click', handleLogout);

    document.addEventListener('click', (event) => {
        if (profileDropdown && !profileDropdown.contains(event.target) && !event.target.closest('.profile-trigger')) {
            profileDropdown.classList.remove('active');
        }
    });

});