// ===== ai_itinerary_view.js - SIMPLE VIEW-ONLY WITH PHOTO SUPPORT & PDF EXPORT =====
import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';
import { showToast } from './utils.js';

// ===== GLOBAL STATE =====
let currentUser = null;
let itineraryData = null;

// ===== BACKEND API BASE URL =====
const API_BASE_URL = 'http://127.0.0.1:5000';

// ===== GET ITINERARY ID FROM URL =====
function getItineraryIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// ===== GET PHOTO URL FROM BACKEND =====
function getPhotoUrl(photoReference, maxwidth = 600) {
    if (!photoReference) return null;
    return `${API_BASE_URL}/api/places/photo?photo_reference=${encodeURIComponent(photoReference)}&maxwidth=${maxwidth}`;
}

// ===== LOAD SAVED ITINERARY FROM FIREBASE =====
async function loadSavedItinerary() {
    const bookingId = getItineraryIdFromURL();

    if (!bookingId) {
        showToast('Itinerary not found', true);
        setTimeout(() => window.location.href = 'profile.html', 2000);
        return;
    }

    const loadingScreen = document.getElementById('loadingScreen');
    const itineraryScreen = document.getElementById('itineraryScreen');

    try {
        console.log('📍 Loading saved itinerary:', bookingId);

        const docRef = doc(db, 'users', currentUser.uid, 'bookings', bookingId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Itinerary not found');
        }

        const data = docSnap.data();
        console.log('✅ Loaded itinerary from Firebase:', data);

        itineraryData = data;

        // Hide loading, show content
        loadingScreen.style.display = 'none';
        itineraryScreen.style.display = 'block';

        // Render content
        renderTripHeader();
        renderFlight();
        renderDayTabs();
        renderHotel();

    } catch (error) {
        console.error('❌ Error loading itinerary:', error);
        showToast('Error loading itinerary', true);
        setTimeout(() => window.location.href = 'profile.html', 2000);
    }
}

// ===== RENDER TRIP HEADER =====
function renderTripHeader() {
    const tripTitle = document.getElementById('tripTitle');
    const tripSubtitle = document.getElementById('tripSubtitle');

    const city = itineraryData.city || 'Your Destination';
    const country = itineraryData.country || '';
    const duration = itineraryData.duration || '3 Days';

    tripTitle.textContent = itineraryData.title || `Trip to ${city}`;
    tripSubtitle.textContent = `${duration} in ${city}${country ? ', ' + country : ''}`;
}

// ===== RENDER FLIGHT =====
function renderFlight() {
    const flightSection = document.getElementById('flightSection');
    
    if (!itineraryData.flight) {
        flightSection.style.display = 'none';
        return;
    }

    const flight = itineraryData.flight;
    
    flightSection.innerHTML = `
        <h2><i class="fa fa-plane"></i> Flight Details</h2>
        <div class="flight-card">
            <div class="flight-header">
                <div class="flight-route">${flight.fromAirport} → ${flight.toAirport}</div>
                <div class="flight-duration">${parseDuration(flight.duration)}</div>
            </div>
            <div class="flight-details">
                <div class="flight-time">
                    <h3>${flight.departure}</h3>
                    <p>${flight.fromAirport}</p>
                </div>
                <div class="flight-arrow">
                    <i class="fa fa-arrow-right"></i>
                </div>
                <div class="flight-time">
                    <h3>${flight.arrival}</h3>
                    <p>${flight.toAirport}</p>
                </div>
            </div>
            <div class="flight-info">
                <span><i class="fa fa-calendar"></i> ${flight.arrivalDate || flight.departureDate || 'N/A'}</span>
                <span><i class="fa fa-plane"></i> ${flight.flightNumber || ''}</span>
            </div>
        </div>
    `;
}

// ===== CHECK IF ITEM IS A HOTEL =====
function isHotel(activity) {
    const category = (activity.category || '').toLowerCase();
    const name = (activity.name || '').toLowerCase();
    const isHotelCategory = category.includes('hotel') || category.includes('accommodation') || category.includes('lodging');
    const isHotelName = name.includes('hotel') || name.includes('resort') || name.includes('inn') || name.includes('lodge');
    const hasHotelFlag = activity.isHotel === true;
    
    return isHotelCategory || hasHotelFlag || (isHotelName && !name.includes('restaurant') && !name.includes('cafe'));
}

