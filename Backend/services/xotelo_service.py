# Backend/services/xotelo_service.py
import requests


class XoteloService:
    def __init__(self):
        self.base_url = "https://data.xotelo.com/api"
        print(f"✓ Xotelo Service initialized")
    
    # Expanded city to location_key mapping
    CITY_TO_LOCATION = {
        # ===== ASIA =====
        # Malaysia
        'kuala lumpur': 'g298570',
        'penang': 'g298303',
        'melaka': 'g306997',
        'johor bahru': 'g298304',
        'kota kinabalu': 'g298307',
        'ipoh': 'g298305',
        'langkawi': 'g298283',
        
        # Singapore
        'singapore': 'g294265',
        
        # Thailand
        'bangkok': 'g293916',
        'phuket': 'g293920',
        'chiang mai': 'g293917',
        'krabi': 'g297927',
        
        # Indonesia
        'bali': 'g294226',
        'jakarta': 'g294229',
        'yogyakarta': 'g294230',
        
        # Japan
        'tokyo': 'g298564',
        'kyoto': 'g298564',  
        'osaka': 'g298566',
        'hiroshima': 'g298561',
        
        # South Korea
        'seoul': 'g294197',
        'busan': 'g297884',
        'jeju island': 'g983296',
        
        # Vietnam
        'hanoi': 'g293924',
        'ho chi minh city': 'g293925',
        'da nang': 'g469418',
        
        # Cambodia
        'siem reap': 'g297390',
        
        # ===== EUROPE =====
        # France
        'paris': 'g187147',
        'lyon': 'g187265',
        'nice': 'g187234',
        'marseille': 'g187253',
        
        # Italy
        'rome': 'g187791',
        'venice': 'g187870',
        'florence': 'g187895',
        'milan': 'g187849',
        'naples': 'g187785',
        
        # Spain
        'barcelona': 'g187497',
        'madrid': 'g187514',
        'seville': 'g187443',
        'valencia': 'g187529',
        
        # United Kingdom
        'london': 'g186338',
        'edinburgh': 'g186525',
        'liverpool': 'g186337',
        
        # Germany
        'berlin': 'g187323',
        'munich': 'g187309',
        'frankfurt': 'g187337',
        
        # Netherlands
        'amsterdam': 'g188590',
        'rotterdam': 'g188632',
        
        # Switzerland
        'zurich': 'g188113',
        'geneva': 'g188057',
        'interlaken': 'g188098',
        
        # Greece
        'athens': 'g189400',
        'santorini': 'g189433',
        'mykonos': 'g189433',
        
        # Portugal
        'lisbon': 'g189158',
        'porto': 'g189180',
        
        # Czech Republic
        'prague': 'g274707',
        
        # ===== AMERICAS =====
        # USA
        'new york': 'g60763',
        'los angeles': 'g32655',
        'san francisco': 'g60713',
        'miami': 'g34438',
        'las vegas': 'g45963',
        'orlando': 'g34515',
        
        # Canada
        'toronto': 'g155019',
        'vancouver': 'g154943',
        'montreal': 'g155032',
        
        # Brazil
        'sao paulo': 'g303631',
        'rio de janeiro': 'g303506',
        'brasilia': 'g303322',
        
        # Mexico
        'mexico city': 'g150800',
        'cancun': 'g150807',
        'guadalajara': 'g150798',
        'cabo': 'g152516',
        'playa del carmen': 'g150812',
        
        # Peru
        'cusco': 'g294314',
        'lima': 'g294316',
        
        # Argentina
        'buenos aires': 'g312741',
        
        # ===== MIDDLE EAST & AFRICA =====
        # UAE
        'dubai': 'g295424',
        'abu dhabi': 'g294013',
        
        # Turkey
        'istanbul': 'g293974',
        'cappadocia': 'g297981',
        
        # Egypt
        'cairo': 'g294201',
        'luxor': 'g294205',
        'sharm el sheikh': 'g297555',
        
        # Morocco
        'marrakech': 'g293734',
        'casablanca': 'g293732',
        
        # South Africa
        'cape town': 'g312659',
        
        # ===== OCEANIA =====
        # Australia
        'sydney': 'g255060',
        'melbourne': 'g255100',
        'gold coast': 'g255337',
        
        # New Zealand
        'auckland': 'g255106',
        'queenstown': 'g255122',
    }
    
    def get_location_key(self, city_name):
        """Get Xotelo location key for supported cities"""
        city_lower = city_name.lower().strip()
        location_key = self.CITY_TO_LOCATION.get(city_lower)
        
        if not location_key:
            supported = len(self.CITY_TO_LOCATION)
            available = ', '.join(sorted(list(self.CITY_TO_LOCATION.keys())[:10])) + f'... ({supported} total)'
            raise Exception(f"City '{city_name}' not supported by Xotelo. {supported} cities available.")
        
        print(f"✓ Xotelo location key for {city_name}: {location_key}")
        return location_key
    
    def is_city_supported(self, city_name):
        """Check if city is supported by Xotelo"""
        return city_name.lower().strip() in self.CITY_TO_LOCATION
    
    def get_hotels(self, city_name, check_in=None, check_out=None, adults=2, rooms=1):
        """Get hotels for a city using Xotelo API"""
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
                raise Exception(f"Xotelo API failed: {response.status_code}")
            
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
            return {'data': formatted_hotels, 'source': 'xotelo'}
            
        except Exception as e:
            print(f"✗ Error: {str(e)}")
            raise


xotelo_service = XoteloService()
