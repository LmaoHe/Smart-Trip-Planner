// Import Firebase modules
import { auth, db, storage } from './firebase-config.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showError, hideError } from './utils.js';

// ===== GLOBAL VARIABLES =====
let dayCount = 1;
let activityCounters = { 1: 1 };
let coverImageFile = null;
let galleryImageFiles = [];
let isEditMode = false;
let currentItineraryId = null;
let existingCoverImageUrl = null;
let existingGalleryImages = [];
let existingActivityImages = {};
let currentPublishStatus = 'draft';
let deletedGalleryImages = [];
let hotelImageFile = null;
let existingHotelImageUrl = null;

// ===== CHECK FOR EDIT MODE =====
const urlParams = new URLSearchParams(window.location.search);
const itineraryIdFromUrl = urlParams.get('id');

if (itineraryIdFromUrl) {
    isEditMode = true;
    currentItineraryId = itineraryIdFromUrl;
}

// ===== DESTINATION DATA =====
const destinationData = {
    'Malaysia': [
        { name: 'Kuala Lumpur' },
        { name: 'Penang' },
        { name: 'Langkawi' }
    ],
    'Singapore': [
        { name: 'Singapore' }
    ],
    'Thailand': [
        { name: 'Bangkok' },
        { name: 'Phuket' },
        { name: 'Chiang Mai' },
        { name: 'Krabi' }
    ],
    'Indonesia': [
        { name: 'Bali' },
        { name: 'Jakarta' },
        { name: 'Yogyakarta' }
    ],
    'Japan': [
        { name: 'Tokyo' },
        { name: 'Osaka' },
        { name: 'Hiroshima' }
    ],
    'South Korea': [
        { name: 'Seoul' },
        { name: 'Busan' },
        { name: 'Jeju Island' }
    ],
    'Vietnam': [
        { name: 'Hanoi' },
        { name: 'Ho Chi Minh City' },
        { name: 'Da Nang' }
    ],
    'Cambodia': [
        { name: 'Siem Reap' }
    ],
    'France': [
        { name: 'Paris' },
        { name: 'Nice' },
        { name: 'Lyon' },
        { name: 'Marseille' }
    ],
    'Italy': [
        { name: 'Rome' },
        { name: 'Venice' },
        { name: 'Florence' },
        { name: 'Milan' },
        { name: 'Naples' }
    ],
    'Spain': [
        { name: 'Barcelona' },
        { name: 'Madrid' },
        { name: 'Seville' },
        { name: 'Valencia' }
    ],
    'United Kingdom': [
        { name: 'London' },
        { name: 'Edinburgh' },
        { name: 'Liverpool' }
    ],
    'Germany': [
        { name: 'Berlin' },
        { name: 'Munich' },
        { name: 'Frankfurt' }
    ],
    'Netherlands': [
        { name: 'Amsterdam' },
        { name: 'Rotterdam' }
    ],
    'Switzerland': [
        { name: 'Zurich' },
        { name: 'Geneva' }
    ],
    'Greece': [
        { name: 'Athens' },
        { name: 'Santorini' },
        { name: 'Mykonos' }
    ],
    'Portugal': [
        { name: 'Lisbon' },
        { name: 'Porto' }
    ],
    'Czech Republic': [
        { name: 'Prague' }
    ],
    'United States': [
        { name: 'New York' },
        { name: 'Los Angeles' },
        { name: 'San Francisco' },
        { name: 'Las Vegas' },
        { name: 'Miami' },
        { name: 'Orlando' }
    ],
    'Canada': [
        { name: 'Toronto' },
        { name: 'Vancouver' },
        { name: 'Montreal' }
    ],
    'Brazil': [
        { name: 'Rio de Janeiro' },
        { name: 'São Paulo' }
    ],
    'Mexico': [
        { name: 'Cancun' },
        { name: 'Mexico City' },
        { name: 'Guadalajara' }
    ],
    'Peru': [
        { name: 'Cusco' },
        { name: 'Lima' }
    ],
    'Argentina': [
        { name: 'Buenos Aires' }
    ],
    'United Arab Emirates': [
        { name: 'Dubai' },
        { name: 'Abu Dhabi' }
    ],
    'Turkey': [
        { name: 'Istanbul' },
        { name: 'Cappadocia' }
    ],
    'Egypt': [
        { name: 'Cairo' },
        { name: 'Luxor' },
        { name: 'Sharm El Sheikh' }
    ],
    'Morocco': [
        { name: 'Marrakech' },
        { name: 'Casablanca' }
    ],
    'South Africa': [
        { name: 'Cape Town' }
    ],
    'Australia': [
        { name: 'Sydney' },
        { name: 'Melbourne' },
        { name: 'Gold Coast' }
    ],
    'New Zealand': [
        { name: 'Auckland' },
        { name: 'Queenstown' }
    ]
};

