// ========== IMPORTS ========== //
import { db, auth } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { observeAuthState, handleLogout } from './auth.js';

// ========== API CONFIG - GOOGLE PLACES API ========== //
const API_CONFIG = {
    baseUrl: 'http://localhost:5000/api'
};

const CONFIG = {
    defaultLocation: {
        lat: 3.1390,
        lng: 101.6869,
        zoom: 13
    },
    cacheExpiry: 604800000
};

// ========== CACHE MANAGER ========== //
class CacheManager {
    constructor() {
        this.storageKey = 'travel_co_poi_cache';
        this.loadCache();
    }


    loadCache() {
        try {
            const cached = localStorage.getItem(this.storageKey);
            this.cache = cached ? JSON.parse(cached) : {};
        } catch (e) {
            console.warn('Cache load error:', e);
            this.cache = {};
        }
    }

    saveCache() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
        } catch (e) {
            console.warn('Cache save error:', e);
        }
    }

    isCacheValid(category) {
        if (!this.cache[category]) return false;
        const { timestamp } = this.cache[category];
        const now = Date.now();
        const isValid = (now - timestamp) < CONFIG.cacheExpiry;
        if (!isValid) {
            delete this.cache[category];
            this.saveCache();
        }
        return isValid;
    }

    getCache(category) {
        if (this.isCacheValid(category)) {
            console.log(`✅ Using cached data for ${category}`);
            return this.cache[category].data;
        }
        return null;
    }

    setCache(category, data) {
        this.cache[category] = {
            data: data,
            timestamp: Date.now()
        };
        this.saveCache();
        console.log(`💾 Cached ${category} (${data.length} items)`);
    }

    clearCache() {
        this.cache = {};
        this.saveCache();
        console.log('🗑️ Cache cleared');
    }
}

// ========== GLOBAL VARIABLES ========== //
let map;
let markers = [];
let currentCategory = 'all';
let currentLocation = { ...CONFIG.defaultLocation };
let userMarker = null;
let selectedMarkerIndex = null;
let lastLat = null;
let lastLng = null;
let currentUser = null;
const cacheManager = new CacheManager();

// ========== USER PROFILE UI ========== //
function updateUserProfileUI(userData) {
    const profileNameElement = document.getElementById('profileName');
    const profileAvatarElement = document.getElementById('profileAvatarInitials');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileNameElement || !profileAvatarElement || !profileDropdown) {
        console.error("Profile UI elements not found!");
        return;
    }

    if (userData) {
        const firstName = userData.firstName || '';
        const lastName = userData.lastName || '';
        profileNameElement.textContent = `${firstName} ${lastName}`.trim() || 'User';
        const photoURL = userData.profilePhotoURL;
        profileAvatarElement.innerHTML = '';
        if (photoURL) {
            const img = document.createElement('img');
            img.src = photoURL;
            img.alt = `${firstName}'s profile picture`;
            img.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 50%;";
            profileAvatarElement.appendChild(img);
        } else {
            const firstInitial = firstName ? firstName[0].toUpperCase() : '';
            const lastInitial = lastName ? lastName[0].toUpperCase() : '';
            profileAvatarElement.textContent = `${firstInitial}${lastInitial}` || 'U';
        }

        profileDropdown.style.display = 'flex';
        console.log('✅ Profile UI updated:', firstName, lastName);
    } else {
        console.warn("Missing user data for UI update.");
        profileDropdown.style.display = 'none';
    }
}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// ========== HELPER FUNCTIONS ========== //
function getMarkerColor(category) {
    const colors = {
        'cafe': 'blue',
        'tourist_attraction': 'green',
        'museum': 'purple',
        'park': 'orange',
        'gym': 'gold',
        'shopping_mall': 'violet',
    };
    return colors[category] || 'blue';
}

function showLoading() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.style.display = 'flex';
}

