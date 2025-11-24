// ========== aiItinerary.js (TRAVEL.COM - FINAL OPTIMIZED) ==========
import { showToast} from './utils.js';
import { db, auth } from './firebase-config.js';
import { doc, getDoc, serverTimestamp, setDoc, } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';

// ===== GLOBAL STATE =====
let currentUser = null;
let itineraryData = null;
let map = null;
let selectedHotel = null;
let directionsService = null;
let directionsRenderer = null;
let activePolylines = [];

// ===== DRAG AND DROP STATE =====
let draggedActivity = null;
let draggedFromDay = null;
let draggedActivityIndex = null;
let autoScrollInterval = null;

// ===== GET CATEGORY CLASS FOR STYLING =====
function getCategoryClass(category) {
    const categoryMap = {
        'restaurant': 'category-food',
        'cafe': 'category-food',
        'museum': 'category-culture',
        'art_gallery': 'category-culture',
        'tourist_attraction': 'category-attraction',
        'park': 'category-nature',
        'zoo': 'category-nature',
        'shopping_mall': 'category-shopping',
        'hotel': 'category-hotel',
        'default': 'category-default'
    };

    return categoryMap[category] || categoryMap['default'];
}

// ===== UPDATE TRIP HEADER =====
function updateTripHeader() {
    console.log('📝 Updating trip header...');

    if (!itineraryData) {
        console.warn('⚠️ No itinerary data available');
        return;
    }

    const tripTitle = document.getElementById('tripTitle');

    if (!tripTitle) {
        console.error('❌ Trip header elements not found');
        return;
    }

    // Get city and country from itineraryData
    const city = itineraryData.city || itineraryData.destination;
    const country = itineraryData.country;

    if (city && country) {
        tripTitle.textContent = `Your Trip to ${city}, ${country}`;
        console.log(`✅ Header updated: ${city}, ${country}`);
    } else {
        tripTitle.textContent = 'Your Perfect Trip';
        console.warn('⚠️ Missing city or country data');
    }
}

// ===== DRAG EVENT HANDLERS =====
function handleActivityDragStart(e) {
    draggedActivity = {
        name: e.currentTarget.getAttribute('data-activity-name'),
        fromDay: parseInt(e.currentTarget.getAttribute('data-day-number'))
    };

    e.currentTarget.style.opacity = '0.4';
    e.currentTarget.style.cursor = 'grabbing';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);

    // Add visual feedback to all drop zones
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.style.background = '#E0F2FE';
        zone.style.border = '2px dashed #3D9BF3';
    });

    // ADD DRAG LISTENER FOR AUTO-SCROLL
    document.addEventListener('drag', handleAutoScroll);

    console.log(`🎯 Dragging: ${draggedActivity.name} from Day ${draggedActivity.fromDay}`);
}

function handleActivityDragEnd(e) {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.style.cursor = 'grab';

    // Remove visual feedback from drop zones
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.style.background = 'transparent';
        zone.style.border = '2px dashed transparent';
    });

    // REMOVE DRAG LISTENER AND STOP AUTO-SCROLL
    document.removeEventListener('drag', handleAutoScroll);
    stopAutoScroll();
}

// ===== AUTO-SCROLL WHILE DRAGGING =====
function handleAutoScroll(e) {
    const scrollThreshold = 100;
    const scrollSpeed = 10;

    const viewportHeight = window.innerHeight;
    const mouseY = e.clientY;

    // Clear any existing scroll interval
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }

    // Check if near top edge
    if (mouseY < scrollThreshold) {
        autoScrollInterval = setInterval(() => {
            window.scrollBy(0, -scrollSpeed);
        }, 16); // ~60fps
    }
    // Check if near bottom edge
    else if (mouseY > viewportHeight - scrollThreshold) {
        autoScrollInterval = setInterval(() => {
            window.scrollBy(0, scrollSpeed);
        }, 16); // ~60fps
    }
}

function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

// ===== CREATE DROP ZONE =====
function createDropZone(dayNumber, position) {
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.setAttribute('data-day', dayNumber);
    dropZone.setAttribute('data-position', position);

    dropZone.style.cssText = `
        min-height: 8px;
        height: 8px;
        background: transparent;
        border: 2px dashed transparent;
        border-radius: 4px;
        transition: all 0.2s ease;
        margin: 4px 0;
    `;

    dropZone.addEventListener('dragover', handleDropZoneDragOver);
    dropZone.addEventListener('drop', handleDropZoneDrop);
    dropZone.addEventListener('dragleave', handleDropZoneDragLeave);

    return dropZone;
}

// ===== CALCULATE ACTIVITY INDEX FOR DROP =====
function calculateActivityIndex(targetDay, position) {
    // Get all non-hotel activities
    const nonHotelActivities = itineraryData.activities.filter(a => !a.isHotel);

    const maxActivitiesDay1 = 2;
    const activitiesPerDay = 3;

    console.log(`📊 Calculating index for Day ${targetDay}, position ${position}`);
    console.log(`   Total non-hotel activities: ${nonHotelActivities.length}`);

    let targetIndex;

    if (targetDay === 1) {
        // Day 1: Activities are at indices 0 to (maxActivitiesDay1 - 1)
        targetIndex = Math.min(position, maxActivitiesDay1);
        console.log(`   Day 1: targetIndex = ${targetIndex} (max: ${maxActivitiesDay1})`);
    } else {

        const baseIndex = maxActivitiesDay1 + ((targetDay - 2) * activitiesPerDay);
        targetIndex = baseIndex + position;

        console.log(`   Day ${targetDay}: baseIndex = ${baseIndex}, position = ${position}, targetIndex = ${targetIndex}`);
    }

    // Count how many non-hotel activities are BEFORE our target index
    let actualIndex = 0;
    let nonHotelCount = 0;

    for (let i = 0; i < itineraryData.activities.length; i++) {
        if (!itineraryData.activities[i].isHotel) {
            if (nonHotelCount === targetIndex) {
                actualIndex = i;
                break;
            }
            nonHotelCount++;
        }
    }

    // If we didn't find it (means we're appending), use the current position
    if (nonHotelCount < targetIndex) {
        actualIndex = itineraryData.activities.length;
    }

    console.log(`   ✅ Final actualIndex in full array: ${actualIndex}`);

    return actualIndex;
}

function handleDropZoneDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.style.background = '#3D9BF3';
    e.currentTarget.style.height = '12px';
    e.currentTarget.style.border = '2px solid #3D9BF3';
}

function handleDropZoneDragLeave(e) {
    e.currentTarget.style.background = '#E0F2FE';
    e.currentTarget.style.height = '8px';
    e.currentTarget.style.border = '2px dashed #3D9BF3';
}

function handleDropZoneDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    stopAutoScroll();

    // Reset drop zone visual feedback
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.height = '8px';
    e.currentTarget.style.border = '2px dashed transparent';

    if (!draggedActivity) {
        console.error('❌ No dragged activity');
        return;
    }

    const targetDay = parseInt(e.currentTarget.getAttribute('data-day'));
    const targetPosition = parseInt(e.currentTarget.getAttribute('data-position'));

    console.log(`📍 Drop: ${draggedActivity.name} → Day ${targetDay}, position ${targetPosition}`);

    let movedActivity;

    // ✅ CHECK IF DRAGGING FROM UNSCHEDULED
    if (draggedActivity.fromDay === 'unscheduled') {
        console.log('📥 Moving from Unscheduled to itinerary');

        // Find in unscheduled array
        const unscheduledIndex = window.unscheduledActivitiesData.findIndex(a =>
            a.name === draggedActivity.name
        );

        if (unscheduledIndex === -1) {
            console.error('❌ Activity not found in unscheduled');
            showToast('Activity not found', true);
            return;
        }

        // Remove from unscheduled
        [movedActivity] = window.unscheduledActivitiesData.splice(unscheduledIndex, 1);
        console.log(`✅ Removed from unscheduled: ${movedActivity.name}`);

    } else {
        // Dragging from scheduled itinerary
        const activityIndex = itineraryData.activities.findIndex(a =>
            a.name === draggedActivity.name && !a.isHotel
        );

        if (activityIndex === -1) {
            console.error('❌ Activity not found in itineraryData.activities');
            showToast('Activity not found', true);
            return;
        }

        // Remove from current position
        [movedActivity] = itineraryData.activities.splice(activityIndex, 1);
        console.log(`✅ Removed from position ${activityIndex}`);
    }

    // Calculate new index based on day and position
    const newIndex = calculateActivityIndex(targetDay, targetPosition);
    console.log(`📍 Inserting at position ${newIndex}`);

    // Insert at new position in itineraryData.activities
    itineraryData.activities.splice(newIndex, 0, movedActivity);

    // Reset drag state
    draggedActivity = null;

    // Re-render entire itinerary
    console.log('🔄 Re-rendering itinerary...');
    renderAllActivitiesAtOnce();
    renderUnscheduledActivities();

    showToast(`✅ Added to Day ${targetDay}`, false);

    console.log(`✅ Activity moved successfully to Day ${targetDay}`);
}

// ===== DRAG FROM UNSCHEDULED =====
function handleUnscheduledDragStart(e) {
    draggedActivity = {
        name: e.currentTarget.getAttribute('data-activity-name'),
        fromDay: 'unscheduled' // ← MUST be 'unscheduled', not 999
    };

    e.currentTarget.style.opacity = '0.4';
    e.currentTarget.style.cursor = 'grabbing';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);

    // Add visual feedback to all drop zones
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.style.background = '#E0F2FE';
        zone.style.border = '2px dashed #3D9BF3';
    });

    // Add drag listener for auto-scroll
    document.addEventListener('drag', handleAutoScroll);

    console.log(`🎯 Dragging from Unscheduled: ${draggedActivity.name}`);
}

const locationCache = {};

function clearAllPolylines() {
    console.log(`🗑️ Clearing ${activePolylines.length} polylines`);

    activePolylines.forEach(polyline => {
        polyline.setMap(null);
    });
    activePolylines = [];

    console.log('✅ All routes cleared from map');
}

// ===== LOAD GOOGLE MAPS API KEY FROM BACKEND =====
async function loadGoogleMapsAPI() {
    console.log('🔑 Fetching Google Maps API key from backend...');

    try {
        const response = await fetch('http://127.0.0.1:5000/api/config/google-maps-key', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to get API key');
        }

        console.log('✅ Google Maps API key received');

        // ✅ REMOVED: marker library (not needed for custom markers)
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.key}&libraries=places,routes&loading=async`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
            console.log('✅ Google Maps API loaded successfully');
        };

        script.onerror = () => {
            console.error('❌ Failed to load Google Maps API');
        };

        document.head.appendChild(script);
        return data.key;

    } catch (error) {
        console.error('❌ Error fetching Google Maps API key:', error);
        showToast(`Error loading Google Maps: ${error.message}`, true);
        return null;
    }
}

loadGoogleMapsAPI();

// ===== GET PHOTO URL FROM YOUR BACKEND =====
function getPlacePhotoUrl(photoReference, maxWidth = 400) {
    if (!photoReference) return null;
    return `http://127.0.0.1:5000/api/places/photo?photo_reference=${photoReference}&maxwidth=${maxWidth}`;
}

