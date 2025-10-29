// --- Imports ---
import { auth, db } from './firebase-config.js'; // Ensure db is exported
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    getIdToken,
    deleteUser,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, setLoading, showError, hideError } from './utils.js';

// --- Global Variables ---
let currentStep = 1; // Relevant for registration page
let stream = null; // For camera stream

// --- Registration Page Constants (CORRECTED for 3 Steps) ---
const stepTitles = { 1: "Personal Information", 2: "Security Setup", 3: "Profile Picture" };
const stepDescriptions = { 1: "Tell us about yourself", 2: "Create a secure password", 3: "Add a profile picture" };
const stepSubtitles = { 1: "Step 1 of 3 - Personal Details", 2: "Step 2 of 3 - Password Setup", 3: "Step 3 of 3 - Profile Picture" };

// --- Registration Specific Functions (CORRECTED for 3 Steps) ---
function nextStep() {
    if (!document.getElementById('registrationForm')) return;
    console.log('nextStep called, currentStep:', currentStep);
    if (validateCurrentStep()) {
        if (currentStep < 3) { // Allow moving up to step 3
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
        if (currentStep === 3) { // Stop camera when going back from step 3
            stopCamera();
        }
        currentStep--;
        updateUI();
    }
}

function updateUI() {
    const registrationForm = document.getElementById('registrationForm');
    if (!registrationForm) return;
    console.log('updateUI called for step:', currentStep);

    // Update progress steps - Loop corrected to 3
    for (let i = 1; i <= 3; i++) {
        const step = document.getElementById('step' + i);
        const line = document.getElementById('line' + i); // line1, line2
        if (step) {
            step.classList.remove('active', 'completed');
            if (line) line.classList.remove('completed'); // Reset lines
            if (i < currentStep) {
                step.classList.add('completed');
                // Complete lines leading up to the current step
                if (line) line.classList.add('completed');
            } else if (i === currentStep) {
                step.classList.add('active');
            }
        }
    }
    // Ensure line2 is visible again (if it exists in HTML)
    const line2 = document.getElementById('line2');
    if (line2) line2.style.display = ''; // Reset display style

    // Update step info (using 3-step constants)
    const titleEl = document.getElementById('stepTitle');
    const descEl = document.getElementById('stepDescription');
    const subtitleEl = document.getElementById('formSubtitle');
    if (titleEl && stepTitles[currentStep]) titleEl.textContent = stepTitles[currentStep];
    if (descEl && stepDescriptions[currentStep]) descEl.textContent = stepDescriptions[currentStep];
    if (subtitleEl && stepSubtitles[currentStep]) subtitleEl.textContent = stepSubtitles[currentStep];

    // Update form steps visibility (using 3-step IDs)
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    const stepIds = ['personalInfo', 'passwordSetup', 'profilePicture']; // 3 steps
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
        if (!firstName) {
            showError('firstNameError', 'Please enter first name'); isValid = false;
        }
        if (!lastName) {
            showError('lastNameError', 'Pleaser enter last name'); isValid = false;
        }
        if (!email) {
            showError('emailError', 'Please enter email'); isValid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('emailError', 'Please enter valid email'); isValid = false;
        }
        if (!birthDate) {
            showError('birthDateError', 'Please enter birth date'); isValid = false;
        } else {
            const today = new Date(); const birth = new Date(birthDate); let age = today.getFullYear() - birth.getFullYear(); const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            if (age < 13) {
                showError('birthDateError', 'Must be 13+'); isValid = false;
            }
        }
        if (!gender) {
            showError('genderError', 'Please select gender'); isValid = false;
        }
        if (!phone || !/^\d{7,}$/.test(phone)) {
            showError('phoneError', 'Please enter valid phone'); isValid = false;
        }

    } else if (currentStep === 2) {
        // --- Full Step 2 Validation ---
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        if (!password) {
            showError('passwordError', 'Please enter password'); isValid = false;
        } else if (password.length < 8) {
            showError('passwordError', 'Min 8 chars'); isValid = false;
        } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            showError('passwordError', 'Need Upper, Lower, Num, Symbol'); isValid = false;
        }
        if (!confirmPassword) {
            showError('confirmPasswordError', 'Please enter confirm password'); isValid = false;
        } else if (password !== confirmPassword) {
            showError('confirmPasswordError', 'No match'); isValid = false;
        }

    } else if (currentStep === 3) {
        // No validation needed for step 3 (picture is optional)
        isValid = true;
    }
    return isValid;
}

// --- Camera and File Upload Functions ---
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    stopCamera();

    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById('profilePreview');
        const video = document.getElementById('video'); // Reference to hide it

        if (preview) {
            preview.innerHTML = '';

            // Create and add the new image
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = "Profile Preview";
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;"; // Ensure display: block
            preview.appendChild(img);

            // Ensure video element (outside preview) remains hidden
            if (video) video.style.display = 'none';

            console.log("File uploaded and preview updated.");
        } else {
            console.error("Profile preview element not found during file upload.");
        }
    };
    reader.onerror = function (err) { // Handle file reading errors
        console.error("FileReader error:", err);
        showToast("Failed to read the selected file.", true);
        // Attempt to reset preview to placeholder on error
        const preview = document.getElementById('profilePreview');
        if (preview) {
            preview.innerHTML = '<div class="profile-placeholder">👤</div>';
        }
    };
    reader.readAsDataURL(file);
    event.target.value = null;
}