function hideLoading() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.style.display = 'none';
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ========== GET PEXELS IMAGE ========== //
function getPexelsImage(category) {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('cafe') || categoryLower.includes('coffee')) {
        return 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    } else if (categoryLower.includes('attraction') || categoryLower.includes('point_of_interest')) {
        return 'https://images.pexels.com/photos/2398220/pexels-photo-2398220.jpeg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    } else if (categoryLower.includes('museum')) {
        return 'https://images.pexels.com/photos/2398220/pexels-photo-2398220.jpeg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    } else if (categoryLower.includes('park') || categoryLower.includes('garden')) {
        return 'https://images.pexels.com/photos/1761279/pexels-photo-1761279.jpeg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    } else if (categoryLower.includes('gym') || categoryLower.includes('fitness')) {
        return 'https://images.pexels.com/photos/28215/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    } else if (categoryLower.includes('shopping') || categoryLower.includes('mall')) {
        return 'https://images.pexels.com/photos/2126868/pexels-photo-2126868.jpeg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    } else {
        return 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=450&h=280&fit=crop';
    }
}

// ========== MAP INITIALIZATION ========== //
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        preferCanvas: true
    }).setView([currentLocation.lat, currentLocation.lng], currentLocation.zoom)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    console.log('✅ Map initialized at', currentLocation.lat, currentLocation.lng);
}

// ========== USER LOCATION ========== //
function updateUserMarker(lat, lng) {
    if (userMarker) {
        map.removeLayer(userMarker);
    }

    userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#1e40af',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.8
    }).addTo(map);

    userMarker.bindPopup('📍 You are here');
    console.log('✅ User marker updated at', lat, lng);
}

// ========== BROWSER GEOLOCATION ========== //
async function startLocationTracking() {
    console.log('📍 Starting location tracking with browser geolocation...');

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                console.log(`✅ Browser location acquired: ${latitude}, ${longitude} (Accuracy: ${accuracy}m)`);

                currentLocation = {
                    lat: latitude,
                    lng: longitude,
                    zoom: 13
                };

                lastLat = latitude;
                lastLng = longitude;

                map.setView([latitude, longitude], 13);
                updateUserMarker(latitude, longitude);

                cacheManager.clearCache();
                loadPOIs(currentCategory);
            },
            (error) => {
                console.warn('⚠️ Browser geolocation failed:', error.message);
                console.log('📍 Using default location (Kuala Lumpur)');

                currentLocation = { ...CONFIG.defaultLocation };
                lastLat = currentLocation.lat;
                lastLng = currentLocation.lng;

                map.setView([currentLocation.lat, currentLocation.lng], currentLocation.zoom);
                updateUserMarker(currentLocation.lat, currentLocation.lng);

                cacheManager.clearCache();
                loadPOIs(currentCategory);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.warn('⚠️ Browser geolocation not available, using default location');
        currentLocation = { ...CONFIG.defaultLocation };
        lastLat = currentLocation.lat;
        lastLng = currentLocation.lng;

        map.setView([currentLocation.lat, currentLocation.lng], currentLocation.zoom);
        updateUserMarker(currentLocation.lat, currentLocation.lng);

        cacheManager.clearCache();
        loadPOIs(currentCategory);
    }
}

// ========== GOOGLE PLACES NEARBY SEARCH ========== //
async function searchNearbyPOIs(lat, lng, category = 'all', limit = 50, radius = 5000) {
    try {
        console.log(`🔍 Google Places Nearby: ${category} near ${lat}, ${lng}`);

        const url = `${API_CONFIG.baseUrl}/places/nearby?lat=${lat}&lng=${lng}&radius=${radius}&type=${category}`;
        console.log(`📡 Fetching from: ${url}`);

        const response = await fetch(url);
        const data = await response.json();

        console.log(`📊 Response data:`, data);

        if (data.results && data.results.length > 0) {
            console.log(`✅ Got ${data.results.length} results`);
            console.log(`🔍 First result:`, data.results[0]);

            return data.results.map(place => {
                const distance = calculateDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng);

                console.log(`📍 Mapping:`, {
                    name: place.name,
                    address: place.formatted_address,
                    hasAddress: !!place.formatted_address
                });

                return {
                    poi: {
                        name: place.name,
                        rating: place.rating || 'N/A',
                        categories: place.types || [],
                        phone: place.formatted_phone_number || ''
                    },
                    position: {
                        lat: place.geometry.location.lat,
                        lon: place.geometry.location.lng
                    },
                    address: {
                        freeformAddress: place.formatted_address || 'No address'
                    },
                    dist: distance * 1000,
                    place_id: place.place_id,
                    photos: place.photos || []
                };
            });
        } else {
            console.warn(`⚠️ No results or empty results array`);
            return [];
        }
    } catch (error) {
        console.error('❌ Google Places search error:', error);
        return [];
    }
}

