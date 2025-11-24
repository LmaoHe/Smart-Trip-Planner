// JavaScript/admin_register.js

// --- Imports ---
import { auth, db } from './firebase-config.js';
import { 
    onAuthStateChanged, 
    createUserWithEmailAndPassword,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, setLoading, showError, hideError } from './utils.js';
import { handleLogout } from './auth.js';

// --- Global Variables ---
let currentStep = 1;
let currentSuperAdmin = null;

// --- Registration Page Constants (2 Steps) ---
const stepTitles = { 1: "Admin's Personal Information", 2: "Admin's Security Setup" };
const stepDescriptions = { 1: "Enter the new admin's details", 2: "Create a secure password for the new admin" };
const stepSubtitles = { 1: "Step 1 of 2 - Personal Details", 2: "Step 2 of 2 - Password Setup" };

// --- Registration Specific Functions (2-Step Logic) ---
function nextStep() {
    if (!document.getElementById('registrationForm')) return;
    console.log('nextStep called, currentStep:', currentStep);
    if (validateCurrentStep()) {
        if (currentStep < 2) {
            currentStep++;
            updateUI();
            console.log('Moved to step:', currentStep);
        }
    } else {
        console.log('Validation failed for step:', currentStep);
    }
}

function prevStep() {
    if (!document.getElementById('registrationForm')) return;
    console.log('prevStep called, currentStep:', currentStep);
    if (currentStep > 1) {
        currentStep--;
        updateUI();
    }
}

function updateUI() {
    const registrationForm = document.getElementById('registrationForm');
    if (!registrationForm) return;
    console.log('updateUI called for step:', currentStep);

    // Update progress steps - Loop for 2 steps
    for (let i = 1; i <= 2; i++) {
        const step = document.getElementById('step' + i);
        const line = document.getElementById('line' + i);
        if (step) {
            step.classList.remove('active', 'completed');
            if (i === 1 && line) line.classList.remove('completed');
            if (i < currentStep) {
                step.classList.add('completed');
                if (i === 1 && line) line.classList.add('completed');
            } else if (i === currentStep) {
                step.classList.add('active');
            }
        }
    }
    
    // Hide line2/step3 if they exist in the HTML by mistake
    const line2 = document.getElementById('line2');
    if (line2) line2.style.display = 'none';
    const step3 = document.getElementById('step3');
    if (step3) step3.style.display = 'none';

    // Update step info
    const titleEl = document.getElementById('stepTitle');
    const descEl = document.getElementById('stepDescription');
    const subtitleEl = document.getElementById('formSubtitle');
    if (titleEl && stepTitles[currentStep]) titleEl.textContent = stepTitles[currentStep];
    if (descEl && stepDescriptions[currentStep]) descEl.textContent = stepDescriptions[currentStep];
    if (subtitleEl && stepSubtitles[currentStep]) subtitleEl.textContent = stepSubtitles[currentStep];

    // Update form steps visibility
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    const stepIds = ['personalInfo', 'passwordSetup'];
    const activeStep = document.getElementById(stepIds[currentStep - 1]);
    if (activeStep) activeStep.classList.add('active');
}

function validateCurrentStep() {
    if (!document.getElementById('registrationForm')) return true;

    console.log('Validating step:', currentStep);
    let isValid = true;
    const activeStepElement = document.querySelector('.form-step.active');
    if (activeStepElement) {
        activeStepElement.querySelectorAll('.error-message').forEach(error => error.style.display = 'none');
    }

    if (currentStep === 1) {
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const birthDate = document.getElementById('birthDate').value;
        const gender = document.getElementById('gender').value;
        const phone = document.getElementById('phone').value.trim();

        if (!firstName) {
            showError('firstNameError', 'Please enter first name');
            isValid = false;
        }
        if (!lastName) {
            showError('lastNameError', 'Please enter last name');
            isValid = false;
        }
        if (!email) {
            showError('emailError', 'Please enter email');
            isValid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('emailError', 'Please enter valid email');
            isValid = false;
        }

        if (!birthDate) {
            showError('birthDateError', 'Please enter birth date');
            isValid = false;
        } else {
            const birth = new Date(birthDate);
            if (isNaN(birth.getTime())) {
                showError('birthDateError', 'Invalid date format.');
                isValid = false;
            }
        }

        if (!gender) {
            showError('genderError', 'Please select gender');
            isValid = false;
        }

        if (!phone) {
            showError('phoneError', 'Please enter phone number');
            isValid = false;
        } else if (!/^\d{7,}$/.test(phone)) {
            showError('phoneError', 'Please enter valid phone (min 7 digits)');
            isValid = false;
        }

        return isValid;

    } else if (currentStep === 2) {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!password) {
            showError('passwordError', 'Please enter password');
            isValid = false;
        } else if (password.length < 8) {
            showError('passwordError', 'Min 8 chars');
            isValid = false;
        } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            showError('passwordError', 'Need Upper, Lower, Num, Symbol');
            isValid = false;
        }
        if (!confirmPassword) {
            showError('confirmPasswordError', 'Please enter confirm password');
            isValid = false;
        } else if (password !== confirmPassword) {
            showError('confirmPasswordError', 'No match');
            isValid = false;
        }

        return isValid;
    }

    return isValid;
}