async function loadItineraryForEdit() {
    console.log('🔍 loadItineraryForEdit called');
    console.log('🔍 isEditMode:', isEditMode);
    console.log('🔍 currentItineraryId:', currentItineraryId);

    if (!isEditMode || !currentItineraryId) {
        console.log('⚠️ Not in edit mode or no ID provided');
        return;
    }

    try {
        console.log('📝 Loading itinerary for edit:', currentItineraryId);

        const docRef = doc(db, 'itineraries', currentItineraryId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.error('❌ Itinerary not found:', currentItineraryId);
            alert('Itinerary not found.');
            window.location.href = 'itineraryHub.html';
            return;
        }

        const data = docSnap.data();
        console.log('✅ Itinerary data loaded:', data);

        // Store the publish status
        currentPublishStatus = data.publishStatus || 'draft';
        console.log('📊 Current publish status:', currentPublishStatus);

        // ===== UPDATE PAGE TITLE & BUTTON BASED ON PUBLISH STATUS =====
        try {
            console.log('📝 Step 1: Updating page title and button...');
            const pageTitle = document.querySelector('.page-title');
            const submitBtn = document.getElementById('submit-btn');
            const saveDraftBtn = document.getElementById('save-draft-btn');

            if (currentPublishStatus === 'draft') {
                // DRAFT MODE
                if (pageTitle) pageTitle.textContent = 'Edit Draft';
                if (submitBtn) {
                    submitBtn.textContent = 'Publish Itinerary';
                    submitBtn.classList.add('btn-publish');
                }
                if (saveDraftBtn) {
                    saveDraftBtn.style.display = 'inline-block';
                    saveDraftBtn.textContent = 'Update Draft';
                }
                console.log('  ✅ Set to DRAFT mode');
            } else {
                // PUBLISHED MODE
                if (pageTitle) pageTitle.textContent = 'Edit Itinerary';
                if (submitBtn) {
                    submitBtn.textContent = 'Update Itinerary';
                    submitBtn.classList.remove('btn-publish');
                }
                if (saveDraftBtn) {
                    saveDraftBtn.style.display = 'none';
                }
                console.log('  ✅ Set to PUBLISHED mode');
            }
            console.log('✅ Step 1 complete');
        } catch (e) {
            console.error('❌ Step 1 failed:', e.message, e);
        }

        // ===== POPULATE BASIC INFORMATION =====
        try {
            console.log('📝 Step 2: Populating basic information...');
            const titleInput = document.getElementById('itinerary-title');
            if (titleInput) {
                titleInput.value = data.title || '';
                console.log('  ✅ Title set');
            } else {
                console.warn('  ⚠️ Title input not found');
            }

            const countrySelect = document.getElementById('country');
            if (countrySelect) {
                countrySelect.value = data.destination?.country || '';
                console.log('  ✅ Country set');

                // Trigger country change to populate cities
                countrySelect.dispatchEvent(new Event('change'));

                // Wait for cities to populate, then set city
                setTimeout(() => {
                    const citySelect = document.getElementById('city');
                    if (citySelect) {
                        citySelect.value = data.destination?.city || '';
                        console.log('  ✅ City set');
                    } else {
                        console.warn('  ⚠️ City select not found');
                    }
                }, 100);
            } else {
                console.warn('  ⚠️ Country select not found');
            }
            console.log('✅ Step 2 complete');
        } catch (e) {
            console.error('❌ Step 2 failed:', e.message, e);
        }

        // ===== POPULATE DURATION & BUDGET =====
        try {
            console.log('📝 Step 3: Populating duration & budget...');
            const daysInput = document.getElementById('days');
            const nightsInput = document.getElementById('nights');
            const fixedPriceInput = document.getElementById('fixed-price');

            if (daysInput) daysInput.value = data.duration?.days || 0;
            if (nightsInput) nightsInput.value = data.duration?.nights || 0;
            if (fixedPriceInput) fixedPriceInput.value = data.price || '';
            console.log('✅ Step 3 complete');
        } catch (e) {
            console.error('❌ Step 3 failed:', e.message, e);
        }

        // ===== POPULATE SUITABLE FOR =====
        try {
            console.log('📝 Step 4: Populating suitable for...');
            const suitableFor = data.suitableFor || [];
            suitableFor.forEach(value => {
                const checkbox = document.querySelector(`input[name="suitable-for"][value="${value}"]`);
                if (checkbox) checkbox.checked = true;
            });
            console.log('✅ Step 4 complete');
        } catch (e) {
            console.error('❌ Step 4 failed:', e.message, e);
        }

        // ===== COVER IMAGE =====
        try {
            console.log('📝 Step 5: Setting cover image...');
            existingCoverImageUrl = data.coverImage || null;

            const coverPreview = document.getElementById('cover-preview');
            const coverImageInput = document.getElementById('cover-image');

            if (existingCoverImageUrl) {
                // Show preview with circular delete button
                if (coverPreview) {
                    coverPreview.innerHTML = `
                <div style="position: relative; display: inline-block;">
                    <img src="${existingCoverImageUrl}" 
                         style="max-width: 100%; max-height: 300px; border-radius: 8px; display: block;">
                    <button type="button" 
                            id="remove-cover-btn" 
                            style="position: absolute; top: 4px; right: 4px; background: #ff4444; 
                                   color: white; border: none; border-radius: 50%; width: 28px; 
                                   height: 28px; cursor: pointer; font-weight: bold; font-size: 16px;
                                   display: flex; align-items: center; justify-content: center;">
                        ×
                    </button>
                </div>
            `;

                    // Attach delete handler WITHOUT confirmation
                    const removeBtn = document.getElementById('remove-cover-btn');
                    if (removeBtn) {
                        removeBtn.addEventListener('click', function () {
                            existingCoverImageUrl = null;
                            coverPreview.innerHTML = '<p style="color: #999;">Cover image removed. Please upload a new one.</p>';
                            if (coverImageInput) {
                                coverImageInput.setAttribute('required', 'required');
                            }
                            console.log('Cover image removed');
                        });
                    }

                    console.log('✅ Cover image preview with circular delete button set');
                }

                // Remove required attribute in edit mode (has existing image)
                if (coverImageInput) {
                    coverImageInput.removeAttribute('required');
                    console.log('  ✅ Made cover image optional (has existing)');
                }
            } else {
                // No existing image - make required
                if (coverImageInput) {
                    coverImageInput.setAttribute('required', 'required');
                    console.log('  ℹ️ Cover image required (no existing)');
                }
            }
            console.log('✅ Step 5 complete');
        } catch (e) {
            console.error('❌ Step 5 failed:', e.message, e);
        }

        // ===== STEP 6: GALLERY IMAGES (Horizontal Layout) =====
        try {
            console.log('📝 Step 6: Setting gallery images...');
            existingGalleryImages = data.galleryImages || [];
            deletedGalleryImages = [];

            const galleryPreview = document.getElementById('gallery-preview');

            if (existingGalleryImages.length > 0 && galleryPreview) {
                galleryPreview.innerHTML = `
            <div id="existing-gallery-container" style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                ${existingGalleryImages.map((imgUrl, index) => `
                    <div class="existing-gallery-item" data-image-url="${imgUrl}" data-index="${index}" 
                         style="position: relative; width: 150px; height: 150px; flex-shrink: 0;">
                        <img src="${imgUrl}" 
                             style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;">
                        <button type="button" 
                                class="remove-gallery-btn" 
                                data-index="${index}"
                                style="position: absolute; top: 4px; right: 4px; background: #ff4444; color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-weight: bold; font-size: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;">
                            ×
                        </button>
                    </div>
                `).join('')}
            </div>
        `;

                // Attach delete handlers to all remove buttons
                const removeButtons = document.querySelectorAll('.remove-gallery-btn');
                removeButtons.forEach(btn => {
                    btn.addEventListener('click', function () {
                        const index = parseInt(this.getAttribute('data-index'));
                        const imageUrl = existingGalleryImages[index];

                        // Add to deleted list
                        deletedGalleryImages.push(imageUrl);

                        // Remove from DOM immediately
                        const galleryItem = this.closest('.existing-gallery-item');
                        if (galleryItem) {
                            galleryItem.remove();
                        }

                        // Check if container is now empty and clear it
                        const container = document.getElementById('existing-gallery-container');
                        if (container && container.children.length === 0) {
                            galleryPreview.innerHTML = '';
                        }

                        console.log('Gallery image removed:', imageUrl);
                    });
                });

                console.log('✅ Gallery images with delete buttons set');
            } else {
                // No images - leave blank (no message)
                if (galleryPreview) {
                    galleryPreview.innerHTML = '';
                }
                console.log('  ℹ️ No existing gallery images - preview left blank');
            }
            console.log('✅ Step 6 complete');
        } catch (e) {
            console.error('❌ Step 6 failed:', e.message, e);
        }

        // ===== OVERVIEW =====
        try {
            console.log('📝 Step 7: Populating overview...');
            const shortSummaryInput = document.getElementById('short-summary');
            const detailedDescInput = document.getElementById('detailed-description');

            if (shortSummaryInput) shortSummaryInput.value = data.shortSummary || '';
            if (detailedDescInput) detailedDescInput.value = data.detailedDescription || '';

            const charCount = document.querySelector('.char-count');
            if (charCount) {
                charCount.textContent = `${(data.shortSummary || '').length} / 150 characters`;
            }
            console.log('✅ Step 7 complete');
        } catch (e) {
            console.error('❌ Step 7 failed:', e.message, e);
        }

        // ===== HIGHLIGHTS =====
        try {
            console.log('📝 Step 8: Populating highlights...');
            const highlightsContainer = document.getElementById('highlights-container');
            if (highlightsContainer) {
                highlightsContainer.innerHTML = '';
                const highlights = data.highlights || [];
                if (highlights.length > 0) {
                    highlights.forEach((highlight, index) => {
                        const highlightItem = document.createElement('div');
                        highlightItem.className = 'highlight-item';
                        highlightItem.innerHTML = `
                            <input type="text" name="highlight" value="${highlight}" placeholder="e.g., Visit UNESCO World Heritage Sites" required>
                            <button type="button" class="btn-remove-highlight" ${index === 0 ? 'disabled' : ''}>Remove</button>
                        `;
                        highlightsContainer.appendChild(highlightItem);
                    });
                }

                // Check if function exists before calling
                if (typeof attachHighlightRemoveListeners === 'function') {
                    attachHighlightRemoveListeners();
                    console.log('✅ Step 8 complete');
                } else {
                    console.warn('  ⚠️ attachHighlightRemoveListeners not defined');
                }
            } else {
                console.warn('  ⚠️ Highlights container not found');
            }
        } catch (e) {
            console.error('❌ Step 8 failed:', e.message, e);
        }

        // ===== STEP 8.5: POPULATE INCLUDES =====
        try {
            console.log('📝 Step 8.5: Populating includes...');
            const includesContainer = document.getElementById('includes-container');
            if (includesContainer) {
                includesContainer.innerHTML = '';
                const includes = data.includes || [];
                
                if (includes.length > 0) {
                    includes.forEach((include, index) => {
                        const includeItem = document.createElement('div');
                        includeItem.className = 'include-item';
                        includeItem.innerHTML = `
                            <input type="text" name="include" value="${include}" placeholder="e.g., Hotel breakfast included">
                            <button type="button" class="btn-remove-include" ${index === 0 ? 'disabled' : ''}>Remove</button>
                        `;
                        includesContainer.appendChild(includeItem);
                    });
                    
                    // Attach remove listeners
                    if (typeof attachIncludeRemoveListeners === 'function') {
                        attachIncludeRemoveListeners();
                    }
                } else {
                    // Add default empty one
                    if (typeof addInclude === 'function') {
                        addInclude();
                    }
                }
                console.log('✅ Step 8.5 complete');
            } else {
                console.warn('  ⚠️ Includes container not found');
            }
        } catch (e) {
            console.error('❌ Step 8.5 failed:', e.message, e);
        }

        // ===== STEP 8.6: POPULATE EXCLUDES =====
        try {
            console.log('📝 Step 8.6: Populating excludes...');
            const excludesContainer = document.getElementById('excludes-container');
            if (excludesContainer) {
                excludesContainer.innerHTML = '';
                const excludes = data.notIncludes || [];
                
                if (excludes.length > 0) {
                    excludes.forEach((exclude, index) => {
                        const excludeItem = document.createElement('div');
                        excludeItem.className = 'exclude-item';
                        excludeItem.innerHTML = `
                            <input type="text" name="exclude" value="${exclude}" placeholder="e.g., International flights">
                            <button type="button" class="btn-remove-exclude" ${index === 0 ? 'disabled' : ''}>Remove</button>
                        `;
                        excludesContainer.appendChild(excludeItem);
                    });
                    
                    // Attach remove listeners
                    if (typeof attachExcludeRemoveListeners === 'function') {
                        attachExcludeRemoveListeners();
                    }
                } else {
                    // Add default empty one
                    if (typeof addExclude === 'function') {
                        addExclude();
                    }
                }
                console.log('✅ Step 8.6 complete');
            } else {
                console.warn('  ⚠️ Excludes container not found');
            }
        } catch (e) {
            console.error('❌ Step 8.6 failed:', e.message, e);
        }

        // ===== STEP 8.7: POPULATE BOOKING SETTINGS =====
        try {
            console.log('📝 Step 8.7: Populating booking settings...');
            
            const maxPeopleInput = document.getElementById('max-people');
            const interestThresholdInput = document.getElementById('interest-threshold');
            const minPeopleInput = document.getElementById('min-people');
            
            if (maxPeopleInput) maxPeopleInput.value = data.maxBookings || 20;
            if (interestThresholdInput) interestThresholdInput.value = data.interestThreshold || 10;
            if (minPeopleInput) minPeopleInput.value = data.minPeople || '';
            
            console.log('✅ Step 8.7 complete');
        } catch (e) {
            console.error('❌ Step 8.7 failed:', e.message, e);
        }

        // ===== STEP 8.8: POPULATE HOTEL INFORMATION =====
        try {
            console.log('📝 Step 8.8: Populating hotel information...');
            
            const hotel = data.hotel || {};
            
            const hotelNameInput = document.getElementById('hotel-name');
            const hotelCategorySelect = document.getElementById('hotel-category');
            const hotelRoomTypeInput = document.getElementById('hotel-room-type');
            const hotelRatingSelect = document.getElementById('hotel-rating');
            const hotelLocationInput = document.getElementById('hotel-location');
            const hotelDescriptionTextarea = document.getElementById('hotel-description');
            
            if (hotelNameInput) hotelNameInput.value = hotel.name || '';
            if (hotelCategorySelect) hotelCategorySelect.value = hotel.category || '';
            if (hotelRoomTypeInput) hotelRoomTypeInput.value = hotel.roomType || '';
            if (hotelRatingSelect) hotelRatingSelect.value = hotel.rating || '';
            if (hotelLocationInput) hotelLocationInput.value = hotel.location || '';
            if (hotelDescriptionTextarea) hotelDescriptionTextarea.value = hotel.description || '';
            
            // Handle hotel image
            existingHotelImageUrl = hotel.image || null;
            const hotelImagePreview = document.getElementById('hotel-image-preview');
            const hotelImageInput = document.getElementById('hotel-image');
            
            if (existingHotelImageUrl) {
                if (hotelImagePreview) {
                    hotelImagePreview.innerHTML = `
                        <div style="position: relative; display: inline-block;">
                            <img src="${existingHotelImageUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; display: block;">
                            <button type="button" id="remove-hotel-image-btn" 
                                    style="position: absolute; top: 4px; right: 4px; background: #ff4444; color: white; 
                                           border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; 
                                           font-weight: bold; font-size: 16px; display: flex; align-items: center; 
                                           justify-content: center;">×</button>
                        </div>
                    `;
                    hotelImagePreview.classList.add('has-image');
                    
                    // Attach delete handler
                    const removeBtn = document.getElementById('remove-hotel-image-btn');
                    if (removeBtn) {
                        removeBtn.addEventListener('click', function() {
                            existingHotelImageUrl = null;
                            hotelImagePreview.innerHTML = '<p style="color: #999;">Hotel image removed. Please upload a new one.</p>';
                            hotelImagePreview.classList.remove('has-image');
                            if (hotelImageInput) {
                                hotelImageInput.setAttribute('required', 'required');
                            }
                            console.log('Hotel image removed');
                        });
                    }
                }
                // Make hotel image optional (has existing)
                if (hotelImageInput) {
                    hotelImageInput.removeAttribute('required');
                }
            } else {
                // No existing image - make required
                if (hotelImageInput) {
                    hotelImageInput.setAttribute('required', 'required');
                }
            }
            
            console.log('✅ Step 8.8 complete');
        } catch (e) {
            console.error('❌ Step 8.8 failed:', e.message, e);
        }

        // ===== DAYS & ACTIVITIES =====
        try {
            console.log('📝 Step 9: Populating days & activities...');
            const daysContainer = document.getElementById('days-container');
            if (!daysContainer) {
                console.error('  ❌ Days container not found!');
                throw new Error('days-container element not found');
            }

            daysContainer.innerHTML = '';
            const days = data.days || [];

            dayCount = 0;
            activityCounters = {};

            days.forEach((day, dayIndex) => {
                dayCount++;
                const dayNumber = dayCount;
                activityCounters[dayNumber] = day.activities?.length || 1;

                // Build activities HTML
                let activitiesHTML = '';
                if (day.activities && day.activities.length > 0) {
                    day.activities.forEach((activity, actIndex) => {
                        const activityNum = actIndex + 1;

                        // Store existing activity image
                        if (activity.image) {
                            if (!existingActivityImages[dayNumber]) {
                                existingActivityImages[dayNumber] = {};
                            }
                            existingActivityImages[dayNumber][actIndex] = activity.image;
                        }

                        activitiesHTML += `
                            <div class="activity-block">
                                <div class="activity-header">
                                    <span>Activity ${activityNum}</span>
                                    <button type="button" class="btn-remove-activity" ${actIndex === 0 ? 'disabled' : ''}>Remove</button>
                                </div>

                                <div class="form-group">
                                    <label>Activity Name <span class="required">*</span></label>
                                    <input type="text" name="day-${dayNumber}-activity-name" value="${activity.name || ''}" required placeholder="e.g., Visit local market">
                                </div>

                                <div class="form-group">
                                    <label>Category <span class="required">*</span></label>
                                    <select name="day-${dayNumber}-activity-category" required>
                                        <option value="">Select Category</option>
                                        <option value="food" ${activity.category === 'food' ? 'selected' : ''}>Food</option>
                                        <option value="attraction" ${activity.category === 'attraction' ? 'selected' : ''}>Attraction</option>
                                        <option value="shopping" ${activity.category === 'shopping' ? 'selected' : ''}>Shopping</option>
                                        <option value="nature" ${activity.category === 'nature' ? 'selected' : ''}>Nature</option>
                                        <option value="culture" ${activity.category === 'culture' ? 'selected' : ''}>Culture</option>
                                        <option value="adventure" ${activity.category === 'adventure' ? 'selected' : ''}>Adventure</option>
                                        <option value="relaxation" ${activity.category === 'relaxation' ? 'selected' : ''}>Relaxation</option>
                                        <option value="transportation" ${activity.category === 'transportation' ? 'selected' : ''}>Transportation</option>
                                    </select>handleCoverImagePreview
                                </div>

                                <div class="form-group">
                                    <label>Time (Optional)</label>
                                    <input type="time" name="day-${dayNumber}-activity-time" value="${activity.time || ''}">
                                </div>

                                <div class="form-group">
                                    <label>Description</label>
                                    <textarea name="day-${dayNumber}-activity-description" rows="2" placeholder="Brief description...">${activity.description || ''}</textarea>
                                </div>

                                <div class="form-group">
                                    <label>Activity Image (Optional)</label>
                                    <input type="file" name="day-${dayNumber}-activity-image" accept="image/*">
                                    ${activity.image ? `<div style="margin-top: 8px;"><img src="${activity.image}" style="max-width: 200px; border-radius: 8px;"><br><small>Current image (upload new to replace)</small></div>` : ''}
                                </div>

                                <div class="form-group">
                                    <label>Estimated Cost (RM) - Optional</label>
                                    <input type="number" name="day-${dayNumber}-activity-cost" min="0" step="0.01" value="${activity.cost || ''}" placeholder="e.g., 50.00">
                                </div>
                            </div>
                        `;
                    });
                }

                const dayBlock = document.createElement('div');
                dayBlock.className = 'day-block';
                dayBlock.setAttribute('data-day', dayNumber);

                dayBlock.innerHTML = `
                    <div class="day-header">
                        <h3>Day ${dayNumber}</h3>
                        <button type="button" class="btn-remove-day" ${dayNumber === 1 ? 'disabled' : ''}>Remove Day</button>
                    </div>

                    <div class="form-group">
                        <label for="day-${dayNumber}-title">Day Title <span class="required">*</span></label>
                        <input type="text" id="day-${dayNumber}-title" name="day-${dayNumber}-title" value="${day.title || ''}" required placeholder="e.g., Explore Hidden Gems">
                    </div>

                    <div class="form-group">
                        <label for="day-${dayNumber}-description">Day Description <span class="required">*</span></label>
                        <textarea id="day-${dayNumber}-description" name="day-${dayNumber}-description" rows="3" required placeholder="Brief overview...">${day.description || ''}</textarea>
                    </div>

                    <div class="activities-container">
                        <h4>Activities</h4>
                        ${activitiesHTML}
                        <button type="button" class="btn-add-activity" data-day="${dayNumber}">+ Add Activity</button>
                    </div>
                `;

                daysContainer.appendChild(dayBlock);
                console.log(`  ✅ Day ${dayNumber} added`);
            });

            // Check if functions exist before calling
            if (typeof attachDayRemoveListeners === 'function') {
                attachDayRemoveListeners();
            } else {
                console.warn('  ⚠️ attachDayRemoveListeners not defined');
            }

            if (typeof attachActivityListeners === 'function') {
                attachActivityListeners();
            } else {
                console.warn('  ⚠️ attachActivityListeners not defined');
            }

            console.log('✅ Step 9 complete');
        } catch (e) {
            console.error('❌ Step 9 failed:', e.message, e);
            console.error('  Error stack:', e.stack);
        }

        // ===== TAGS =====
        try {
            console.log('📝 Step 10: Populating tags...');
            const tags = data.tags || [];
            tags.forEach(tag => {
                const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
                if (checkbox) checkbox.checked = true;
            });
            console.log('✅ Step 10 complete');
        } catch (e) {
            console.error('❌ Step 10 failed:', e.message, e);
        }

        // ===== SEASON =====
        try {
            console.log('📝 Step 11: Populating season');
            const seasonSelect = document.getElementById('season-suitability');
            if (seasonSelect) seasonSelect.value = data.seasonSuitability || '';

            console.log('✅ Step 11 complete');
        } catch (e) {
            console.error('❌ Step 11 failed:', e.message, e);
        }

        console.log('✅ Form populated successfully!');

    } catch (error) {
        console.error('❌ Error loading itinerary:', error);
        console.error('❌ Error name:', error?.name);
        console.error('❌ Error message:', error?.message);
        console.error('❌ Error stack:', error?.stack);

        alert('Error loading itinerary: ' + (error?.message || 'Unknown error'));
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    initializeEventListeners();
    initializeCharacterCounter();
    initializeDestinationDropdowns();

    // Load itinerary data if in edit mode
    if (isEditMode) {
        await loadItineraryForEdit();
    }
});

