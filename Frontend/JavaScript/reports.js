import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleLogout } from './auth.js';
import { showToast } from './utils.js';

// ===== AIRPORT TO CITY MAPPING =====
function getAirportCity(code) {
    const cities = {
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
    return cities[code] || code;
}

// ===== GLOBAL VARIABLES =====
let currentUser = null;
let currentUserRole = null;
let currentPeriod = 'week';
let currentStats = null;

// Chart instances
let revenueChartInstance = null;
let avgBookingValueChartInstance = null;
let destinationsChartInstance = null;
let tripDurationChartInstance = null;
let themesChartInstance = null;
let bookingsChartInstance = null;

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

function formatRevenue(value) {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
    } else {
        return value.toFixed(2);
    }
}

// Helper function to calculate growth percentage
function calculateGrowth(previous, current) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function parseDuration(durationStr) {
    if (!durationStr) return null;

    // If already a number, return it
    if (typeof durationStr === 'number') {
        return durationStr;
    }

    // Convert to string and extract first number
    const str = String(durationStr).toLowerCase();

    // Match patterns like "7 Days", "7D", "7 days 6 nights", "7", etc.
    const match = str.match(/(\d+)/);
    if (match) {
        return parseInt(match[1]);
    }

    return null;
}

// Helper function to calculate trip duration from dates
function calculateDuration(booking) {
    if (booking.startDate && booking.endDate) {
        const start = booking.startDate.toDate ? booking.startDate.toDate() : new Date(booking.startDate);
        const end = booking.endDate.toDate ? booking.endDate.toDate() : new Date(booking.endDate);
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }
    return null;
}