// ========== GOOGLE PLACES TEXT SEARCH (Search Bar) ========== //
async function searchPOIByName(query, lat, lng, limit = 50, radius = 100000) {
    try {
        showLoading();
        console.log(`🔍 Google Places Text Search: "${query}"`);


        if (!query || query.trim() === '') {
            hideLoading();
            return [];
        }


        const response = await fetch(`${API_CONFIG.baseUrl}/places/textsearch?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}`);
        const data = await response.json();


        hideLoading();


        if (data.results) {
            return data.results.map(place => {
                const distance = calculateDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng);

                return {
                    poi: {
                        name: place.name,
                        rating: place.rating || 'N/A',
                        categories: place.types || [],
                        phone: place.formatted_phone_number || ''
                    },
                    position: {
                        lat: place.geometry.location.lat,
                        lon: place.geometry.location.lng
                    },
                    address: {
                        freeformAddress: place.formatted_address
                    },
                    dist: distance * 1000,
                    place_id: place.place_id,
                    photos: place.photos || []
                };
            });
        }
        return [];
    } catch (error) {
        console.error('❌ Google Places search error:', error);
        hideLoading();
        return [];
    }
}


// ========== GET GOOGLE PLACE DETAILS ========== //
async function getPlaceDetails(place_id) {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/places/details?place_id=${place_id}`);
        const data = await response.json();


        return {
            rating: data.rating || 'N/A',
            reviews_count: data.reviews_count || 0,
            reviews: data.reviews || [],
            photos: data.photos || [],
            phone: data.phone || '',
            website: data.website || '',
            hours: data.hours || null,
            price_level: data.price_level || ''
        };
    } catch (error) {
        console.error('❌ Google Places details error:', error);
        return null;
    }
}



// ========== LOAD POIs ========== //
async function loadPOIs(category) {
    try {
        showLoading();
        console.log(`📍 Loading POIs for category: ${category} at ${currentLocation.lat}, ${currentLocation.lng}`);


        const cachedData = cacheManager.getCache(category);
        if (cachedData) {
            displayPOIs(cachedData);
            hideLoading();
            return;
        }


        const results = await searchNearbyPOIs(
            currentLocation.lat,
            currentLocation.lng,
            category,
            50,
            50000
        );


        if (results.length > 0) {
            cacheManager.setCache(category, results);
            displayPOIs(results);
        } else {
            console.warn('No POIs found');
        }


        hideLoading();
    } catch (error) {
        console.error('Error loading POIs:', error);
        hideLoading();
    }
}



// ========== DISPLAY POIs WITH MARKERS ========== //
async function displayPOIs(pois) {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];


    if (pois.length === 0) return;


    for (const poi of pois) {
        const name = poi.poi?.name || 'Unknown';
        const lat = poi.position.lat;
        const lon = poi.position.lon;
        const address = poi.address?.freeformAddress || 'No address';
        const phone = poi.poi?.phone || '';
        const distance = poi.dist ? (poi.dist / 1000).toFixed(1) : 'N/A';

        const markerColor = getMarkerColor(currentCategory);

        const marker = L.marker([lat, lon], {
            icon: L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map);


        const popup = `
            <div class="google-maps-popup">
                <strong>${name}</strong>
                <p>📍 ${address}</p>
                ${phone ? `<p>📞 ${phone}</p>` : ''}
            </div>
        `;


        marker.bindPopup(popup);


        marker.on('mouseover', function () {
            const containerPoint = map.latLngToContainerPoint(poi.position);
            const event = {
                target: {
                    getBoundingClientRect: () => ({
                        left: containerPoint.x + document.querySelector('.map-wrapper').getBoundingClientRect().left,
                        top: containerPoint.y + document.querySelector('.map-wrapper').getBoundingClientRect().top
                    })
                }
            };
            showPreviewCard(poi, event);
        });


        marker.on('mouseout', function () {
            hidePreviewCard();
        });


        marker.on('click', function () {
            hidePreviewCard();
            const index = markers.length;
            showPOIModal(poi, index);
        });


        markers.push(marker);
    }


    updateDisplayPOIList(pois);
    console.log(`✅ Displayed ${markers.length} markers with color: ${getMarkerColor(currentCategory)}`);
}


// ========== UPDATE DISPLAY POI LIST ========== //
function updateDisplayPOIList(pois) {
    const poiSidebarList = document.getElementById('poiSidebarList');


    if (!poiSidebarList) return;


    poiSidebarList.innerHTML = '';


    if (pois.length === 0) {
        poiSidebarList.innerHTML = '<p class="empty-message">No POIs found</p>';
        return;
    }


    pois.forEach((poi, index) => {
        const name = poi.poi?.name || 'Unknown';
        const address = poi.address?.freeformAddress || 'No address';
        const distance = poi.dist ? (poi.dist / 1000).toFixed(1) : 'N/A';


        const poiItem = document.createElement('div');
        poiItem.className = 'poi-sidebar-item';
        poiItem.innerHTML = `
            <div class="poi-sidebar-item-name">${name}</div>
            <div class="poi-sidebar-item-address">${address}</div>
            <div class="poi-sidebar-item-distance">📏 ${distance} km away</div>
        `;


        poiItem.addEventListener('click', () => {
            hidePreviewCard();
            showPOIModal(poi, index);
        });


        poiSidebarList.appendChild(poiItem);
    });


    console.log(`✅ Displayed ${pois.length} items in sidebar list`);
}



// ========== SHOW PREVIEW CARD ========== //
function showPreviewCard(poi, event) {
    const previewCard = document.getElementById('poiPreviewCard');
    const name = poi.poi?.name || 'Unknown';
    const address = poi.address?.freeformAddress || 'No address';
    const category = poi.poi?.categories ? poi.poi.categories[0] : 'Point of Interest';
    const rating = poi.poi?.rating || 'N/A';

    // ✅ FIX: Get the correct image URL with error handling
    let imgUrl = getPexelsImage(category);
    
    // Try to use Google photo first if available
    if (poi.photos && poi.photos.length > 0) {
        const photo = poi.photos[0];
        imgUrl = `${API_CONFIG.baseUrl}/places/photo?photo_reference=${photo.photo_reference}&maxwidth=450`;
        console.log(`✅ Using Google photo in preview:`, imgUrl);
    } else {
        console.log(`📷 Using Pexels fallback in preview:`, imgUrl);
    }

    document.getElementById('previewName').textContent = name;
    document.getElementById('previewAddress').textContent = address;
    document.getElementById('previewType').textContent = category;
    document.getElementById('previewRating').textContent = rating !== 'N/A' ? `⭐ ${rating}` : '';
    
    // ✅ FIX: Add error handling for the image
    const previewImageImg = document.getElementById('previewImageImg');
    if (previewImageImg) {
        previewImageImg.src = imgUrl;
        previewImageImg.onerror = function () {
            console.warn(`⚠️ Preview image failed to load, using Pexels fallback`);
            this.src = getPexelsImage(category);
        };
    }

    const rect = event.target.getBoundingClientRect();
    previewCard.style.left = (rect.left - 175) + 'px';
    previewCard.style.top = (rect.top - 280) + 'px';

    previewCard.style.cursor = 'pointer';
    previewCard.onclick = function (e) {
        const poiIndex = markers.findIndex(m => {
            return m.getLatLng().lat === poi.position.lat &&
                m.getLatLng().lng === poi.position.lon;
        });
        if (poiIndex !== -1) {
            hidePreviewCard();
            showPOIModal(poi, poiIndex);
        }
    };

    previewCard.classList.add('show');
    console.log(`👀 Preview card shown for: ${name}`);
}

// ========== HIDE PREVIEW CARD ========== //
function hidePreviewCard() {
    const previewCard = document.getElementById('poiPreviewCard');
    previewCard.classList.remove('show');
}



// ========== SHOW POI MODAL ========== //
async function showPOIModal(poi, index) {
    const modal = document.getElementById('poiModal');
    const name = poi.poi?.name || 'Unknown';
    const address = poi.address?.freeformAddress || 'No address';
    const phone = poi.poi?.phone || '';
    const distance = poi.dist ? (poi.dist / 1000).toFixed(1) : 'N/A';

    console.log(`📋 Opening modal for: ${name}`);
    console.log(`📦 POI object:`, poi);
    console.log(`📍 Address field:`, poi.address);
    console.log(`📝 Address value:`, address);

    // ✅ RESTORE OLD MARKER COLOR
    if (selectedMarkerIndex !== null && markers[selectedMarkerIndex]) {
        const oldColor = getMarkerColor(currentCategory);
        markers[selectedMarkerIndex].setIcon(L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${oldColor}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }));
    }

    selectedMarkerIndex = index;

    // ✅ CHANGE TO RED WHEN SELECTED
    if (markers[index]) {
        markers[index].setIcon(L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }));
    }

    // ✅ GET REAL DATA FROM GOOGLE
    console.log(`🔍 Fetching details for place_id: ${poi.place_id}`);
    let details = await getPlaceDetails(poi.place_id);
    console.log(`📦 Details response:`, details);

    let rating = 'N/A';
    let totalRatings = 0;
    let website = '';
    let imgUrl = null;

    if (details) {
        rating = details.rating || 'N/A';
        totalRatings = details.reviews_count || 0;
        website = details.website || '';

        console.log(`✅ Details loaded:`, { rating, totalRatings, website });

        // ✅ TRY TO GET GOOGLE PHOTOS FIRST
        if (details.photos && details.photos.length > 0) {
            const photo = details.photos[0];
            imgUrl = `${API_CONFIG.baseUrl}/places/photo?photo_reference=${photo.photo_reference}&maxwidth=450`;
            console.log(`✅ Using Google photo:`, imgUrl);
        } else {
            console.log(`⚠️ No photos in details`);
        }
    } else {
        console.warn(`⚠️ No details returned`);
    }

    // ✅ FALLBACK TO PEXELS ONLY IF NO GOOGLE PHOTO
    if (!imgUrl) {
        imgUrl = getPexelsImage(poi.poi?.categories ? poi.poi.categories[0] : 'business');
        console.log(`📷 Using Pexels fallback:`, imgUrl);
    }

    console.log(`🖼️ Final image URL:`, imgUrl);

    // ✅ SET BASIC INFO (ONLY ONCE)
    const modalName = document.getElementById('modalName');
    const modalAddress = document.getElementById('modalAddress');
    const modalDistance = document.getElementById('modalDistance');
    const modalRating = document.getElementById('modalRating');
    const modalReviews = document.getElementById('modalReviews');
    const modalCategory = document.getElementById('modalCategory');
    const modalImageImg = document.getElementById('modalImageImg');

    if (modalName) modalName.textContent = name;

    // ✅ DISPLAY ADDRESS - Use the one from poi data structure
    if (modalAddress) {
        const displayAddress = poi.address?.freeformAddress || 'No address available';
        console.log(`✅ Setting address to: ${displayAddress}`);
        modalAddress.textContent = displayAddress;
    }

    if (modalDistance) modalDistance.textContent = distance + ' km';
    if (modalRating) modalRating.textContent = `⭐ ${rating}`;
    if (modalReviews) modalReviews.textContent = `(${totalRatings} reviews)`;

    const categoryDisplay = poi.poi?.categories ? poi.poi.categories[0] : 'Point of Interest';
    if (modalCategory) modalCategory.textContent = categoryDisplay;

    // ✅ SET IMAGE WITH PROPER ERROR HANDLING
    if (modalImageImg) {
        console.log(`🖼️ Setting image to:`, imgUrl);
        modalImageImg.src = imgUrl;

        modalImageImg.onload = function () {
            console.log(`✅ Image loaded successfully`);
        };

        modalImageImg.onerror = function () {
            console.warn(`⚠️ Image failed to load, using placeholder`);
            this.src = `https://via.placeholder.com/450x280?text=${encodeURIComponent(name)}`;
        };
    }

    // ✅ PHONE
    const phoneSection = document.getElementById('phoneSection');
    if (phoneSection) {
        if (phone) {
            phoneSection.style.display = 'flex';
            const phoneLink = document.getElementById('modalPhoneLink');
            if (phoneLink) {
                phoneLink.textContent = phone;
                phoneLink.href = `tel:${phone}`;
            }
        } else {
            phoneSection.style.display = 'none';
        }
    }

    // ✅ HOURS
    const hoursSection = document.getElementById('hoursSection');
    if (hoursSection) {
        if (details && details.hours) {
            hoursSection.style.display = 'flex';
            const isOpen = details.hours.open_now !== undefined ? details.hours.open_now : true;
            const statusEl = document.getElementById('modalHoursStatus');
            if (statusEl) {
                statusEl.textContent = isOpen ? 'Open' : 'Closed';
                statusEl.className = `hours-status ${isOpen ? 'open' : 'closed'}`;
            }

            const hoursEl = document.getElementById('modalHours');
            if (hoursEl && details.hours.weekday_text) {
                hoursEl.innerHTML = details.hours.weekday_text.join('<br>');
            }
        } else {
            hoursSection.style.display = 'none';
        }
    }

    // ✅ WEBSITE
    const websiteSection = document.getElementById('websiteSection');
    if (websiteSection) {
        if (website) {
            websiteSection.style.display = 'flex';
            const websiteLink = document.getElementById('websiteLink');
            if (websiteLink) {
                try {
                    websiteLink.textContent = new URL(website).hostname;
                    websiteLink.href = website;
                } catch (e) {
                    websiteLink.textContent = website;
                    websiteLink.href = website;
                }
            }
        } else {
            websiteSection.style.display = 'none';
        }
    }

    // ✅ SHOW MODAL
    if (modal) {
        modal.classList.add('show');
    }

    // Close any open popups
    if (markers[index]) {
        markers[index].closePopup();
    }

    markers.forEach(marker => {
        if (marker.isPopupOpen()) {
            marker.closePopup();
        }
    });

    // Center map on POI
    map.setView([poi.position.lat, poi.position.lon], 15);

    // ✅ ACTION BUTTONS
    const directionsBtn = document.getElementById('directionsBtn');
    if (directionsBtn) {
        directionsBtn.onclick = () => {
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.position.lat},${poi.position.lon}`;
            window.open(googleMapsUrl, '_blank');
        };
    }

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.onclick = () => {
            alert(`💾 Saved: ${name}`);
        };
    }

    const nearbyBtn = document.getElementById('nearbyBtn');
    if (nearbyBtn) {
        nearbyBtn.onclick = () => {
            alert(`📍 Nearby places for: ${name}`);
        };
    }

    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const shareText = `Check out ${name} at ${address}`;
            if (navigator.share) {
                navigator.share({
                    title: name,
                    text: shareText,
                    url: window.location.href
                });
            } else {
                alert(`📤 Share: ${shareText}`);
            }
        };
    }

    // ✅ TAB SWITCHING
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.dataset.tab + '-tab';
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });

    // ✅ POPULATE REVIEWS TAB
    const reviewsContainer = document.getElementById('reviewsContainer');
    if (reviewsContainer) {
        if (details && details.reviews && details.reviews.length > 0) {
            reviewsContainer.innerHTML = details.reviews.map(review => `
                <div class="review-item">
                    <div class="review-author">${review.author_name || 'Anonymous'}</div>
                    <div class="review-rating">${'⭐'.repeat(review.rating)} (${review.rating}/5)</div>
                    <div class="review-text">${review.text || 'No text provided'}</div>
                </div>
            `).join('');
        } else {
            reviewsContainer.innerHTML = '<p class="empty-message">No reviews available</p>';
        }
    }

    // ✅ POPULATE ABOUT TAB
    const aboutContainer = document.getElementById('aboutContainer');
    if (aboutContainer) {
        if (details && details.hours) {
            let hoursHTML = '<h4>Hours</h4>';
            if (details.hours.weekday_text) {
                hoursHTML += details.hours.weekday_text.map(day => `<div>${day}</div>`).join('');
            }
            aboutContainer.innerHTML = hoursHTML;
        } else {
            aboutContainer.innerHTML = '<p class="empty-message">No additional information available</p>';
        }
    }

    console.log(`✅ Modal opened for: ${name}`);
}

// ========== CLOSE POI MODAL ========== //
function closePOIModal() {
    const modal = document.getElementById('poiModal');
    modal.classList.remove('show');


    if (selectedMarkerIndex !== null && markers[selectedMarkerIndex]) {
        const originalColor = getMarkerColor(currentCategory);
        markers[selectedMarkerIndex].setIcon(L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${originalColor}.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }));
        selectedMarkerIndex = null;
    }


    console.log('✅ Modal closed');
}

// ========== SETUP MODAL CLOSE ========== //
function setupModalClose() {
    const closeBtn = document.getElementById('modalClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePOIModal);
    }


    const modal = document.getElementById('poiModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closePOIModal();
            }
        });
    }


    console.log('✅ Modal close handlers setup');
}

// ========== SEARCH BAR FUNCTIONALITY ========== //
function setupSearchBar() {
    const searchInput = document.getElementById('mapSearch');
    if (!searchInput) return;


    searchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                console.log(`🔍 Searching for: ${query}`);
                const results = await searchPOIByName(
                    query,
                    currentLocation.lat,
                    currentLocation.lng,
                    50,
                    100000
                );


                if (results.length > 0) {
                    displayPOIs(results);
                    const firstResult = results[0];
                    map.setView([firstResult.position.lat, firstResult.position.lon], 14);
                } else {
                    alert('No results found for: ' + query);
                }
            }
        }
    });
}

// ========== EVENT LISTENERS ========== //
function setupEventListeners() {
    const sidebar = document.querySelector('.google-sidebar');
    const menuBtn = document.getElementById('menuToggle');


    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('show');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
    }


    document.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.dataset.category;
            cacheManager.clearCache();
            loadPOIs(currentCategory);
        });
    });


    const locationBtn = document.getElementById('locationBtn');
    if (locationBtn) {
        locationBtn.addEventListener('click', () => {
            map.setView([currentLocation.lat, currentLocation.lng], 15);
            if (userMarker) userMarker.openPopup();
        });
    }


    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    if (zoomIn) zoomIn.addEventListener('click', () => map.zoomIn());
    if (zoomOut) zoomOut.addEventListener('click', () => map.zoomOut());
}


function setupProfileDropdown() {
    const trigger = document.querySelector('.profile-trigger');
    const dropdown = document.getElementById('profileDropdown');
    const logout = document.getElementById('logoutButton');


    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleProfileDropdown();
        });
    }


    document.addEventListener('click', () => {
        if (dropdown) dropdown.classList.remove('active');
    });


    if (logout) {
        logout.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                await handleLogout(e);
            } catch (error) {
                console.error('Logout error:', error);
                window.location.href = 'login.html';
            }
        });
    }
}


// ========== AUTH ========== //
observeAuthState(async (user) => {
    currentUser = user;
    
    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const userData = docSnap.data();
                console.log("✅ User data from Firestore: ", userData);

                // Add cache-busting query parameter to profile photo
                if (userData.profilePhotoURL) {
                    userData.profilePhotoURL = `${userData.profilePhotoURL}?t=${new Date().getTime()}`;
                }

                updateUserProfileUI(userData);
            } else {
                console.warn("⚠️ User profile not found");
                updateUserProfileUI({ firstName: user.displayName || 'User' });
            }

        } catch (error) {
            console.error("❌ Error fetching user data...", error);
            const profileDropdown = document.getElementById('profileDropdown');
            if (profileDropdown) profileDropdown.style.display = 'none';
        }
    } else {
        console.log("⚠️ User not logged in - redirecting to login");
        window.location.href = 'login.html';
    }
});


// ========== INITIALIZE ========== //
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App starting...');
    if (!map) {
        initMap();
        setupEventListeners();
        setupSearchBar();
        setupProfileDropdown();
        setupModalClose();
        startLocationTracking();
    }
});