// ===== RENDER DAY TABS =====
function renderDayTabs() {
    const tabsContainer = document.getElementById('dayTabsContainer');
    const contentContainer = document.getElementById('itineraryContent');

    if (!itineraryData.itinerary) return;

    const days = Object.keys(itineraryData.itinerary);
    const totalDays = days.length;

    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    for (let i = 1; i <= totalDays; i++) {
        // Create tab
        const tab = document.createElement('button');
        tab.className = 'day-tab';
        tab.textContent = `Day ${i}`;
        if (i === 1) tab.classList.add('active');
        
        tab.addEventListener('click', () => {
            document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.day-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`day-${i}`).classList.add('active');
        });
        
        tabsContainer.appendChild(tab);

        // Create day section
        const daySection = document.createElement('div');
        daySection.id = `day-${i}`;
        daySection.className = 'day-section section';
        if (i === 1) daySection.classList.add('active');

        daySection.innerHTML = `<h2><i class="fa fa-map-marked-alt"></i> Day ${i}</h2>`;

        const activities = getDayActivities(i);
        const nonHotelActivities = activities.filter(activity => !isHotel(activity));
        
        if (nonHotelActivities.length === 0) {
            daySection.innerHTML += `
                <div style="text-align: center; padding: 2rem; color: var(--text-gray);">
                    <i class="fa fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    <p>No activities planned for this day</p>
                </div>
            `;
        } else {
            nonHotelActivities.forEach((activity, idx) => {
                const card = createActivityCard(activity, idx + 1);
                daySection.appendChild(card);
            });
        }

        contentContainer.appendChild(daySection);
    }
}

// ===== GET DAY ACTIVITIES =====
function getDayActivities(dayNumber) {
    if (!itineraryData.itinerary) return [];
    
    const dayKey = `day_${dayNumber}`;
    const altDayKey = `day${dayNumber}`;
    
    return itineraryData.itinerary[dayKey] || itineraryData.itinerary[altDayKey] || [];
}

// ===== CREATE ACTIVITY CARD =====
function createActivityCard(activity, number) {
    const card = document.createElement('div');
    card.className = 'activity-card';
    card.style.position = 'relative';
    
    // Build image URL with priority
    let imageUrl = null;
    
    if (activity.image) {
        imageUrl = activity.image;
    } else if (activity.photo_reference) {
        imageUrl = getPhotoUrl(activity.photo_reference, 600);
    } else if (activity.photos && activity.photos.length > 0) {
        imageUrl = activity.photos[0];
    } else {
        imageUrl = `https://via.placeholder.com/600x200?text=${encodeURIComponent(activity.name)}`;
    }
    
    card.innerHTML = `
        <div class="activity-number">${number}</div>
        <img src="${imageUrl}" 
             alt="${activity.name}" 
             class="activity-image" 
             onerror="this.src='https://via.placeholder.com/600x200?text=No+Image'"
             loading="lazy">
        <div class="activity-content">
            <div class="activity-header">
                <h3>${activity.name}</h3>
                ${activity.rating ? `<div class="activity-rating">★ ${activity.rating}</div>` : ''}
            </div>
            <div class="activity-category">
                <i class="fa fa-tag"></i>
                ${activity.category || 'Attraction'}
            </div>
            <div class="activity-address">
                <i class="fa fa-map-marker-alt"></i>
                ${activity.address || 'Address not available'}
            </div>
        </div>
    `;
    
    return card;
}

