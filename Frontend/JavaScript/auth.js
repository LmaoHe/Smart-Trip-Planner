import { auth, db, storage } from './firebase-config.js'; 
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    getIdToken,
    deleteUser,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    setDoc,        
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    ref, 
    uploadString, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showToast, setLoading, showError, hideError } from './utils.js';

// --- Global Variables ---
let currentStep = 1;

// --- Registration Page Constants (3 Steps) ---
const stepTitles = { 1: "Personal Information", 2: "Security Setup", 3: "Profile Picture" };
const stepDescriptions = { 1: "Tell us about yourself", 2: "Create a secure password", 3: "Add a profile picture" };
const stepSubtitles = { 1: "Step 1 of 3 - Personal Details", 2: "Step 2 of 3 - Password Setup", 3: "Step 3 of 3 - Profile Picture" };

// --- Registration Specific Functions ---
function nextStep() {
    if (!document.getElementById('registrationForm')) return;
    console.log('nextStep called, currentStep:', currentStep);
    if (validateCurrentStep()) {
        if (currentStep < 3) { 
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

    // Update progress steps
    for (let i = 1; i <= 3; i++) {
        const step = document.getElementById('step' + i);
        const line = document.getElementById('line' + i);
        if (step) {
            step.classList.remove('active', 'completed');
            if (line) line.classList.remove('completed'); 
            if (i < currentStep) {
                step.classList.add('completed');
                if (line) line.classList.add('completed');
            } else if (i === currentStep) {
                step.classList.add('active');
            }
        }
    }
    
    // Ensure line2 is visible again 
    const line2 = document.getElementById('line2');
    if (line2) line2.style.display = ''; 

    // Update step info
    const titleEl = document.getElementById('stepTitle');
    const descEl = document.getElementById('stepDescription');
    const subtitleEl = document.getElementById('formSubtitle');
    if (titleEl && stepTitles[currentStep]) titleEl.textContent = stepTitles[currentStep];
    if (descEl && stepDescriptions[currentStep]) descEl.textContent = stepDescriptions[currentStep];
    if (subtitleEl && stepSubtitles[currentStep]) subtitleEl.textContent = stepSubtitles[currentStep];

    // Update form steps visibility
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    const stepIds = ['personalInfo', 'passwordSetup', 'profilePicture'];
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
    } else {
        document.querySelectorAll('.error-message').forEach(error => error.style.display = 'none');
    }

    if (currentStep === 1) {
        // --- Full Step 1 Validation ---
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const birthDate = document.getElementById('birthDate').value;
        const gender = document.getElementById('gender').value;
        const phone = document.getElementById('phone').value.trim();
        
        if (!firstName) { showError('firstNameError', 'Please enter first name'); isValid = false; }
        if (!lastName) { showError('lastNameError', 'Please enter last name'); isValid = false; }
        if (!email) { showError('emailError', 'Please enter email'); isValid = false; }
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('emailError', 'Please enter valid email'); isValid = false; }
        
        if (!birthDate) { showError('birthDateError', 'Please enter birth date'); isValid = false; }
        else {
            const today = new Date();
            const birth = new Date(birthDate);
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            if (age < 13) { showError('birthDateError', 'Must be 13+'); isValid = false; }
        }
        
        if (!gender) { showError('genderError', 'Please select gender'); isValid = false; }
        if (!phone || !/^\d{7,}$/.test(phone)) { showError('phoneError', 'Please enter valid phone'); isValid = false; }

    } else if (currentStep === 2) {
        // --- Full Step 2 Validation ---
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!password) { showError('passwordError', 'Please enter password'); isValid = false; }
        else if (password.length < 8) { showError('passwordError', 'Min 8 chars'); isValid = false; }
        else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            showError('passwordError', 'Need Upper, Lower, Num, Symbol'); isValid = false;
        }
        
        if (!confirmPassword) { showError('confirmPasswordError', 'Please enter confirm password'); isValid = false; }
        else if (password !== confirmPassword) { showError('confirmPasswordError', 'No match'); isValid = false; }

    } else if (currentStep === 3) {
        // No validation needed for step 3 (picture is optional)
        isValid = true;
    }
    return isValid;
}

// --- File Upload Function ---
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById('profilePreview');
        const previewImage = document.getElementById('previewImage'); 
        const placeholder = preview?.querySelector('.profile-placeholder');

        if (preview && previewImage) {
            // Hide placeholder
            if (placeholder) placeholder.style.display = 'none';
            
            // Show and update image
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            
            console.log("File uploaded and preview updated.");
        } else {
            console.error("Profile preview elements not found.");
        }
    };
    
    reader.onerror = function (err) {
        console.error("FileReader error:", err);
        showToast("Failed to read the selected file.", true);
        
        // Reset preview
        const previewImage = document.getElementById('previewImage');
        const placeholder = document.querySelector('.profile-placeholder');
        
        if (previewImage) previewImage.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
    };
    
    reader.readAsDataURL(file);
}