function startCamera() {
    // Get references
    const video = document.getElementById('video');
    const preview = document.getElementById('profilePreview');
    const cameraControls = document.getElementById('cameraControls');
    const placeholder = preview?.querySelector('.profile-placeholder');
    const existingImg = preview?.querySelector('img');

    // Check elements *before* getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia API not supported.');
        showToast('Camera API not supported by your browser.', true);
        return;
    }
    // Check for video element specifically
    if (!video || !preview || !cameraControls) {
        console.error('Required HTML elements (video, profilePreview, cameraControls) not found.');
        showToast('Camera UI elements missing.', true);
        return;
    }

    console.log("Attempting to start camera...");

    // Hide placeholder and image inside the preview div
    if (placeholder) placeholder.style.display = 'none';
    if (existingImg) existingImg.style.display = 'none';

    // Show the separate video element
    video.style.display = 'block';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(function (mediaStream) {
            stream = mediaStream;
            video.srcObject = mediaStream;
            // Video element is already visible
            cameraControls.style.display = 'flex'; // Show capture/cancel
            console.log('Camera started successfully');
        })
        .catch(function (error) {
            console.error('Camera error:', error);
            showToast('Error accessing camera: ' + error.message, true);
            stopCamera(); // Cleanup on error
        });
}


function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const preview = document.getElementById('profilePreview');

    if (!video || !canvas || !preview || !video.srcObject || video.style.display === 'none') {
        console.error('Camera not active or elements missing for capture.');
        showToast('Cannot capture photo, camera not active.', true);
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL('image/png');

    // Stop camera stream first (this hides the video element)
    stopCamera();

    // Clear preview div (remove placeholder/old image)
    preview.innerHTML = '';

    // Display captured image *inside* the preview div
    const img = document.createElement('img');
    img.src = dataURL;
    img.alt = "Profile Capture";
    img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
    preview.appendChild(img);
}

function stopCamera() {
    const video = document.getElementById('video');
    const cameraControls = document.getElementById('cameraControls');
    const preview = document.getElementById('profilePreview');

    console.log('Stopping camera...');
    // Stop stream tracks
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    // Hide controls
    if (cameraControls) cameraControls.style.display = 'none';
    // Hide video element
    if (video) {
        video.style.display = 'none';
        video.srcObject = null;
    }

    if (preview) {
        // Check if an image is ALREADY displayed in the preview
        const existingImg = preview.querySelector('img');

        // **Only reset to placeholder IF NO image is currently shown**
        if (!existingImg) {
            console.log("No image found in preview, restoring placeholder.");
            preview.innerHTML = '<div class="profile-placeholder">👤</div>';
        } else {
            console.log("Image already in preview, leaving it visible.");
            // Ensure the existing image is displayed correctly (in case startCamera hid it)
            existingImg.style.display = 'block';
        }
    } else {
        console.error("Profile preview element not found during stopCamera.");
    }
}

// --- Core Authentication Logic ---
async function handleRegistration(event) {
    event.preventDefault();
    const form = event.target;

    // Corrected validation check to ensure we are on STEP 3
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
    const profilePreviewImg = document.querySelector('#profilePreview img'); // Get image element
    const profilePicDataURL = profilePreviewImg ? profilePreviewImg.src : null; // Get image src (Data URL)

    let createdUser = null;

    try {
        // Step 1: Create Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = userCredential.user;
        console.log('Firebase Auth user created:', createdUser.uid);

        // Step 2: Get ID Token
        const idToken = await createdUser.getIdToken();

        // Step 3: Send profile data AND image data URL to backend
        const profileData = {
            firstName, lastName, birthDate, gender, phone, email,
            profilePicDataURL // Include the image data URL
        };
        const backendResponse = await fetch('http://127.0.0.1:5000/create-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify(profileData)
        });

        if (!backendResponse.ok) {
            const errorData = await backendResponse.json();
            const profileError = new Error(errorData.message || 'Failed to save profile/upload image.');
            profileError.code = 'BACKEND_SAVE_FAILED';
            throw profileError;
        }

        // Step 4: Success
        const result = await backendResponse.json();
        console.log('Backend response:', result);
        showToast('Account created successfully!', false);
        setTimeout(() => { window.location.href = 'login.html'; }, 1000);

    } catch (error) {
        console.error('Registration failed:', error); let errorMessage = error.message;
        if (error.code === 'auth/email-already-in-use') { errorMessage = 'Email already registered.'; showToast(errorMessage, true); }
        else if (createdUser) {
            console.warn(`Error post-creation (${createdUser.uid}). Rolling back...`, error);
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) { errorMessage = "Cannot connect to server."; } else if (error.code === 'BACKEND_SAVE_FAILED') { errorMessage = `Profile/Image save failed: ${error.message}.`; } else { errorMessage = `Unexpected profile setup error.`; }
            try { console.log("--> Calling deleteUser..."); await deleteUser(createdUser); console.log("--> Rolled back Auth user."); errorMessage += " (Rolled back)"; showToast(errorMessage, true); }
            catch (deleteError) { console.error("--> Rollback failed:", deleteError); errorMessage = "Inconsistent state. Contact support."; showToast(errorMessage, true); }
        } else { showToast(`Registration Error: ${errorMessage}`, true); }
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
        // Only reset if button is still loading (i.e., error occurred)
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
        // Redirect to the login page after sucessful logout
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        showToast('Logout failed: ${error.message}', true);
        if (logoutButton) {
            setLoading(logoutButton, false, 'Logging out...', 'Logout');
        }
    }
}