// ===== FETCH BUSINESS STATS  =====
async function fetchBusinessStats(period) {
    console.log('📊 FETCHING BUSINESS REPORTS:', period);

    // Show loading state
    const loadingCards = ['totalItinerariesCount', 'totalBookingsCount', 'totalRevenueCount', 'topDestinationName'];
    loadingCards.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '...';
    });

    try {
        const now = new Date();
        let startDate, previousStartDate, previousEndDate;

        if (period === 'week') {
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            previousStartDate = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
            previousEndDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        } else if (period === 'month') {
            startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            previousStartDate = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
            previousEndDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        } else if (period === 'year') {
            startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
            previousStartDate = new Date(now.getTime() - (730 * 24 * 60 * 60 * 1000));
            previousEndDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
        } else {
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            previousStartDate = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
            previousEndDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        }

        // Initialize stats
        const stats = {
            totalItineraries: 0,
            totalBookings: 0,
            totalRevenue: 0,
            revenueOverTime: {},
            bookingsOverTime: {},
            avgBookingValueOverTime: {},
            destinationCounts: {},
            tripDurationCounts: {
                '1-2 days': 0,
                '3-4 days': 0,
                '5-7 days': 0,
                '8-14 days': 0,
                '15+ days': 0
            },
            sourceCounts: {
                'AI-Generated Itineraries': 0,
                'Paid Itinerary Bookings': 0,
                'Package Bookings': 0,
                'Hotel Bookings': 0,
                'Flight Bookings': 0
            },
            topDestination: ''
        };

        const previousStats = {
            totalBookings: 0,
            totalRevenue: 0
        };

        // 1. FETCH PRELOADED ITINERARIES
        console.log('📚 Fetching preloaded itineraries catalog...');
        const itinerariesRef = collection(db, 'itineraries');
        const itinerariesSnapshot = await getDocs(itinerariesRef);
        stats.totalItineraries = itinerariesSnapshot.size;

        itinerariesSnapshot.forEach((docSnap) => {
            const itinerary = docSnap.data();
            const destination = itinerary.city || 'Unknown';
            stats.destinationCounts[destination] = (stats.destinationCounts[destination] || 0) + 1;

            // Duration tracking
            let duration = null;
            if (itinerary.duration) {
                duration = parseDuration(itinerary.duration);
            } else if (itinerary.tripDuration) {
                duration = parseDuration(itinerary.tripDuration);
            } else if (itinerary.days) {
                duration = parseDuration(itinerary.days);
            } else if (itinerary.startDate && itinerary.endDate) {
                duration = calculateDuration(itinerary);
            }

            if (duration && duration > 0) {
                if (duration <= 2) {
                    stats.tripDurationCounts['1-2 days']++;
                } else if (duration <= 4) {
                    stats.tripDurationCounts['3-4 days']++;
                } else if (duration <= 7) {
                    stats.tripDurationCounts['5-7 days']++;
                } else if (duration <= 14) {
                    stats.tripDurationCounts['8-14 days']++;
                } else {
                    stats.tripDurationCounts['15+ days']++;
                }
            }
        });

        console.log(`✅ Preloaded itineraries: ${stats.totalItineraries}`);

        // 2. FETCH BOOKINGS FROM ALL USERS (✅ UPDATED FOR SINGLE DOCUMENTS)
        console.log('👥 Fetching bookings from all users...');
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);

        let flightCount = 0;
        let hotelCount = 0;
        let packageCount = 0;
        let itineraryBookingCount = 0;
        let aiItineraryCount = 0;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userBookingsRef = collection(db, 'users', userId, 'bookings');
            const bookingsSnapshot = await getDocs(userBookingsRef);

            for (const bookingDoc of bookingsSnapshot.docs) {
                const booking = bookingDoc.data();
                const bookingType = booking.bookingType;
                const status = booking.status;
                const createdAt = booking.createdAt;

                let bookingDate = null;
                if (createdAt && createdAt.toDate) {
                    bookingDate = createdAt.toDate();
                }

                // HANDLE ITINERARY BOOKINGS (SINGLE DOCUMENT)
                if (bookingType === 'itinerary' && status === 'confirmed') {
                    const isAIGenerated = booking.isAIGenerated === true || booking.source === 'ai-generated';

                    // AI-Generated Itineraries
                    if (isAIGenerated) {
                        if (bookingDate && bookingDate >= startDate && bookingDate <= now) {
                            aiItineraryCount++;
                            const dest = booking.itineraryCity || booking.city || 'Unknown';
                            stats.destinationCounts[dest] = (stats.destinationCounts[dest] || 0) + 1;
                        }
                    }
                    // Paid Itinerary Bookings
                    else {
                        const totalPrice = booking.totalPrice || 0;

                        // Current period
                        if (bookingDate && bookingDate >= startDate && bookingDate <= now) {
                            itineraryBookingCount++;
                            stats.totalBookings++;
                            stats.totalRevenue += totalPrice;

                            const dateKey = bookingDate.toISOString().split('T')[0];
                            stats.bookingsOverTime[dateKey] = (stats.bookingsOverTime[dateKey] || 0) + 1;
                            stats.revenueOverTime[dateKey] = (stats.revenueOverTime[dateKey] || 0) + totalPrice;

                            const dest = booking.itineraryCity || booking.city || 'Unknown';
                            stats.destinationCounts[dest] = (stats.destinationCounts[dest] || 0) + 1;

                            // Duration tracking
                            let duration = null;
                            if (booking.itineraryDuration) {
                                duration = parseDuration(booking.itineraryDuration);
                            } else if (booking.duration) {
                                duration = parseDuration(booking.duration);
                            } else if (booking.days) {
                                duration = parseDuration(booking.days);
                            }

                            if (duration && duration > 0) {
                                if (duration <= 2) {
                                    stats.tripDurationCounts['1-2 days']++;
                                } else if (duration <= 4) {
                                    stats.tripDurationCounts['3-4 days']++;
                                } else if (duration <= 7) {
                                    stats.tripDurationCounts['5-7 days']++;
                                } else if (duration <= 14) {
                                    stats.tripDurationCounts['8-14 days']++;
                                } else {
                                    stats.tripDurationCounts['15+ days']++;
                                }
                            }
                        }

                        // Previous period
                        if (bookingDate && bookingDate >= previousStartDate && bookingDate < previousEndDate) {
                            previousStats.totalBookings++;
                            previousStats.totalRevenue += totalPrice;
                        }
                    }
                }

                // HANDLE PACKAGE BOOKINGS
                else if (bookingType === 'package' && status === 'confirmed') {
                    const serviceCharge = booking.serviceCharge || booking.pricing?.serviceCharge || 0;

                    // Current period
                    if (bookingDate && bookingDate >= startDate && bookingDate <= now) {
                        packageCount++;
                        stats.totalBookings++;
                        stats.totalRevenue += serviceCharge;

                        const dateKey = bookingDate.toISOString().split('T')[0];
                        stats.bookingsOverTime[dateKey] = (stats.bookingsOverTime[dateKey] || 0) + 1;
                        stats.revenueOverTime[dateKey] = (stats.revenueOverTime[dateKey] || 0) + serviceCharge;

                        const dest = booking.packageSummary?.destination || 'Unknown';
                        stats.destinationCounts[dest] = (stats.destinationCounts[dest] || 0) + 1;

                        const nights = booking.packageSummary?.nights;
                        if (nights && nights > 0) {
                            if (nights <= 2) {
                                stats.tripDurationCounts['1-2 days']++;
                            } else if (nights <= 4) {
                                stats.tripDurationCounts['3-4 days']++;
                            } else if (nights <= 7) {
                                stats.tripDurationCounts['5-7 days']++;
                            } else if (nights <= 14) {
                                stats.tripDurationCounts['8-14 days']++;
                            } else {
                                stats.tripDurationCounts['15+ days']++;
                            }
                        }
                    }

                    // Previous period
                    if (bookingDate && bookingDate >= previousStartDate && bookingDate < previousEndDate) {
                        previousStats.totalBookings++;
                        previousStats.totalRevenue += serviceCharge;
                    }
                }

                // HANDLE FLIGHT BOOKINGS
                else if (bookingType === 'flight' && status === 'confirmed') {
                    const serviceCharge = booking.serviceCharge || booking.pricing?.serviceCharge || 0;

                    // Current period
                    if (bookingDate && bookingDate >= startDate && bookingDate <= now) {
                        flightCount++;
                        stats.totalBookings++;
                        stats.totalRevenue += serviceCharge;

                        const dateKey = bookingDate.toISOString().split('T')[0];
                        stats.bookingsOverTime[dateKey] = (stats.bookingsOverTime[dateKey] || 0) + 1;
                        stats.revenueOverTime[dateKey] = (stats.revenueOverTime[dateKey] || 0) + serviceCharge;

                        const airportCode = booking.flightDetails?.outbound?.toAirport || "Unknown";
                        const dest = getAirportCity(airportCode);
                        stats.destinationCounts[dest] = (stats.destinationCounts[dest] || 0) + 1;
                    }

                    // Previous period (if you track it)
                    if (bookingDate && bookingDate >= previousStartDate && bookingDate < startDate) {
                        previousStats.totalBookings++;
                        previousStats.totalRevenue += serviceCharge;
                    }
                }

                // HANDLE HOTEL BOOKINGS
                else if (bookingType === 'hotel' && status === 'confirmed') {
                    const serviceCharge = booking.serviceCharge || booking.pricing?.serviceCharge || 0;

                    // Current period
                    if (bookingDate && bookingDate >= startDate && bookingDate <= now) {
                        hotelCount++;
                        stats.totalBookings++;
                        stats.totalRevenue += serviceCharge;

                        const dateKey = bookingDate.toISOString().split('T')[0];
                        stats.bookingsOverTime[dateKey] = (stats.bookingsOverTime[dateKey] || 0) + 1;
                        stats.revenueOverTime[dateKey] = (stats.revenueOverTime[dateKey] || 0) + serviceCharge;

                        const dest = booking.hotelLocation || 'Unknown';
                        stats.destinationCounts[dest] = (stats.destinationCounts[dest] || 0) + 1;

                        const nights = booking.nights;
                        if (nights && nights > 0) {
                            if (nights <= 2) {
                                stats.tripDurationCounts['1-2 days']++;
                            } else if (nights <= 4) {
                                stats.tripDurationCounts['3-4 days']++;
                            } else if (nights <= 7) {
                                stats.tripDurationCounts['5-7 days']++;
                            } else if (nights <= 14) {
                                stats.tripDurationCounts['8-14 days']++;
                            } else {
                                stats.tripDurationCounts['15+ days']++;
                            }
                        }
                    }

                    // Previous period
                    if (bookingDate && bookingDate >= previousStartDate && bookingDate < previousEndDate) {
                        previousStats.totalBookings++;
                        previousStats.totalRevenue += serviceCharge;
                    }
                }
            }
        }

        // Update source counts
        stats.sourceCounts['AI-Generated Itineraries'] = aiItineraryCount;
        stats.sourceCounts['Paid Itinerary Bookings'] = itineraryBookingCount;
        stats.sourceCounts['Package Bookings'] = packageCount;
        stats.sourceCounts['Flight Bookings'] = flightCount;
        stats.sourceCounts['Hotel Bookings'] = hotelCount;

        // Calculate average booking value per day
        Object.keys(stats.revenueOverTime).forEach(dateKey => {
            const revenue = stats.revenueOverTime[dateKey];
            const bookings = stats.bookingsOverTime[dateKey] || 1;
            stats.avgBookingValueOverTime[dateKey] = revenue / bookings;
        });

        // Get top destination
        if (Object.keys(stats.destinationCounts).length > 0) {
            const topDest = Object.entries(stats.destinationCounts)
                .sort((a, b) => b[1] - a[1])[0];
            stats.topDestination = topDest[0];
        } else {
            stats.topDestination = 'N/A';
        }

        // Calculate growth percentages
        stats.bookingsGrowth = calculateGrowth(previousStats.totalBookings, stats.totalBookings);
        stats.revenueGrowth = calculateGrowth(previousStats.totalRevenue, stats.totalRevenue);

        console.log('📊 SUMMARY:');
        console.log(`Current Period - Bookings: ${stats.totalBookings}, Revenue: RM${stats.totalRevenue.toLocaleString()}`);
        console.log(`Previous Period - Bookings: ${previousStats.totalBookings}, Revenue: RM${previousStats.totalRevenue.toLocaleString()}`);
        console.log(`Growth - Bookings: ${stats.bookingsGrowth}%, Revenue: ${stats.revenueGrowth}%`);
        console.log(`AI Itineraries: ${aiItineraryCount}, Paid Itineraries: ${itineraryBookingCount}, Packages: ${packageCount}`);

        currentStats = stats;
        updateDashboardUI(stats);

    } catch (error) {
        console.error('Error fetching business stats:', error);
        showToast(`Error loading stats: ${error.message}`, true);

        loadingCards.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'Error';
        });
    }
}