// ===== DESTINATION HANDLING =====
function initializeDestinationDropdowns() {
    const countrySelect = document.getElementById('country');
    const citySelect = document.getElementById('city');

    // Country change handler
    countrySelect.addEventListener('change', function () {
        const selectedCountry = this.value;
        hideError('country-error');

        // Reset city dropdown
        citySelect.innerHTML = '<option value="">Select a city</option>';
        citySelect.value = '';
        hideError('city-error');

        if (selectedCountry) {
            // Enable city dropdown
            citySelect.disabled = false;

            // Populate cities for selected country
            const cities = destinationData[selectedCountry];
            if (cities && cities.length > 0) {
                cities.forEach(city => {
                    const option = document.createElement('option');
                    option.value = city.name;
                    option.textContent = city.name;
                    citySelect.appendChild(option);
                });
            }
        } else {
            // Disable city dropdown if no country selected
            citySelect.disabled = true;
            citySelect.innerHTML = '<option value="">Select country first</option>';
        }
    });

    // City change handler
    citySelect.addEventListener('change', function () {
        if (this.value) {
            hideError('city-error');
        }
    });
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Highlights
    document.getElementById('add-highlight-btn').addEventListener('click', addHighlight);
    attachHighlightRemoveListeners();

    // ADD THESE: Includes & Excludes
    document.getElementById('add-include-btn').addEventListener('click', addInclude);
    document.getElementById('add-exclude-btn').addEventListener('click', addExclude);
    attachIncludeRemoveListeners();
    attachExcludeRemoveListeners();

    // Days
    document.getElementById('add-day-btn').addEventListener('click', addDay);

    // Cover Image Preview
    document.getElementById('cover-image').addEventListener('change', handleCoverImagePreview);

    // Gallery Images Preview
    document.getElementById('gallery-images').addEventListener('change', handleGalleryImagesPreview);

    // ADD THIS: Hotel image preview
    document.getElementById('hotel-image').addEventListener('change', handleHotelImagePreview);

    // Form Submission
    document.getElementById('addTripForm').addEventListener('submit', handleFormSubmit);

    // Save Draft
    document.getElementById('save-draft-btn').addEventListener('click', saveDraft);

    // Cancel
    document.getElementById('cancel-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to cancel? All unsaved changes will be lost.')) {
            window.location.href = 'itineraryHub.html';
        }
    });

    // Budget validation
    document.getElementById('fixed-price').addEventListener('input', validateFixedPrice);

    // Real-time validation (Clear error on input)
    setupRealTimeValidation();
}