// --- Event Listeners (Run on DOMContentLoaded - CORRECTED for 3 Steps & Camera) ---
document.addEventListener('DOMContentLoaded', function () {
    console.log('Auth Service DOMContentLoaded');

    // --- Registration Page Specific Setup ---
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        console.log('Setting up 3-Step Registration Form');
        currentStep = 1; // Initialize step count
        updateUI(); // Initial UI setup

        // Attach Navigation Listeners for 3 Steps
        const nextBtn1 = document.getElementById('nextBtnStep1');
        const prevBtn2 = document.getElementById('prevBtnStep2');
        const nextBtn2 = document.getElementById('nextBtnStep2'); // Step 2 -> 3
        const prevBtn3 = document.getElementById('prevBtnStep3'); // Step 3 -> 2

        if (nextBtn1) nextBtn1.addEventListener('click', (e) => { e.preventDefault(); nextStep(); });
        else console.error('nextBtn1 not found');
        if (prevBtn2) prevBtn2.addEventListener('click', (e) => { e.preventDefault(); prevStep(); });
        else console.error('prevBtn2 not found');
        if (nextBtn2) nextBtn2.addEventListener('click', (e) => { e.preventDefault(); nextStep(); }); // Re-added listener
        else console.error('nextBtn2 not found');
        if (prevBtn3) prevBtn3.addEventListener('click', (e) => { e.preventDefault(); prevStep(); }); // Re-added listener
        else console.error('prevBtn3 not found');

        // Attach Camera/File Listeners
        const fileInput = document.getElementById('fileInput');
        const startCameraBtn = document.getElementById('startCameraBtn');
        const captureBtn = document.getElementById('capturePhotoBtn');
        const stopCameraBtn = document.getElementById('stopCameraBtn');

        if (fileInput) fileInput.addEventListener('change', handleFileUpload); else console.error('fileInput not found');
        if (startCameraBtn) startCameraBtn.addEventListener('click', startCamera); else console.error('startCameraBtn not found');
        if (captureBtn) captureBtn.addEventListener('click', capturePhoto); else console.error('capturePhotoBtn not found');
        if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera); else console.error('stopCameraBtn not found');

        // Attach Registration Submit Listener
        registrationForm.addEventListener('submit', handleRegistration);

        // Attach focus listeners for registration inputs
        registrationForm.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('focus', function () { hideError(this.id + 'Error'); });
        });
        console.log('Registration listeners attached.');
    } // --- End of Registration Setup ---

    // --- Login Page Specific Setup ---
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // ... (Login setup remains the same)
        console.log('Setting up Login Form');
        loginForm.addEventListener('submit', handleLogin);
        loginForm.querySelectorAll('input').forEach(input => {
            input.addEventListener('focus', function () { hideError(this.id + 'Error'); });
        });
        console.log('Login listeners attached.');
    } // --- End of Login Setup ---

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
                // This will now only throw an error for bad input
                await resetPassword(email);

                // --- THIS WILL NOW RUN ---
                // (Unless resetPassword threw an error for invalid input)
                console.log(">>> resetPassword finished, attempting to show success toast.");
                showToast('A password reset link has been sent to your gmail. Check your inbox spam folder)', false);
                // -------------------------

                console.log('Reset link processed for:', email);

                if (emailInput) emailInput.value = '';
                if (resetBtn) {
                    resetBtn.disabled = true;
                    setTimeout(() => { if (resetBtn) resetBtn.disabled = false; }, 10000);
                }

            } catch (err) { // This 'catch' will now only run for 'invalid-email' or 'missing-email'
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
                const successEl = document.getElementById('resetSuccess'); // Still hide this if present
                if (successEl) {
                    successEl.style.display = 'none';
                    successEl.classList.remove('show');
                }
            });
        }
        console.log('Forgot Password listeners attached.');
    } // --- End Forgot Password Setup --

}); // End of DOMContentLoaded