// ===== HEADER FUNCTIONS =====
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameElement || !profileAvatarElement || !profileDropdown) {
        console.error("❌ Profile UI elements not found!");
        return;
    }

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'User';

        profileNameElement.textContent = fullName;
        profileAvatarElement.innerHTML = '';

        const photoURL = userData.profilePhotoURL;

        if (photoURL) {
            const img = document.createElement('img');
            img.src = `${photoURL}?t=${new Date().getTime()}`;
            img.alt = `${fullName}'s profile picture`;
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
            profileAvatarElement.appendChild(img);
        } else {
            const firstInitial = firstName ? firstName[0].toUpperCase() : '';
            const lastInitial = lastName ? lastName[0].toUpperCase() : '';
            const initials = `${firstInitial}${lastInitial}` || 'U';
            profileAvatarElement.textContent = initials;

            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
            const colorIndex = firstInitial.charCodeAt(0) % colors.length;
            profileAvatarElement.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: ${colors[colorIndex]};
                color: white;
                font-weight: bold;
                border-radius: 50%;
                cursor: pointer;
            `;
        }

        profileDropdown.style.display = 'flex';
    } else {
        profileDropdown.style.display = 'none';
    }
}

function toggleDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// ===== INITIALIZE GOOGLE MAP =====
async function initializeMap(city, country) {
    console.log('Initializing Google Map for', city);
    const mapContainer = document.getElementById('routeMap');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    try {
        const cityCoords = await getCoordinates(city, country);
        map = new google.maps.Map(mapContainer, {
            zoom: 13,
            center: cityCoords,
            styles: [
                {
                    featureType: 'poi',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });

        directionsService = new google.maps.DirectionsService();

        // ADD ZOOM LISTENER TO ADJUST LINE THICKNESS
        map.addListener('zoom_changed', () => {
            const zoomLevel = map.getZoom();
            const thickness = calculatePolylineThickness(zoomLevel);

            // Update all polylines on the map
            const svgs = document.querySelectorAll('svg[data-type="gm-polyline"]');
            svgs.forEach(svg => {
                const polylines = svg.querySelectorAll('polyline');
                polylines.forEach(poly => {
                    poly.style.strokeWidth = thickness + 'px';
                });
            });

            console.log('Zoom level:', zoomLevel, 'Thickness:', thickness + 'px');
        });

        console.log('Map initialized for', city);
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// CALCULATE POLYLINE THICKNESS BASED ON ZOOM LEVEL
function calculatePolylineThickness(zoomLevel) {

    if (zoomLevel >= 18) return 3;
    if (zoomLevel >= 15) return 5;
    if (zoomLevel >= 12) return 6;
    if (zoomLevel >= 10) return 8;
    if (zoomLevel >= 8) return 10;
    if (zoomLevel >= 5) return 12;
    return 15;
}

// ===== SEARCH FLIGHTS =====
async function searchFlights(origin, destination, departureDate, returnDate = null) {
    console.log(`✈️ Searching flights: ${origin} → ${destination}`);

    try {
        const response = await fetch('http://127.0.0.1:5000/search-flights', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                origin: origin,
                destination: destination,
                departureDate: departureDate,
                returnDate: returnDate,
                adults: 1,
                travelClass: 'ECONOMY'
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to search flights');
        }

        if (!data.flights || data.flights.length === 0) {
            console.warn('❌ No flights found');
            return null;
        }

        console.log(`✅ Found ${data.flights.length} flights`);

        const selectedFlight = data.flights[0];
        const outbound = selectedFlight.itineraries[0];
        const firstSegment = outbound.segments[0];
        const lastSegment = outbound.segments[outbound.segments.length - 1];

        const flightData = {
            id: selectedFlight.id,
            price: selectedFlight.price,
            departure: formatTime(firstSegment.departure.time),
            arrival: formatTime(lastSegment.arrival.time),
            departureDate: firstSegment.departure.time.split('T')[0],
            arrivalDate: lastSegment.arrival.time.split('T')[0],
            airline: firstSegment.airline,
            flightNumber: `${firstSegment.airline}${firstSegment.flightNumber}`,
            fromAirport: firstSegment.departure.airport,
            toAirport: lastSegment.arrival.airport,
            duration: outbound.duration,
            segments: outbound.segments,
            hasReturn: selectedFlight.itineraries.length > 1,
            returnFlight: selectedFlight.itineraries.length > 1 ? {
                departure: formatTime(selectedFlight.itineraries[1].segments[0].departure.time),
                arrival: formatTime(selectedFlight.itineraries[1].segments[selectedFlight.itineraries[1].segments.length - 1].arrival.time),
                duration: selectedFlight.itineraries[1].duration
            } : null
        };

        console.log('✅ Selected flight:', flightData);
        return flightData;

    } catch (error) {
        console.error('❌ Flight search error:', error);
        throw error;
    }
}

// ===== FORMAT TIME =====
function formatTime(isoTime) {
    const date = new Date(isoTime);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ===== GET AIRPORT CODE =====
function getAirportCode(city) {
    const airportMap = {
        // Asia
        'Kuala Lumpur': 'KUL',
        'Penang': 'PEN',
        'Langkawi': 'LGK',
        'Singapore': 'SIN',
        'Bangkok': 'BKK',
        'Phuket': 'HKT',
        'Chiang Mai': 'CNX',
        'Krabi': 'KBV',
        'Bali': 'DPS',
        'Jakarta': 'CGK',
        'Yogyakarta': 'JOG',
        'Tokyo': 'NRT',
        'Kyoto': 'KIX',
        'Osaka': 'KIX',
        'Hiroshima': 'HIJ',
        'Seoul': 'ICN',
        'Busan': 'PUS',
        'Jeju Island': 'CJU',
        'Hanoi': 'HAN',
        'Ho Chi Minh City': 'SGN',
        'Da Nang': 'DAD',
        'Siem Reap': 'REP',

        // Europe
        'Paris': 'CDG',
        'Nice': 'NCE',
        'Lyon': 'LYS',
        'Marseille': 'MRS',
        'Rome': 'FCO',
        'Venice': 'VCE',
        'Florence': 'FLR',
        'Milan': 'MXP',
        'Naples': 'NAP',
        'Barcelona': 'BCN',
        'Madrid': 'MAD',
        'Seville': 'SVQ',
        'Valencia': 'VLC',
        'London': 'LHR',
        'Edinburgh': 'EDI',
        'Liverpool': 'LPL',
        'Berlin': 'BER',
        'Munich': 'MUC',
        'Frankfurt': 'FRA',
        'Amsterdam': 'AMS',
        'Rotterdam': 'RTM',
        'Zurich': 'ZRH',
        'Geneva': 'GVA',
        'Interlaken': 'ZRH',
        'Athens': 'ATH',
        'Santorini': 'JTR',
        'Mykonos': 'JMK',
        'Lisbon': 'LIS',
        'Porto': 'OPO',
        'Prague': 'PRG',

        // Americas
        'New York': 'JFK',
        'Los Angeles': 'LAX',
        'San Francisco': 'SFO',
        'Las Vegas': 'LAS',
        'Miami': 'MIA',
        'Orlando': 'MCO',
        'Toronto': 'YYZ',
        'Vancouver': 'YVR',
        'Montreal': 'YUL',
        'Rio de Janeiro': 'GIG',
        'São Paulo': 'GRU',
        'Cancun': 'CUN',
        'Mexico City': 'MEX',
        'Playa del Carmen': 'CUN',
        'Cusco': 'CUZ',
        'Lima': 'LIM',
        'Buenos Aires': 'EZE',

        // Middle East & Africa
        'Dubai': 'DXB',
        'Abu Dhabi': 'AUH',
        'Istanbul': 'IST',
        'Cappadocia': 'ASR',
        'Cairo': 'CAI',
        'Luxor': 'LXR',
        'Sharm El Sheikh': 'SSH',
        'Marrakech': 'RAK',
        'Casablanca': 'CMN',
        'Cape Town': 'CPT',

        // Oceania
        'Sydney': 'SYD',
        'Melbourne': 'MEL',
        'Gold Coast': 'OOL',
        'Auckland': 'AKL',
        'Queenstown': 'ZQN'
    };

    return airportMap[city] || null;
}

// ===== AIRPORT TO CITY MAPPING (COMPLETE) =====
const airportToCityMap = {
    // Asia
    'KUL': 'Kuala Lumpur',
    'PEN': 'Penang',
    'LGK': 'Langkawi',

    'SIN': 'Singapore',

    'BKK': 'Bangkok',
    'HKT': 'Phuket',
    'CNX': 'Chiang Mai',
    'KBV': 'Krabi',

    'DPS': 'Bali',
    'CGK': 'Jakarta',
    'JOG': 'Yogyakarta',

    'NRT': 'Tokyo',
    'HND': 'Tokyo',
    'KIX': 'Osaka',
    'HIJ': 'Hiroshima',

    'ICN': 'Seoul',
    'PUS': 'Busan',
    'CJU': 'Jeju Island',

    'HAN': 'Hanoi',
    'SGN': 'Ho Chi Minh City',
    'DAD': 'Da Nang',

    'REP': 'Siem Reap',

    // Europe
    'CDG': 'Paris',
    'NCE': 'Nice',
    'LYS': 'Lyon',
    'MRS': 'Marseille',

    'FCO': 'Rome',
    'VCE': 'Venice',
    'FLR': 'Florence',
    'MXP': 'Milan',
    'NAP': 'Naples',

    'BCN': 'Barcelona',
    'MAD': 'Madrid',
    'SVQ': 'Seville',
    'VLC': 'Valencia',

    'LHR': 'London',
    'EDI': 'Edinburgh',
    'LPL': 'Liverpool',

    'BER': 'Berlin',
    'MUC': 'Munich',
    'FRA': 'Frankfurt',

    'AMS': 'Amsterdam',
    'RTM': 'Rotterdam',

    'ZRH': 'Zurich',
    'GVA': 'Geneva',

    'ATH': 'Athens',
    'JTR': 'Santorini',
    'JMK': 'Mykonos',

    'LIS': 'Lisbon',
    'OPO': 'Porto',

    'PRG': 'Prague',

    // Americas
    'JFK': 'New York',
    'EWR': 'New York',
    'LAX': 'Los Angeles',
    'SFO': 'San Francisco',
    'LAS': 'Las Vegas',
    'MIA': 'Miami',
    'MCO': 'Orlando',

    'YYZ': 'Toronto',
    'YVR': 'Vancouver',
    'YUL': 'Montreal',

    'GIG': 'Rio de Janeiro',
    'GRU': 'São Paulo',

    'CUN': 'Cancun',
    'MEX': 'Mexico City',
    'GDL': 'Guadalajara',

    'CUZ': 'Cusco',
    'LIM': 'Lima',

    'EZE': 'Buenos Aires',

    // Middle East & Africa
    'DXB': 'Dubai',
    'AUH': 'Abu Dhabi',

    'IST': 'Istanbul',
    'ASR': 'Cappadocia',
    'NAV': 'Cappadocia',

    'CAI': 'Cairo',
    'LXR': 'Luxor',
    'SSH': 'Sharm El Sheikh',

    'RAK': 'Marrakech',
    'CMN': 'Casablanca',

    'CPT': 'Cape Town',

    // Oceania
    'SYD': 'Sydney',
    'MEL': 'Melbourne',
    'OOL': 'Gold Coast',

    'AKL': 'Auckland',
    'ZQN': 'Queenstown'
};

// ===== GET ACTIVITIES FROM ML MODEL =====
async function getActivities(city, country, travelStyles, withWhom, nights) {
    console.log(`🎯 Getting AI recommendations for ${city}`);
    console.log(`🎨 Travel Styles: ${travelStyles.join(', ')}`);
    console.log(`👥 With Whom: ${withWhom}`);
    console.log(`🌙 Nights: ${nights}`);

    try {
        const response = await fetch('http://127.0.0.1:5000/api/itinerary/recommendations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                destination: city,
                country: country,
                travelStyles: travelStyles,
                withWhom: withWhom,
                nights: nights
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to get recommendations');
        }

        if (!data.activities || data.activities.length === 0) {
            console.warn('⚠️ No recommendations found');
            return [];
        }

        console.log(`✅ Got ${data.activities.length} AI recommendations`);

        const formatted = data.activities.map((activity, idx) => ({
            ...activity,
            id: idx,
            duration: 1.5
        }));

        return formatted;

    } catch (error) {
        console.error('❌ Recommendations error:', error);
        showToast(`Error getting recommendations: ${error.message}`, true);
        return [];
    }
}

// ===== GET HOTELS =====
async function getHotels(city, checkIn, checkOut) {
    console.log(`🏨 Searching hotels in ${city}`);

    try {
        const response = await fetch('http://127.0.0.1:5000/api/hotels/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cityName: city,
                checkInDate: checkIn,
                checkOutDate: checkOut,
                adults: 2,
                roomQuantity: 1
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const hotelsList = data.data || [];

        if (hotelsList.length === 0) {
            console.warn('❌ No hotels found');
            return [];
        }

        console.log(`✅ Found ${hotelsList.length} hotels`);

        const formattedHotels = hotelsList.map(item => {
            const hotel = item.hotel || {};
            const offers = item.offers || [];

            let price = 0;
            let currency = 'USD';

            if (offers.length > 0) {
                price = parseFloat(offers[0].price.total);
                currency = offers[0].price.currency;
            }

            return {
                id: hotel.hotelId,
                name: hotel.name,
                rating: hotel.rating || 'N/A',
                reviewCount: hotel.reviewCount || 0,
                price: {
                    total: price,
                    currency: currency
                },
                image: hotel.image,
                address: hotel.address?.cityName || city,
                accommodationType: hotel.accommodation_type || 'Hotel',
                geo: hotel.geo || {},
                url: hotel.url
            };
        });

        return formattedHotels.slice(0, 5);

    } catch (error) {
        console.error('❌ Hotel search error:', error);
    }
}

// ===== UPDATE LOADING MESSAGE =====
function updateLoadingMessage(message) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) {
        loadingText.textContent = message;
    }
}

// ===== SIMULATE LOADING STEPS =====
async function simulateLoadingSteps() {
    const steps = document.querySelectorAll('.loading-steps .step');
    for (let i = 0; i < steps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 600));
        steps[i].classList.add('active');
    }
}

// ===== GENERATE ITINERARY =====
async function generateItinerary() {
    const loadingScreen = document.getElementById('loadingScreen');
    const itineraryScreen = document.getElementById('itineraryScreen');

    if (!loadingScreen || !itineraryScreen) {
        console.error('❌ Required elements not found');
        return;
    }

    try {
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const formData = sessionStorage.getItem('itineraryFormData');

        if (!formData) {
            throw new Error('No itinerary data found. Please go back and fill the form.');
        }

        const tripData = JSON.parse(formData);
        console.log('📋 Trip data:', tripData);

        // ✅ CALCULATE NIGHTS FROM DATES
        const checkInDate = new Date(tripData.startDate);  // ← Changed from check_in
        const checkOutDate = new Date(tripData.endDate);    // ← Changed from check_out
        const timeDiff = checkOutDate - checkInDate;
        const nights = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        console.log(`📅 Check-in: ${tripData.startDate}, Check-out: ${tripData.endDate}`);
        console.log(`🌙 Calculated nights: ${nights}`);

        // ✅ Add nights to tripData
        tripData.nights = nights;

        const originCode = getAirportCode(tripData.departingFrom);
        const destinationCode = getAirportCode(tripData.destination);  // ← Changed from city

        if (!originCode || !destinationCode) {
            throw new Error(`Could not find airport codes`);
        }

        updateLoadingMessage('🔍 Searching flights...');
        const flight = await searchFlights(originCode, destinationCode, tripData.startDate, tripData.endDate);  // ← Changed field names

        if (!flight) {
            throw new Error('No flights available');
        }

        console.log('✅ Flight found:', flight);

        updateLoadingMessage('🎯 Finding attractions...');

        // GET TRAVEL STYLES FROM FORM DATA 
        const travelStyles = tripData.travelStyles || tripData.preferences?.travelStyles || ['cultural', 'nature'];
        const withWhom = tripData.withWhom || tripData.preferences?.withWhom || 'solo';

        console.log(`🎨 Travel Styles: ${travelStyles.join(', ')}`);
        console.log(`👥 Traveling with: ${withWhom}`);

        // GET ALL RECOMMENDATIONS 
        const allActivities = await getActivities(
            tripData.destination || tripData.city,
            tripData.country,
            travelStyles,
            withWhom,
            nights
        );

        // ===== IMPROVED CAPACITY CALCULATION =====
        const maxActivitiesDay1 = 2;
        const maxActivitiesLastDay = 1;

        let activitiesPerDay;
        if (nights > 10) {
            activitiesPerDay = 2;  // Relaxed pace for long trips
            console.log(`📅 Long trip (${nights} nights) - Using 2 activities per day`);
        } else {
            activitiesPerDay = 3;  // Standard pace
            console.log(`📅 Standard trip (${nights} nights) - Using 3 activities per day`);
        }

        let totalScheduled;

        if (nights === 1) {
            // Same-day trip
            totalScheduled = 2;
            console.log(`1 night = 2 activities (day trip)`);
        } else if (nights === 2) {
            // 2 nights: Day 1 (2) + Day 2 (2 before leaving)
            totalScheduled = maxActivitiesDay1 + maxActivitiesLastDay;
            console.log(`2 nights: Day 1 (2) + Day 2 (2) = 4 activities`);
        } else {
            // 3+ nights: Day 1 (2) + middle days (activitiesPerDay each) + last day (1)
            const middleDays = nights - 2;
            totalScheduled = maxActivitiesDay1 + (middleDays * activitiesPerDay) + maxActivitiesLastDay;

            console.log(`${nights} nights breakdown:`);
            console.log(`  Day 1: ${maxActivitiesDay1} activities (arrival)`);
            console.log(`  Days 2-${nights - 1}: ${activitiesPerDay} activities/day (${middleDays} days = ${middleDays * activitiesPerDay})`);
            console.log(`  Day ${nights}: ${maxActivitiesLastDay} activities (before airport)`);
            console.log(`  Total: ${totalScheduled} activities`);
        }

        console.log(`\n📊 Recommendations summary:`);
        console.log(`   Total from API: ${allActivities.length}`);
        console.log(`   Scheduled: ${totalScheduled} activities`);
        console.log(`   Unscheduled: ${allActivities.length - totalScheduled} activities`);

        // ✅ SPLIT INTO SCHEDULED AND UNSCHEDULED
        const scheduledActivities = allActivities.slice(0, totalScheduled);
        const unscheduledActivities = allActivities.slice(totalScheduled);

        console.log(`\n✅ Activities split complete:`);
        console.log(`   Scheduled: ${scheduledActivities.length}`);
        console.log(`   Unscheduled: ${unscheduledActivities.length}`);

        updateLoadingMessage('🏨 Finding hotels...');
        const hotels = await getHotels(tripData.destination || tripData.city, tripData.startDate, tripData.endDate);  // ← Changed field names

        itineraryData = {
            ...tripData,
            nights: nights,
            flight: flight,
            activities: scheduledActivities,
            hotels: hotels,
            arrivalTime: flight.arrival,
            selectedHotel: null
        };

        // ✅ STORE GLOBALLY FOR UNSCHEDULED TAB
        window.allActivitiesData = allActivities;
        window.unscheduledActivitiesData = unscheduledActivities;

        console.log('✅ Itinerary created. Waiting for hotel selection...');

        updateTripHeader();
        await simulateLoadingSteps();

        console.log('✅ Itinerary generated:', itineraryData);

        loadingScreen.classList.remove('active');
        loadingScreen.classList.add('hidden');
        itineraryScreen.classList.add('active');

        setTimeout(() => {
            initializeResizablePanel();
        }, 500);

        setTimeout(async () => {
            await initializeMap(tripData.destination || tripData.city, tripData.country);  // ← Changed from city

            // ✅ Render ONLY Day 1 initially (without full itinerary)
            const container = document.querySelector('.activities-content');
            container.innerHTML = '';
            const nonHotelActivities = itineraryData.activities.filter(a => !a.isHotel);

            // Render just Day 1
            await renderDaySection(
                container,
                1,
                nonHotelActivities,
                nights,
                itineraryData.flight
            );

            console.log('✅ Day 1 rendered - waiting for hotel selection...');

            renderHotels(itineraryData.hotels);
            initializeHotelCarousel(itineraryData.hotels.length);

            await addFlightMarker(itineraryData.flight);
            await addActivityMarkers(itineraryData.activities);
        }, 300);

    } catch (error) {
        console.error('❌ Error:', error);

        if (loadingScreen) {
            const loadingText = document.getElementById('loadingText');
            const loadingSubtext = document.getElementById('loadingSubtext');

            if (loadingText) loadingText.textContent = '❌ Error';
            if (loadingSubtext) loadingSubtext.textContent = error.message;
        }

        showToast(`Error: ${error.message}`, true);
    }
}


// ===== RENDER FLIGHT CARD - RETURNS CARD WITH TRANSIT CALCULATED =====
async function renderFlightCard(flight) {
    // ✅ Create the card
    const flightDate = new Date(flight.departureDate);
    const options = { month: 'short', day: 'numeric' };
    const dateStr = flightDate.toLocaleDateString('en-US', options);
    const durationText = parseDuration(flight.duration);

    const card = document.createElement('div');
    card.className = 'flight-card-container';
    card.innerHTML = `
        <div class="flight-card-header">
            <i class="fa fa-plane" style="color: var(--primary-blue); font-size: 18px;"></i>
            <h2 class="flight-title">${flight.fromAirport} — ${flight.toAirport}</h2>
        </div>
        <div class="flight-card-content">
            <div class="flight-time-box">
                <div class="flight-time">${flight.departure}</div>
                <div class="flight-airport">${flight.fromAirport}</div>
            </div>
            <div class="flight-timeline">
                <div class="flight-timeline-line"></div>
                <div class="flight-duration-container">
                    <i class="fa fa-plane flight-airplane-icon"></i>
                </div>
            </div>
            <div class="flight-time-box">
                <div class="flight-time">${flight.arrival}</div>
                <div class="flight-airport">${flight.toAirport}</div>
            </div>
        </div>
        <div class="flight-card-footer">
            <div class="flight-info-left">
                <div class="flight-date-airline">
                    ${dateStr} <span>| ${flight.flightNumber}</span>
                </div>
            </div>
            <div class="flight-duration-footer">
                <div class="flight-duration-badge">${durationText}</div>
            </div>
        </div>
    `;

    // ✅ Create wrapper for both flight and transit
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display: flex; flex-direction: column; gap: var(--card-gap);`;
    wrapper.appendChild(card);

    // ✅ Create transit card
    const transitCard = createTransitCard('transit-airport-0', 'Calculating...');
    wrapper.appendChild(transitCard);

    // ✅ CALCULATE AIRPORT → FIRST ACTIVITY
    try {
        const nonHotelActivities = itineraryData.activities.filter(a => !a.isHotel);
        const firstActivity = nonHotelActivities[0];

        if (firstActivity) {
            const firstCoords = {
                lat: parseFloat(firstActivity.latitude || firstActivity.coordinates?.lat),
                lng: parseFloat(firstActivity.longitude || firstActivity.coordinates?.lng)
            };

            if (firstCoords.lat && firstCoords.lng) {
                const toCity = airportToCityMap[flight.toAirport];
                const airportCoords = await getCoordinates(`${toCity} International Airport`, itineraryData.country);

                if (airportCoords) {
                    // ✅ AWAIT the route calculation
                    await new Promise((resolve) => {
                        directionsService.route({
                            origin: airportCoords,
                            destination: firstCoords,
                            travelMode: google.maps.TravelMode.DRIVING
                        }, (result, status) => {
                            if (status === google.maps.DirectionsStatus.OK) {
                                const leg = result.routes[0].legs[0];
                                const distKm = (leg.distance.value / 1000).toFixed(1);
                                const timeMins = Math.round(leg.duration.value / 60);

                                // ✅ UPDATE the transit card text
                                const textSpan = transitCard.querySelector('.transit-text');
                                if (textSpan) {
                                    textSpan.textContent = `${timeMins} minutes · ${distKm} km`;
                                    console.log(`✅ Updated airport transit: ${timeMins}m • ${distKm}km`);
                                }
                            }
                            resolve();
                        });
                    });
                }
            }
        }
    } catch (error) {
        console.error('❌ Error calculating airport route:', error);
    }

    console.log('✅ Flight card created with transit calculated');
    return wrapper;
}