// ===== RENDER HOTEL =====
function renderHotel() {
    const hotelSection = document.getElementById('hotelSection');
    
    // First check if there's a dedicated hotel field
    if (itineraryData.hotel) {
        const hotel = itineraryData.hotel;
        
        let imageUrl = null;
        if (hotel.image) {
            imageUrl = hotel.image;
        } else if (hotel.photo_reference) {
            imageUrl = getPhotoUrl(hotel.photo_reference, 800);
        } else {
            imageUrl = 'https://via.placeholder.com/800x300?text=Hotel';
        }
        
        hotelSection.innerHTML = `
            <h2><i class="fa fa-hotel"></i> Accommodation</h2>
            <div class="hotel-card">
                <img src="${imageUrl}" 
                     alt="${hotel.name}" 
                     class="hotel-image" 
                     onerror="this.src='https://via.placeholder.com/800x300?text=Hotel'"
                     loading="lazy">
                <div class="hotel-content">
                    <h3>${hotel.name}</h3>
                    ${hotel.rating ? `<div class="hotel-rating">★ ${hotel.rating} / 5.0</div>` : ''}
                    <div class="hotel-address">
                        <i class="fa fa-map-marker-alt"></i>
                        ${hotel.address || 'Address not available'}
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    // Otherwise, look for hotels in the itinerary activities
    const foundHotel = findHotelInItinerary();
    
    if (foundHotel) {
        let imageUrl = null;
        if (foundHotel.image) {
            imageUrl = foundHotel.image;
        } else if (foundHotel.photo_reference) {
            imageUrl = getPhotoUrl(foundHotel.photo_reference, 800);
        } else if (foundHotel.photos && foundHotel.photos.length > 0) {
            imageUrl = foundHotel.photos[0];
        } else {
            imageUrl = 'https://via.placeholder.com/800x300?text=Hotel';
        }
        
        hotelSection.innerHTML = `
            <h2><i class="fa fa-hotel"></i> Accommodation</h2>
            <div class="hotel-card">
                <img src="${imageUrl}" 
                     alt="${foundHotel.name}" 
                     class="hotel-image" 
                     onerror="this.src='https://via.placeholder.com/800x300?text=Hotel'"
                     loading="lazy">
                <div class="hotel-content">
                    <h3>${foundHotel.name}</h3>
                    ${foundHotel.rating ? `<div class="hotel-rating">★ ${foundHotel.rating} / 5.0</div>` : ''}
                    <div class="hotel-address">
                        <i class="fa fa-map-marker-alt"></i>
                        ${foundHotel.address || 'Address not available'}
                    </div>
                </div>
            </div>
        `;
    } else {
        hotelSection.style.display = 'none';
    }
}

// ===== FIND HOTEL IN ITINERARY =====
function findHotelInItinerary() {
    if (!itineraryData.itinerary) return null;
    
    for (let day in itineraryData.itinerary) {
        const activities = itineraryData.itinerary[day];
        if (Array.isArray(activities)) {
            const foundHotel = activities.find(activity => isHotel(activity));
            if (foundHotel) return foundHotel;
        }
    }
    return null;
}

// ===== PARSE DURATION =====
function parseDuration(duration) {
    if (!duration) return 'N/A';
    const match = duration.match(/PT(\d+)H?(\d+)?M?/);
    if (!match) return duration;

    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;

    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
}

// ===== USER PROFILE UI =====
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
            const initials = `${firstInitial}${lastInitial}` || 'U';
            profileAvatarElement.textContent = initials;
        }

        profileDropdown.style.display = 'flex';
    } else {
        profileDropdown.style.display = 'none';
    }
}

// ===== SETUP PROFILE DROPDOWN =====
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

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}

// ===== DOM CONTENT LOADED =====
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
            
            loadSavedItinerary();
        } catch (error) {
            console.error("Error fetching user data:", error);
        }
    } else {
        window.location.href = 'login.html';
    }
});

// ============================================
// ✅ PDF DOWNLOAD FUNCTION
// ============================================

// ===== DOWNLOAD PDF (TEXT-ONLY - SIMPLE & FAST) =====
window.downloadPDFWithTabsEnhanced = async function() {
    try {
        showToast('Generating PDF...');
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);
        let yPos = margin;
        
        // Helper: Add new page if needed
        function checkPageBreak(requiredSpace = 20) {
            if (yPos + requiredSpace > pageHeight - margin) {
                pdf.addPage();
                yPos = margin;
                return true;
            }
            return false;
        }
        
        // Cover Page
        pdf.setFontSize(32);
        pdf.setTextColor(61, 155, 243);
        pdf.setFont('helvetica', 'bold');
        const title = itineraryData.title || `Trip to ${itineraryData.city}`;
        pdf.text(title, margin, yPos, { maxWidth: contentWidth });
        yPos += 15;
        
        pdf.setFontSize(14);
        pdf.setTextColor(107, 114, 128);
        pdf.setFont('helvetica', 'normal');
        const subtitle = `${itineraryData.duration || '3 Days'} in ${itineraryData.city}${itineraryData.country ? ', ' + itineraryData.country : ''}`;
        pdf.text(subtitle, margin, yPos);
        yPos += 15;
        
        pdf.setDrawColor(224, 230, 237);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;
        
        // Flight Section
        if (itineraryData.flight) {
            checkPageBreak(40);
            
            pdf.setFontSize(18);
            pdf.setTextColor(61, 155, 243);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Flight Details', margin, yPos);
            yPos += 10;
            
            const flight = itineraryData.flight;
            
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${flight.fromAirport} -> ${flight.toAirport}`, margin, yPos);
            yPos += 7;
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.text(`Departure: ${flight.departure} from ${flight.fromAirport}`, margin + 5, yPos);
            yPos += 6;
            pdf.text(`Arrival: ${flight.arrival} at ${flight.toAirport}`, margin + 5, yPos);
            yPos += 6;
            pdf.text(`Duration: ${parseDuration(flight.duration)}`, margin + 5, yPos);
            yPos += 6;
            pdf.text(`Flight: ${flight.flightNumber || 'N/A'}`, margin + 5, yPos);
            yPos += 6;
            pdf.text(`Date: ${flight.departureDate || flight.arrivalDate || 'N/A'}`, margin + 5, yPos);
            yPos += 12;
        }
        
        // Daily Itinerary
        const days = Object.keys(itineraryData.itinerary || {});
        
        for (let i = 1; i <= days.length; i++) {
            checkPageBreak(40);
            
            pdf.setFontSize(18);
            pdf.setTextColor(61, 155, 243);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`Day ${i}`, margin, yPos);
            yPos += 10;
            
            const activities = getDayActivities(i).filter(activity => !isHotel(activity));
            
            if (activities.length === 0) {
                pdf.setFontSize(11);
                pdf.setTextColor(107, 114, 128);
                pdf.setFont('helvetica', 'italic');
                pdf.text('No activities planned for this day', margin + 5, yPos);
                yPos += 10;
            } else {
                activities.forEach((activity, idx) => {
                    checkPageBreak(25);
                    
                    pdf.setFontSize(12);
                    pdf.setTextColor(0, 0, 0);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(`${idx + 1}. ${activity.name}`, margin + 5, yPos);
                    yPos += 6;
                    
                    if (activity.rating) {
                        pdf.setFontSize(10);
                        pdf.setTextColor(243, 156, 18);
                        pdf.setFont('helvetica', 'normal');
                        pdf.text(`Rating: ${activity.rating}/5`, margin + 10, yPos);
                        yPos += 5;
                    }
                    
                    if (activity.category) {
                        pdf.setFontSize(10);
                        pdf.setTextColor(61, 155, 243);
                        pdf.text(`Category: ${activity.category}`, margin + 10, yPos);
                        yPos += 5;
                    }
                    
                    if (activity.address) {
                        pdf.setFontSize(9);
                        pdf.setTextColor(107, 114, 128);
                        const addressLines = pdf.splitTextToSize(`Address: ${activity.address}`, contentWidth - 15);
                        addressLines.forEach(line => {
                            checkPageBreak(5);
                            pdf.text(line, margin + 10, yPos);
                            yPos += 4;
                        });
                    }
                    
                    yPos += 6;
                });
            }
            
            yPos += 5;
        }
        
        // Hotel Section
        const hotel = itineraryData.hotel || findHotelInItinerary();
        
        if (hotel) {
            checkPageBreak(30);
            
            pdf.setFontSize(18);
            pdf.setTextColor(61, 155, 243);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Accommodation', margin, yPos);
            yPos += 10;
            
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(hotel.name, margin + 5, yPos);
            yPos += 7;
            
            if (hotel.rating) {
                pdf.setFontSize(10);
                pdf.setTextColor(243, 156, 18);
                pdf.text(`Rating: ${hotel.rating}/5.0`, margin + 10, yPos);
                yPos += 6;
            }
            
            if (hotel.address) {
                pdf.setFontSize(9);
                pdf.setTextColor(107, 114, 128);
                const addressLines = pdf.splitTextToSize(`Address: ${hotel.address}`, contentWidth - 15);
                addressLines.forEach(line => {
                    checkPageBreak(5);
                    pdf.text(line, margin + 10, yPos);
                    yPos += 4;
                });
            }
        }
        
        // Footer on each page
        const pageCount = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.setFont('helvetica', 'normal');
            pdf.text(
                `Page ${i} of ${pageCount}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
            pdf.text(
                `Generated by Travel.Co on ${new Date().toLocaleDateString()}`,
                pageWidth / 2,
                pageHeight - 6,
                { align: 'center' }
            );
        }
        
        // Save
        const filename = `${itineraryData.city || 'Itinerary'}_${new Date().getTime()}.pdf`;
        pdf.save(filename);
        
        showToast('PDF downloaded successfully!', false);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        showToast('Error generating PDF', true);
    }
};
