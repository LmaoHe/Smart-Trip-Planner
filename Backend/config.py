# Backend/config.py
import os
from dotenv import load_dotenv

# Load variables from .env file (e.g., backend/.env)
load_dotenv()

class Config:
    # 1. Read API keys from environment variables
    AMADEUS_API_KEY = os.getenv('AMADEUS_API_KEY')
    AMADEUS_API_SECRET = os.getenv('AMADEUS_API_SECRET')
    
    # 2. Set the Base URL directly to the Amadeus test environment
    AMADEUS_BASE_URL = 'https://test.api.amadeus.com'