// ===== RENDER RETURN FLIGHT CARD =====
function renderReturnFlightCard(flight) {
    if (!flight || !flight.returnFlight) return null;

    const returnFlight = flight.returnFlight;
    const card = document.createElement('div');
    card.className = 'flight-card-container';
    card.innerHTML = `
        <div class="flight-card-header">
            <i class="fa fa-plane" style="color: var(--primary-blue); font-size: 18px;"></i>
            <h2 class="flight-title">${flight.toAirport} → ${flight.fromAirport}</h2>
        </div>
        <div class="flight-card-content">
            <div class="flight-time-box">
                <div class="flight-time">${returnFlight.departure}</div>
                <div class="flight-airport">${flight.toAirport}</div>
            </div>
            <div class="flight-timeline">
                <div class="flight-timeline-line"></div>
                <div class="flight-duration-container">
                    <i class="fa fa-plane flight-airplane-icon"></i>
                </div>
            </div>
            <div class="flight-time-box">
                <div class="flight-time">${returnFlight.arrival}</div>
                <div class="flight-airport">${flight.fromAirport}</div>
            </div>
        </div>
        <div class="flight-card-footer">
            <div class="flight-info-left">
                <div class="flight-date-airline">
                    <span>${flight.airline} ${flight.flightNumber}</span>
                </div>
            </div>
            <div class="flight-duration-footer">
                <div class="flight-duration-badge">${parseDuration(returnFlight.duration)}</div>
            </div>
        </div>
    `;
    return card;
}

// ===== PARSE DURATION =====
function parseDuration(duration) {
    if (!duration) return 'N/A';

    const match = duration.match(/PT(\d+)H?(\d+)?M?/);

    if (!match) return duration;

    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

// ===== GET COORDINATES FROM GOOGLE GEOCODING =====
async function getCoordinates(city, country = '') {
    const actualCity = airportToCityMap[city] || city;
    const cacheKey = `${actualCity}`;

    if (locationCache[cacheKey]) {
        return locationCache[cacheKey];
    }

    try {
        const geocoder = new google.maps.Geocoder();
        const query = country ? `${actualCity}, ${country}` : actualCity;

        const response = await new Promise((resolve, reject) => {
            geocoder.geocode({ address: query }, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results.length > 0) {
                    resolve(results[0]);
                } else {
                    reject(`Geocoding error: ${status}`);
                }
            });
        });

        const location = {
            lat: response.geometry.location.lat(),
            lng: response.geometry.location.lng(),
            address: response.formatted_address
        };

        locationCache[cacheKey] = location;
        console.log(`✅ Geocoded ${actualCity}: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);

        return location;
    } catch (error) {
        console.error(`⚠️ Geocoding error for ${city}:`, error);
        return { lat: 3.1390, lng: 101.6869 };
    }
}

// ===== CREATE AIRPORT MARKER SVG WITH EMOJI =====
function createAirportMarkerSvg(color, type) {
    const emoji = type === 'departure' ? '🛫' : '🛬';

    return `
        <svg width="50" height="65" viewBox="0 0 50 65" xmlns="http://www.w3.org/2000/svg">
            <!-- Pin body -->
            <path d="M25 0 C11.2 0 0 11.2 0 25 C0 35 25 65 25 65 C25 65 50 35 50 25 C50 11.2 38.8 0 25 0 Z" 
                  fill="#${color}" 
                  stroke="white" 
                  stroke-width="3"/>
            
            <!-- White circle background -->
            <circle cx="25" cy="23" r="14" fill="white"/>
            
            <!-- Plane emoji -->
            <text x="25" y="30" 
                  font-size="18" 
                  text-anchor="middle">
                ${emoji}
            </text>
        </svg>
    `;
}


// ===== CREATE AIRPORT MARKER =====
function createAirportMarker(position, type, title, subtitle, map) {
    const color = type === 'departure' ? '3B82F6' : '10B981';  // Blue for departure, Green for arrival

    console.log(`✈️ Creating ${type} marker: ${title}`);

    // Create SVG marker
    const markerSvg = createAirportMarkerSvg(color, type);

    const marker = new google.maps.Marker({
        position: position,
        map: map,
        title: title,
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(markerSvg),
            scaledSize: new google.maps.Size(50, 65),
            anchor: new google.maps.Point(25, 65)
        },
        animation: google.maps.Animation.DROP,
        optimized: false,
        zIndex: 2000  // Higher than activity markers
    });

    // Info window
    const infoContent = `
        <div style="font-family: 'Inter', sans-serif; max-width: 250px; padding: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="background: #${color}; color: white; padding: 6px 10px; border-radius: 6px; font-size: 18px;">
                    ${type === 'departure' ? '🛫' : '🛬'}
                </div>
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1F2937; flex: 1;">${title}</h3>
            </div>
            <p style="margin: 0; font-size: 14px; color: #6B7280; line-height: 1.5;">${subtitle}</p>
        </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
        content: infoContent
    });

    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });

    return marker;
}


// ===== ADD FLIGHT MARKER =====
async function addFlightMarker(flight) {
    if (!map) return;

    try {
        console.log('✈️ Adding flight markers...');

        const totalDays = itineraryData.nights || 3;

        // Convert airport codes to city names
        const fromCity = airportToCityMap[flight.fromAirport] || flight.fromAirport;
        const toCity = airportToCityMap[flight.toAirport] || flight.toAirport;

        console.log(`🛫 From: ${flight.fromAirport} (${fromCity})`);
        console.log(`🛬 To: ${flight.toAirport} (${toCity})`);

        // Geocode using city name + "International Airport"
        const fromCoords = await getCoordinates(`${fromCity} International Airport`, itineraryData?.country);
        const toCoords = await getCoordinates(`${toCity} International Airport`, itineraryData?.country);

        console.log(`📍 Departure coords: lat=${fromCoords.lat}, lng=${fromCoords.lng}`);
        console.log(`📍 Arrival coords: lat=${toCoords.lat}, lng=${toCoords.lng}`);

        // VERIFY the coordinates are numbers, not strings
        if (isNaN(fromCoords.lat) || isNaN(fromCoords.lng)) {
            console.error('❌ Invalid departure coordinates:', fromCoords);
            return;
        }
        if (isNaN(toCoords.lat) || isNaN(toCoords.lng)) {
            console.error('❌ Invalid arrival coordinates:', toCoords);
            return;
        }

        // CREATE CUSTOM AIRPORT/FLIGHT MARKER WITH PLANE ICON
        createAirportMarker(
            toCoords,
            'arrival',
            `${flight.toAirport} (${toCity})`,
            `Arrival: ${flight.arrival} • ${parseDuration(flight.duration)} flight`,
            map
        );

        console.log('✅ Flight markers added successfully');
    } catch (error) {
        console.error('❌ Error adding flight markers:', error);
    }
}

// ===== CREATE HOTEL MARKER SVG =====
function createHotelMarkerSvg(color) {
    return `
        <svg width="50" height="65" viewBox="0 0 50 65" xmlns="http://www.w3.org/2000/svg">
            <!-- Pin body -->
            <path d="M25 0 C11.2 0 0 11.2 0 25 C0 35 25 65 25 65 C25 65 50 35 50 25 C50 11.2 38.8 0 25 0 Z" 
                  fill="#${color}" 
                  stroke="white" 
                  stroke-width="3"/>
            
            <!-- White circle background -->
            <circle cx="25" cy="23" r="14" fill="white"/>
            
            <!-- Hotel emoji -->
            <text x="25" y="30" 
                  font-family="Arial, sans-serif"
                  font-size="18" 
                  text-anchor="middle">
                🏨
            </text>
        </svg>
    `;
}


// ===== CREATE HOTEL MARKER =====
function createHotelMarker(position, title, address, map) {
    const color = '10B981';  // Green for hotels

    console.log(`🏨 Creating hotel marker: ${title}`);

    const markerSvg = createHotelMarkerSvg(color);

    const marker = new google.maps.Marker({
        position: position,
        map: map,
        title: title,
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(markerSvg),
            scaledSize: new google.maps.Size(50, 65),
            anchor: new google.maps.Point(25, 65)
        },
        animation: google.maps.Animation.DROP,
        optimized: false,
        zIndex: 1500  // Higher than activities
    });

    // Info window
    const infoContent = `
        <div style="font-family: 'Inter', sans-serif; max-width: 250px; padding: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="font-size: 24px;">🏨</div>
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1F2937; flex: 1;">${title}</h3>
            </div>
            <p style="margin: 0; font-size: 14px; color: #6B7280; line-height: 1.5;">${address}</p>
        </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
        content: infoContent
    });

    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });

    return marker;
}

// ===== ADD ACTIVITY MARKERS =====
async function addActivityMarkers(activities) {
    if (!map || !activities) return;

    try {
        console.log('📍 Adding activity markers...');

        for (let idx = 0; idx < activities.length; idx++) {
            const activity = activities[idx];

            // Skip hotels - they have their own marker function
            if (activity.isHotel) continue;

            // Get coordinates
            let activityCoords;
            if (activity.coordinates) {
                activityCoords = activity.coordinates;
            } else {
                activityCoords = await getCoordinates(activity.name, itineraryData?.city);
            }

            createActivityMarker(
                activityCoords,
                activity.name,
                activity.address || activity.category,
                map,
                (idx + 1).toString()
            );
        }

        console.log(`✅ ${activities.length} activity markers added`);
    } catch (error) {
        console.error('❌ Error adding activity markers:', error);
    }
}

// ===== CREATE ACTIVITY MARKER SVG (NUMBERS ONLY) =====
function createActivityMarkerSvg(color, labelText) {
    return `
        <svg width="50" height="65" viewBox="0 0 50 65" xmlns="http://www.w3.org/2000/svg">
            <!-- Pin body -->
            <path d="M25 0 C11.2 0 0 11.2 0 25 C0 35 25 65 25 65 C25 65 50 35 50 25 C50 11.2 38.8 0 25 0 Z" 
                  fill="#${color}" 
                  stroke="white" 
                  stroke-width="3"/>
            
            <!-- White circle background -->
            <circle cx="25" cy="23" r="14" fill="white"/>
            
            <!-- Activity number -->
            ${labelText ? `
            <text x="25" y="30.5" 
                  font-family="Arial, sans-serif"
                  font-size="20" 
                  font-weight="900"
                  fill="#${color}"
                  text-anchor="middle">
                ${labelText}
            </text>
            ` : `
            <circle cx="25" cy="23" r="6" fill="#${color}"/>
            `}
        </svg>
    `;
}


// ===== CREATE ACTIVITY MARKER =====
function createActivityMarker(position, title, address, map, label) {
    const color = '3B82F6';  // Blue for all activities

    console.log(`📍 Creating activity marker: ${title} | Label: ${label}`);

    const markerSvg = createActivityMarkerSvg(color, label);

    const marker = new google.maps.Marker({
        position: position,
        map: map,
        title: title,
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(markerSvg),
            scaledSize: new google.maps.Size(50, 65),
            anchor: new google.maps.Point(25, 65)
        },
        animation: google.maps.Animation.DROP,
        optimized: false,
        zIndex: label ? 1000 + parseInt(label, 10) : 100
    });

    // Info window
    const infoContent = `
        <div style="font-family: 'Inter', sans-serif; max-width: 250px; padding: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                ${label ? `<div style="background: #${color}; color: white; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 14px;">${label}</div>` : ''}
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1F2937; flex: 1;">${title}</h3>
            </div>
            <p style="margin: 0; font-size: 14px; color: #6B7280; line-height: 1.5;">${address}</p>
        </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
        content: infoContent
    });

    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });

    return marker;
}

// ===== VIEW ROUTE FOR SINGLE ACTIVITY =====
window.viewRoute = async function (activityName) {
    console.log('🗺️ Viewing route to:', activityName);

    if (!directionsService || !map) {
        showToast('Map not initialized', true);
        return;
    }

    clearAllPolylines();

    try {
        const currentActivity = itineraryData.activities.find(
            activity => activity.name === activityName
        );

        if (!currentActivity) {
            showToast('Activity not found', true);
            return;
        }

        const toCoords = {
            lat: currentActivity.latitude || currentActivity.lat,
            lng: currentActivity.longitude || currentActivity.lng
        };

        if (!toCoords.lat || !toCoords.lng) {
            showToast('Activity coordinates not found', true);
            return;
        }

        let fromCoords;
        let fromName = 'Unknown';

        // ===== HANDLE HOTEL ACTIVITIES =====
        if (currentActivity.isHotel || currentActivity.type === 'hotel' || currentActivity.category === 'hotel') {
            const currentIndex = itineraryData.activities.findIndex(a => a.name === activityName);

            // Check if next item exists and is NOT a hotel (means hotel is at END of day)
            const nextActivity = currentIndex < itineraryData.activities.length - 1 ?
                itineraryData.activities[currentIndex + 1] : null;

            const nextIsHotel = nextActivity && (
                nextActivity.isHotel === true ||
                nextActivity.type === 'hotel' ||
                nextActivity.category === 'hotel'
            );

            const hotelAtEndOfDay = nextActivity && !nextIsHotel;

            if (hotelAtEndOfDay) {
                // Hotel is at END of day - route from last activity before it
                let lastActivityBeforeHotel = null;

                for (let i = currentIndex - 1; i >= 0; i--) {
                    const activity = itineraryData.activities[i];
                    const isHotelItem = (
                        activity.isHotel === true ||
                        activity.type === 'hotel' ||
                        activity.category === 'hotel'
                    );

                    if (!isHotelItem) {
                        lastActivityBeforeHotel = activity;
                        break;
                    }
                }

                if (lastActivityBeforeHotel) {
                    fromCoords = {
                        lat: lastActivityBeforeHotel.latitude || lastActivityBeforeHotel.lat,
                        lng: lastActivityBeforeHotel.longitude || lastActivityBeforeHotel.lng
                    };
                    fromName = lastActivityBeforeHotel.name;
                    console.log(`✅ Hotel at end of day - routing from last activity: ${fromName}`);
                } else {
                    // No activities before hotel (shouldn't happen, but handle it)
                    const toCity = airportToCityMap[itineraryData?.flight?.toAirport] || itineraryData?.flight?.toAirport;
                    fromCoords = await getCoordinates(`${toCity} International Airport`, itineraryData?.country);
                    fromName = `${itineraryData?.flight?.toAirport || 'Airport'}`;
                    console.log(`✅ No activities before hotel - using airport: ${fromName}`);
                }
            } else {
                // Hotel at START of day (Day 2+) - no route needed
                console.log('🏨 Hotel at start of day - no route needed');
                showToast('Hotel at start of day - no route to display', false);
                return;
            }
        }
        // ===== HANDLE REGULAR ACTIVITIES =====
        else {
            const currentIndex = itineraryData.activities.findIndex(a => a.name === activityName);
            console.log(`📍 Activity: ${activityName}, Index: ${currentIndex}`);

            // Get previous activity
            const prevActivity = currentIndex > 0 ? itineraryData.activities[currentIndex - 1] : null;

            // Check if PREVIOUS item is a hotel
            const prevIsHotel = prevActivity && (
                prevActivity.isHotel === true ||
                prevActivity.type === 'hotel' ||
                prevActivity.category === 'hotel'
            );

            console.log(`🔎 Previous item: ${prevActivity?.name}, Is Hotel: ${prevIsHotel}`);

            if (prevIsHotel) {
                // Previous is hotel - this is FIRST activity of the day, start from hotel
                fromCoords = {
                    lat: prevActivity.latitude || prevActivity.lat,
                    lng: prevActivity.longitude || prevActivity.lng
                };
                fromName = prevActivity.name;
                console.log(`✅ First activity of day: Starting from hotel: ${fromName}`);
            } else if (prevActivity) {
                // Previous is a regular activity - use it (chaining activities)
                fromCoords = {
                    lat: prevActivity.latitude || prevActivity.lat,
                    lng: prevActivity.longitude || prevActivity.lng
                };
                fromName = prevActivity.name;
                console.log(`✅ Continuing from previous activity: ${fromName}`);
            } else {
                // No previous activity - must be first activity of Day 1, use airport
                const toCity = airportToCityMap[itineraryData?.flight?.toAirport] || itineraryData?.flight?.toAirport;
                fromCoords = await getCoordinates(`${toCity} International Airport`, itineraryData?.country);
                fromName = `${itineraryData?.flight?.toAirport || 'Airport'}`;
                console.log(`✅ First activity of Day 1: Using airport: ${fromName}`);
            }
        }

        if (!fromCoords || !fromCoords.lat || !fromCoords.lng) {
            showToast('Could not determine starting point', true);
            return;
        }

        // ===== CALCULATE AND DRAW ROUTE =====
        directionsService.route({
            origin: fromCoords,
            destination: toCoords,
            travelMode: google.maps.TravelMode.DRIVING
        }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                const leg = result.routes[0].legs[0];
                const distKm = (leg.distance.value / 1000).toFixed(1);
                const timeMins = Math.round(leg.duration.value / 60);

                console.log(`✅ Route: ${fromName} → ${activityName} (${distKm}km, ${timeMins}min)`);
                showToast(`📍 ${fromName} → ${activityName}: ${distKm} km • ${timeMins} min`, false);

                const path = result.routes[0].overview_path;

                const routeLine = new google.maps.Polyline({
                    path: path,
                    geodesic: true,
                    strokeColor: '#3B82F6',
                    strokeOpacity: 1,
                    strokeWeight: 5,
                    map: map,
                    icons: [{
                        icon: {
                            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                            strokeColor: '#FFFFFF',
                            fillColor: '#3B82F6',
                            fillOpacity: 1,
                            scale: 3
                        },
                        offset: '100%',
                        repeat: '100px'
                    }]
                });

                activePolylines.push(routeLine);
                console.log('✅ Drew route line on map with arrows');

                // Fit map to show entire route
                const bounds = new google.maps.LatLngBounds();
                bounds.extend(fromCoords);
                bounds.extend(toCoords);

                map.fitBounds(bounds, {
                    padding: { top: 100, right: 100, bottom: 100, left: 100 }
                });

                // Limit zoom level
                google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
                    const currentZoom = map.getZoom();
                    if (currentZoom > 15) {
                        map.setZoom(15);
                    }
                });
            } else {
                console.error('❌ Route error:', status);
                showToast('❌ Could not calculate route', true);
            }
        });
    } catch (error) {
        console.error('❌ Error viewing route:', error);
        showToast('Error calculating route', true);
    }
};

