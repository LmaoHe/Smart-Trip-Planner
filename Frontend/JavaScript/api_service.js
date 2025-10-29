// api_service.js
class APIService {
    constructor() {
        this.baseURL = 'http://localhost:5000';
    }

    async searchHotels(cityName, checkInDate, checkOutDate, adults, rooms) {
        try {
            // FIXED: Add /api/ prefix
            const url = `${this.baseURL}/api/hotels/search`;
            
            console.log('Sending request to:', url);
            console.log('Data:', { cityName, checkInDate, checkOutDate, adults, rooms });

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cityName: cityName,
                    checkInDate: checkInDate,
                    checkOutDate: checkOutDate,
                    adults: adults,
                    roomQuantity: rooms
                })
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Search failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Hotel search error:', error);
            throw error;
        }
    }

    async searchFlights(origin, destination, departureDate, returnDate, travelers) {
        try {
            // FIXED: Add /api/ prefix
            const url = `${this.baseURL}/api/flights/search`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    origin,
                    destination,
                    departureDate,
                    returnDate,
                    adults: travelers
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Flight search failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Flight search error:', error);
            throw error;
        }
    }
}

export default new APIService();