// ===== REAL-TIME VALIDATION =====
function setupRealTimeValidation() {
    // Clear errors when user starts typing
    const inputs = document.querySelectorAll('input[required], textarea[required], select[required]');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const errorId = input.id + '-error';
            hideError(errorId);
        });

        if (input.tagName === 'SELECT') {
            input.addEventListener('change', () => {
                const errorId = input.id + '-error';
                hideError(errorId);
            });
        }
    });
}

// ===== CHARACTER COUNTER =====
function initializeCharacterCounter() {
    const shortSummary = document.getElementById('short-summary');
    const charCount = document.querySelector('.char-count');

    shortSummary.addEventListener('input', () => {
        const currentLength = shortSummary.value.length;
        charCount.textContent = `${currentLength} / 150 characters`;
    });
}

// ===== VALIDATION FUNCTIONS =====
function validateFixedPrice() {
    const priceInput = document.getElementById('fixed-price');
    const priceError = document.getElementById('fixed-price-error');
    const value = parseFloat(priceInput.value);

    if (!value || value <= 0 || isNaN(value)) {
        priceError.style.display = 'block';
        priceError.textContent = 'Please enter a valid, positive trip price.';
    } else {
        priceError.style.display = 'none';
        priceError.textContent = '';
    }
}

function validateDestination() {
    let isValid = true;
    const country = document.getElementById('country').value;
    const city = document.getElementById('city').value;

    hideError('country-error');
    hideError('city-error');

    if (!country) {
        showError('country-error', 'Please select a country.');
        document.getElementById('country').focus();
        isValid = false;
    }

    if (!city) {
        showError('city-error', 'Please select a city.');
        if (isValid) document.getElementById('city').focus();
        isValid = false;
    }

    return isValid;
}

function validateBasicInfo() {
    let isValid = true;
    // Get field values
    const title = document.getElementById('itinerary-title').value.trim();
    const days = parseInt(document.getElementById('days').value, 10);
    const nights = parseInt(document.getElementById('nights').value, 10);
    const fixedPrice = parseFloat(document.getElementById('fixed-price').value);

    // Clear old errors
    hideError('itinerary-title-error');
    hideError('days-error');
    hideError('nights-error');
    hideError('fixed-price-error');

    // Title validation
    if (!title) {
        showError('itinerary-title-error', 'Please enter an itinerary title.');
        document.getElementById('itinerary-title').focus();
        isValid = false;
    } else if (title.length < 10) {
        showError('itinerary-title-error', 'Itinerary title must be at least 10 characters long.');
        document.getElementById('itinerary-title').focus();
        isValid = false;
    }

    // Destination validation (your own function)
    if (!validateDestination()) {
        isValid = false;
    }

    // Days validation
    if (!days || days < 1) {
        showError('days-error', 'Please enter a valid number of days (minimum 1).');
        if (isValid) document.getElementById('days').focus();
        isValid = false;
    }

    // Nights validation
    if (typeof nights !== 'number' || nights < 0) {
        showError('nights-error', 'Number of nights cannot be negative.');
        if (isValid) document.getElementById('nights').focus();
        isValid = false;
    }

    // Fixed price validation - always required, must be positive
    if (!fixedPrice || fixedPrice <= 0 || isNaN(fixedPrice)) {
        showError('fixed-price-error', 'Please enter a valid, positive trip price.');
        if (isValid) document.getElementById('fixed-price').focus();
        isValid = false;
    }

    return isValid;
}

function validateCoverImage() {
    hideError('cover-image-error');

    // In edit mode with existing image, OR new file uploaded
    if (!coverImageFile && !existingCoverImageUrl) {
        showError('cover-image-error', 'Please upload a cover image.');
        document.getElementById('cover-image').focus();
        return false;
    }

    if (coverImageFile) {
        const maxSize = 5 * 1024 * 1024;
        if (coverImageFile.size > maxSize) {
            showError('cover-image-error', 'Cover image must be less than 5MB.');
            document.getElementById('cover-image').focus();
            return false;
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(coverImageFile.type)) {
            showError('cover-image-error', 'Cover image must be in JPEG, PNG, or WebP format.');
            document.getElementById('cover-image').focus();
            return false;
        }
    }

    return true;
}

function validateOverview() {
    let isValid = true;
    const shortSummary = document.getElementById('short-summary').value.trim();
    const detailedDescription = document.getElementById('detailed-description').value.trim();

    hideError('short-summary-error');
    hideError('detailed-description-error');

    if (!shortSummary) {
        showError('short-summary-error', 'Please enter a short summary.');
        document.getElementById('short-summary').focus();
        isValid = false;
    } else if (shortSummary.length < 20) {
        showError('short-summary-error', 'Short summary must be at least 20 characters long.');
        document.getElementById('short-summary').focus();
        isValid = false;
    }

    if (!detailedDescription) {
        showError('detailed-description-error', 'Please enter a detailed description.');
        if (isValid) document.getElementById('detailed-description').focus();
        isValid = false;
    } else if (detailedDescription.length < 100) {
        showError('detailed-description-error', 'Detailed description must be at least 100 characters long.');
        if (isValid) document.getElementById('detailed-description').focus();
        isValid = false;
    }

    return isValid;
}

function validateHighlights() {
    hideError('highlights-error');

    const highlights = Array.from(document.querySelectorAll('input[name="highlight"]'))
        .map(input => input.value.trim())
        .filter(value => value !== '');

    if (highlights.length < 3) {
        showError('highlights-error', 'Please add at least 3 highlights.');
        document.querySelector('input[name="highlight"]').focus();
        return false;
    }

    if (highlights.length > 10) {
        showError('highlights-error', 'Maximum 10 highlights allowed.');
        return false;
    }

    // Check for duplicate highlights
    const uniqueHighlights = new Set(highlights.map(h => h.toLowerCase()));
    if (uniqueHighlights.size < highlights.length) {
        showError('highlights-error', 'Duplicate highlights found. Please ensure each highlight is unique.');
        return false;
    }

    return true;
}

function validateDays() {
    hideError('days-error-message');

    const dayBlocks = document.querySelectorAll('.day-block');

    if (dayBlocks.length === 0) {
        showError('days-error-message', 'Please add at least one day to the itinerary.');
        return false;
    }

    for (let i = 0; i < dayBlocks.length; i++) {
        const dayNumber = i + 1;
        const dayTitle = document.getElementById(`day-${dayNumber}-title`);
        const dayDescription = document.getElementById(`day-${dayNumber}-description`);

        const titleErrorId = `day-${dayNumber}-title-error`;
        const descErrorId = `day-${dayNumber}-description-error`;

        hideError(titleErrorId);
        hideError(descErrorId);

        if (!dayTitle || !dayTitle.value.trim()) {
            showError(titleErrorId, `Please enter a title for Day ${dayNumber}.`);
            dayTitle.focus();
            return false;
        }

        if (!dayDescription || !dayDescription.value.trim()) {
            showError(descErrorId, `Please enter a description for Day ${dayNumber}.`);
            dayDescription.focus();
            return false;
        }

        if (dayDescription.value.trim().length < 20) {
            showError(descErrorId, `Day ${dayNumber} description must be at least 20 characters long.`);
            dayDescription.focus();
            return false;
        }

        // Validate activities for this day
        if (!validateActivitiesForDay(dayBlocks[i], dayNumber)) {
            return false;
        }
    }

    return true;
}