function renderAllActivitiesAtOnce() {
    if (!selectedHotel) {
        console.warn('⚠️ No hotel selected yet. Waiting for hotel selection...');
        return;
    }

    const container = document.querySelector('.activities-content');
    container.innerHTML = '';

    const nonHotelActivities = itineraryData.activities.filter(a => !a.isHotel);

    // USE ORIGINAL NIGHTS COUNT (don't recalculate days based on activities)
    const totalNights = itineraryData.nights;
    const maxActivitiesDay1 = 2;
    const activitiesPerDay = 3;

    // Calculate total days based on ORIGINAL trip duration, not activity count
    const totalDaysNeeded = totalNights;

    console.log(`\n📅 Rendering ${totalDaysNeeded} days (${totalNights} nights) with ${nonHotelActivities.length} activities\n`);

    // CREATE DYNAMIC DAY TABS FIRST
    createDayTabs(totalDaysNeeded);

    // Render all days
    async function renderAllDays() {
        for (let day = 1; day <= totalDaysNeeded; day++) {
            await renderDaySection(
                container,
                day,
                nonHotelActivities,
                totalNights,
                day === 1 ? itineraryData.flight : null
            );
        }

        // ✅ INITIALIZE TABS AFTER RENDERING (with delay)
        setTimeout(() => {
            console.log('\n🔄 Initializing tabs...\n');
            initializeDayTabs();
        }, 500);
    }

    renderAllDays();
}

// ===== INITIALIZE DAY TABS - WITH UNSCHEDULED SUPPORT =====
function initializeDayTabs() {
    console.log('🔧 Initializing day tabs...');

    const dayTabs = document.querySelectorAll('.day-tab');

    if (dayTabs.length === 0) {
        console.error('❌ No day tabs found!');
        return;
    }

    console.log(`   Found ${dayTabs.length} tabs`);

    dayTabs.forEach(tab => {
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            const dayNumber = this.getAttribute('data-day');

            console.log(`\n🖱️ Clicked tab: ${dayNumber}`);

            // Remove active from all tabs
            dayTabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = 'white';
                t.style.color = '#6B7280';
                t.style.borderColor = '#E0E6ED';
            });

            // Add active to clicked tab
            this.classList.add('active');
            this.style.background = '#3D9BF3';
            this.style.color = 'white';
            this.style.borderColor = '#3D9BF3';

            // ✅ CHECK IF IT'S UNSCHEDULED TAB
            if (dayNumber === 'unscheduled') {
                console.log('   Showing Unscheduled section');

                // Hide all day sections
                document.querySelectorAll('[id^="day-section-"]').forEach(section => {
                    section.style.display = 'none';
                });

                // Hide hotels section
                const hotelsSection = document.querySelector('.hotels-section');
                if (hotelsSection) {
                    hotelsSection.style.display = 'none';
                }

                // Show unscheduled section
                const unscheduledSection = document.getElementById('unscheduled-section');
                if (unscheduledSection) {
                    unscheduledSection.style.display = 'block';
                    unscheduledSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    console.log('   ✅ Unscheduled section shown');
                }
            }
            // ✅ OTHERWISE IT'S A REGULAR DAY
            else {
                console.log(`   Showing Day ${dayNumber}`);

                // Hide unscheduled section
                const unscheduledSection = document.getElementById('unscheduled-section');
                if (unscheduledSection) {
                    unscheduledSection.style.display = 'none';
                }

                // Hide all day sections
                const allSections = document.querySelectorAll('[id^="day-section-"]');
                allSections.forEach(section => {
                    section.style.display = 'none';
                });

                // Show selected day section
                const selectedSection = document.querySelector(`#day-section-${dayNumber}`);
                if (selectedSection) {
                    selectedSection.style.display = 'flex';
                    selectedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    console.log(`   ✅ Day ${dayNumber} shown`);
                }

                // Handle hotels section (only Day 1)
                const hotelsSection = document.querySelector('.hotels-section');
                if (hotelsSection) {
                    hotelsSection.style.display = dayNumber === '1' ? 'block' : 'none';
                }
            }

            sessionStorage.setItem('currentDay', dayNumber);
        });
    });

    // Activate Day 1 by default
    const firstTab = dayTabs[0];
    if (firstTab) {
        firstTab.click();
        console.log('✅ Day 1 activated\n');
    }
}

// ===== CREATE DAY TABS DYNAMICALLY (WITH UNSCHEDULED TAB) =====
function createDayTabs(totalDays) {
    console.log(`\n🏷️ Creating ${totalDays} day tabs + Unscheduled tab...`);

    const tabsContainer = document.getElementById('dayTabsContainer') || document.querySelector('.day-tabs');

    if (!tabsContainer) {
        console.error('❌ Day tabs container not found!');
        return;
    }

    // Clear existing tabs
    tabsContainer.innerHTML = '';

    // Get trip dates if available
    const tripStartDate = itineraryData?.tripStartDate ? new Date(itineraryData.tripStartDate) : null;

    // ✅ CREATE DAY TABS (Day 1, Day 2, etc.)
    for (let day = 1; day <= totalDays; day++) {
        const tabBtn = document.createElement('button');
        tabBtn.className = 'day-tab';
        tabBtn.setAttribute('data-day', day);

        // Calculate date for this day
        let dateStr = '';
        if (tripStartDate) {
            const dayDate = new Date(tripStartDate);
            dayDate.setDate(dayDate.getDate() + (day - 1));
            dateStr = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        // Create tab content
        tabBtn.innerHTML = `
            <span class="tab-label">Day ${day}</span>
            ${dateStr ? `<span class="tab-date">${dateStr}</span>` : ''}
        `;

        // Add active class to Day 1
        if (day === 1) {
            tabBtn.classList.add('active');
        }

        tabsContainer.appendChild(tabBtn);
        console.log(`   ✅ Created tab for Day ${day}${dateStr ? ' (' + dateStr + ')' : ''}`);
    }

    // CREATE UNSCHEDULED TAB
    const unscheduledTab = document.createElement('button');
    unscheduledTab.className = 'day-tab unscheduled-tab';
    unscheduledTab.setAttribute('data-day', 'unscheduled');
    unscheduledTab.innerHTML = `
        <span class="tab-label"><i class="fa fa-lightbulb"></i> Unscheduled</span>
        <span class="tab-date">More ideas</span>
    `;

    tabsContainer.appendChild(unscheduledTab);
    console.log(`   ✅ Created Unscheduled tab`);

    console.log(`✅ All ${totalDays + 1} tabs created\n`);
}

// ===== RENDER SINGLE DAY SECTION =====
async function renderDaySection(container, dayNumber, nonHotelActivities, totalNights, flight) {
    if (!nonHotelActivities || nonHotelActivities.length === 0) {
        console.warn(`No activities for Day ${dayNumber}`);
        return;
    }

    const hotelInItinerary = selectedHotel;

    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    dayHeader.style.cssText = `
        padding: 16px;
        margin-top: 24px;
        margin-bottom: 12px;
        border-left: 4px solid var(--primary-blue);
        background: #EFF6FF;
        border-radius: 4px;
    `;
    dayHeader.innerHTML = `
        <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--primary-blue);">
            Day ${dayNumber}
        </h2>
    `;
    container.appendChild(dayHeader);

    const dayContainer = document.createElement('div');
    dayContainer.id = `day-section-${dayNumber}`;
    dayContainer.className = 'day-section';
    dayContainer.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        gap: var(--card-gap) !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        scroll-margin-top: 80px;
    `;

    let dayActivities = [];

    // DYNAMIC ACTIVITIES PER DAY CALCULATION
    const maxActivitiesDay1 = 2;

    // Use 2 activities/day for long trips (>10 nights), 3 for shorter trips
    const activitiesPerDay = totalNights > 10 ? 2 : 3;

    console.log(`📅 Trip length: ${totalNights} nights → ${activitiesPerDay} activities per day`);

    const remainingActivities = nonHotelActivities.length - maxActivitiesDay1;
    const additionalDays = Math.ceil(remainingActivities / activitiesPerDay);
    const totalDaysNeeded = 1 + additionalDays;

    if (dayNumber === 1) {
        // ===== DAY 1: Flight + Activities (with drop zones) + Hotel =====

        // Flight card (NO drop zone before this - flight cannot be moved)
        if (flight) {
            console.log('✈️ Adding flight to Day 1');
            const flightCard = await renderFlightCard(flight);
            if (flightCard) {
                dayContainer.appendChild(flightCard);
            }
        }

        // Day 1 activities
        const endIdx = Math.min(maxActivitiesDay1, nonHotelActivities.length);
        const day1Activities = nonHotelActivities.slice(0, endIdx).filter(a => a);

        day1Activities.forEach((activity, idx) => {
            // ADD DROP ZONE BEFORE EACH ACTIVITY (allows reordering)
            const dropZone = createDropZone(dayNumber, idx);
            dayContainer.appendChild(dropZone);

            const cardNum = idx + 1;
            const card = createActivityCard(activity, cardNum, dayNumber);
            dayContainer.appendChild(card);

            if (idx < day1Activities.length - 1) {
                const transitId = `transit-day${dayNumber}-${idx}-${idx + 1}`;
                const transit = createTransitCard(transitId, 'Calculating...');
                dayContainer.appendChild(transit);
            }
        });

        // ADD FINAL DROP ZONE (after last activity, before hotel)
        const finalDropZone = createDropZone(dayNumber, day1Activities.length);
        dayContainer.appendChild(finalDropZone);

        dayActivities = day1Activities;

        // Activity to hotel transit
        if (hotelInItinerary && hotelInItinerary.name && day1Activities.length > 0) {
            const transitId = `transit-day${dayNumber}-to-hotel`;
            const transitCard = createTransitCard(transitId, 'Calculating...');
            dayContainer.appendChild(transitCard);
        }

        // ADD HOTEL AT END OF DAY 1 (NO drop zone after - hotel is always last)
        if (hotelInItinerary && hotelInItinerary.name) {
            console.log('🏨 Adding hotel at END of Day 1');
            const hotelCard = createActivityCard(hotelInItinerary, day1Activities.length + 1, dayNumber);
            dayContainer.appendChild(hotelCard);
        }

        console.log(`📍 DAY 1: Flight + ${day1Activities.length} activities + Hotel`);

    } else if (dayNumber > 1) {

        // Check if this is the LAST day
        const isLastDay = (dayNumber === totalDaysNeeded);
        const activitiesForThisDay = isLastDay ? 1 : activitiesPerDay;

        const startIdx = maxActivitiesDay1 + ((dayNumber - 2) * activitiesPerDay);
        const endIdx = Math.min(startIdx + activitiesForThisDay, nonHotelActivities.length);

        if (startIdx >= nonHotelActivities.length) {
            console.log(`\n📍 DAY ${dayNumber}: No more activities - skipping`);
            container.appendChild(dayContainer);
            return;
        }

        dayActivities = nonHotelActivities.slice(startIdx, endIdx).filter(a => a);
        console.log(`📍 DAY ${dayNumber} (${isLastDay ? 'LAST DAY' : 'regular'}): ${dayActivities.length} activities (${activitiesPerDay}/day pace)`);

        // ADD HOTEL CARD FOR DAY 2+ AT BEGINNING (NO drop zone before - hotel is always first)
        if (hotelInItinerary && hotelInItinerary.name) {
            const hotelCard = createActivityCard(hotelInItinerary, 0, dayNumber);
            dayContainer.appendChild(hotelCard);

            // Hotel to activity transit
            if (dayActivities.length > 0) {
                const transitId = `transit-day${dayNumber}-hotel-0`;
                const transitCard = createTransitCard(transitId, 'Calculating...');
                dayContainer.appendChild(transitCard);
            }
        }

        // Activities with drop zones
        dayActivities.forEach((activity, idx) => {
            // ADD DROP ZONE BEFORE EACH ACTIVITY
            const dropZone = createDropZone(dayNumber, idx);
            dayContainer.appendChild(dropZone);

            const card = createActivityCard(activity, idx + 1, dayNumber);
            dayContainer.appendChild(card);

            if (idx < dayActivities.length - 1) {
                const transitId = `transit-day${dayNumber}-${idx}-${idx + 1}`;
                const transit = createTransitCard(transitId, 'Calculating...');
                dayContainer.appendChild(transit);
            }
        });

        // ADD FINAL DROP ZONE (after last activity, before airport transit if last day)
        const finalDropZone = createDropZone(dayNumber, dayActivities.length);
        dayContainer.appendChild(finalDropZone);

        console.log(`📍 DAY ${dayNumber}: Hotel + ${dayActivities.length} activities`);
    }

    // ADD SOFT WARNING IF TOO MANY ACTIVITIES (BEFORE RETURN FLIGHT)
    const recommendedMax = dayNumber === 1 ? 2 : (dayNumber === totalDaysNeeded ? 1 : activitiesPerDay);

    if (dayActivities.length > recommendedMax + 1) {
        const warningBanner = document.createElement('div');
        warningBanner.className = 'activity-warning';
        warningBanner.style.cssText = `
            padding: 12px 16px;
            background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
            border-left: 4px solid #F59E0B;
            margin-bottom: 12px;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(245, 158, 11, 0.1);
        `;
        warningBanner.innerHTML = `
            <p style="margin: 0; font-size: 13px; color: #92400E; display: flex; align-items: center; gap: 8px;">
                <i class="fa fa-exclamation-triangle" style="font-size: 16px; color: #F59E0B;"></i>
                <span>
                    <strong>Busy day!</strong> You have ${dayActivities.length} activities scheduled. 
                    Consider spreading them out for a more relaxed trip.
                </span>
            </p>
        `;

        dayContainer.appendChild(warningBanner);
    }

    // ADD RETURN FLIGHT ON LAST DAY
    if (dayNumber === totalDaysNeeded && itineraryData.flight && itineraryData.flight.hasReturn) {
        console.log(`\n✈️ Adding return flight to Day ${dayNumber}`);

        // Add transit from last activity to airport
        const transitToAirport = createTransitCard(`transit-day${dayNumber}-to-airport`, 'Calculating...');
        dayContainer.appendChild(transitToAirport);

        // Add return flight card (NO drop zone before/after - flight cannot be moved)
        const returnFlightCard = renderReturnFlightCard(itineraryData.flight);
        if (returnFlightCard) {
            dayContainer.appendChild(returnFlightCard);
        }
    }

    // APPEND DAY CONTAINER TO MAIN CONTAINER
    container.appendChild(dayContainer);

    // DELAY CALCULATION SLIGHTLY TO ENSURE DOM IS READY
    setTimeout(async () => {
        if (dayActivities.length > 0) {
            console.log(`🚀 Calculating transits for Day ${dayNumber}\n`);
            calculateActivityTransits(dayNumber, dayActivities, totalDaysNeeded);
        }

        // ADD HOTELS SECTION ONLY AFTER DAY 1
        if (dayNumber === 1) {
            const hotelsSection = document.querySelector('.hotels-section');
            if (hotelsSection) {
                hotelsSection.style.display = 'block';
                container.appendChild(hotelsSection);
            }

            if (itineraryData && itineraryData.hotels && itineraryData.hotels.length > 0) {
                renderHotels(itineraryData.hotels);
                initializeHotelCarousel(itineraryData.hotels.length);
            }
        }

        console.log(`✅ Day ${dayNumber} complete\n`);
    }, 100);
}

// ===== CREATE ACTIVITY CARD (SUPPORTS GOOGLE PLACES + HOTELS.COM) =====
function createActivityCard(activity, cardNumber, dayNumber = 1) {
    const card = document.createElement('div');
    card.className = `activity-card ${getCategoryClass(activity.category)}`;
    card.style.position = 'relative';
    card.style.cursor = activity.place_id ? 'pointer' : 'default';

    // ✅ HANDLE MULTIPLE IMAGE SOURCES
    let imageUrl = `https://via.placeholder.com/600x200?text=${encodeURIComponent(activity.name)}`;

    // Priority 1: Direct image URL (from Hotels.com API)
    if (activity.image) {
        imageUrl = activity.image;
        console.log(`✅ Using direct image URL for ${activity.name}`);
    }
    // Priority 2: photo_reference from CSV (Google Places data)
    else if (activity.photo_reference) {
        imageUrl = getPlacePhotoUrl(activity.photo_reference, 600);
        console.log(`✅ Using CSV photo for ${activity.name}`);
    }
    // Priority 3: photos array from API (fallback)
    else if (activity.photos && activity.photos.length > 0) {
        const photoRef = activity.photos[0].photo_reference || activity.photos[0].reference;
        if (photoRef) {
            imageUrl = getPlacePhotoUrl(photoRef, 600);
            console.log(`✅ Using API photo for ${activity.name}`);
        }
    }

    const description = activity.address || `Popular ${activity.category} in the city`;

    // Determine if we should hide View on Map button
    const isDay2PlusHotel = activity.isHotel && dayNumber > 1;

    // Don't show remove button or enable drag for hotels
    const canRemove = !activity.isHotel;
    const canDrag = !activity.isHotel;

    card.innerHTML = `
        ${canRemove ? `
            <button class="btn-remove-activity" 
                    onclick="event.stopPropagation(); removeActivity('${activity.name.replace(/'/g, "\\'")}', ${dayNumber})" 
                    title="Remove activity"
                    style="
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: rgba(239, 68, 68, 0.95);
                        color: white;
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 16px;
                        z-index: 10;
                        opacity: 0;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
                        backdrop-filter: blur(4px);
                    "
                    onmouseover="this.style.background='rgb(220, 38, 38)'; this.style.transform='scale(1.1) rotate(90deg)'"
                    onmouseout="this.style.background='rgba(239, 68, 68, 0.95)'; this.style.transform='scale(1) rotate(0deg)'">
                <i class="fa fa-times"></i>
            </button>
        ` : ''}
        
        <div class="activity-card-images">
            <img src="${imageUrl}" 
                 alt="${activity.name}" 
                 class="activity-image"
                 onerror="this.src='https://via.placeholder.com/600x200?text=${encodeURIComponent(activity.name)}'">
            ${activity.place_id ? `
                <div class="card-click-hint">
                    <i class="fa fa-info-circle"></i> Click for details
                </div>
            ` : ''}
        </div>
        
        <div class="activity-card-info">
            <div class="activity-header">
                <h3>${activity.name}</h3>
                <span class="activity-rating">${activity.rating || 'N/A'}</span>
            </div>
            
            <div class="activity-meta">
                <span><i class="fa ${activity.isHotel ? 'fa-hotel' : 'fa-bookmark'}"></i> ${activity.category}</span>
                <span><i class="fa fa-user"></i> ${activity.reviews || 0} reviews</span>
            </div>
            
            <p class="activity-description">${description}</p>
            
            <div class="activity-actions">
                ${!isDay2PlusHotel ? `
                    <button class="btn-view-on-map" 
                            onclick="event.stopPropagation(); viewRoute('${activity.name.replace(/'/g, "\\'")}')">
                        <i class="fa fa-map-marker"></i> View on Map
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    // MAKE ENTIRE CARD CLICKABLE TO SHOW DETAILS (ONLY IF HAS PLACE_ID)
    if (activity.place_id) {
        console.log(`Adding click listener for: ${activity.name}, place_id: ${activity.place_id}`);

        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on buttons
            if (e.target.closest('.btn-remove-activity')) {
                return;
            }
            if (e.target.closest('.btn-view-on-map')) {
                return;
            }

            showActivityDetails(activity.name, activity.place_id);
        });

        // Add hover effect
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
            card.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '';
        });
    } else {
        console.log(`No place_id for activity: ${activity.name}`);
    }

    // MAKE CARD DRAGGABLE (but not hotels)
    if (canDrag) {
        card.setAttribute('draggable', true);
        card.setAttribute('data-activity-name', activity.name);
        card.setAttribute('data-day-number', dayNumber);

        // Drag event listeners
        card.addEventListener('dragstart', handleActivityDragStart);
        card.addEventListener('dragend', handleActivityDragEnd);
    }

    // ADD HOVER EFFECT TO SHOW/HIDE REMOVE BUTTON
    if (canRemove) {
        card.addEventListener('mouseenter', function () {
            const removeBtn = this.querySelector('.btn-remove-activity');
            if (removeBtn) removeBtn.style.opacity = '1';
        });

        card.addEventListener('mouseleave', function () {
            const removeBtn = this.querySelector('.btn-remove-activity');
            if (removeBtn) removeBtn.style.opacity = '0';
        });
    }

    return card;
}