// ===== UPDATE UI =====
function updateDashboardUI(stats) {
    console.log(`\n📈 Updating UI...`);

    const totalItineraries = stats.totalItineraries ?? 0;
    const totalBookings = stats.totalBookings ?? 0;
    const totalRevenue = stats.totalRevenue ?? 0;
    const topDestination = stats.topDestination || 'N/A';

    safeSetText('totalItinerariesCount', totalItineraries);
    safeSetText('totalBookingsCount', totalBookings);

    // Format revenue in K format (e.g., 212.4K)
    safeSetText('totalRevenueCount', `RM ${formatRevenue(totalRevenue)}`);

    safeSetText('topDestinationName', topDestination);

    // Update growth indicators
    updateGrowthIndicator('bookingsGrowth', stats.bookingsGrowth);
    updateGrowthIndicator('revenueGrowth', stats.revenueGrowth);

    console.log(`✅ UI Updated!`);
    renderAllCharts(stats);
}

// Helper function to update growth indicators
function updateGrowthIndicator(elementId, growthPercentage) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const absGrowth = Math.abs(growthPercentage);
    let icon = '';
    let className = '';

    if (growthPercentage > 0) {
        icon = '↑';
        className = 'positive';
    } else if (growthPercentage < 0) {
        icon = '↓';
        className = 'negative';
    } else {
        icon = '→';
        className = 'neutral';
    }

    el.textContent = `${icon} ${absGrowth}%`;
    el.className = `stat-growth ${className}`;
}

