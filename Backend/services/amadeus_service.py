# Backend/services/amadeus_service.py
import requests
from datetime import datetime, timedelta
from flask import current_app

class AmadeusService:
    def __init__(self):
        self.api_key = None
        self.api_secret = None
        self.base_url = None
        self.token = None
        self.token_expiry = None
    
    def initialize(self, api_key, api_secret, base_url):
        """Initialize with API credentials"""
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url
    
    def get_access_token(self):
        """Get OAuth token from Amadeus"""
        if self.token and self.token_expiry and datetime.now() < self.token_expiry:
            return self.token
        
        try:
            response = requests.post(
                f"{self.base_url}/v1/security/oauth2/token",
                data={
                    'grant_type': 'client_credentials',
                    'client_id': self.api_key,
                    'client_secret': self.api_secret
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            response.raise_for_status()
            data = response.json()
            
            self.token = data['access_token']
            self.token_expiry = datetime.now() + timedelta(seconds=1700)
            return self.token
        except Exception as e:
            current_app.logger.error(f"Auth error: {str(e)}")
            raise Exception("Failed to authenticate with Amadeus")
    
    def get_city_code(self, city_name):
        """Convert city name to IATA code (e.g., 'Kuala Lumpur' -> 'KUL')"""
        try:
            token = self.get_access_token()
            response = requests.get(
                f"{self.base_url}/v1/reference-data/locations",
                params={'subType': 'CITY', 'keyword': city_name},
                headers={'Authorization': f'Bearer {token}'}
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get('data') and len(data['data']) > 0:
                return data['data'][0]['iataCode']
            return None
        except Exception as e:
            current_app.logger.error(f"City code error: {str(e)}")
            return None
    
    def search_hotels_by_city(self, city_name, check_in, check_out, adults=2, rooms=1):
        """Search hotels by city name (all-in-one method)"""
        try:
            # Step 1: Get city code
            city_code = self.get_city_code(city_name)
            if not city_code:
                raise Exception(f"City not found: {city_name}")
            
            # Step 2: Search hotels
            token = self.get_access_token()
            params = {
                'cityCode': city_code,
                'checkInDate': check_in,
                'checkOutDate': check_out,
                'adults': adults,
                'roomQuantity': rooms,
                'currency': 'MYR'
            }
            
            response = requests.get(
                f"{self.base_url}/v3/shopping/hotel-offers",
                params=params,
                headers={'Authorization': f'Bearer {token}'}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            current_app.logger.error(f"Hotel search error: {str(e)}")
            raise Exception(f"Failed to search hotels: {str(e)}")


def search_flights(self, origin, destination, departure_date, adults=1, return_date=None, currency='MYR'):
    """Search for flight offers"""
    try:
        token = self.get_access_token()
        
        params = {
            'originLocationCode': origin,
            'destinationLocationCode': destination,
            'departureDate': departure_date,
            'adults': adults,
            'currencyCode': currency,
            'max': 50  # Limit results
        }
        
        if return_date:
            params['returnDate'] = return_date
        
        response = requests.get(
            f"{self.base_url}/v2/shopping/flight-offers",
            params=params,
            headers={'Authorization': f'Bearer {token}'}
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        current_app.logger.error(f"Flight search error: {str(e)}")
        raise Exception(f"Failed to search flights: {str(e)}")


# Create singleton instance
amadeus_service = AmadeusService()