function validateActivitiesForDay(dayBlock, dayNumber) {
    const activityBlocks = dayBlock.querySelectorAll('.activity-block');

    if (activityBlocks.length === 0) {
        showError(`day-${dayNumber}-activities-error`, `Please add at least one activity for Day ${dayNumber}.`);
        return false;
    }

    for (let i = 0; i < activityBlocks.length; i++) {
        const activityBlock = activityBlocks[i];
        const activityNum = i + 1;

        // Get activity fields
        const nameInput = activityBlock.querySelector('input[name*="activity-name"]');
        const categorySelect = activityBlock.querySelector('select[name*="activity-category"]');

        if (!nameInput || !nameInput.value.trim()) {
            showError(`day-${dayNumber}-activity-${activityNum}-name-error`,
                `Please enter a name for Activity ${activityNum} in Day ${dayNumber}.`);
            nameInput.focus();
            return false;
        }

        if (!categorySelect || !categorySelect.value) {
            showError(`day-${dayNumber}-activity-${activityNum}-category-error`,
                `Please select a category for Activity ${activityNum} in Day ${dayNumber}.`);
            categorySelect.focus();
            return false;
        }

        // Validate activity image size if uploaded
        const imageInput = activityBlock.querySelector('input[type="file"]');
        if (imageInput && imageInput.files[0]) {
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (imageInput.files[0].size > maxSize) {
                showError(`day-${dayNumber}-activity-${activityNum}-image-error`,
                    `Image for Activity ${activityNum} in Day ${dayNumber} must be less than 5MB.`);
                return false;
            }
        }
    }

    return true;
}

function validateTags() {
    hideError('tags-error');

    const tags = document.querySelectorAll('input[name="tags"]:checked');

    if (tags.length === 0) {
        showError('tags-error', 'Please select at least one tag.');
        document.querySelector('input[name="tags"]').focus();
        return false;
    }

    return true;
}

function validateGalleryImages() {
    hideError('gallery-images-error');

    if (galleryImageFiles.length > 0) {
        const maxSize = 5 * 1024 * 1024; // 5MB per image
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

        for (let i = 0; i < galleryImageFiles.length; i++) {
            const file = galleryImageFiles[i];

            if (file.size > maxSize) {
                showError('gallery-images-error', `Gallery image "${file.name}" is too large. Maximum size is 5MB.`);
                return false;
            }

            if (!validTypes.includes(file.type)) {
                showError('gallery-images-error', `Gallery image "${file.name}" must be in JPEG, PNG, or WebP format.`);
                return false;
            }
        }

        if (galleryImageFiles.length > 10) {
            showError('gallery-images-error', 'Maximum 10 gallery images allowed.');
            return false;
        }
    }

    return true;
}

function validateIncludes() {
    hideError('includes-error');

    const includes = Array.from(document.querySelectorAll('input[name="include"]'))
        .map(input => input.value.trim())
        .filter(value => value !== '');

    if (includes.length < 3) {
        showError('includes-error', 'Please add at least 3 items to "What\'s Included".');
        document.querySelector('input[name="include"]').focus();
        return false;
    }

    return true;
}

function validateExcludes() {
    hideError('excludes-error');

    const excludes = Array.from(document.querySelectorAll('input[name="exclude"]'))
        .map(input => input.value.trim())
        .filter(value => value !== '');

    if (excludes.length < 2) {
        showError('excludes-error', 'Please add at least 2 items to "What\'s NOT Included".');
        document.querySelector('input[name="exclude"]').focus();
        return false;
    }

    return true;
}

function validateBookingSettings() {
    let isValid = true;
    const maxPeople = parseInt(document.getElementById('max-people').value);
    const interestThreshold = parseInt(document.getElementById('interest-threshold').value);

    hideError('max-people-error');
    hideError('interest-threshold-error');

    if (!maxPeople || maxPeople < 1) {
        showError('max-people-error', 'Please enter maximum people per trip (minimum 1).');
        document.getElementById('max-people').focus();
        isValid = false;
    }

    if (!interestThreshold || interestThreshold < 1) {
        showError('interest-threshold-error', 'Please enter interest threshold (minimum 1).');
        if (isValid) document.getElementById('interest-threshold').focus();
        isValid = false;
    }

    // Logical validation: interest threshold should not exceed max people
    if (maxPeople && interestThreshold && interestThreshold > maxPeople) {
        showError('interest-threshold-error', 'Interest threshold cannot exceed maximum people.');
        if (isValid) document.getElementById('interest-threshold').focus();
        isValid = false;
    }

    return isValid;
}

function validateHotel() {
    let isValid = true;
    const hotelName = document.getElementById('hotel-name').value.trim();
    const hotelCategory = document.getElementById('hotel-category').value;
    const hotelRoomType = document.getElementById('hotel-room-type').value.trim();
    const hotelRating = document.getElementById('hotel-rating').value;
    const hotelLocation = document.getElementById('hotel-location').value.trim();

    hideError('hotel-name-error');
    hideError('hotel-category-error');
    hideError('hotel-room-type-error');
    hideError('hotel-rating-error');
    hideError('hotel-location-error');

    if (!hotelName) {
        showError('hotel-name-error', 'Please enter hotel name.');
        document.getElementById('hotel-name').focus();
        isValid = false;
    }

    if (!hotelCategory) {
        showError('hotel-category-error', 'Please select hotel category.');
        if (isValid) document.getElementById('hotel-category').focus();
        isValid = false;
    }

    if (!hotelRoomType) {
        showError('hotel-room-type-error', 'Please enter room type.');
        if (isValid) document.getElementById('hotel-room-type').focus();
        isValid = false;
    }

    if (!hotelRating) {
        showError('hotel-rating-error', 'Please select hotel rating.');
        if (isValid) document.getElementById('hotel-rating').focus();
        isValid = false;
    }

    if (!hotelLocation) {
        showError('hotel-location-error', 'Please enter hotel location.');
        if (isValid) document.getElementById('hotel-location').focus();
        isValid = false;
    }

    return isValid;
}

function validateAllFields() {
    // Validate in order of form sections
    if (!validateBasicInfo()) return false;
    if (!validateCoverImage()) return false;
    if (!validateGalleryImages()) return false;
    if (!validateOverview()) return false;
    if (!validateHighlights()) return false;
    if (!validateIncludes()) return false;
    if (!validateExcludes()) return false;
    if (!validateBookingSettings()) return false;
    if (!validateHotel()) return false;
    if (!validateDays()) return false;
    if (!validateTags()) return false;

    return true;
}

// ===== HIGHLIGHTS MANAGEMENT =====
function addHighlight() {
    const container = document.getElementById('highlights-container');
    const currentHighlights = container.querySelectorAll('.highlight-item');

    hideError('highlights-error');

    if (currentHighlights.length >= 10) {
        showError('highlights-error', 'Maximum 10 highlights allowed.');
        return;
    }

    const highlightItem = document.createElement('div');
    highlightItem.className = 'highlight-item';
    highlightItem.innerHTML = `
        <input type="text" name="highlight" placeholder="e.g., Experience local traditions">
        <button type="button" class="btn-remove-highlight">Remove</button>
    `;
    container.appendChild(highlightItem);
    attachHighlightRemoveListeners();
}

function attachHighlightRemoveListeners() {
    const removeButtons = document.querySelectorAll('.btn-remove-highlight');
    removeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const highlights = document.querySelectorAll('.highlight-item');
            if (highlights.length > 1) {
                this.parentElement.remove();
                hideError('highlights-error');
            } else {
                showError('highlights-error', 'At least one highlight is required.');
            }
        });
    });
}

// ===== DAY MANAGEMENT =====
function addDay() {
    dayCount++;
    activityCounters[dayCount] = 1;

    const daysContainer = document.getElementById('days-container');
    const dayBlock = document.createElement('div');
    dayBlock.className = 'day-block';
    dayBlock.setAttribute('data-day', dayCount);

    dayBlock.innerHTML = `
        <div class="day-header">
            <h3>Day ${dayCount}</h3>
            <button type="button" class="btn-remove-day">Remove Day</button>
        </div>

        <div class="form-group">
            <label for="day-${dayCount}-title">Day Title <span class="required">*</span></label>
            <input type="text" id="day-${dayCount}-title" name="day-${dayCount}-title" required placeholder="e.g., Explore Hidden Gems">
            <div id="day-${dayCount}-title-error" class="error-message" style="display: none;"></div>
        </div>

        <div class="form-group">
            <label for="day-${dayCount}-description">Day Description <span class="required">*</span></label>
            <textarea id="day-${dayCount}-description" name="day-${dayCount}-description" rows="3" required placeholder="Brief overview of what happens on this day..."></textarea>
            <div id="day-${dayCount}-description-error" class="error-message" style="display: none;"></div>
        </div>

        <div class="activities-container">
            <h4>Activities</h4>
            <div id="day-${dayCount}-activities-error" class="error-message" style="display: none;"></div>

            <div class="activity-block">
                <div class="activity-header">
                    <span>Activity 1</span>
                    <button type="button" class="btn-remove-activity" disabled>Remove</button>
                </div>

                <div class="form-group">
                    <label>Activity Name <span class="required">*</span></label>
                    <input type="text" name="day-${dayCount}-activity-name" required placeholder="e.g., Morning hike">
                    <div id="day-${dayCount}-activity-1-name-error" class="error-message" style="display: none;"></div>
                </div>

                <div class="form-group">
                    <label>Category <span class="required">*</span></label>
                    <select name="day-${dayCount}-activity-category" required>
                        <option value="">Select Category</option>
                        <option value="food">Food</option>
                        <option value="attraction">Attraction</option>
                        <option value="shopping">Shopping</option>
                        <option value="nature">Nature</option>
                        <option value="culture">Culture</option>
                        <option value="adventure">Adventure</option>
                        <option value="relaxation">Relaxation</option>
                        <option value="transportation">Transportation</option>
                    </select>
                    <div id="day-${dayCount}-activity-1-category-error" class="error-message" style="display: none;"></div>
                </div>

                <div class="form-group">
                    <label>Time (Optional)</label>
                    <input type="time" name="day-${dayCount}-activity-time">
                </div>

                <div class="form-group">
                    <label>Description</label>
                    <textarea name="day-${dayCount}-activity-description" rows="2" placeholder="Brief description of the activity..."></textarea>
                </div>

                <div class="form-group">
                    <label>Activity Image (Optional)</label>
                    <input type="file" name="day-${dayCount}-activity-image" accept="image/*">
                    <div id="day-${dayCount}-activity-1-image-error" class="error-message" style="display: none;"></div>
                </div>

                <div class="form-group">
                    <label>Estimated Cost (RM) - Optional</label>
                    <input type="number" name="day-${dayCount}-activity-cost" min="0" step="0.01" placeholder="e.g., 50.00">
                </div>
            </div>

            <button type="button" class="btn-add-activity" data-day="${dayCount}">+ Add Activity</button>
        </div>
    `;

    daysContainer.appendChild(dayBlock);
    attachDayRemoveListeners();
    attachActivityListeners();
}