// ===== RENDER CHARTS =====
function renderAllCharts(stats) {
    console.log(`\n🎨 Rendering charts for ${currentPeriod}...`);

    const now = new Date();
    let days = currentPeriod === 'week' ? 7 : (currentPeriod === 'month' ? 30 : 365);
    let startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    console.log(`📅 Period: ${currentPeriod}, Days: ${days}`);

    // 1. Revenue Over Time (Line Chart)
    const revenuePeriodData = {};
    Object.keys(stats.revenueOverTime).forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        if (date >= startDate && date <= now) {
            revenuePeriodData[dateStr] = stats.revenueOverTime[dateStr];
        }
    });

    if (Object.keys(revenuePeriodData).length > 0) {
        const sortedLabels = Object.keys(revenuePeriodData).sort();
        const chartData = sortedLabels.map(label => revenuePeriodData[label]);
        const formattedLabels = sortedLabels.map(dateStr =>
            dateFns.format(new Date(dateStr + 'T00:00:00'), currentPeriod === 'year' ? 'MMM yyyy' : 'MMM dd')
        );

        renderRevenueChart('revenueChart', formattedLabels, chartData, `Revenue (RM)`);
    } else {
        renderEmptyChart('revenueChart', `No revenue in this ${currentPeriod}`, 'revenueChart');
    }

    // 2. Average Booking Value (Line Chart)
    const avgValuePeriodData = {};
    Object.keys(stats.avgBookingValueOverTime).forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        if (date >= startDate && date <= now) {
            avgValuePeriodData[dateStr] = stats.avgBookingValueOverTime[dateStr];
        }
    });

    if (Object.keys(avgValuePeriodData).length > 0) {
        const sortedLabels = Object.keys(avgValuePeriodData).sort();
        const chartData = sortedLabels.map(label => avgValuePeriodData[label]);
        const formattedLabels = sortedLabels.map(dateStr =>
            dateFns.format(new Date(dateStr + 'T00:00:00'), currentPeriod === 'year' ? 'MMM yyyy' : 'MMM dd')
        );

        renderLineChart('avgBookingValueChart', formattedLabels, chartData, 'Avg Value (RM)',
            'rgba(147, 51, 234, 0.1)', 'rgba(147, 51, 234, 1)');
    } else {
        renderEmptyChart('avgBookingValueChart', `No data for ${currentPeriod}`, 'avgBookingValueChart');
    }

    // 3. Top Destinations (Bar Chart)
    if (stats.destinationCounts && Object.keys(stats.destinationCounts).length > 0) {
        const sorted = Object.entries(stats.destinationCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const labels = sorted.map(([dest]) => dest);
        const data = sorted.map(([, count]) => count);

        renderBarChart('destinationsChart', labels, data, 'Visits',
            'rgba(61, 155, 243, 0.6)', 'rgba(61, 155, 243, 1)');
    }

    // 4. Trip Duration Distribution (Bar Chart)
    if (stats.tripDurationCounts) {
        const labels = Object.keys(stats.tripDurationCounts);
        const data = Object.values(stats.tripDurationCounts);

        renderBarChart('tripDurationChart', labels, data, 'Trips',
            'rgba(243, 156, 18, 0.6)', 'rgba(243, 156, 18, 1)');
    }

    // 5. Booking Distribution (Doughnut Chart)
    if (stats.sourceCounts) {
        const labels = [];
        const data = [];

        Object.entries(stats.sourceCounts).forEach(([key, value]) => {
            if (value > 0) {
                labels.push(key);
                data.push(value);
            }
        });

        if (data.length > 0) {
            renderDoughnutChart('themesChart', labels, data);
        }
    }

    // 6. Bookings Trend Over Time (Line Chart)
    const bookingsPeriodData = {};
    Object.keys(stats.bookingsOverTime).forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        if (date >= startDate && date <= now) {
            bookingsPeriodData[dateStr] = stats.bookingsOverTime[dateStr];
        }
    });

    if (Object.keys(bookingsPeriodData).length > 0) {
        const sortedLabels = Object.keys(bookingsPeriodData).sort();
        const chartData = sortedLabels.map(label => bookingsPeriodData[label]);
        const formattedLabels = sortedLabels.map(dateStr =>
            dateFns.format(new Date(dateStr + 'T00:00:00'), currentPeriod === 'year' ? 'MMM yyyy' : 'MMM dd')
        );

        renderLineChart('bookingsChart', formattedLabels, chartData, `Bookings`,
            'rgba(39, 174, 96, 0.1)', 'rgba(39, 174, 96, 1)');
    } else {
        renderEmptyChart('bookingsChart', `No bookings in this ${currentPeriod}`, 'bookingsChart');
    }
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

