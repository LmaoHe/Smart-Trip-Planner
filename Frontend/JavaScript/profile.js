// --- Imports ---
import { auth, db } from './firebase-config.js'; // Import auth and db
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Removed Timestamp, not strictly needed here
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { showToast, setLoading, showError, hideError } from './utils.js';

// --- Global Variables ---
let currentUser = null;
let originalProfileData = null; // Corrected spelling

// --- Profile Page Specific Utility Functions ---
function showStatusMessage(message, isError = true) {
    const statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? 'error-message show' : 'success-message show';
    statusEl.style.display = 'block';
    setTimeout(() => {
        if (statusEl) {
            statusEl.style.display = 'none';
            statusEl.classList.remove('show');
        }
    }, 5000);
}

function hideStatusMessage() {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) statusEl.style.display = 'none';
}


// --- UI Population Functions ---
function populateProfileHeader(userData) {
    const headerAvatar = document.getElementById('headerAvatar');
    const headerName = document.getElementById('headerName');
    const profilePageAvatar = document.getElementById('profilePageAvatar');
    const profilePageName = document.getElementById('profilePageName');
    const memberSinceEl = document.getElementById('memberSince');
    // Location element removed as per previous step

    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'User'; // Corrected: Template literal
    const photoURL = userData.profilePhotoURL;
    const createdAt = userData.createdAt;

    // Update Header
    if (headerName) headerName.textContent = fullName;
    if (headerAvatar) {
        headerAvatar.innerHTML = '';
        if (photoURL) {
            const img = document.createElement('img'); img.src = photoURL; img.alt = "Avatar"; img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;"; headerAvatar.appendChild(img);
        } else { headerAvatar.textContent = (firstName?.[0]?.toUpperCase() || '') + (lastName?.[0]?.toUpperCase() || '') || 'U'; }
    }

    // Update Profile Page Header
    if (profilePageName) profilePageName.textContent = fullName;
    if (profilePageAvatar) {
        profilePageAvatar.innerHTML = '';
        if (photoURL) {
            const img = document.createElement('img'); img.src = photoURL; img.alt = "Profile"; img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;"; profilePageAvatar.appendChild(img);
        } else { profilePageAvatar.textContent = (firstName?.[0]?.toUpperCase() || '') + (lastName?.[0]?.toUpperCase() || '') || '👤'; }
    }

    // Update Member Since
    if (memberSinceEl && createdAt && createdAt.toDate) {
        const joinDate = createdAt.toDate();
        memberSinceEl.textContent = joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (memberSinceEl) {
        memberSinceEl.textContent = 'N/A';
    }
}

function populateProfileForm(userData) {
    const form = document.getElementById('profileForm');
    if (!form) return;

    form.firstName.value = userData.firstName || '';
    form.lastName.value = userData.lastName || '';

    // Correctly format birthDate if it's a Timestamp
    if (userData.birthDate && typeof userData.birthDate === 'string') {
        form.birthDate.value = userData.birthDate; // Assumes YYYY-MM-DD
    } else if (userData.birthDate && userData.birthDate.toDate) { // Handle Firestore Timestamp
        const date = userData.birthDate.toDate(); // Correct: Call on the Timestamp object
        const year = date.getFullYear(); // Correct: Call on the Date object
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        form.birthDate.value = `${year}-${month}-${day}`; // Correct: Template literal
    } else {
        form.birthDate.value = '';
    }
    form.gender.value = userData.gender || '';
    form.phone.value = userData.phone || '';
    form.email.value = userData.email || ''; // Read-only

    // Store original data for cancellation (only editable fields + necessary display fields)
    originalProfileData = { // Corrected spelling
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        birthDate: form.birthDate.value,
        gender: form.gender.value,
        phone: form.phone.value,
        // Include non-editable fields needed for UI updates/consistency
        email: userData.email,
        createdAt: userData.createdAt,
        profilePhotoURL: userData.profilePhotoURL,
        // Removed location
    };
    console.log("Original profile data stored for cancel:", originalProfileData); // Corrected log variable
}

// --- Event Handlers ---
async function handleProfileSave(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast("Authentication error. Please log in again.", true);
        return;
    }

    const saveBtn = document.getElementById('saveChangesBtn');
    setLoading(saveBtn, true, 'Saving...', 'Save Changes');
    hideStatusMessage();
    // Hide field errors
    hideError('firstNameError');
    hideError('lastNameError');
    hideError('birthDateError');
    hideError('genderError');
    hideError('phoneError');

    const form = document.getElementById('profileForm');
    // Read current values into updateData object
    const updatedData = {
        firstName: form.firstName.value.trim(),
        lastName: form.lastName.value.trim(),
        birthDate: form.birthDate.value,
        gender: form.gender.value,
        phone: form.phone.value.trim(),
    };

    // --- Frontend Validation ---
    let isValid = true;
    if (!updatedData.firstName) {
        showError('firstNameError', 'First name required.'); isValid = false;
    }
    if (!updatedData.lastName) {
        showError('lastNameError', 'Last name required.'); isValid = false;
    }
    if (!updatedData.birthDate) {
        showError('birthDateError', 'Birth date required.'); isValid = false;
    } else {
        // Age check (needs birthDate from updatedData)
        const birth = new Date(updatedData.birthDate); // Use updatedData
        if (isNaN(birth.getTime())) { // Check if date is valid
            showError('birthDateError', 'Invalid birth date format.'); isValid = false;
        } else {
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) { age--; }
            if (age < 13) { showError('birthDateError', 'Must be 13+ years old.'); isValid = false; }
        }
    }
    if (!updatedData.gender) {
        showError('genderError', 'Gender required.'); isValid = false;
    }
    if (!updatedData.phone) {
        showError('phoneError', 'Phone number required.'); isValid = false;
    } else if (!/^\d{7,}$/.test(updatedData.phone)) { // Use updatedData.phone
        showError('phoneError', 'Valid phone (min 7 digits).'); isValid = false;
    }
    // --- End Validation ---

    if (!isValid) {
        setLoading(saveBtn, false, 'Saving...', 'Save Changes');
        return;
    }

    try {
        console.log("Sending update data to backend:", updatedData);
        const idToken = await currentUser.getIdToken();
        const response = await fetch('http://127.0.0.1:5000/update-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(updatedData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to save profile via backend.");
        }

        console.log("Profile updated successfully via backend.");
        showToast("Profile saved successfully!", false);

        originalProfileData = { ...originalProfileData, ...updatedData };
        populateProfileHeader(originalProfileData);

    } catch (error) {
        console.error("Error saving profile:", error);
        showStatusMessage(`Error saving profile: ${error.message}`, true);
    } finally {
        setLoading(saveBtn, false, 'Saving...', 'Save Changes');
    }
}

