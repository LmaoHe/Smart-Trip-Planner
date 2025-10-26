# Backend/config.py (PYTHON format)

class Config:
    # Get these from https://developers.amadeus.com/
    AMADEUS_API_KEY = 'J0FDvAuZaT6oHPGL0g21ZiQFMHmJdEbZ'
    AMADEUS_API_SECRET = 'kbyT45Gl7FFGTKAq'
    
    # Test vs Production
    ENVIRONMENT = 'test'  # Use 'test' for development, 'production' for live
    
    # API Endpoints
    AMADEUS_BASE_URL = 'https://test.api.amadeus.com'  # or https://api.amadeus.com for production
    
    @staticmethod
    def validate():
        if Config.AMADEUS_API_KEY == 'YOUR_AMADEUS_API_KEY_HERE':
            raise ValueError("⚠️ Please add your Amadeus API key in config.py!")