// ===== REMOVE ACTIVITY FUNCTION =====
window.removeActivity = function (activityName, dayNumber) {
    console.log(`🗑️ Removing activity: ${activityName} from Day ${dayNumber}`);

    // Find and remove from itineraryData.activities
    const activityIndex = itineraryData.activities.findIndex(a =>
        a.name === activityName && !a.isHotel
    );

    if (activityIndex === -1) {
        showToast('Activity not found', true);
        return;
    }

    const removedActivity = itineraryData.activities.splice(activityIndex, 1)[0];
    console.log(`✅ Removed: ${removedActivity.name}`);

    // Add to unscheduled activities
    if (window.unscheduledActivitiesData) {
        window.unscheduledActivitiesData.push(removedActivity);
        console.log(`✅ Added to unscheduled: ${removedActivity.name}`);
    }

    // Re-render the entire itinerary
    renderAllActivitiesAtOnce();
    renderUnscheduledActivities();

    showToast(`✅ ${activityName} removed from itinerary`, false);
};

// ===== CREATE TRANSIT CARD (WITH ROUTE DATA ATTRIBUTES) =====
function createTransitCard(elementId, displayText) {
    console.log(`🔧 createTransitCard called with ID: ${elementId}, Text: ${displayText}`);

    const transitDiv = document.createElement('div');
    transitDiv.className = 'activity-transit-card';
    transitDiv.id = elementId;
    transitDiv.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 12px 16px !important;
        margin: 0 !important;
        background: #F9FAFB !important;
        border: 1px solid #E5E7EB !important;
        border-radius: 8px !important;
        gap: 10px !important;
        font-size: 13px !important;
        color: #6B7280 !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
        position: relative !important;
    `;

    // ✅ ADD data attributes to store route info
    transitDiv.setAttribute('data-transit-id', elementId);

    // Left side: Car icon and transit text
    const leftContainer = document.createElement('div');
    leftContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
    `;

    // ✅ Create icon element
    const icon = document.createElement('i');
    icon.className = 'fa fa-car';
    icon.style.cssText = 'color: #6B7280; font-size: 16px;';

    // ✅ Create text span
    const textSpan = document.createElement('span');
    textSpan.className = 'transit-text';
    textSpan.textContent = displayText;
    textSpan.style.cssText = 'color: #6B7280; font-weight: 500;';

    leftContainer.appendChild(icon);
    leftContainer.appendChild(textSpan);

    // Right side: Directions link
    const directionsLink = document.createElement('a');
    directionsLink.href = '#';
    directionsLink.className = 'directions-link';
    directionsLink.style.cssText = `
        color: #3D9BF3;
        text-decoration: none;
        font-weight: 600;
        font-size: 12px;
        padding: 6px 12px;
        border-radius: 4px;
        background: #EFF6FF;
        transition: all 0.2s ease;
        opacity: 0;
        pointer-events: none;
    `;
    directionsLink.textContent = '→ Directions';
    directionsLink.onclick = function (e) {
        e.preventDefault();
        viewRoute(elementId);
        openGoogleMapsDirections(elementId);
    };

    transitDiv.appendChild(leftContainer);
    transitDiv.appendChild(directionsLink);

    // Hover effects
    transitDiv.addEventListener('mouseenter', function () {
        const iconEl = this.querySelector('.fa-car');
        const textEl = this.querySelector('.transit-text');
        const linkEl = this.querySelector('.directions-link');

        if (iconEl) iconEl.style.color = '#3D9BF3';
        if (textEl) textEl.style.color = '#3D9BF3';
        if (linkEl) {
            linkEl.style.opacity = '1';
            linkEl.style.pointerEvents = 'auto';
        }
        this.style.background = '#F0F9FF';
        this.style.borderColor = '#3D9BF3';
    });

    transitDiv.addEventListener('mouseleave', function () {
        const iconEl = this.querySelector('.fa-car');
        const textEl = this.querySelector('.transit-text');
        const linkEl = this.querySelector('.directions-link');

        if (iconEl) iconEl.style.color = '#6B7280';
        if (textEl) textEl.style.color = '#6B7280';
        if (linkEl) {
            linkEl.style.opacity = '0';
            linkEl.style.pointerEvents = 'none';
        }
        this.style.background = '#F9FAFB';
        this.style.borderColor = '#E5E7EB';
    });

    return transitDiv;
}

// ===== OPEN GOOGLE MAPS DIRECTIONS =====
function openGoogleMapsDirections(transitCardId) {
    const transitCard = document.querySelector(`#${transitCardId}`);
    if (!transitCard) {
        console.error(`Card not found: ${transitCardId}`);
        return;
    }

    // ✅ READ coordinates from the card's data attributes
    const originLat = parseFloat(transitCard.getAttribute('data-origin-lat'));
    const originLng = parseFloat(transitCard.getAttribute('data-origin-lng'));
    const destLat = parseFloat(transitCard.getAttribute('data-dest-lat'));
    const destLng = parseFloat(transitCard.getAttribute('data-dest-lng'));

    if (!originLat || !originLng || !destLat || !destLng) {
        console.error('Route coordinates not found');
        return;
    }

    // Open Google Maps with the CORRECT coordinates
    const url = `https://www.google.com/maps/dir/${originLat},${originLng}/${destLat},${destLng}`;
    window.open(url, '_blank');
}

// ===== SWITCH DAY (FIXED) =====
window.switchDay = function (dayNumber, event) {
    console.log(`🖱️ switchDay called for Day ${dayNumber}`);

    // Remove active class from all tabs
    document.querySelectorAll('.day-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'white';
        btn.style.color = '#6B7280';
        btn.style.borderColor = '#E0E6ED';
    });

    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
        event.target.style.background = '#3D9BF3';
        event.target.style.color = 'white';
        event.target.style.borderColor = '#3D9BF3';
    } else {
        // Fallback if event is not passed
        const clickedTab = document.querySelector(`.day-tab[data-day="${dayNumber}"]`);
        if (clickedTab) {
            clickedTab.classList.add('active');
            clickedTab.style.background = '#3D9BF3';
            clickedTab.style.color = 'white';
            clickedTab.style.borderColor = '#3D9BF3';
        }
    }

    // ✅ HIDE ALL DAY SECTIONS FIRST
    console.log('   Hiding all day sections...');
    const allDaySections = document.querySelectorAll('[id^="day-section-"]');
    allDaySections.forEach(section => {
        section.style.display = 'none';
    });

    // ✅ SHOW ONLY THE SELECTED DAY SECTION
    const daySection = document.querySelector(`#day-section-${dayNumber}`);
    if (daySection) {
        daySection.style.display = 'flex';
        daySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log(`   ✅ Showing Day ${dayNumber}`);
    } else {
        console.error(`   ❌ Day section not found: day-section-${dayNumber}`);
    }

    // ✅ HANDLE HOTELS SECTION VISIBILITY
    const hotelsSection = document.querySelector('.hotels-section');
    if (hotelsSection) {
        if (dayNumber === 1) {
            hotelsSection.style.display = 'block';
            console.log('   ✅ Showing hotels section (Day 1)');
        } else {
            hotelsSection.style.display = 'none';
            console.log('   ⚪ Hiding hotels section');
        }
    }

    // Update current day tracking
    sessionStorage.setItem('currentDay', dayNumber);
    console.log(`✅ Switched to Day ${dayNumber}\n`);
}

// ===== RENDER UNSCHEDULED ACTIVITIES (WITH DRAG SUPPORT) =====
function renderUnscheduledActivities() {
    const container = document.getElementById('unscheduledActivitiesContainer');
    if (!container) {
        console.error('Unscheduled container not found');
        return;
    }

    const unscheduledActivities = window.unscheduledActivitiesData || [];

    if (unscheduledActivities.length === 0) {
        container.innerHTML = `
            <p style="color: #95A5A6; font-size: 14px; padding: 24px; text-align: center;">
                All recommendations have been scheduled!
            </p>
        `;
        return;
    }

    // Clear container
    container.innerHTML = '';

    // Add header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 16px;
        margin-bottom: 12px;
        border-left: 4px solid #F59E0B;
        background: #FEF3C7;
        border-radius: 4px;
    `;
    header.innerHTML = `
        <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #D97706;">
            <i class="fa fa-lightbulb" style="margin-right: 8px;"></i>More Ideas (${unscheduledActivities.length})
        </h2>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #92400E;">
            Drag these activities into your itinerary or explore them later
        </p>
    `;
    container.appendChild(header);

    // Render each unscheduled activity AS DRAGGABLE
    unscheduledActivities.forEach((activity, idx) => {
        const card = createActivityCard(activity, idx + 1, 'unscheduled'); // ← Changed from 999 to 'unscheduled'

        // ✅ MAKE UNSCHEDULED ACTIVITIES DRAGGABLE
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-activity-name', activity.name);
        card.setAttribute('data-day-number', 'unscheduled'); // ← Important!
        card.style.cursor = 'grab';

        // ✅ Add the SPECIAL drag handlers for unscheduled
        card.addEventListener('dragstart', handleUnscheduledDragStart);
        card.addEventListener('dragend', handleActivityDragEnd);

        container.appendChild(card);
    });

    console.log(`✅ Rendered ${unscheduledActivities.length} draggable unscheduled activities`);
}

// ===== CALCULATE ACTIVITY-TO-ACTIVITY TRANSITS (WITH RETURN FLIGHT AIRPORT TRANSIT) =====
function calculateActivityTransits(dayNumber, activities, totalDaysNeeded) {
    if (!directionsService || !activities || activities.length < 1) {
        console.log(`⚠️ Day ${dayNumber}: Not enough activities to calculate transits`);
        return;
    }

    console.log(`\n🚗 Calculating transits for Day ${dayNumber}...`);
    console.log(`📊 Total activities: ${activities.length}`);

    // Helper to get coordinates
    function getCoords(activity) {
        if (!activity) return null;
        const lat = activity.latitude || activity.lat || activity.coordinates?.lat;
        const lng = activity.longitude || activity.lng || activity.coordinates?.lng;
        if (lat && lng) {
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
        return null;
    }

    // ✅ HANDLE DAY 1 - LAST ACTIVITY TO HOTEL
    if (dayNumber === 1) {
        const hotelInItinerary = selectedHotel;

        if (hotelInItinerary && activities.length > 0) {
            const lastActivity = activities[activities.length - 1];
            const lastActivityCoords = getCoords(lastActivity);
            const hotelCoords = getCoords(hotelInItinerary);

            if (lastActivityCoords && hotelCoords) {
                const transitId = `transit-day${dayNumber}-to-hotel`;
                const transitEl = document.querySelector(`#${transitId}`);

                console.log(`\n[Last Activity→Hotel] ${lastActivity.name} → ${hotelInItinerary.name}`);
                console.log(`   Looking for card ID: #${transitId}`);

                if (transitEl) {
                    console.log(`   ✅ Card found in DOM`);

                    directionsService.route({
                        origin: lastActivityCoords,
                        destination: hotelCoords,
                        travelMode: google.maps.TravelMode.DRIVING
                    }, (result, status) => {
                        console.log(`   Route response: ${status}`);
                        if (status === google.maps.DirectionsStatus.OK) {
                            const leg = result.routes[0].legs[0];
                            const distKm = (leg.distance.value / 1000).toFixed(1);
                            const timeMins = Math.round(leg.duration.value / 60);

                            const textSpan = transitEl.querySelector('.transit-text');
                            if (textSpan) {
                                textSpan.textContent = `${timeMins} minutes · ${distKm} km`;
                                console.log(`   ✅ UPDATED: ${timeMins}m • ${distKm}km`);
                            }
                        }
                    });
                } else {
                    console.warn(`   ⚠️ Card NOT FOUND. Make sure card is created with ID: ${transitId}`);
                }
            }
        }
    }

    // ✅ HANDLE DAY 2+ - START FROM HOTEL TO FIRST ACTIVITY
    if (dayNumber > 1) {
        const hotelInItinerary = selectedHotel;

        if (hotelInItinerary && activities.length > 0) {
            const hotelCoords = getCoords(hotelInItinerary);
            const firstActivityCoords = getCoords(activities[0]);

            if (hotelCoords && firstActivityCoords) {
                const transitId = `transit-day${dayNumber}-hotel-0`;
                const transitEl = document.querySelector(`#${transitId}`);

                console.log(`\n[Hotel→0] Day ${dayNumber} - ${hotelInItinerary.name} → ${activities[0].name}`);
                console.log(`   Hotel Coords: ${JSON.stringify(hotelCoords)}`);
                console.log(`   First Activity Coords: ${JSON.stringify(firstActivityCoords)}`);
                console.log(`   Looking for card ID: #${transitId}`);

                if (transitEl) {
                    console.log(`   ✅ Card found in DOM`);

                    setTimeout(() => {
                        directionsService.route({
                            origin: hotelCoords,
                            destination: firstActivityCoords,
                            travelMode: google.maps.TravelMode.DRIVING
                        }, (result, status) => {
                            console.log(`   Route response: ${status}`);
                            if (status === google.maps.DirectionsStatus.OK) {
                                const leg = result.routes[0].legs[0];
                                const distKm = (leg.distance.value / 1000).toFixed(1);
                                const timeMins = Math.round(leg.duration.value / 60);

                                const textSpan = transitEl.querySelector('.transit-text');
                                if (textSpan) {
                                    textSpan.textContent = `${timeMins} minutes · ${distKm} km`;
                                    console.log(`   ✅ UPDATED: ${timeMins}m • ${distKm}km`);
                                }
                            }
                        });
                    }, 0);
                } else {
                    console.warn(`   ⚠️ Card NOT FOUND. Make sure card is created with ID: ${transitId}`);
                }
            }
        }
    }

    // ✅ HANDLE ACTIVITY-TO-ACTIVITY TRANSITS
    for (let i = 0; i < activities.length - 1; i++) {
        const activityA = activities[i];
        const activityB = activities[i + 1];
        const coordsA = getCoords(activityA);
        const coordsB = getCoords(activityB);

        if (!coordsA || !coordsB) {
            console.warn(`⚠️ Missing coordinates for: ${activityA?.name} → ${activityB?.name}`);
            continue;
        }

        const transitId = `transit-day${dayNumber}-${i}-${i + 1}`;
        console.log(`\n🔍 [${i}→${i + 1}] CHECKING: ${activityA.name} → ${activityB.name}`);
        console.log(`   Transit ID to find: #${transitId}`);

        const transitEl = document.querySelector(`#${transitId}`);
        if (!transitEl) {
            console.error(`   ❌ CARD NOT FOUND in DOM!`);
            console.error(`   Searching for: #${transitId}`);
            const allTransits = Array.from(document.querySelectorAll('[id^="transit-"]')).map(el => el.id);
            console.error(`   All transit cards in DOM:`, allTransits);
            continue;
        } else {
            console.log(`   ✅ Card found in DOM: #${transitId}`);
        }

        const delay = i === 0 ? 200 : (i + 1) * 200;
        console.log(`   🕐 Scheduling route calculation in ${delay}ms`);

        setTimeout(() => {
            console.log(`   ⏱️ Executing route calculation (delay: ${delay}ms)`);

            directionsService.route({
                origin: coordsA,
                destination: coordsB,
                travelMode: google.maps.TravelMode.DRIVING
            }, (result, status) => {
                console.log(`   📍 Route response received: ${status}`);

                if (status === google.maps.DirectionsStatus.OK) {
                    const leg = result.routes[0].legs[0];
                    const distKm = (leg.distance.value / 1000).toFixed(1);
                    const timeMins = Math.round(leg.duration.value / 60);

                    console.log(`   ✅ Route data: ${timeMins}m • ${distKm}km`);

                    const transitElUpdate = document.querySelector(`#${transitId}`);
                    if (!transitElUpdate) {
                        console.error(`   ❌ Card disappeared from DOM!`);
                        return;
                    }

                    const textSpanUpdate = transitElUpdate.querySelector('.transit-text');
                    if (textSpanUpdate) {
                        textSpanUpdate.textContent = `${timeMins} minutes · ${distKm} km`;
                        console.log(`   ✅ UPDATED text: "${timeMins} minutes · ${distKm} km"`);

                        // Store coordinates for directions
                        transitElUpdate.setAttribute('data-origin-lat', coordsA.lat);
                        transitElUpdate.setAttribute('data-origin-lng', coordsA.lng);
                        transitElUpdate.setAttribute('data-dest-lat', coordsB.lat);
                        transitElUpdate.setAttribute('data-dest-lng', coordsB.lng);
                    } else {
                        console.error(`   ❌ .transit-text span disappeared!`);
                    }
                } else {
                    console.error(`   ❌ Route failed with status: ${status}`);
                }
            });
        }, delay);
    }

    // ✅ HANDLE LAST DAY - LAST ACTIVITY TO AIRPORT (FOR RETURN FLIGHT)
    if (dayNumber === totalDaysNeeded && itineraryData.flight && itineraryData.flight.hasReturn && activities.length > 0) {
        const lastActivity = activities[activities.length - 1];
        const lastActivityCoords = getCoords(lastActivity);

        const toCity = airportToCityMap[itineraryData.flight.toAirport] || itineraryData.flight.toAirport;

        console.log(`\n✈️ Calculating transit to airport for return flight...`);
        console.log(`   From: ${lastActivity.name}`);
        console.log(`   To: ${toCity} Airport`);

        getCoordinates(`${toCity} International Airport`, itineraryData.country).then(airportCoords => {
            if (lastActivityCoords && airportCoords) {
                const transitId = `transit-day${dayNumber}-to-airport`;
                const transitEl = document.querySelector(`#${transitId}`);

                console.log(`   Looking for transit card: #${transitId}`);

                if (transitEl) {
                    console.log(`   ✅ Transit card found`);

                    setTimeout(() => {
                        directionsService.route({
                            origin: lastActivityCoords,
                            destination: airportCoords,
                            travelMode: google.maps.TravelMode.DRIVING
                        }, (result, status) => {
                            console.log(`   Airport route response: ${status}`);
                            if (status === google.maps.DirectionsStatus.OK) {
                                const leg = result.routes[0].legs[0];
                                const distKm = (leg.distance.value / 1000).toFixed(1);
                                const timeMins = Math.round(leg.duration.value / 60);

                                const textSpan = transitEl.querySelector('.transit-text');
                                if (textSpan) {
                                    textSpan.textContent = `${timeMins} minutes · ${distKm} km`;
                                    console.log(`   ✅ Airport transit UPDATED: ${timeMins}m • ${distKm}km`);
                                }
                            }
                        });
                    }, (activities.length) * 200 + 200); // Schedule after all other transits
                } else {
                    console.warn(`   ⚠️ Transit card to airport NOT FOUND`);
                }
            }
        });
    }

    console.log(`\n✅ Transit calculations submitted for Day ${dayNumber}\n`);
}