function getInitials(firstName = '', lastName = '') {
    const firstInitial = firstName ? firstName[0].toUpperCase() : '';
    const lastInitial = lastName ? lastName[0].toUpperCase() : '';
    return `${firstInitial}${lastInitial}` || 'SA';
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
    profileNameEl.textContent = `${firstName} ${lastName}`.trim() || 'Super Admin';

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

function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
        console.log('Dropdown toggled:', dropdown.classList.contains('active'));
    }
}

// --- Core Admin Registration Logic (FRONTEND ONLY - NO BACKEND) ---
async function handleAdminRegistration(event) {
    event.preventDefault();
    const form = event.target;

    if (currentStep !== 2 || !validateCurrentStep()) {
        showToast('Please complete all fields correctly', true);
        return;
    }
    
    if (!currentSuperAdmin) {
        showToast('Authentication error. Please log in again.', true);
        return;
    }

    const registerBtn = form.querySelector('#registerBtn');
    setLoading(registerBtn, true, 'Creating Admin Account...', 'Create Account');

    // Get all form data for the NEW admin
    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;
    const firstName = form.querySelector('#firstName').value.trim();
    const lastName = form.querySelector('#lastName').value.trim();
    const birthDate = form.querySelector('#birthDate').value;
    const gender = form.querySelector('#gender').value;
    const phone = form.querySelector('#phone').value.trim();

    try {
        console.log('Creating new admin account...');
        
        // Step 1: Create new admin user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newAdminUid = userCredential.user.uid;
        
        console.log(`✅ Admin created in Auth: ${newAdminUid}`);
        
        // Step 2: Create admin profile in Firestore
        const profileData = {
            firstName,
            lastName,
            birthDate,
            gender,
            phone,
            email,
            role: 'admin',
            createdAt: serverTimestamp(),
            createdBy: currentSuperAdmin.uid,
            profilePhotoURL: null
        };
        
        await setDoc(doc(db, 'users', newAdminUid), profileData);
        console.log('✅ Admin profile created in Firestore');
        
        // Step 3: Sign out the newly created admin
        await signOut(auth);
        console.log('✅ Signed out new admin');
        
        // Step 4: Show success message and redirect
        showToast('✅ Admin account created successfully! Redirecting to login...', false);
        
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);

    } catch (error) {
        console.error('Admin registration failed:', error);
        
        // Handle specific errors
        if (error.code === 'auth/email-already-in-use') {
            showError('emailError', 'This email is already in use.');
            currentStep = 1;
            updateUI();
        } else if (error.code === 'auth/weak-password') {
            showError('passwordError', 'Password is too weak.');
        } else if (error.code === 'auth/invalid-email') {
            showError('emailError', 'Invalid email address.');
            currentStep = 1;
            updateUI();
        } else {
            showToast(`Error: ${error.message}`, true);
        }
    } finally {
        setLoading(registerBtn, false, 'Creating Admin Account...', 'Create Account');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    console.log("Admin Register page loaded.");

    // --- Authentication Check ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentSuperAdmin = user;
            console.log("Auth State: User signed in (UID:", user.uid + ")");
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();

                    updateHeaderUI(userData);

                    // --- SECURITY CHECK ---
                    if (userData.role !== 'superadmin') {
                        console.warn("Access Denied: User is not a superadmin.");
                        showToast("You do not have permission to access this page.", true);
                        setTimeout(() => { window.location.href = 'admin_dashboard.html'; }, 3000);
                        return;
                    }

                    console.log("Superadmin access confirmed.");
                    setupPageListeners();
                } else {
                    console.error("Critical: Superadmin data missing from Firestore:", user.uid);
                    showToast("Error: Your profile data not found. Logging out.", true);
                    await handleLogout();
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                showToast("Error loading profile. Logging out.", true);
                await handleLogout();
            }
        } else {
            console.log("Auth State: User signed out. Redirecting to login.");
            window.location.href = 'login.html';
        }
    });
});

function setupPageListeners() {
    console.log('Setting up Admin Registration Form');
    const registrationForm = document.getElementById('registrationForm');

    if (registrationForm) {
        currentStep = 1;
        updateUI();

        // Attach Navigation Listeners
        const nextBtn1 = document.getElementById('nextBtnStep1');
        const prevBtn2 = document.getElementById('prevBtnStep2');

        if (nextBtn1) nextBtn1.addEventListener('click', (e) => { e.preventDefault(); nextStep(); });
        else console.error('nextBtn1 not found');
        if (prevBtn2) prevBtn2.addEventListener('click', (e) => { e.preventDefault(); prevStep(); });
        else console.error('prevBtn2 not found');

        // Attach Registration Submit Listener
        registrationForm.addEventListener('submit', handleAdminRegistration);

        // Attach focus listeners
        registrationForm.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('focus', function () { hideError(this.id + 'Error'); });
        });

        console.log('Registration listeners attached.');
    }

    // ===== PROFILE DROPDOWN LISTENERS =====
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
        console.log('Logout listener attached.');
    }

    // Profile trigger - use ID selector
    const profileTrigger = document.getElementById('profileDropdown');
    if (profileTrigger) {
        const trigger = profileTrigger.querySelector('.profile-trigger');
        if (trigger) {
            trigger.addEventListener('click', toggleDropdown);
            console.log('Profile trigger listener attached.');
        }
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function (event) {
        const profileDropdown = document.getElementById('profileDropdown');
        if (profileDropdown && !profileDropdown.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });
}