function attachDayRemoveListeners() {
    const removeButtons = document.querySelectorAll('.btn-remove-day');
    removeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const dayBlock = this.closest('.day-block');
            const dayNumber = parseInt(dayBlock.getAttribute('data-day'));

            if (confirm(`Are you sure you want to remove Day ${dayNumber}?`)) {
                dayBlock.remove();
                delete activityCounters[dayNumber];

                // Disable first day's remove button if only one day left
                const remainingDays = document.querySelectorAll('.day-block');
                if (remainingDays.length === 1) {
                    remainingDays[0].querySelector('.btn-remove-day').disabled = true;
                }
            }
        });
    });

    // Enable remove buttons for all days except if only one exists
    const allDays = document.querySelectorAll('.day-block');
    if (allDays.length > 1) {
        removeButtons.forEach(btn => btn.disabled = false);
    }
}

// ===== ACTIVITY MANAGEMENT =====
function attachActivityListeners() {
    const addActivityButtons = document.querySelectorAll('.btn-add-activity');
    addActivityButtons.forEach(button => {
        button.addEventListener('click', function () {
            const dayNumber = parseInt(this.getAttribute('data-day'));
            addActivity(dayNumber);
        });
    });

    attachActivityRemoveListeners();
}

function addActivity(dayNumber) {
    activityCounters[dayNumber]++;
    const activityCount = activityCounters[dayNumber];

    const dayBlock = document.querySelector(`[data-day="${dayNumber}"]`);
    const activitiesContainer = dayBlock.querySelector('.activities-container');
    const addButton = activitiesContainer.querySelector('.btn-add-activity');

    const activityBlock = document.createElement('div');
    activityBlock.className = 'activity-block';
    activityBlock.innerHTML = `
        <div class="activity-header">
            <span>Activity ${activityCount}</span>
            <button type="button" class="btn-remove-activity">Remove</button>
        </div>

        <div class="form-group">
            <label>Activity Name <span class="required">*</span></label>
            <input type="text" name="day-${dayNumber}-activity-name" required placeholder="e.g., Visit local market">
            <div id="day-${dayNumber}-activity-${activityCount}-name-error" class="error-message" style="display: none;"></div>
        </div>

        <div class="form-group">
            <label>Category <span class="required">*</span></label>
            <select name="day-${dayNumber}-activity-category" required>
                <option value="">Select Category</option>
                <option value="food">Food</option>
                <option value="attraction">Attraction</option>
                <option value="shopping">Shopping</option>
                <option value="nature">Nature</option>
                <option value="culture">Culture</option>
                <option value="adventure">Adventure</option>
                <option value="relaxation">Relaxation</option>
                <option value="transportation">Transportation</option>
            </select>
            <div id="day-${dayNumber}-activity-${activityCount}-category-error" class="error-message" style="display: none;"></div>
        </div>

        <div class="form-group">
            <label>Time (Optional)</label>
            <input type="time" name="day-${dayNumber}-activity-time">
        </div>

        <div class="form-group">
            <label>Description</label>
            <textarea name="day-${dayNumber}-activity-description" rows="2" placeholder="Brief description of the activity..."></textarea>
        </div>

        <div class="form-group">
            <label>Activity Image (Optional)</label>
            <input type="file" name="day-${dayNumber}-activity-image" accept="image/*">
            <div id="day-${dayNumber}-activity-${activityCount}-image-error" class="error-message" style="display: none;"></div>
        </div>

        <div class="form-group">
            <label>Estimated Cost (RM) - Optional</label>
            <input type="number" name="day-${dayNumber}-activity-cost" min="0" step="0.01" placeholder="e.g., 50.00">
        </div>
    `;

    activitiesContainer.insertBefore(activityBlock, addButton);
    attachActivityRemoveListeners();
}

function attachActivityRemoveListeners() {
    const removeButtons = document.querySelectorAll('.btn-remove-activity');
    removeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const dayBlock = this.closest('.day-block');
            const activities = dayBlock.querySelectorAll('.activity-block');

            if (activities.length > 1) {
                this.closest('.activity-block').remove();

                // Update activity numbers
                const remainingActivities = dayBlock.querySelectorAll('.activity-block');
                remainingActivities.forEach((activity, index) => {
                    activity.querySelector('.activity-header span').textContent = `Activity ${index + 1}`;
                });

                // Disable first activity's remove button if only one left
                if (remainingActivities.length === 1) {
                    remainingActivities[0].querySelector('.btn-remove-activity').disabled = true;
                }
            } else {
                const dayNumber = dayBlock.getAttribute('data-day');
                showError(`day-${dayNumber}-activities-error`, 'At least one activity is required per day.');
            }
        });
    });

    // Enable remove buttons for all activities except if only one exists per day
    document.querySelectorAll('.day-block').forEach(dayBlock => {
        const activities = dayBlock.querySelectorAll('.activity-block');
        const removeButtons = dayBlock.querySelectorAll('.btn-remove-activity');

        if (activities.length > 1) {
            removeButtons.forEach(btn => btn.disabled = false);
        } else {
            removeButtons[0].disabled = true;
        }
    });
}

function handleCoverImagePreview(event) {
    const file = event.target.files[0];
    hideError('cover-image-error');

    if (file) {
        // Validate file size
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            showError('cover-image-error', 'Cover image must be less than 5MB.');
            event.target.value = '';
            return;
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showError('cover-image-error', 'Cover image must be in JPEG, PNG, or WebP format.');
            event.target.value = '';
            return;
        }

        coverImageFile = file;
        const preview = document.getElementById('cover-preview');
        const reader = new FileReader();

        reader.onload = function (e) {
            preview.innerHTML = `
                <div style="position: relative; display: inline-block;">
                    <img src="${e.target.result}" style="max-width: 100%; max-height: 300px; border-radius: 8px; display: block;">
                    <button type="button" id="remove-new-cover-btn" 
                            style="position: absolute; top: 4px; right: 4px; background: #ff4444; 
                                   color: white; border: none; border-radius: 50%; width: 28px; 
                                   height: 28px; cursor: pointer; font-weight: bold; font-size: 16px;
                                   display: flex; align-items: center; justify-content: center;">
                        ×
                    </button>
                </div>
            `;

            // Attach remove handler
            const removeBtn = document.getElementById('remove-new-cover-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', function () {
                    coverImageFile = null;
                    preview.innerHTML = '<p style="color: #999;">No cover image selected.</p>';
                    document.getElementById('cover-image').value = '';
                });
            }
        };

        reader.readAsDataURL(file);
    }
}