window.addHotelToItinerary = async function (hotelIndex) {
    if (!itineraryData || !itineraryData.hotels) {
        showToast('Itinerary data not available', true);
        return;
    }

    const hotel = itineraryData.hotels[hotelIndex];
    if (!hotel) {
        showToast('Hotel not found', true);
        return;
    }

    console.log('Adding hotel to itinerary:', hotel);
    clearAllPolylines();

    // STEP 1: Set the global selectedHotel IMMEDIATELY
    selectedHotel = hotel;
    console.log(`✅ selectedHotel updated to: ${hotel.name}`);

    // STEP 2: Update the selected hotel in itineraryData FIRST
    itineraryData.selectedHotel = hotel;
    console.log(`✅ Selected hotel updated to: ${hotel.name}`);

    // STEP 3: Geocode hotel address to get coordinates
    let hotelCoords;
    try {
        hotelCoords = await getCoordinates(hotel.name, itineraryData.city);
        console.log('✅ Hotel geocoded:', hotelCoords);
    } catch (error) {
        console.error('❌ Failed to geocode hotel:', error);
        showToast('⚠️ Could not find hotel location', true);
        return;
    }

    if (!hotelCoords || isNaN(hotelCoords.lat) || isNaN(hotelCoords.lng)) {
        console.error('❌ Invalid hotel coordinates:', hotelCoords);
        showToast('⚠️ Hotel added but location unavailable', true);
        return;
    }

    const hotelActivity = {
        id: Date.now(),
        name: hotel.name,
        category: 'hotel',
        type: 'hotel',
        rating: hotel.rating || 'N/A',
        reviews: hotel.reviewCount || 0,
        address: hotel.address,
        image: hotel.image || hotel.imageUrl,
        latitude: hotelCoords.lat,
        longitude: hotelCoords.lng,
        isHotel: true,
        placeid: null
    };

    // Also update the global selectedHotel with complete data
    selectedHotel = hotelActivity;
    console.log(`✅ selectedHotel object updated with complete data`);

    // STEP 4: Remove any existing hotel from activities (if re-selecting)
    const existingHotelIndex = itineraryData.activities.findIndex(a => a.isHotel);
    if (existingHotelIndex !== -1) {
        itineraryData.activities.splice(existingHotelIndex, 1);
        console.log('✅ Removed existing hotel from activities');
    }

    // STEP 5: Add the NEW hotel to activities array
    const day1Section = document.querySelector('#day-section-1');
    if (!day1Section) {
        showToast('Day 1 section not found', true);
        return;
    }

    // Insert hotel after Day 1 activities (at position 2)
    itineraryData.activities.splice(2, 0, hotelActivity);
    console.log('✅ New hotel inserted into activities array at position 2');

    // Find the last Day 1 activity position in the activities array
    const day1Cards = day1Section.querySelectorAll('.activity-card');
    const day1ActivityNames = Array.from(day1Cards).map(card =>
        card.querySelector('h3')?.textContent
    ).filter(name => name);

    console.log('Last activity in Day 1:', day1ActivityNames[day1ActivityNames.length - 1]);

    // ✅ ADD TRANSIT CARD (no route calculation yet)
    if (day1ActivityNames.length > 0) {
        const transitCardId = `transit-to-hotel-${Date.now()}`;
        const transitCard = createTransitCard(transitCardId, 'Route available on "View on Map"');
        day1Section.appendChild(transitCard);
        console.log('🚗 Added transit card (route hidden until "View on Map")');
    }

    // Create and add hotel card to Day 1
    const hotelCard = createActivityCard(hotelActivity, 999);
    day1Section.appendChild(hotelCard);
    console.log('✅ Hotel card added to Day 1');

    // ✅ ADD HOTEL MARKER ONLY (NO ROUTE)
    if (map) {
        const markerPosition = {
            lat: hotelActivity.latitude,
            lng: hotelActivity.longitude
        };

        createHotelMarker(
            markerPosition,
            hotelActivity.name,
            hotelActivity.address,
            map
        );

        console.log("✅ Added hotel marker with 🏨 emoji");
    }

    showToast(`🏨 ${hotel.name} added to Day 1!`, false);
    console.log('✅ Hotel added to Day 1 itinerary');

    // Hide hotel recommendations section
    const hotelsSection = document.querySelector('.hotels-section');
    if (hotelsSection) {
        hotelsSection.style.display = 'none';
    }

    // NOW RENDER THE FULL ITINERARY WITH ALL DAYS
    console.log('🎯 Hotel selected! Now rendering full itinerary...');
    renderAllActivitiesAtOnce();
    renderUnscheduledActivities();

    showToast(`🏨 ${hotel.name} selected! Your itinerary is ready.`, false);
    console.log('✅ Hotel added and full itinerary rendered');

    // Scroll to the newly added hotel card
    setTimeout(() => {
        hotelCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);

    // ✅ SHOW SAVE ITINERARY BUTTON
    const saveItineraryBtn = document.getElementById('saveItineraryBtn');
    if (saveItineraryBtn) {
        saveItineraryBtn.style.display = 'block';
        saveItineraryBtn.disabled = false;
        console.log('✅ Save Itinerary button enabled');
    }
}

// ===== RENDER HOTELS (SLIDER ONLY) - REDESIGNED =====
function renderHotels(hotels) {
    const container = document.getElementById('hotelsContainer');
    if (!container) {
        console.warn('hotelsContainer not found');
        return;
    }

    // Get the parent hotels-section
    const hotelsSection = container.closest('.hotels-section');

    container.innerHTML = '';

    if (!hotels || hotels.length === 0) {
        container.innerHTML = `<p style="color: #95A5A6; font-size: 13px; padding: 16px;">No hotels available</p>`;
        return;
    }

    // CHECK IF HOTEL ALREADY ADDED TO ITINERARY
    const hotelAlreadyAdded = itineraryData?.activities?.some(activity => activity.isHotel === true);

    if (hotelAlreadyAdded) {
        console.log('Hotel already in itinerary - hiding hotel section');
        if (hotelsSection) {
            hotelsSection.style.display = 'none';
        }
        return;
    }

    // Show section if hidden
    if (hotelsSection) {
        hotelsSection.style.display = 'block';
    }

    // ✅ Create main carousel wrapper
    const carouselWrapper = document.createElement('div');
    carouselWrapper.id = 'hotels-carousel-wrapper';
    carouselWrapper.style.cssText = `
        display: flex;
        align-items: stretch;
        gap: 12px;
        margin-top: 16px;
        width: 100%;
        min-height: 200px;
    `;

    // ✅ Left arrow button
    const prevBtn = document.createElement('button');
    prevBtn.id = 'hotelsPrevBtn';
    prevBtn.style.cssText = `
        min-width: 44px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #3D9BF3;
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.3s ease;
        flex-shrink: 0;
        align-self: center;
        z-index: 10;
        box-shadow: 0 2px 8px rgba(61, 155, 243, 0.3);
    `;
    prevBtn.innerHTML = '<i class="fa fa-chevron-left"></i>';
    prevBtn.addEventListener('mouseover', () => {
        if (!prevBtn.disabled) prevBtn.style.background = '#2E8FE5';
    });
    prevBtn.addEventListener('mouseout', () => {
        if (!prevBtn.disabled) prevBtn.style.background = '#3D9BF3';
    });

    // ✅ Carousel viewport wrapper
    const carouselViewport = document.createElement('div');
    carouselViewport.style.cssText = `
        flex: 1;
        overflow: hidden;
        position: relative;
        min-height: 200px;
        max-height: 220px;
    `;

    // ✅ Hotel carousel container
    const hotelsCarousel = document.createElement('div');
    hotelsCarousel.id = 'hotelsContainer-carousel';
    hotelsCarousel.style.cssText = `
        display: flex;
        gap: 16px;
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        height: 100%;
        width: 100%;
    `;

    // ✅ Add hotel cards to carousel
    hotels.forEach((hotel, hotelIdx) => {
        const card = document.createElement('div');
        card.className = 'hotel-card-carousel';
        card.setAttribute('data-index', hotelIdx);
        card.style.cssText = `
            flex: 0 0 100%;
            display: flex;
            gap: 0;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
            height: 100%;
            box-sizing: border-box;
            position: relative;
            border: 2px solid #E0E6ED;
            transition: all 0.3s ease;
        `;

        const rating = hotel.rating && hotel.rating !== 'N/A' ? parseFloat(hotel.rating).toFixed(1) : 'N/A';
        const reviews = hotel.reviewCount > 0 ? hotel.reviewCount.toLocaleString() : '0';
        const imageUrl = hotel.image || 'https://via.placeholder.com/300x200?text=Hotel';

        card.innerHTML = `
            <div class="hotel-card-image" style="
                position: relative; 
                width: 200px; 
                height: 100%; 
                flex-shrink: 0; 
                overflow: hidden;
                background: #F8F9FA;
            ">
                <img 
                    src="${imageUrl}" 
                    alt="${hotel.name}" 
                    style="
                        width: 100%; 
                        height: 100%; 
                        object-fit: cover;
                    " 
                    onerror="this.src='https://via.placeholder.com/300x200?text=Hotel'"
                >
                ${rating !== 'N/A' ? `
                    <div style="
                        position: absolute; 
                        top: 12px; 
                        left: 12px; 
                        background: #3D9BF3; 
                        color: white; 
                        padding: 6px 12px; 
                        border-radius: 8px; 
                        font-size: 14px; 
                        font-weight: 700;
                        box-shadow: 0 2px 8px rgba(61, 155, 243, 0.4);
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">
                        <span style="font-size: 16px;">${rating}</span>
                        <span style="font-size: 11px; opacity: 0.9;">/5</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="hotel-card-details" style="
                flex: 1; 
                display: flex; 
                flex-direction: column; 
                justify-content: space-between; 
                padding: 20px 24px;
                min-width: 0;
                position: relative;
            ">
                <div>
                    <h4 style="
                        font-size: 18px; 
                        font-weight: 600; 
                        margin: 0 0 8px 0; 
                        color: #2C3E50; 
                        line-height: 1.3;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                    ">${hotel.name}</h4>
                    
                    <p style="
                        font-size: 13px; 
                        color: #6B7280; 
                        margin: 0 0 12px 0;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        <i class="fa fa-map-marker" style="color: #3D9BF3;"></i>
                        <span style="
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        ">${hotel.address || 'Address not available'}</span>
                    </p>
                    
                    ${reviews !== '0' ? `
                        <p style="
                            font-size: 13px; 
                            color: #6B7280; 
                            margin: 0;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        ">
                            <i class="fa fa-user" style="color: #3D9BF3;"></i>
                            <span>${reviews} reviews</span>
                        </p>
                    ` : ''}
                </div>
                
                <button 
                    class="add-hotel-btn" 
                    onclick="addHotelToItinerary(${hotelIdx})"
                    style="
                        position: absolute;
                        top: 16px;
                        right: 16px;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: rgba(255, 255, 255, 0.95);
                        color: #3D9BF3;
                        border: 2px solid #3D9BF3;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        font-weight: bold;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 8px rgba(61, 155, 243, 0.3);
                        backdrop-filter: blur(4px);
                    "
                    onmouseover="this.style.transform='scale(1.1) rotate(90deg)'; this.style.background='#3D9BF3'; this.style.color='white'; this.style.boxShadow='0 4px 12px rgba(61, 155, 243, 0.5)';"
                    onmouseout="this.style.transform='scale(1) rotate(0deg)'; this.style.background='rgba(255, 255, 255, 0.95)'; this.style.color='#3D9BF3'; this.style.boxShadow='0 2px 8px rgba(61, 155, 243, 0.3)';"
                    title="Add to itinerary"
                >
                    <i class="fa fa-plus"></i>
                </button>
            </div>
        `;

        hotelsCarousel.appendChild(card);
        console.log(`✅ Added hotel card ${hotelIdx + 1}: ${hotel.name}`);
    });

    carouselViewport.appendChild(hotelsCarousel);

    // ✅ Right arrow button
    const nextBtn = document.createElement('button');
    nextBtn.id = 'hotelsNextBtn';
    nextBtn.style.cssText = `
        min-width: 44px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #3D9BF3;
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.3s ease;
        flex-shrink: 0;
        align-self: center;
        z-index: 10;
        box-shadow: 0 2px 8px rgba(61, 155, 243, 0.3);
    `;
    nextBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
    nextBtn.addEventListener('mouseover', () => {
        if (!nextBtn.disabled) nextBtn.style.background = '#2E8FE5';
    });
    nextBtn.addEventListener('mouseout', () => {
        if (!nextBtn.disabled) nextBtn.style.background = '#3D9BF3';
    });

    carouselWrapper.appendChild(prevBtn);
    carouselWrapper.appendChild(carouselViewport);
    carouselWrapper.appendChild(nextBtn);

    container.appendChild(carouselWrapper);

    // ✅ Create expanded hotels container
    const expandedContainer = document.createElement('div');
    expandedContainer.id = 'hotels-expanded-container';
    expandedContainer.style.cssText = `
        display: none;
        margin-top: 16px;
    `;

    // Back button
    const backBtn = document.createElement('button');
    backBtn.style.cssText = `
        background: none;
        border: none;
        color: #3D9BF3;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: color 0.3s ease;
    `;
    backBtn.innerHTML = '<i class="fa fa-chevron-left"></i> Back to Slider';
    backBtn.addEventListener('click', closeAllHotels);
    backBtn.addEventListener('mouseover', () => backBtn.style.color = '#2E8FE5');
    backBtn.addEventListener('mouseout', () => backBtn.style.color = '#3D9BF3');

    expandedContainer.appendChild(backBtn);

    // All hotels grid
    const hotelsGrid = document.createElement('div');
    hotelsGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
    `;

    hotels.forEach((hotel, idx) => {
        const card = document.createElement('div');
        card.style.cssText = `
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
            transition: all 0.3s ease;
            border: 2px solid #E0E6ED;
            position: relative;
        `;
        card.addEventListener('mouseover', () => {
            card.style.transform = 'translateY(-4px)';
            card.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
        });
        card.addEventListener('mouseout', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.08)';
        });

        const rating = hotel.rating && hotel.rating !== 'N/A' ? parseFloat(hotel.rating).toFixed(1) : 'N/A';
        const reviews = hotel.reviewCount > 0 ? hotel.reviewCount.toLocaleString() : '0';
        const imageUrl = hotel.image || 'https://via.placeholder.com/300x200?text=Hotel';

        card.innerHTML = `
            <div style="position: relative; width: 100%; padding-top: 60%; background: #F8F9FA; overflow: hidden;">
                <img 
                    src="${imageUrl}" 
                    alt="${hotel.name}" 
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;" 
                    onerror="this.src='https://via.placeholder.com/300x200?text=Hotel'"
                >
                ${rating !== 'N/A' ? `
                    <div style="
                        position: absolute; 
                        top: 12px; 
                        left: 12px; 
                        background: #3D9BF3; 
                        color: white; 
                        padding: 6px 12px; 
                        border-radius: 8px; 
                        font-size: 14px; 
                        font-weight: 700;
                        box-shadow: 0 2px 8px rgba(61, 155, 243, 0.4);
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">
                        <span style="font-size: 16px;">${rating}</span>
                        <span style="font-size: 11px; opacity: 0.9;">/10</span>
                    </div>
                ` : ''}
                <button 
                    class="add-hotel-btn" 
                    onclick="addHotelToItinerary(${idx})"
                    style="
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: rgba(255, 255, 255, 0.95);
                        color: #3D9BF3;
                        border: 2px solid #3D9BF3;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        font-weight: bold;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 8px rgba(61, 155, 243, 0.3);
                        backdrop-filter: blur(4px);
                    "
                    onmouseover="this.style.transform='scale(1.1) rotate(90deg)'; this.style.background='#3D9BF3'; this.style.color='white'; this.style.boxShadow='0 4px 12px rgba(61, 155, 243, 0.5)';"
                    onmouseout="this.style.transform='scale(1) rotate(0deg)'; this.style.background='rgba(255, 255, 255, 0.95)'; this.style.color='#3D9BF3'; this.style.boxShadow='0 2px 8px rgba(61, 155, 243, 0.3)';"
                    title="Add to itinerary"
                >
                    <i class="fa fa-plus"></i>
                </button>
            </div>
            
            <div style="padding: 20px;">
                <h4 style="
                    font-size: 16px; 
                    font-weight: 600; 
                    margin: 0 0 8px 0; 
                    color: #2C3E50;
                    line-height: 1.3;
                ">${hotel.name}</h4>
                
                <p style="
                    font-size: 13px; 
                    color: #6B7280; 
                    margin: 0 0 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <i class="fa fa-map-marker" style="color: #3D9BF3;"></i>
                    <span>${hotel.address || 'Address not available'}</span>
                </p>
                
                ${reviews !== '0' ? `
                    <p style="
                        font-size: 13px; 
                        color: #6B7280; 
                        margin: 0;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        <i class="fa fa-user" style="color: #3D9BF3;"></i>
                        <span>${reviews} reviews</span>
                    </p>
                ` : ''}
            </div>
        `;

        hotelsGrid.appendChild(card);
    });

    expandedContainer.appendChild(hotelsGrid);
    container.appendChild(expandedContainer);

    // ✅ Initialize carousel
    initializeHotelCarousel(hotels.length);

    console.log(`✅ Rendered ${hotels.length} hotels with slider`);
}

// ===== HOTEL CAROUSEL NAVIGATION =====
function initializeHotelCarousel(totalHotels) {
    const carousel = document.getElementById('hotelsContainer-carousel');
    const prevBtn = document.getElementById('hotelsPrevBtn');
    const nextBtn = document.getElementById('hotelsNextBtn');

    if (!carousel || !prevBtn || !nextBtn) {
        console.error('❌ Carousel elements not found');
        return;
    }

    let currentIndex = 0;

    function updateCarousel() {
        const cardWidth = carousel.parentElement.offsetWidth;
        const gap = 16;
        const translateAmount = currentIndex * (cardWidth + gap);

        carousel.style.transform = `translateX(-${translateAmount}px)`;

        prevBtn.style.opacity = currentIndex > 0 ? '1' : '0.4';
        prevBtn.style.cursor = currentIndex > 0 ? 'pointer' : 'not-allowed';
        prevBtn.disabled = currentIndex === 0;

        nextBtn.style.opacity = currentIndex < totalHotels - 1 ? '1' : '0.4';
        nextBtn.style.cursor = currentIndex < totalHotels - 1 ? 'pointer' : 'not-allowed';
        nextBtn.disabled = currentIndex === totalHotels - 1;

        console.log(`🏨 Showing hotel ${currentIndex + 1} of ${totalHotels}`);
    }

    // Remove old event listeners
    const newPrevBtn = prevBtn.cloneNode(true);
    const newNextBtn = nextBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);

    // Re-select fresh buttons
    const freshPrevBtn = document.getElementById('hotelsPrevBtn');
    const freshNextBtn = document.getElementById('hotelsNextBtn');

    freshPrevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    });

    freshNextBtn.addEventListener('click', () => {
        if (currentIndex < totalHotels - 1) {
            currentIndex++;
            updateCarousel();
        }
    });

    window.addEventListener('resize', updateCarousel);
    updateCarousel();
}