function handleCancelChanges() {
    if (originalProfileData) { // Corrected spelling
        console.log("Cancelling changes, restoring form data.");
        populateProfileForm(originalProfileData); // Reset form
        document.querySelectorAll('.profile-form .error-message').forEach(el => el.style.display = 'none');
        hideStatusMessage();
    } else {
        console.warn("Original profile data not available to cancel.");
        showToast("Could not restore original data.", true);
    }
}

function handleChangePhotoClick() {
    const fileInput = document.getElementById('photoUploadInput');
    if (fileInput) {
        fileInput.click();
    } else {
        console.error("File input #photoUploadInput not found.");
        showToast("Could not initiate photo change.", true);
    }
}

async function handlePhotoSelected(event) {
    const file = event.target.files[0];
    if (!file || !currentUser || !originalProfileData) {
        if (!originalProfileData) {
            showToast("Profile data is still loading.", true);
        } else if (!currentUser) {
            showToast("Auth error.", true);
        }
        event.target.value = null;
        return;
    }
    const changePhotoBtn = document.getElementById('changePhotoButton');
    setLoading(changePhotoBtn, true, 'Uploading...', 'Change Photo');
    console.log("New photo selected...");
    const reader = new FileReader();
    reader.onloadend = async function () {
        const profilePicDataURL = reader.result;
        try {
            const idToken = await currentUser.getIdToken();
            const response = await fetch('http://127.0.0.1:5000/update-profile-picture', {
                method: 'POST', headers: {
                    'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`
                }, body: JSON.stringify({ profilePicDataURL: profilePicDataURL })
            });
            if (!response.ok) {
                const errorData = await response.json(); throw new Error(errorData.message || "Failed photo upload.");
            }
            const result = await response.json();
            const originalPhotoURL = result.photoURL;

            const cacheBustedURL = `${originalPhotoURL}?t=${new Date().getTime()}`;

            console.log("Photo updated. New cache-busted URL:", cacheBustedURL);
            showToast("Picture updated!", false);

            originalProfileData.profilePhotoURL = cacheBustedURL;
            const updatedDisplayData = { ...originalProfileData };
            populateProfileHeader(updatedDisplayData);
            populateProfileForm(updatedDisplayData);

        } catch (error) {
            console.error("Error updating picture:", error);
            showToast(`Error: ${error.message}`, true);
        } finally {
            setLoading(changePhotoBtn, false, 'Uploading...', 'Change Photo');
        }
    };
    reader.onerror = function () {
        console.error("FileReader error.");
        showToast("Could not read photo.", true);
        setLoading(changePhotoBtn, false, 'Uploading...', 'Change Photo');
    };
    reader.readAsDataURL(file);
    event.target.value = null;
}