// ===== GALLERY IMAGES PREVIEW =====
function handleGalleryImagesPreview(event) {
    const newFiles = Array.from(event.target.files);
    hideError('gallery-images-error');

    // Check total count (existing + new)
    const totalCount = galleryImageFiles.length + newFiles.length;
    if (totalCount > 10) {
        showError('gallery-images-error', `Maximum 10 gallery images allowed. You currently have ${galleryImageFiles.length} image(s).`);
        event.target.value = '';
        return;
    }

    // Validate each file
    const maxSize = 5 * 1024 * 1024; // 5MB
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    for (const file of newFiles) {
        if (file.size > maxSize) {
            showError('gallery-images-error', `Image "${file.name}" is too large. Maximum size is 5MB.`);
            event.target.value = '';
            return;
        }
        if (!validTypes.includes(file.type)) {
            showError('gallery-images-error', `Image "${file.name}" must be in JPEG, PNG, or WebP format.`);
            event.target.value = '';
            return;
        }
    }

    // APPEND new files to existing array
    const startIndex = galleryImageFiles.length;
    galleryImageFiles = [...galleryImageFiles, ...newFiles];

    console.log('📤 Adding', newFiles.length, 'new images. Total now:', galleryImageFiles.length);

    const preview = document.getElementById('gallery-preview');

    // Create or get the container for new images
    let newImagesContainer = preview.querySelector('#new-gallery-container');
    if (!newImagesContainer) {
        newImagesContainer = document.createElement('div');
        newImagesContainer.id = 'new-gallery-container';
        // Horizontal layout with wrapping
        newImagesContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px;';
        preview.appendChild(newImagesContainer);
    }

    // Process only the NEW files
    newFiles.forEach((file, relativeIndex) => {
        const absoluteIndex = startIndex + relativeIndex;
        const reader = new FileReader();
        reader.onload = function (e) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'gallery-image-item';
            imgContainer.style.cssText = 'position: relative; width: 150px; height: 150px; flex-shrink: 0; display: inline-block;';
            imgContainer.dataset.imageIndex = absoluteIndex;
            imgContainer.innerHTML = `
                <img src="${e.target.result}" 
                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;">
                <button type="button" class="remove-new-gallery-btn" data-index="${absoluteIndex}"
                        style="position: absolute; top: 4px; right: 4px; background: #ff4444; 
                               color: white; border: none; border-radius: 50%; width: 28px; 
                               height: 28px; cursor: pointer; font-weight: bold; font-size: 16px;
                               display: flex; align-items: center; justify-content: center;
                               box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;">
                    ×
                </button>
            `;

            newImagesContainer.appendChild(imgContainer);
        };
        reader.readAsDataURL(file);
    });

    // Reattach listeners after a brief delay to ensure all DOM updates are complete
    setTimeout(() => {
        attachNewGalleryRemoveListeners();
    }, 100);

    // Clear the file input
    event.target.value = '';
}

// ===== HOTEL IMAGE PREVIEW =====
function handleHotelImagePreview(event) {
    const file = event.target.files[0];
    hideError('hotel-image-error');

    if (file) {
        // Validate file size
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            showError('hotel-image-error', 'Hotel image must be less than 5MB.');
            event.target.value = '';
            return;
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showError('hotel-image-error', 'Hotel image must be in JPEG, PNG, or WebP format.');
            event.target.value = '';
            return;
        }

        hotelImageFile = file;
        const preview = document.getElementById('hotel-image-preview');
        const reader = new FileReader();

        reader.onload = function (e) {
            preview.innerHTML = `
                <img src="${e.target.result}" style="max-width: 100%; max-height: 300px; border-radius: 8px;">
            `;
            preview.classList.add('has-image');
        };

        reader.readAsDataURL(file);
    }
}

// ===== ATTACH REMOVE LISTENERS FOR NEW GALLERY IMAGES =====
function attachNewGalleryRemoveListeners() {
    const allItems = document.querySelectorAll('#new-gallery-container .gallery-image-item');
    console.log('🔗 Attaching listeners to', allItems.length, 'images');

    allItems.forEach((item) => {
        const btn = item.querySelector('.remove-new-gallery-btn');
        if (!btn) return;

        // Clone button to remove old listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        // Add fresh click listener
        newBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const indexToRemove = parseInt(this.getAttribute('data-index'));
            console.log('🗑️ Remove button clicked for index:', indexToRemove);
            console.log('📊 Current array length:', galleryImageFiles.length);
            console.log('📊 Current DOM items:', document.querySelectorAll('#new-gallery-container .gallery-image-item').length);

            // Build a new array WITHOUT mutating the original
            const newArray = [];
            for (let i = 0; i < galleryImageFiles.length; i++) {
                if (i !== indexToRemove) {
                    newArray.push(galleryImageFiles[i]);
                }
            }

            galleryImageFiles = newArray;
            console.log('✅ New array length:', galleryImageFiles.length);

            // Completely rebuild the gallery display
            rebuildGalleryDisplay();
        });
    });
}

// ===== REBUILD ENTIRE GALLERY DISPLAY =====
function rebuildGalleryDisplay() {
    console.log('🔄 Rebuilding gallery display with', galleryImageFiles.length, 'images');

    const preview = document.getElementById('gallery-preview');
    let newImagesContainer = preview.querySelector('#new-gallery-container');

    // Clear existing container
    if (newImagesContainer) {
        newImagesContainer.innerHTML = '';
    } else {
        newImagesContainer = document.createElement('div');
        newImagesContainer.id = 'new-gallery-container';
        newImagesContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px;';
        preview.appendChild(newImagesContainer);
    }

    // If no images left, remove container
    if (galleryImageFiles.length === 0) {
        if (newImagesContainer) {
            newImagesContainer.remove();
        }
        console.log('🧹 All images removed');
        return;
    }

    // Re-render all images with correct sequential indices
    galleryImageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'gallery-image-item';
            imgContainer.style.cssText = 'position: relative; width: 150px; height: 150px; flex-shrink: 0; display: inline-block;';
            imgContainer.dataset.imageIndex = index;
            imgContainer.innerHTML = `
                <img src="${e.target.result}" 
                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;">
                <button type="button" class="remove-new-gallery-btn" data-index="${index}"
                        style="position: absolute; top: 4px; right: 4px; background: #ff4444; 
                               color: white; border: none; border-radius: 50%; width: 28px; 
                               height: 28px; cursor: pointer; font-weight: bold; font-size: 16px;
                               display: flex; align-items: center; justify-content: center;
                               box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 10;">
                    ×
                </button>
            `;

            newImagesContainer.appendChild(imgContainer);

            // Reattach listeners after last image is rendered
            if (newImagesContainer.children.length === galleryImageFiles.length) {
                setTimeout(() => {
                    attachNewGalleryRemoveListeners();
                    console.log('✅ Gallery rebuilt successfully');
                }, 50);
            }
        };
        reader.readAsDataURL(file);
    });
}