async function handleRegistration(event) {
    event.preventDefault();
    const form = event.target;

    // Validation check
    if (currentStep !== 3 || !validateCurrentStep()) {
        showToast('Please complete all steps correctly before submitting', true);
        return;
    }

    const registerBtn = form.querySelector('#registerBtn');
    setLoading(registerBtn, true, 'Creating Account...', 'Create Account');

    // Get all form data
    const email = form.querySelector('#email').value;
    const password = form.querySelector('#password').value;
    const firstName = form.querySelector('#firstName').value;
    const lastName = form.querySelector('#lastName').value;
    const birthDate = form.querySelector('#birthDate').value;
    const gender = form.querySelector('#gender').value;
    const phone = form.querySelector('#phone').value;
    
    // Get image data
    const previewImage = document.getElementById('previewImage');
    const profilePicDataURL = (previewImage && previewImage.style.display !== 'none') ? previewImage.src : null;

    try {
        // --- Step A: Create Auth User ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('Firebase Auth user created:', user.uid);

        let photoURL = null;

        // --- Step B: Upload Image to Firebase Storage ---
        if (profilePicDataURL) {
            try {
                // Reference: users/UID/profile.png (Matches your simplified Storage Rule)
                const storageRef = ref(storage, `users/${user.uid}/profile.png`);
                
                // Upload Base64 Data URL
                await uploadString(storageRef, profilePicDataURL, 'data_url');
                
                // Get Download URL
                photoURL = await getDownloadURL(storageRef);
                console.log('Image uploaded:', photoURL);
            } catch (imgError) {
                console.warn("Image upload failed (proceeding without image):", imgError);
            }
        }

        await setDoc(doc(db, "users", user.uid), {
            firstName: firstName,
            lastName: lastName,
            birthDate: birthDate,
            gender: gender,
            phone: phone,
            email: email,
            role: 'traveler', 
            profilePhotoURL: photoURL,
            createdAt: serverTimestamp()
        });

        console.log('Profile created in Firestore.');
        showToast('Account created successfully!', false);
        
        // Redirect
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);

    } catch (error) {
        console.error('Registration failed:', error); 
        let errorMessage = error.message;
        
        // Specific error handling
        if (error.code === 'auth/email-already-in-use') { 
            errorMessage = 'Email already registered.'; 
        } else if (error.code === 'permission-denied') {
            errorMessage = 'Security Check Failed: Could not save profile data.';
        } else if (error.code === 'storage/unauthorized') {
            errorMessage = 'Permission Denied: Could not upload image.';
        }

        showToast(errorMessage, true);

        if (auth.currentUser) {
            await auth.currentUser.delete().catch(e => console.log("Cleanup failed", e));
        }

    } finally {
        const finalRegisterBtn = document.getElementById('registerBtn');
        if (finalRegisterBtn) { setLoading(finalRegisterBtn, false, 'Creating Account...', 'Create Account'); }
    }
}


async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const loginBtn = form.querySelector('#loginBtn');

    hideError('loginEmailError');
    hideError('loginPasswordError');

    const email = form.querySelector('#loginEmail').value;
    const password = form.querySelector('#loginPassword').value;

    if (!email || !password) {
        if (!email) showError('loginEmailError', 'Please enter email.');
        if (!password) showError('loginPasswordError', 'Please enter password.');
        return;
    }

    setLoading(loginBtn, true, 'Signing In...', 'Sign In');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("Firebase Auth login successful for UID:", user.uid);

        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            console.error("Inconsistent state: User in Auth but not Firestore.", user.uid);
            await signOut(auth);
            throw new Error("User profile not found. Contact support.");
        }

        const role = userDoc.data().role;

        try {
            await updateDoc(userDocRef, {
                lastLoginAt: serverTimestamp()
            });
            console.log("lastLoginAt updated successfully");
        } catch (updateError) {
            console.warn("Failed to update lastLoginAt:", updateError);
        }

        if (role === 'admin' || role === 'superadmin') {
            window.location.href = 'admin_dashboard.html';
        } else if (role === 'traveler') {
            window.location.href = 'home.html';
        } else {
            console.warn("Unknown user role:", role);
            await signOut(auth);
            throw new Error("Invalid user role configuration.");
        }

    } catch (error) {
        console.error('Login failed:', error);
        let errorMessage = error.message;

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = 'Invalid email or password.';
            showError('loginPasswordError', errorMessage);
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format.';
            showError('loginEmailError', errorMessage);
        } else {
            showToast(`Login failed: ${errorMessage}`, true);
        }
    } finally {
        const finalLoginBtn = document.getElementById('loginBtn');
        if (finalLoginBtn && finalLoginBtn.disabled) {
            setLoading(finalLoginBtn, false, 'Signing In...', 'Sign In');
        }
    }
}