// --- Main Execution Logic ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Profile page DOM fully loaded");

    // Get elements
    const profileForm = document.getElementById('profileForm');
    const saveBtn = document.getElementById('saveChangesBtn');
    const cancelBtn = document.getElementById('cancelChangesBtn');
    const changePhotoBtn = document.getElementById('changePhotoButton');
    const photoUploadInput = document.getElementById('photoUploadInput');


    // Attach listeners
    if (profileForm && saveBtn) {
        profileForm.addEventListener('submit', handleProfileSave);
    } else {
        console.error("Profile form/save missing");
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelChanges);
    } else {
        console.error("Cancel button missing");
    }
    if (changePhotoBtn && photoUploadInput) {
        changePhotoBtn.addEventListener('click', handleChangePhotoClick);
        photoUploadInput.addEventListener('change', handlePhotoSelected);
    } else {
        console.error("Change photo elements missing");
    }

    // --- Authentication Check ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            console.log("Auth State: User signed in (UID:", user.uid + ")");
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {

                    const userData = docSnap.data(); // Get data from Firestore
                    console.log("Fetched user data:", userData);

                    // Check if a photo URL exists before trying to modify it
                    if (userData.profilePhotoURL) {
                        // Add a unique timestamp to the URL to force the browser to re-download
                        userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                    }

                    originalProfileData = userData; // Now save the MODIFIED data globally
                    populateProfileHeader(originalProfileData);
                    populateProfileForm(originalProfileData);

                } else { // Handle missing Firestore doc
                    console.error("Firestore document missing:", user.uid);
                    showToast("Error: Profile data not found. Logging out.", true); // Use showToast
                    await signOut(auth);
                    window.location.href = 'login.html';
                }
            } catch (error) { // Handle Firestore fetch error
                console.error("Error fetching user data:", error);
                showToast("Error loading profile. Please try again later.", true); // Use showToast
                document.querySelector('.main-content').innerHTML = '<p style="color:red; text-align:center;">Could not load profile data.</p>';
            }
        } else { // User is signed out
            currentUser = null;
            originalProfileData = null; // Corrected spelling
            console.log("Auth State: User signed out. Redirecting to login.");
            window.location.href = 'login.html';
        }
    });

}); // End DOMContentLoaded