// ===== VIEW ALL HOTELS =====
window.viewAllHotels = function () {
    const carouselWrapper = document.getElementById('hotels-carousel-wrapper');
    const expandedContainer = document.getElementById('hotels-expanded-container');

    if (carouselWrapper && expandedContainer) {
        carouselWrapper.style.display = 'none';
        expandedContainer.style.display = 'block';
        console.log('✅ Showing expanded view');
    }
};

// ===== CLOSE ALL HOTELS =====
window.closeAllHotels = function () {
    const carouselWrapper = document.getElementById('hotels-carousel-wrapper');
    const expandedContainer = document.getElementById('hotels-expanded-container');

    if (carouselWrapper && expandedContainer) {
        expandedContainer.style.display = 'none';
        carouselWrapper.style.display = 'flex';

        const carousel = document.getElementById('hotelsContainer-carousel');
        if (carousel) {
            carousel.style.transform = 'translateX(0)';
        }

        const prevBtn = document.getElementById('hotelsPrevBtn');
        const nextBtn = document.getElementById('hotelsNextBtn');
        if (prevBtn && nextBtn) {
            prevBtn.style.opacity = '0.4';
            prevBtn.style.cursor = 'not-allowed';
            prevBtn.disabled = true;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
            nextBtn.disabled = false;
        }

        console.log('✅ Back to slider view');
    }
};

// ===== BOOK HOTEL =====
window.bookHotel = function (hotelId, name, price, address) {
    console.log('📍 Booking hotel:', name);

    const hotelData = {
        hotelId: hotelId,
        name: name,
        price: price,
        address: address,
        checkIn: itineraryData.check_in,
        checkOut: itineraryData.check_out,
        nights: itineraryData.nights,
        city: itineraryData.city
    };

    sessionStorage.setItem('selectedHotelData', JSON.stringify(hotelData));
    window.location.href = 'hotelDetails.html';
};

// ===== FETCH PLACE DETAILS FROM BACKEND =====
async function fetchPlaceDetails(placeId) {
    try {
        console.log('🔍 Fetching place details for:', placeId);

        const response = await fetch(`http://127.0.0.1:5000/api/places/details?place_id=${placeId}`);
        const data = await response.json();

        console.log('📦 Raw backend response:', data);

        if (!data) {
            console.error('❌ No data received from backend');
            return null;
        }

        // ✅ MAP YOUR BACKEND RESPONSE EXACTLY AS IT RETURNS
        return {
            name: data.name,                          // from backend
            address: data.address,                    // from backend
            rating: data.rating,                      // from backend
            reviewsCount: data.reviews_count,         // from backend
            phone: data.phone,                        // from backend
            website: data.website,                    // from backend
            photos: data.photos || [],                // from backend (array of photo objects)
            reviews: data.reviews || [],              // from backend (array of review objects)
            hours: data.hours,                        // from backend (opening_hours object)
            mapsUrl: data.maps_url,                   // from backend
            priceLevel: data.price_level              // from backend
        };

    } catch (error) {
        console.error('❌ Error fetching place details:', error);
        return null;
    }
}

