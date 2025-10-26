// Frontend/JavaScript/apiService.js
// This calls YOUR Flask backend (NOT Amadeus directly)

class APIService {
    constructor() {
        // Your Flask backend URL
        this.backendURL = 'http://localhost:5000/api';
    }

    // Search Hotels
    async searchHotels(cityName, checkInDate, checkOutDate, adults = 2, rooms = 1) {
        try {
            const response = await fetch(`${this.backendURL}/hotels/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cityName,
                    checkInDate,
                    checkOutDate,
                    adults,
                    rooms
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Search failed');
            }

            return await response.json();

        } catch (error) {
            console.error('Hotel search error:', error);
            throw error;
        }
    }

    // Health Check
    async checkHealth() {
        try {
            const response = await fetch(`${this.backendURL}/health`);
            return await response.json();
        } catch (error) {
            console.error('Backend health check failed:', error);
            return { status: 'ERROR' };
        }
    }
}

// Export single instance
const apiService = new APIService();
export default apiService;