// ===== UPLOAD IMAGES TO FIREBASE =====
async function uploadImage(file, path) {
    try {
        const imageRef = storageRef(storage, path);
        await uploadBytes(imageRef, file);
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

function collectFormData() {
    const formData = new FormData(document.getElementById('addTripForm'));

    // Basic Information
    const data = {
        title: formData.get('itinerary-title'),
        destination: {
            country: formData.get('country'),
            city: formData.get('city')
        },
        duration: {
            days: parseInt(formData.get('days')),
            nights: parseInt(formData.get('nights'))
        },
        suitableFor: formData.getAll('suitable-for'),
        price: parseFloat(document.getElementById("fixed-price").value),

        // Overview
        shortSummary: formData.get('short-summary'),
        detailedDescription: formData.get('detailed-description'),
        highlights: Array.from(document.querySelectorAll('input[name="highlight"]'))
            .map(input => input.value)
            .filter(value => value.trim() !== ''),

        // Includes & Excludes
        includes: Array.from(document.querySelectorAll('input[name="include"]'))
            .map(input => input.value.trim())
            .filter(value => value !== ''),
        notIncludes: Array.from(document.querySelectorAll('input[name="exclude"]'))
            .map(input => input.value.trim())
            .filter(value => value !== ''),

        // Booking Settings
        maxBookings: parseInt(formData.get('max-people')) || 20,
        interestThreshold: parseInt(formData.get('interest-threshold')) || 10,

        // Hotel
        hotel: {
            name: formData.get('hotel-name'),
            category: formData.get('hotel-category'),
            roomType: formData.get('hotel-room-type'),
            rating: parseFloat(formData.get('hotel-rating')),
            location: formData.get('hotel-location'),
            description: formData.get('hotel-description') || ''
        },

        // Tags & Metadata
        tags: formData.getAll('tags'),
        seasonSuitability: formData.get('season-suitability') || '',

        publishStatus: 'published',
        paymentEnabled: false,
        paymentDeadline: null,
        currentBookings: 0,

        // Days array
        days: [],

        // Metadata
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    // Collect day-by-day data (keep existing logic)
    const dayBlocks = document.querySelectorAll('.day-block');
    dayBlocks.forEach((dayBlock, index) => {
        const dayNumber = index + 1;
        const dayData = {
            dayNumber: dayNumber,
            title: formData.get(`day-${dayNumber}-title`),
            description: formData.get(`day-${dayNumber}-description`),
            activities: []
        };

        // Collect activities for this day
        const activityBlocks = dayBlock.querySelectorAll('.activity-block');
        activityBlocks.forEach(activityBlock => {
            const activityInputs = activityBlock.querySelectorAll('input, select, textarea');
            const activityData = {
                name: '',
                category: '',
                time: '',
                description: '',
                cost: null
            };

            activityInputs.forEach(input => {
                if (input.name.includes('activity-name')) activityData.name = input.value;
                if (input.name.includes('activity-category')) activityData.category = input.value;
                if (input.name.includes('activity-time')) activityData.time = input.value;
                if (input.name.includes('activity-description')) activityData.description = input.value;
                if (input.name.includes('activity-cost')) activityData.cost = input.value ? parseFloat(input.value) : null;
            });

            if (activityData.name) {
                dayData.activities.push(activityData);
            }
        });

        data.days.push(dayData);
    });

    return data;
}

// ===== FORM SUBMISSION =====
async function handleFormSubmit(event) {
    event.preventDefault();

    if (!validateAllFields()) {
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;

    if (isEditMode && currentPublishStatus === 'draft') {
        submitBtn.textContent = 'Publishing...';
    } else if (isEditMode) {
        submitBtn.textContent = 'Updating...';
    } else {
        submitBtn.textContent = 'Creating...';
    }

    try {
        const data = collectFormData();
        data.publishStatus = 'published';
        data.createdBy = auth.currentUser.uid;

        // ===== HANDLE COVER IMAGE =====
        if (coverImageFile) {
            // New cover image uploaded
            const coverImagePath = `itineraries/${Date.now()}_cover_${coverImageFile.name}`;
            data.coverImage = await uploadImage(coverImageFile, coverImagePath);
            console.log('✅ Uploaded new cover image');
        } else if (existingCoverImageUrl) {
            // Keep existing cover image
            data.coverImage = existingCoverImageUrl;
            console.log('✅ Keeping existing cover image');
        } else {
            // No cover image
            data.coverImage = null;
            console.log('⚠️ No cover image');
        }

        // ===== HANDLE GALLERY IMAGES =====
        const remainingGalleryImages = existingGalleryImages.filter(
            imgUrl => !deletedGalleryImages.includes(imgUrl)
        );

        // ===== HANDLE HOTEL IMAGE =====
        if (hotelImageFile) {
            const hotelImagePath = `itineraries/${Date.now()}_hotel_${hotelImageFile.name}`;
            data.hotel.image = await uploadImage(hotelImageFile, hotelImagePath);
            console.log('✅ Uploaded hotel image');
        } else if (existingHotelImageUrl) {
            data.hotel.image = existingHotelImageUrl;
            console.log('✅ Keeping existing hotel image');
        } else {
            data.hotel.image = null;
        }

        console.log('📝 Original gallery images:', existingGalleryImages.length);
        console.log('📝 Deleted images:', deletedGalleryImages.length);
        console.log('📝 Remaining images:', remainingGalleryImages.length);

        // Upload new gallery images
        if (galleryImageFiles && galleryImageFiles.length > 0) {
            console.log('📤 Uploading', galleryImageFiles.length, 'new gallery images...');
            const newGalleryUrls = await Promise.all(
                Array.from(galleryImageFiles).map(async (file, index) => {
                    const galleryPath = `itineraries/${Date.now()}_gallery_${index}_${file.name}`;
                    return await uploadImage(file, galleryPath);
                })
            );
            data.galleryImages = [...remainingGalleryImages, ...newGalleryUrls];
            console.log('✅ Added', newGalleryUrls.length, 'new gallery images');
        } else {
            // No new images - just use remaining
            data.galleryImages = remainingGalleryImages;
            console.log('✅ Using', remainingGalleryImages.length, 'remaining gallery images');
        }

        // ===== HANDLE ACTIVITY IMAGES =====
        const allDayBlocks = document.querySelectorAll('.day-block');
        for (let dayIndex = 0; dayIndex < allDayBlocks.length; dayIndex++) {
            const dayBlock = allDayBlocks[dayIndex];
            const dayNumber = dayIndex + 1;
            const activityBlocks = dayBlock.querySelectorAll('.activity-block');

            for (let actIndex = 0; actIndex < activityBlocks.length; actIndex++) {
                const activityBlock = activityBlocks[actIndex];
                const imageInput = activityBlock.querySelector(`input[name="day-${dayNumber}-activity-image"]`);

                if (imageInput && imageInput.files && imageInput.files[0]) {
                    // New image uploaded
                    const file = imageInput.files[0];
                    const imagePath = `itineraries/${Date.now()}_day${dayNumber}_act${actIndex + 1}_${file.name}`;
                    const imageUrl = await uploadImage(file, imagePath);
                    data.days[dayIndex].activities[actIndex].image = imageUrl;
                } else if (existingActivityImages[dayNumber] && existingActivityImages[dayNumber][actIndex]) {
                    // Keep existing image
                    data.days[dayIndex].activities[actIndex].image = existingActivityImages[dayNumber][actIndex];
                }
            }
        }

        if (isEditMode) {
            data.updatedAt = serverTimestamp();
            await updateDoc(doc(db, 'itineraries', currentItineraryId), data);

            if (currentPublishStatus === 'draft') {
                alert('Draft published successfully! 🎉');
            } else {
                alert('Itinerary updated successfully!');
            }
        } else {
            data.createdAt = serverTimestamp();
            data.updatedAt = serverTimestamp();
            await addDoc(collection(db, 'itineraries'), data);
            alert('Itinerary created successfully! 🎉');
        }

        window.location.href = 'itineraryHub.html';

    } catch (error) {
        console.error('Error saving itinerary:', error);
        alert('Error saving itinerary: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ===== INCLUDES MANAGEMENT =====
function addInclude() {
    const container = document.getElementById('includes-container');
    const currentIncludes = container.querySelectorAll('.include-item');

    hideError('includes-error');

    if (currentIncludes.length >= 15) {
        showError('includes-error', 'Maximum 15 items allowed.');
        return;
    }

    const includeItem = document.createElement('div');
    includeItem.className = 'include-item';
    includeItem.innerHTML = `
        <input type="text" name="include" placeholder="e.g., Hotel breakfast included">
        <button type="button" class="btn-remove-include">Remove</button>
    `;
    container.appendChild(includeItem);
    attachIncludeRemoveListeners();
}

function attachIncludeRemoveListeners() {
    const removeButtons = document.querySelectorAll('.btn-remove-include');
    removeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const includes = document.querySelectorAll('.include-item');
            if (includes.length > 1) {
                this.parentElement.remove();
                hideError('includes-error');
            } else {
                showError('includes-error', 'At least one item is required.');
            }
        });
    });
}

// ===== EXCLUDES MANAGEMENT =====
function addExclude() {
    const container = document.getElementById('excludes-container');
    const currentExcludes = container.querySelectorAll('.exclude-item');

    hideError('excludes-error');

    if (currentExcludes.length >= 15) {
        showError('excludes-error', 'Maximum 15 items allowed.');
        return;
    }

    const excludeItem = document.createElement('div');
    excludeItem.className = 'exclude-item';
    excludeItem.innerHTML = `
        <input type="text" name="exclude" placeholder="e.g., International flights">
        <button type="button" class="btn-remove-exclude">Remove</button>
    `;
    container.appendChild(excludeItem);
    attachExcludeRemoveListeners();
}

function attachExcludeRemoveListeners() {
    const removeButtons = document.querySelectorAll('.btn-remove-exclude');
    removeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const excludes = document.querySelectorAll('.exclude-item');
            if (excludes.length > 1) {
                this.parentElement.remove();
                hideError('excludes-error');
            } else {
                showError('excludes-error', 'At least one item is required.');
            }
        });
    });
}

// ===== SAVE DRAFT =====
async function saveDraft() {
    const draftBtn = document.getElementById('save-draft-btn');
    const originalText = draftBtn.textContent;
    draftBtn.disabled = true;

    if (isEditMode && currentPublishStatus === 'draft') {
        draftBtn.textContent = 'Updating...';
    } else {
        draftBtn.textContent = 'Saving...';
    }

    try {
        const data = collectFormData();
        data.publishStatus = 'draft';
        data.createdBy = auth.currentUser.uid;

        // ===== HANDLE COVER IMAGE =====
        if (coverImageFile) {
            const coverImagePath = `itineraries/${Date.now()}_cover_${coverImageFile.name}`;
            data.coverImage = await uploadImage(coverImageFile, coverImagePath);
        } else if (existingCoverImageUrl) {
            data.coverImage = existingCoverImageUrl;
        } else {
            data.coverImage = null;
        }

        // ===== HANDLE GALLERY IMAGES =====
        const remainingGalleryImages = existingGalleryImages.filter(
            imgUrl => !deletedGalleryImages.includes(imgUrl)
        );

        if (galleryImageFiles && galleryImageFiles.length > 0) {
            const newGalleryUrls = await Promise.all(
                Array.from(galleryImageFiles).map(async (file, index) => {
                    const galleryPath = `itineraries/${Date.now()}_gallery_${index}_${file.name}`;
                    return await uploadImage(file, galleryPath);
                })
            );
            data.galleryImages = [...remainingGalleryImages, ...newGalleryUrls];
        } else {
            data.galleryImages = remainingGalleryImages;
        }

        // ===== HANDLE ACTIVITY IMAGES =====
        const allDayBlocks = document.querySelectorAll('.day-block');
        for (let dayIndex = 0; dayIndex < allDayBlocks.length; dayIndex++) {
            const dayBlock = allDayBlocks[dayIndex];
            const dayNumber = dayIndex + 1;
            const activityBlocks = dayBlock.querySelectorAll('.activity-block');

            for (let actIndex = 0; actIndex < activityBlocks.length; actIndex++) {
                const activityBlock = activityBlocks[actIndex];
                const imageInput = activityBlock.querySelector(`input[name="day-${dayNumber}-activity-image"]`);

                if (imageInput && imageInput.files && imageInput.files[0]) {
                    const file = imageInput.files[0];
                    const imagePath = `itineraries/${Date.now()}_day${dayNumber}_act${actIndex + 1}_${file.name}`;
                    const imageUrl = await uploadImage(file, imagePath);
                    data.days[dayIndex].activities[actIndex].image = imageUrl;
                } else if (existingActivityImages[dayNumber] && existingActivityImages[dayNumber][actIndex]) {
                    data.days[dayIndex].activities[actIndex].image = existingActivityImages[dayNumber][actIndex];
                }
            }
        }

        if (isEditMode) {
            data.updatedAt = serverTimestamp();
            await updateDoc(doc(db, 'itineraries', currentItineraryId), data);
            alert('Draft updated successfully!');
        } else {
            data.createdAt = serverTimestamp();
            data.updatedAt = serverTimestamp();
            await addDoc(collection(db, 'itineraries'), data);
            alert('Draft saved successfully!');
        }

        window.location.href = 'itineraryHub.html';

    } catch (error) {
        console.error('Error saving draft:', error);
        alert('Error saving draft: ' + error.message);
        draftBtn.disabled = false;
        draftBtn.textContent = originalText;
    }
}

// Initialize activity listeners on page load
attachActivityListeners();