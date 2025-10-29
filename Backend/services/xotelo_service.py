# Backend/services/xotelo_service.py
import requests

class XoteloService:
    def __init__(self):
        self.base_url = "https://data.xotelo.com/api"
        print(f"✓ Xotelo Service initialized")
    
    # City to location_key mapping (verified working cities only)
    CITY_TO_LOCATION = {
        # Malaysia
        'kuala lumpur': 'g298570',
        'penang': 'g298303',
        'melaka': 'g306997',
        'johor bahru': 'g298304',
        'kota kinabalu': 'g298307',
        'ipoh': 'g298305',
        
        # France
        'paris': 'g187147',
        'lyon': 'g187265',
        'nice': 'g187234',
        'marseille': 'g187253',
        
        # USA
        'new york': 'g60763',
        'los angeles': 'g32655',
        'san francisco': 'g60713',
        'miami': 'g34438',
        'las vegas': 'g45963',
        
        # Brazil
        'sao paulo': 'g303631',
        'rio de janeiro': 'g303506',
        'brasilia': 'g303322',
        
        # Mexico
        'mexico city': 'g150800',
        'cancun': 'g150807',
        'guadalajara': 'g150798',
        'cabo': 'g152516',
    }
    
    def get_location_key(self, city_name):
        city_lower = city_name.lower().strip()
        location_key = self.CITY_TO_LOCATION.get(city_lower)
        
        if not location_key:
            available = ', '.join(sorted(self.CITY_TO_LOCATION.keys()))
            raise Exception(f"City '{city_name}' not supported. Available: {available}")
        
        print(f"✓ Location key for {city_name}: {location_key}")
        return location_key
    
    def get_hotels(self, city_name, check_in=None, check_out=None, adults=2, rooms=1):
        try:
            print(f"\n{'='*60}")
            print(f"🏨 Getting hotels for: {city_name}")
            print(f"{'='*60}\n")
            
            location_key = self.get_location_key(city_name)
            
            response = requests.get(
                f"{self.base_url}/list",
                params={
                    'location_key': location_key,
                    'limit': 50,
                    'sort': 'best_value'
                },
                timeout=15
            )
            
            if response.status_code != 200:
                raise Exception(f"API failed: {response.status_code}")
            
            data = response.json()
            if data.get('error'):
                raise Exception(data['error'])
            
            hotels = data.get('result', {}).get('list', [])
            if not hotels:
                raise Exception(f"No hotels found for {city_name}")
            
            print(f"✓ Found {len(hotels)} hotels")
            
            formatted_hotels = []
            for hotel in hotels:
                price_ranges = hotel.get('price_ranges', {})
                avg_price = 0
                if price_ranges:
                    min_p = price_ranges.get('minimum', 0)
                    max_p = price_ranges.get('maximum', 0)
                    avg_price = (min_p + max_p) / 2 if max_p > 0 else min_p
                
                formatted_hotels.append({
                    'hotel': {
                        'hotelId': hotel.get('key'),
                        'name': hotel.get('name'),
                        'rating': hotel.get('review_summary', {}).get('rating'),
                        'reviewCount': hotel.get('review_summary', {}).get('count', 0),
                        'image': hotel.get('image'),
                        'url': hotel.get('url'),
                        'address': {'cityName': city_name, 'countryCode': 'XX'},
                        'geo': hotel.get('geo', {}),
                        'mentions': hotel.get('mentions', []),
                        'accommodation_type': hotel.get('accommodation_type', 'Hotel')
                    },
                    'offers': [{
                        'id': f"OFFER_{hotel.get('key')}",
                        'price': {
                            'currency': 'USD',
                            'total': str(avg_price),
                            'base': str(avg_price)
                        }
                    }] if avg_price > 0 else []
                })
            
            print(f"✓ Formatted {len(formatted_hotels)} hotels\n")
            return {'data': formatted_hotels}
            
        except Exception as e:
            print(f"✗ Error: {str(e)}")
            raise

xotelo_service = XoteloService()