// ===== CHART RENDERING =====
function renderRevenueChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(39, 174, 96, 0.3)');
    gradient.addColorStop(1, 'rgba(39, 174, 96, 0.05)');

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                fill: true,
                backgroundColor: gradient,
                borderColor: 'rgba(39, 174, 96, 1)',
                tension: 0.4,
                borderWidth: 3,
                pointRadius: 5,
                pointBackgroundColor: 'rgba(39, 174, 96, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += 'RM ' + context.parsed.y.toLocaleString('en-MY', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                });
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return 'RM ' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function renderLineChart(canvasId, labels, data, label, bgColor = 'rgba(61, 155, 243, 0.1)', borderColor = 'rgba(61, 155, 243, 1)') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destroy existing chart instance
    if (canvasId === 'bookingsChart' && bookingsChartInstance) {
        bookingsChartInstance.destroy();
    } else if (canvasId === 'avgBookingValueChart' && avgBookingValueChartInstance) {
        avgBookingValueChartInstance.destroy();
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                fill: true,
                backgroundColor: bgColor,
                borderColor: borderColor,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: borderColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                // Only show RM for Average Booking Value
                                if (canvasId === 'avgBookingValueChart') {
                                    label += 'RM ' + context.parsed.y.toLocaleString('en-MY', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    });
                                } else {
                                    // For Booking Trends, just show the count
                                    label += context.parsed.y.toLocaleString();
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        callback: function (value) {
                            // Only show RM for Average Booking Value
                            if (canvasId === 'avgBookingValueChart') {
                                return 'RM ' + value.toLocaleString();
                            } else {
                                // For Booking Trends, just show the count
                                return value.toLocaleString();
                            }
                        }
                    }
                }
            }
        }
    });

    if (canvasId === 'bookingsChart') {
        bookingsChartInstance = chart;
    } else if (canvasId === 'avgBookingValueChart') {
        avgBookingValueChartInstance = chart;
    }
}