// ===== SHOW ACTIVITY DETAILS WITH PHOTO CAROUSEL =====
window.showActivityDetails = async function (activityName, placeId) {
    console.log('Showing details for:', activityName);

    if (!placeId) {
        showToast('No place ID available for this activity', true);
        return;
    }

    try {
        console.log('⏳ Fetching details from backend...');
        const details = await fetchPlaceDetails(placeId);

        if (!details) {
            showToast('Could not load place details', true);
            return;
        }

        console.log('✅ Details received:', details);

        // Remove existing modal
        const existingModal = document.querySelector('.details-modal-overlay');
        if (existingModal) existingModal.remove();

        // ✅ CREATE MODAL OVERLAY
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'details-modal-overlay';
        modalOverlay.style.opacity = '0';

        // ✅ BUILD PHOTO ARRAY
        const photos = [];
        if (details.photos && details.photos.length > 0) {
            details.photos.forEach(photo => {
                const photoUrl = `http://127.0.0.1:5000/api/places/photo?photo_reference=${photo.photo_reference}&maxwidth=800`;
                photos.push(photoUrl);
            });
        } else {
            photos.push('https://via.placeholder.com/800x400?text=No+Image');
        }

        // ✅ CREATE MODAL CONTENT WITH CAROUSEL
        const modalContent = document.createElement('div');
        modalContent.className = 'details-modal-content';

        modalContent.innerHTML = `
            <button class="modal-close-btn" onclick="closeActivityDetails()">
                <i class="fa fa-times"></i>
            </button>

            <!-- PHOTO CAROUSEL -->
            <div class="details-photo-carousel">
                <div class="carousel-container">
                    ${photos.map((photo, index) => `
                        <img src="${photo}" 
                             alt="Photo ${index + 1}" 
                             class="carousel-photo ${index === 0 ? 'active' : ''}"
                             data-index="${index}"
                             onerror="this.src='https://via.placeholder.com/800x400?text=No+Image'">
                    `).join('')}
                </div>
                
                ${photos.length > 1 ? `
                    <button class="carousel-btn carousel-prev" onclick="changePhoto(-1)">
                        <i class="fa fa-chevron-left"></i>
                    </button>
                    <button class="carousel-btn carousel-next" onclick="changePhoto(1)">
                        <i class="fa fa-chevron-right"></i>
                    </button>
                    
                    <div class="carousel-indicators">
                        ${photos.map((_, index) => `
                            <span class="indicator ${index === 0 ? 'active' : ''}" 
                                  onclick="goToPhoto(${index})"></span>
                        `).join('')}
                    </div>
                    
                    <div class="photo-counter">
                        <span class="current-photo">1</span> / ${photos.length}
                    </div>
                ` : ''}
            </div>

            <div class="details-content">
                <!-- TITLE -->
                <h2 class="details-title">${details.name || 'Unknown Place'}</h2>

                <!-- RATING & REVIEWS COUNT -->
                ${details.rating ? `
                    <div class="details-rating">
                        <div class="rating-badge">★ ${details.rating}</div>
                        <span class="rating-count">(${details.reviewsCount || 0} reviews)</span>
                    </div>
                ` : ''}

                <!-- CONTACT INFO -->
                <div class="details-info">
                    ${details.address ? `
                        <div class="info-item">
                            <i class="fa fa-map-marker-alt"></i>
                            <span>${details.address}</span>
                        </div>
                    ` : ''}

                    ${details.phone ? `
                        <div class="info-item">
                            <i class="fa fa-phone"></i>
                            <a href="tel:${details.phone}">${details.phone}</a>
                        </div>
                    ` : ''}

                    ${details.website ? `
                        <div class="info-item">
                            <i class="fa fa-globe"></i>
                            <a href="${details.website}" target="_blank">Visit Website</a>
                        </div>
                    ` : ''}

                    ${details.priceLevel ? `
                        <div class="info-item">
                            <i class="fa fa-dollar-sign"></i>
                            <span>Price Level: ${'💲'.repeat(details.priceLevel)}</span>
                        </div>
                    ` : ''}

                    ${details.hours ? renderOpeningHours(details.hours) : ''}
                </div>

                <!-- REVIEWS SECTION -->
                ${details.reviews && details.reviews.length > 0 ? `
                    <div class="details-reviews">
                        <h3>Reviews</h3>
                        ${details.reviews.map(review => `
                            <div class="review-item">
                                <div class="review-header">
                                    <strong>${review.author_name || 'Anonymous'}</strong>
                                    <span class="review-rating">★ ${review.rating || 'N/A'}</span>
                                </div>
                                <p class="review-text">${review.text || 'No comment provided'}</p>
                                <small class="review-time">${review.relative_time_description || ''}</small>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p style="color: #999; padding: 1rem;">No reviews available</p>'}

                <!-- ACTION BUTTONS -->
                <div class="details-actions">
                    <a href="${details.mapsUrl || `https://www.google.com/maps/place/?q=place_id:${placeId}`}" 
                       target="_blank" 
                       class="btn btn-primary">
                        <i class="fa fa-map-marker-alt"></i>
                        Open in Google Maps
                    </a>
                    <button class="btn btn-secondary" onclick="closeActivityDetails()">
                        <i class="fa fa-times"></i>
                        Close
                    </button>
                </div>
            </div>
        `;

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // ✅ Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeActivityDetails();
            }
        });

        // ✅ Animate in
        setTimeout(() => {
            modalOverlay.style.opacity = '1';
        }, 10);

    } catch (error) {
        console.error('Error showing details:', error);
        showToast('Error loading details', true);
    }
};

// ===== PHOTO CAROUSEL NAVIGATION =====
window.changePhoto = function (direction) {
    const photos = document.querySelectorAll('.carousel-photo');
    const indicators = document.querySelectorAll('.indicator');
    const counter = document.querySelector('.current-photo');

    let currentIndex = 0;
    photos.forEach((photo, index) => {
        if (photo.classList.contains('active')) {
            currentIndex = index;
        }
    });

    // Remove active class
    photos[currentIndex].classList.remove('active');
    indicators[currentIndex].classList.remove('active');

    // Calculate new index
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = photos.length - 1;
    if (newIndex >= photos.length) newIndex = 0;

    // Add active class to new photo
    photos[newIndex].classList.add('active');
    indicators[newIndex].classList.add('active');
    counter.textContent = newIndex + 1;
};

window.goToPhoto = function (index) {
    const photos = document.querySelectorAll('.carousel-photo');
    const indicators = document.querySelectorAll('.indicator');
    const counter = document.querySelector('.current-photo');

    // Remove all active classes
    photos.forEach(p => p.classList.remove('active'));
    indicators.forEach(i => i.classList.remove('active'));

    // Add active to selected
    photos[index].classList.add('active');
    indicators[index].classList.add('active');
    counter.textContent = index + 1;
};

// ===== CLOSE ACTIVITY DETAILS MODAL =====
window.closeActivityDetails = function () {
    const modal = document.querySelector('.details-modal-overlay');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 300);
    }
};

// ===== RENDER OPENING HOURS =====
function renderOpeningHours(hours) {
    if (!hours) return '';

    const isOpen = hours.open_now;
    const weekdayText = hours.weekday_text || [];

    return `
        <div class="info-item opening-hours">
            <i class="fa fa-clock"></i>
            <div>
                <span class="${isOpen ? 'status-open' : 'status-closed'}">
                    ${isOpen ? 'Open Now' : 'Closed'}
                </span>
                ${weekdayText.length > 0 ? `
                    <div class="hours-list">
                        ${weekdayText.map(day => `<div>${day}</div>`).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ===== MAP ZOOM CONTROLS =====
window.zoomIn = function () {
    if (map) {
        const currentZoom = map.getZoom();
        map.setZoom(currentZoom + 1);
    }
};

window.zoomOut = function () {
    if (map) {
        const currentZoom = map.getZoom();
        map.setZoom(currentZoom - 1);
    }
};

// ===== RESIZABLE PANEL FUNCTIONALITY =====
function initializeResizablePanel() {
    const resizeHandle = document.getElementById('resizeHandle');
    const leftPanel = document.querySelector('.itinerary-left');
    const rightPanel = document.querySelector('.itinerary-right');

    if (!resizeHandle || !leftPanel || !rightPanel) {
        console.warn('Resize elements not found');
        return;
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;

        resizeHandle.classList.add('dragging');
        document.body.classList.add('resizing');

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const newWidth = startWidth + deltaX;

        // Get viewport width
        const viewportWidth = window.innerWidth;

        // Calculate min and max widths
        const minWidth = 300; // 300px minimum
        const maxWidth = viewportWidth * 0.7; // 70% of viewport maximum

        // Clamp the width
        const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

        // Set the width as a pixel value
        leftPanel.style.flex = `0 0 ${clampedWidth}px`;

        // Trigger map resize event (Google Maps needs this)
        if (window.map) {
            google.maps.event.trigger(window.map, 'resize');
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('dragging');
            document.body.classList.remove('resizing');

            // Final map resize
            if (window.map) {
                google.maps.event.trigger(window.map, 'resize');
            }
        }
    });

    console.log('✅ Resizable panel initialized');
}

// ===== SAVE ITINERARY DIRECTLY TO FIRESTORE =====
window.saveItinerary = async function () {
    if (!currentUser) {
        showToast('Please log in to save itineraries', true);
        return;
    }

    // Check activities instead of itinerary
    if (!itineraryData || !itineraryData.activities || itineraryData.activities.length === 0) {
        showToast('No itinerary to save', true);
        return;
    }

    try {
        showToast('Saving itinerary...', false);

        // Generate booking ID
        const bookingId = `AI${Math.floor(Math.random() * 900000000 + 100000000)}`;

        // Build itinerary by day from activities
        const itineraryByDay = {};

        // Get all day sections from DOM
        const daySections = document.querySelectorAll('[id^="day-section-"]');
        daySections.forEach((section) => {
            const dayNumber = section.id.split('-')[2];
            const dayKey = `day${dayNumber}`;
            const activityCards = section.querySelectorAll('.activity-card');
            const dayActivities = [];

            activityCards.forEach((card) => {
                const activityName = card.querySelector('h3')?.textContent;
                const activity = itineraryData.activities.find((a) => a.name === activityName);
                if (activity) {
                    dayActivities.push(activity);
                }
            });

            itineraryByDay[dayKey] = dayActivities;
        });

        console.log('Built itinerary by day:', itineraryByDay);

        // Get cover image - first activity photo or placeholder
        let coverImage = 'https://via.placeholder.com/600x400?text=Trip';

        // Check activities for photos
        for (const activity of itineraryData.activities) {
            if (activity.photoreference) {
                coverImage = `http://127.0.0.1:5000/api/places/photo?photoreference=${activity.photoreference}&maxwidth=600`;
                break;
            }
            if (activity.image) {
                coverImage = activity.image;
                break;
            }
            if (activity.photos && activity.photos.length > 0) {
                const photoRef = activity.photos[0].photoreference;
                if (photoRef) {
                    coverImage = `http://127.0.0.1:5000/api/places/photo?photoreference=${photoRef}&maxwidth=600`;
                    break;
                }
            }
        }

        // ===== COMPREHENSIVE DEBUG CHECK =====
        console.log('═══════════════════════════════════════════════');
        console.log('🔍 DEBUGGING ITINERARY DATA BEFORE SAVE');
        console.log('═══════════════════════════════════════════════');

        // Check global itineraryData
        console.log('1️⃣ GLOBAL itineraryData object:');
        console.log('   Full object:', itineraryData);
        console.log('   Type:', typeof itineraryData);
        console.log('   Is null?', itineraryData === null);
        console.log('   Is undefined?', itineraryData === undefined);

        // Check individual fields
        console.log('\n2️⃣ INDIVIDUAL FIELDS:');
        console.log('   city:', itineraryData?.city, '(type:', typeof itineraryData?.city, ')');
        console.log('   country:', itineraryData?.country, '(type:', typeof itineraryData?.country, ')');
        console.log('   nights:', itineraryData?.nights, '(type:', typeof itineraryData?.nights, ')');
        console.log('   title:', itineraryData?.title, '(type:', typeof itineraryData?.title, ')');
        console.log('   startDate:', itineraryData?.startDate, '(type:', typeof itineraryData?.startDate, ')');
        console.log('   endDate:', itineraryData?.endDate, '(type:', typeof itineraryData?.endDate, ')');

        // Check activities
        console.log('\n3️⃣ ACTIVITIES:');
        console.log('   activities exists?', !!itineraryData?.activities);
        console.log('   activities length:', itineraryData?.activities?.length);
        console.log('   First activity:', itineraryData?.activities?.[0]);

        // Check flight
        console.log('\n4️⃣ FLIGHT DATA:');
        console.log('   flight exists?', !!itineraryData?.flight);
        console.log('   flight object:', itineraryData?.flight);
        if (itineraryData?.flight) {
            console.log('   fromAirport:', itineraryData.flight.fromAirport);
            console.log('   toAirport:', itineraryData.flight.toAirport);
            console.log('   price:', itineraryData.flight.price);
        }

        // Check hotel
        console.log('\n5️⃣ HOTEL DATA:');
        console.log('   selectedHotel exists?', !!selectedHotel);
        console.log('   selectedHotel object:', selectedHotel);
        if (selectedHotel) {
            console.log('   name:', selectedHotel.name);
            console.log('   price:', selectedHotel.price);
        }

        // Check DOM elements
        console.log('\n6️⃣ DOM DATA CHECK:');
        const tripTitleEl = document.getElementById('tripTitle');
        const tripDestinationEl = document.getElementById('tripDestination');
        console.log('   Trip title element:', tripTitleEl?.textContent);
        console.log('   Trip destination element:', tripDestinationEl?.textContent);

        // Check day sections
        console.log('   Day sections found:', daySections.length);

        console.log('═══════════════════════════════════════════════');
        console.log('END DEBUG');
        console.log('═══════════════════════════════════════════════\n');

        // ✅ VALIDATION - DON'T SAVE IF CRITICAL DATA IS MISSING
        if (!itineraryData) {
            showToast('❌ ERROR: Itinerary data is null or undefined', true);
            console.error('FATAL: itineraryData is null or undefined');
            return;
        }

        if (!itineraryData.activities || itineraryData.activities.length === 0) {
            showToast('❌ ERROR: No activities found in itinerary', true);
            console.error('FATAL: No activities in itineraryData');
            return;
        }

        // ✅ TRY TO EXTRACT CITY/COUNTRY FROM ACTIVITIES IF MISSING
        let city = itineraryData.city;
        let country = itineraryData.country;
        let nights = itineraryData.nights;
        let startDate = itineraryData.startDate;
        let endDate = itineraryData.endDate;

        if (!city || !country) {
            console.warn('⚠️ City or Country missing, attempting to extract from activities...');

            // Try to extract from activities
            if (itineraryData.activities && itineraryData.activities.length > 0) {
                const firstActivity = itineraryData.activities[0];

                if (!city) {
                    city = firstActivity.city || firstActivity.vicinity || firstActivity.address || null;
                    console.log('   → Extracted city from activity:', city);
                }

                if (!country) {
                    country = firstActivity.country || null;
                    console.log('   → Extracted country from activity:', country);
                }
            }

            // Try to extract from flight
            if (!city && itineraryData.flight) {
                city = itineraryData.flight.toCity || itineraryData.flight.toAirport || null;
                console.log('   → Extracted city from flight:', city);
            }

            // Try to extract from hotel
            if (!city && selectedHotel) {
                city = selectedHotel.city || selectedHotel.vicinity || null;
                console.log('   → Extracted city from hotel:', city);
            }
        }

        // Try to extract from DOM if still missing
        if (!city) {
            const tripDestinationEl = document.getElementById('tripDestination');
            if (tripDestinationEl) {
                const destinationText = tripDestinationEl.textContent.trim();
                city = destinationText.replace('📍 ', '').trim();
                console.log('   → Extracted city from DOM:', city);
            }
        }

        // ✅ FINAL VALIDATION - MUST HAVE CITY
        if (!city) {
            showToast('❌ ERROR: Cannot save - destination city is missing', true);
            console.error('FATAL: City is still null/undefined after all extraction attempts');
            console.error('Please ensure your itinerary has a valid destination');
            return;
        }

        console.log('✅ Validation passed. Proceeding with save...');
        console.log('   City:', city);
        console.log('   Country:', country || 'Unknown');
        console.log('   Nights:', nights || 'Unknown');

        // ✅ GET USER INFO FROM FIRESTORE
        const userEmail = currentUser.email;
        let firstName = 'Traveler';
        let lastName = '';
        let phone = '';

        try {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                firstName = userData.firstName || 'Traveler';
                lastName = userData.lastName || '';
                phone = userData.phone || '';
                console.log('✅ User data loaded:', firstName, lastName, phone);
            } else {
                console.warn('⚠️ User document not found, using defaults');
            }
        } catch (error) {
            console.warn('⚠️ Error fetching user data:', error.message);
        }

        // Create itinerary document with validated data
        const itineraryDoc = {
            bookingId: bookingId,
            bookingType: 'itinerary',
            status: 'active',
            userId: currentUser.uid,
            email: userEmail,
            firstName: firstName,
            lastName: lastName,
            phone: phone,

            // ✅ Use validated/extracted values
            title: itineraryData.title || `Trip to ${city}`,
            city: city,                                    // ✅ Validated - cannot be null
            country: country || 'Unknown',                 // ✅ Has fallback
            duration: nights ? `${nights} Days` : '1 Day', // ✅ Has fallback

            image: coverImage,
            itinerary: itineraryByDay,
            activities: itineraryData.activities || [],
            totalactivities: itineraryData.activities?.length || 0,
            avgrating: itineraryData.avgrating || 0,
            flight: itineraryData.flight || null,
            hotel: selectedHotel || null,
            price: 0,
            totalPrice: 0,
            currency: 'RM',
            quantity: 1,
            source: 'ai-generated',
            isAIGenerated: true,
            paymentMethod: null,
            startDate: startDate || null,
            endDate: endDate || null,
            nights: nights || 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        console.log('📦 Final itinerary document to save:', itineraryDoc);

        // Save to user's bookings subcollection
        await setDoc(doc(db, 'users', currentUser.uid, 'bookings', bookingId), itineraryDoc);

        showToast('Itinerary saved successfully!', false);
        itineraryData.itineraryid = bookingId;
        itineraryData.bookingid = bookingId;

        console.log('✅ Saved to Firestore with ID:', bookingId);

        // ✅ SHOW BOOKING PROMPT
        setTimeout(() => {
            showBookingPrompt();
        }, 500);

    } catch (error) {
        console.error('Error saving itinerary:', error);
        showToast(`Error saving itinerary: ${error.message}`, true);
    }
};

// ===== SHOW BOOKING PROMPT AFTER SAVING =====
function showBookingPrompt() {
    const flight = itineraryData?.flight;
    const hotel = selectedHotel;

    // If no flight OR no hotel, skip booking prompt
    if (!flight || !hotel) {
        showToast('Itinerary saved! You can book flights and hotels separately from booking page.', false);
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 2000);
        return;
    }

    // Calculate pricing
    const flightPrice = flight?.price?.total || 0;
    const flightCurrency = flight?.price?.currency || 'MYR';

    const hotelPricePerNight = hotel?.price?.total || hotel?.price || 0;
    const hotelCurrency = hotel?.price?.currency || hotel?.currency || 'MYR';
    const totalHotelPrice = hotelPricePerNight * (itineraryData.nights || 1);

    const totalEstimate = parseFloat(flightPrice) + parseFloat(totalHotelPrice);

    console.log('📊 Package Pricing:');
    console.log('Flight:', flight);
    console.log('Flight Price:', flightPrice, flightCurrency);
    console.log('Hotel:', hotel);
    console.log('Hotel Price per Night:', hotelPricePerNight, hotelCurrency);
    console.log('Total Hotel Estimate:', totalHotelPrice);
    console.log('Package Total:', totalEstimate);

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        padding: 32px;
        border-radius: 16px;
        max-width: 550px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease;
    `;

    modalContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px; color: #3D9BF3;">
                <i class="fa fa-check-circle"></i>
            </div>
            <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #2C3E50; font-weight: 700;">Itinerary Saved!</h2>
            <p style="margin: 0; color: #6B7280; font-size: 14px;">Complete your booking with flight + hotel package</p>
        </div>

        <!-- Package Summary -->
        <div style="background: linear-gradient(135deg, #3D9BF3 0%, #2076C7 100%); padding: 20px; border-radius: 12px; margin-bottom: 16px; color: white;">
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa fa-plane" style="font-size: 18px;"></i>
                <span>Travel Package</span>
                <i class="fa fa-hotel" style="font-size: 18px;"></i>
            </div>
            
            <!-- Flight -->
            <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa fa-plane"></i> Flight
                        </div>
                        <div style="font-size: 13px; opacity: 0.9;">${flight.fromAirport} → ${flight.toAirport}</div>
                        <div style="font-size: 12px; opacity: 0.8; margin-top: 2px;">${flight.departureDate || ''}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 16px;">${flightCurrency} ${parseFloat(flightPrice).toFixed(2)}</div>
                        <div style="font-size: 11px; opacity: 0.8;">per person</div>
                    </div>
                </div>
            </div>

            <!-- Hotel -->
            <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa fa-hotel"></i> Hotel
                        </div>
                        <div style="font-size: 13px; opacity: 0.9;">${hotel.name}</div>
                        <div style="font-size: 12px; opacity: 0.8; margin-top: 2px;">${itineraryData.nights} night(s) • Select room next</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; font-size: 16px;">From ${hotelCurrency} ${parseFloat(hotelPricePerNight).toFixed(2)}</div>
                        <div style="font-size: 11px; opacity: 0.8;">per night</div>
                    </div>
                </div>
            </div>

            <!-- Total -->
            <div style="border-top: 1px solid rgba(255,255,255,0.3); margin-top: 16px; padding-top: 16px; text-align: center;">
                <div style="font-size: 13px; opacity: 0.9; margin-bottom: 4px;">Estimated Package Total</div>
                <div style="font-size: 32px; font-weight: 700;">${flightCurrency} ${totalEstimate.toFixed(2)}</div>
                <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">*Final price determined after room selection</div>
            </div>
        </div>

        <!-- Benefits -->
        <div style="background: #F0F9FF; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #E0E6ED;">
            <div style="font-weight: 600; font-size: 14px; color: #2C3E50; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <i class="fa fa-gift" style="color: #3D9BF3;"></i> Package Benefits:
            </div>
            <div style="display: grid; gap: 6px; font-size: 13px; color: #6B7280;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa fa-check" style="color: #27AE60; font-size: 12px;"></i>
                    Coordinated flight and hotel dates
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa fa-check" style="color: #27AE60; font-size: 12px;"></i>
                    Complete travel package in one booking
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa fa-check" style="color: #27AE60; font-size: 12px;"></i>
                    Easy checkout process
                </div>
            </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 12px; margin-top: 24px;">
            <button id="bookPackageBtn" style="
                flex: 1;
                padding: 16px 24px;
                background: linear-gradient(135deg, #3D9BF3 0%, #2076C7 100%);
                color: white;
                border: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(61, 155, 243, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            ">
                <i class="fa fa-shopping-cart"></i> Book Package
            </button>
            <button id="skipBookingBtn" style="
                flex: 1;
                padding: 16px 24px;
                background: white;
                color: #6B7280;
                border: 2px solid #E0E6ED;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            ">
                <i class="fa fa-clock"></i> Maybe Later
            </button>
        </div>

        <div style="text-align: center; margin-top: 16px;">
            <p style="font-size: 12px; color: #95A5A6; margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <i class="fa fa-info-circle"></i>
                You can book this package anytime from your saved itineraries
            </p>
        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Add animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        #bookPackageBtn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(61, 155, 243, 0.5);
        }
        #skipBookingBtn:hover {
            background: #F8F9FA;
            border-color: #6B7280;
            color: #2C3E50;
        }
    `;
    document.head.appendChild(style);

    // Button handlers
    document.getElementById('bookPackageBtn').addEventListener('click', () => {
        bookFlightHotelPackage(flight, hotel);
    });

    document.getElementById('skipBookingBtn').addEventListener('click', () => {
        modal.remove();
        showToast('You can book this package later from your itineraries', false);
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 1500);
    });
}

// ===== BOOK FLIGHT + HOTEL PACKAGE =====
function bookFlightHotelPackage(flight, hotel) {
    try {
        // Store BOTH flight and hotel data together
        const packageData = {
            // Flight data
            flight: {
                ...flight,
                itineraryId: itineraryData.bookingid,
                passengers: 1,
                class: 'ECONOMY',
                tripType: flight.returnDate ? 'round-trip' : 'one-way'
            },
            // Hotel data
            hotel: {
                hotelId: hotel.place_id || hotel.id,
                name: hotel.name,
                address: hotel.address || hotel.vicinity,
                rating: hotel.rating,
                image: hotel.image || hotel.photo,
                pricePerNight: hotel.price?.total || hotel.price || 0,
                currency: hotel.price?.currency || hotel.currency || 'MYR',
                checkIn: itineraryData.startDate || new Date().toISOString().split('T')[0],
                checkOut: calculateCheckoutDate(itineraryData.startDate, itineraryData.nights),
                nights: itineraryData.nights || 1,
                guests: 1,
                coordinates: {
                    lat: hotel.latitude || hotel.lat,
                    lng: hotel.longitude || hotel.lng
                }
            },
            // Package metadata
            packageInfo: {
                itineraryId: itineraryData.bookingid,
                city: itineraryData.city,
                country: itineraryData.country,
                startDate: itineraryData.startDate,
                nights: itineraryData.nights,
                isPackageBooking: true
            }
        };

        // Store in sessionStorage
        sessionStorage.setItem('travelPackage', JSON.stringify(packageData));
        window.location.href = 'hotelRoomSelection.html';

    } catch (error) {
        console.error('❌ Error preparing package booking:', error);
        showToast('Error preparing package booking', true);
    }
}

// ===== CALCULATE CHECKOUT DATE =====
function calculateCheckoutDate(startDate, nights) {
    if (!startDate) return null;

    const date = new Date(startDate);
    date.setDate(date.getDate() + parseInt(nights || 1));
    return date.toISOString().split('T')[0];
}

window.regenerateItinerary = function () {
    if (!confirm('Are you sure you want to regenerate the itinerary?')) {
        return;
    }

    if (itineraryData) {
        sessionStorage.setItem('regenerateTrip', JSON.stringify({
            departingFrom: itineraryData.departingFrom || '',
            destination: itineraryData.destination || itineraryData.city || '',
            country: itineraryData.country || '',
            startDate: itineraryData.startDate || '',
            endDate: itineraryData.endDate || '',
            nights: itineraryData.nights || 3,
            travelStyles: itineraryData.travelStyles || [],
            withWhom: itineraryData.withWhom || 'solo'
        }));

        console.log('✅ Stored regenerate data');
    }

    window.location.href = 'planItinerary.html';
};

// ===== DOM CONTENT LOADED =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 aiItinerary.js loaded');

    const profileTrigger = document.querySelector('.profile-trigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileTrigger) {
        profileTrigger.removeAttribute('onclick');
        profileTrigger.addEventListener('click', toggleDropdown);
    }

    document.addEventListener('click', function (event) {
        if (profileDropdown && !profileDropdown.contains(event.target) && !event.target.closest('.profile-trigger')) {
            profileDropdown.classList.remove('active');
        }
    });

    const saveItineraryBtn = document.getElementById('saveItineraryBtn');
    if (saveItineraryBtn) {
        saveItineraryBtn.style.display = 'none';
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
});

// ===== AUTH STATE OBSERVER =====
observeAuthState(async (user) => {
    currentUser = user;

    console.log('👤 Auth state:', user ? `${user.email}` : 'Logged out');

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
            } else {
                updateUserProfileUI({
                    firstName: user.displayName || 'User',
                    email: user.email
                });
            }

            await generateItinerary();

        } catch (error) {
            console.error('❌ Error:', error);
            await generateItinerary();
        }
    } else {
        window.location.href = 'login.html';
    }
});