async function resetPassword(email) {
    try {
        console.log("Attempting to send reset email to:", email);
        await sendPasswordResetEmail(auth, email);
        console.log("sendPasswordResetEmail function completed successfully (or user not found).");
        return { success: true };
    } catch (error) {
        console.error('Password reset failed:', error);
        console.error('Error Code:', error.code);

        if (error.code === 'auth/missing-email') {
            showError('resetEmailError', 'Please enter your email address.');
            throw error;
        } else if (error.code === 'auth/invalid-email') {
            showError('resetEmailError', 'Please enter a valid email format.');
            throw error;
        }

        console.warn("sendPasswordResetEmail failed (e.g., user not found, network issue), but showing generic success message.");
        return { success: false, error: error };
    }
}

export function observeAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}

export async function handleLogout(event) {
    event.preventDefault();
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        setLoading(logoutButton, true, 'Logging out...', 'Logout');
    }

    try {
        await signOut(auth);
        console.log('User signed out succesfully.');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        showToast(`Logout failed: ${error.message}`, true);
        if (logoutButton) {
            setLoading(logoutButton, false, 'Logging out...', 'Logout');
        }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', function () {
    console.log('Auth Service DOMContentLoaded');

    // --- Registration Page Specific Setup ---
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        console.log('Setting up 3-Step Registration Form');
        currentStep = 1;
        updateUI();

        // Attach Navigation Listeners for 3 Steps
        const nextBtn1 = document.getElementById('nextBtnStep1');
        const prevBtn2 = document.getElementById('prevBtnStep2');
        const nextBtn2 = document.getElementById('nextBtnStep2');
        const prevBtn3 = document.getElementById('prevBtnStep3');

        if (nextBtn1) nextBtn1.addEventListener('click', (e) => { e.preventDefault(); nextStep(); });
        if (prevBtn2) prevBtn2.addEventListener('click', (e) => { e.preventDefault(); prevStep(); });
        if (nextBtn2) nextBtn2.addEventListener('click', (e) => { e.preventDefault(); nextStep(); });
        if (prevBtn3) prevBtn3.addEventListener('click', (e) => { e.preventDefault(); prevStep(); });

        // Attach File Listener (Camera listeners removed)
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.addEventListener('change', handleFileUpload); 
        else console.error('fileInput not found');

        // Attach Registration Submit Listener
        registrationForm.addEventListener('submit', handleRegistration);

        // Attach focus listeners
        registrationForm.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('focus', function () { hideError(this.id + 'Error'); });
        });
        console.log('Registration listeners attached.');
    }

    // --- Login Page Specific Setup ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        console.log('Setting up Login Form');
        loginForm.addEventListener('submit', handleLogin);
        loginForm.querySelectorAll('input').forEach(input => {
            input.addEventListener('focus', function () { hideError(this.id + 'Error'); });
        });
        console.log('Login listeners attached.');
    }

    // --- Forget Password Setup ---
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) {
        console.log('Setting up Forgot Password form');
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('resetEmail');
            const resetBtn = document.getElementById('resetBtn');
            const successEl = document.getElementById('resetSuccess');
            const errorEl = document.getElementById('resetEmailError');

            hideError('resetEmailError');
            if (successEl) successEl.style.display = 'none';

            const email = (emailInput && emailInput.value || '').trim();
            if (!email || !email.includes('@')) {
                showError('resetEmailError', !email ? 'Enter email.' : 'Enter valid email.');
                errorEl?.classList.add('show');
                return;
            }

            setLoading(resetBtn, true, 'Sending Reset Link...', 'Send Reset Link');

            try {
                await resetPassword(email);
                console.log(">>> resetPassword finished, showing success toast.");
                showToast('A password reset link has been sent to your gmail. Check your inbox spam folder)', false);

                if (emailInput) emailInput.value = '';
                if (resetBtn) {
                    resetBtn.disabled = true;
                    setTimeout(() => { if (resetBtn) resetBtn.disabled = false; }, 10000);
                }

            } catch (err) {
                console.error('Reset form submit caught error:', err.code || err.message);
                if (errorEl?.style.display === 'block') {
                    errorEl.classList.add('show');
                }
            } finally {
                setLoading(resetBtn, false, 'Sending Reset Link...', 'Send Reset Link');
            }
        });

        // Clear error/success on focus
        const emailInput = document.getElementById('resetEmail');
        if (emailInput) {
            emailInput.addEventListener('focus', () => {
                hideError('resetEmailError');
                const successEl = document.getElementById('resetSuccess');
                if (successEl) {
                    successEl.style.display = 'none';
                    successEl.classList.remove('show');
                }
            });
        }
        console.log('Forgot Password listeners attached.');
    }
});