function renderBarChart(canvasId, labels, data, label, bgColor = 'rgba(147, 51, 234, 0.6)', borderColor = 'rgba(147, 51, 234, 1)') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destroy existing chart instance
    if (canvasId === 'destinationsChart' && destinationsChartInstance) {
        destinationsChartInstance.destroy();
    } else if (canvasId === 'tripDurationChart' && tripDurationChartInstance) {
        tripDurationChartInstance.destroy();
    }

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: bgColor,
                borderColor: borderColor,
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
                    ticks: { precision: 0 }
                }
            }
        }
    });

    if (canvasId === 'destinationsChart') {
        destinationsChartInstance = chart;
    } else if (canvasId === 'tripDurationChart') {
        tripDurationChartInstance = chart;
    }
}

function renderDoughnutChart(canvasId, labels, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (themesChartInstance) {
        themesChartInstance.destroy();
    }

    const colors = [
        'rgba(61, 155, 243, 0.8)',
        'rgba(147, 51, 234, 0.8)',
        'rgba(243, 156, 18, 0.8)',
        'rgba(39, 174, 96, 0.8)',
        'rgba(231, 76, 60, 0.8)',
        'rgba(52, 152, 219, 0.8)'
    ];

    themesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function renderEmptyChart(canvasId, message, chartType = 'revenueChart') {
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

    // Destroy existing instance
    if (chartType === 'revenueChart' && revenueChartInstance) {
        revenueChartInstance.destroy();
    } else if (chartType === 'bookingsChart' && bookingsChartInstance) {
        bookingsChartInstance.destroy();
    } else if (chartType === 'avgBookingValueChart' && avgBookingValueChartInstance) {
        avgBookingValueChartInstance.destroy();
    }

    const chart = new Chart(ctx, {
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

    if (chartType === 'revenueChart') {
        revenueChartInstance = chart;
    } else if (chartType === 'bookingsChart') {
        bookingsChartInstance = chart;
    } else if (chartType === 'avgBookingValueChart') {
        avgBookingValueChartInstance = chart;
    }
}

// ===== EXPORT PDF (FIXED - NO EMOJIS) =====
function exportToPDF() {
    showToast("Generating PDF report...", false);

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();

        const stats = currentStats || {};

        // ===== HEADER =====
        pdf.setFontSize(22);
        pdf.setTextColor(61, 155, 243);
        pdf.text('Travel.Co Business Reports', 20, 20);

        // Period and Date
        pdf.setFontSize(11);
        pdf.setTextColor(100, 100, 100);
        const periodText = currentPeriod.charAt(0).toUpperCase() + currentPeriod.slice(1);
        pdf.text(`Report Period: ${periodText}`, 20, 30);
        pdf.text(`Generated: ${new Date().toLocaleDateString('en-MY')} at ${new Date().toLocaleTimeString('en-MY')}`, 20, 36);

        // Separator line
        pdf.setDrawColor(61, 155, 243);
        pdf.setLineWidth(0.5);
        pdf.line(20, 40, 190, 40);

        // ===== BUSINESS OVERVIEW SECTION =====
        let yPos = 50;
        pdf.setFontSize(16);
        pdf.setTextColor(61, 155, 243);
        pdf.text('Business Overview', 20, yPos);

        yPos += 8;
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);

        // Itineraries
        pdf.setFont(undefined, 'normal');
        pdf.text('AI Itineraries Generated:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${stats.totalItineraries || 0}`, 95, yPos);

        // Bookings with growth
        yPos += 7;
        pdf.setFont(undefined, 'normal');
        pdf.text('Confirmed Bookings:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${stats.totalBookings || 0}`, 95, yPos);

        // Growth indicator
        if (stats.bookingsGrowth !== undefined) {
            const growthText = stats.bookingsGrowth >= 0 ? `+${stats.bookingsGrowth}%` : `${stats.bookingsGrowth}%`;
            pdf.setTextColor(stats.bookingsGrowth >= 0 ? 39 : 231, stats.bookingsGrowth >= 0 ? 174 : 76, stats.bookingsGrowth >= 0 ? 96 : 60);
            pdf.setFontSize(9);
            pdf.text(growthText, 115, yPos);
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(10);
        }

        // Revenue with growth
        yPos += 7;
        pdf.setFont(undefined, 'normal');
        pdf.text('Total Revenue:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.text(`RM ${(stats.totalRevenue || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 95, yPos);

        // Growth indicator
        if (stats.revenueGrowth !== undefined) {
            const growthText = stats.revenueGrowth >= 0 ? `+${stats.revenueGrowth}%` : `${stats.revenueGrowth}%`;
            pdf.setTextColor(stats.revenueGrowth >= 0 ? 39 : 231, stats.revenueGrowth >= 0 ? 174 : 76, stats.revenueGrowth >= 0 ? 96 : 60);
            pdf.setFontSize(9);
            pdf.text(growthText, 145, yPos);
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(10);
        }

        // Top Destination
        yPos += 7;
        pdf.setFont(undefined, 'normal');
        pdf.text('Top Destination:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${stats.topDestination || 'N/A'}`, 95, yPos);

        // ===== BOOKING DISTRIBUTION SECTION =====
        yPos += 12;
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(220, 220, 220);
        pdf.line(20, yPos, 190, yPos);

        yPos += 8;
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(16);
        pdf.setTextColor(61, 155, 243);
        pdf.text('Booking Distribution', 20, yPos);

        yPos += 8;
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);

        if (stats.sourceCounts) {
            Object.entries(stats.sourceCounts).forEach(([type, count]) => {
                if (count > 0) {
                    pdf.setFont(undefined, 'normal');
                    pdf.text(`${type}:`, 25, yPos);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${count}`, 95, yPos);

                    // Calculate percentage
                    const total = Object.values(stats.sourceCounts).reduce((sum, val) => sum + val, 0);
                    const percentage = ((count / total) * 100).toFixed(1);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(100, 100, 100);
                    pdf.setFontSize(9);
                    pdf.text(`(${percentage}%)`, 110, yPos);
                    pdf.setTextColor(0, 0, 0);
                    pdf.setFontSize(10);

                    yPos += 7;
                }
            });
        }

        // ===== TOP DESTINATIONS SECTION =====
        yPos += 5;
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(220, 220, 220);
        pdf.line(20, yPos, 190, yPos);

        yPos += 8;
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(16);
        pdf.setTextColor(61, 155, 243);
        pdf.text('Top 10 Destinations', 20, yPos);

        yPos += 8;
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);

        if (stats.destinationCounts && Object.keys(stats.destinationCounts).length > 0) {
            const topDests = Object.entries(stats.destinationCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            topDests.forEach(([dest, count], index) => {
                pdf.setFont(undefined, 'normal');
                pdf.text(`${index + 1}. ${dest}:`, 25, yPos);
                pdf.setFont(undefined, 'bold');
                pdf.text(`${count}`, 95, yPos);

                // Calculate percentage
                const total = Object.values(stats.destinationCounts).reduce((sum, val) => sum + val, 0);
                const percentage = ((count / total) * 100).toFixed(1);
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(100, 100, 100);
                pdf.setFontSize(9);
                pdf.text(`(${percentage}%)`, 110, yPos);
                pdf.setTextColor(0, 0, 0);
                pdf.setFontSize(10);

                yPos += 7;
            });
        }

        // ===== REVENUE SUMMARY =====
        yPos += 5;
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(220, 220, 220);
        pdf.line(20, yPos, 190, yPos);

        yPos += 8;
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(16);
        pdf.setTextColor(61, 155, 243);
        pdf.text('Revenue Insights', 20, yPos);

        yPos += 8;
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);

        // Average revenue per booking
        const avgRevenue = stats.totalBookings > 0 ? stats.totalRevenue / stats.totalBookings : 0;
        pdf.setFont(undefined, 'normal');
        pdf.text('Average Revenue per Booking:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.text(`RM ${avgRevenue.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 95, yPos);

        yPos += 7;
        pdf.setFont(undefined, 'normal');
        pdf.text('Total Bookings:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${stats.totalBookings || 0}`, 95, yPos);

        yPos += 7;
        pdf.setFont(undefined, 'normal');
        pdf.text('Total Revenue:', 25, yPos);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(39, 174, 96);
        pdf.text(`RM ${(stats.totalRevenue || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 95, yPos);
        pdf.setTextColor(0, 0, 0);

        // ===== FOOTER =====
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(220, 220, 220);
        pdf.line(20, 275, 190, 275);

        pdf.setFontSize(8);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(128, 128, 128);
        pdf.text('Travel.Co Admin Dashboard - Confidential Business Report', 20, 282);
        pdf.text('This document contains proprietary information', 20, 287);
        pdf.text(`Page 1 of 1`, 175, 282);

        // ===== SAVE PDF =====
        const fileName = `TravelCo_Report_${periodText}_${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(fileName);

        showToast("PDF report downloaded successfully!", false);

    } catch (error) {
        console.error("Error generating PDF:", error);
        showToast("Error generating PDF report", true);
    }
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
                    currentUserRole = userData.role;

                    if (currentUserRole === 'admin' || currentUserRole === 'superadmin') {
                        updateHeaderUI(userData);
                        updateNavigationUI(currentUserRole);
                        fetchBusinessStats(currentPeriod);
                    } else {
                        showToast("You do not have permission to view this page.", true);
                        setTimeout(() => {
                            window.location.href = 'home.html';
                        }, 2000);
                    }
                } else {
                    showToast("Error: Your profile data not found.", true);
                    await handleLogout();
                }
            } catch (error) {
                console.error("❌ Error fetching user data:", error);
                showToast("An error occurred while loading your profile.", true);
                await handleLogout();
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Business Reports Dashboard loaded");

    const profileTrigger = document.getElementById('profileTrigger');
    const logoutButton = document.getElementById('logoutButton');
    const profileDropdown = document.getElementById('profileDropdown');
    const filterBar = document.getElementById('time-filter');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportToPDF);
    }

    if (filterBar) {
        filterBar.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.classList.contains('filter-btn')) {
                filterBar.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');

                const newPeriod = e.target.dataset.period;
                if (newPeriod !== currentPeriod) {
                    currentPeriod = newPeriod;
                    fetchBusinessStats(currentPeriod);
                }
            }
        });
    }

    if (profileTrigger) profileTrigger.addEventListener('click', toggleDropdown);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);

    document.addEventListener('click', (event) => {
        if (profileDropdown && !profileDropdown.contains(event.target) &&
            event.target !== profileTrigger && !profileTrigger.contains(event.target)) {
            profileDropdown.classList.remove('active');
        }
    });

    observeAuthState();
});
