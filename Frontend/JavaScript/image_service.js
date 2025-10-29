class ImageService {
    constructor() {
        this.pexelsKey = 'OV4tqB4rfP59GgqIMWLXJqJkzCXhL9ky8xgXLi9Wtq5fbgroDqxnrPpo'; // Add your Pexels key
        this.baseUrl = 'https://api.pexels.com/v1';
        this.cache = new Map();
    }

    async getHotelImage(cityName) {
        const cacheKey = cityName.toLowerCase();
        
        if (this.cache.has(cacheKey)) {
            const cachedImages = this.cache.get(cacheKey);
            const randomIndex = Math.floor(Math.random() * cachedImages.length);
            console.log(`Using cached random image for ${cityName}`);
            return cachedImages[randomIndex];
        }

        try {
            const query = `luxury hotel ${cityName}`;
            console.log(`Fetching Pexels images for: ${query}`);
            
            const response = await fetch(
                `${this.baseUrl}/search?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape`,
                {
                    headers: {
                        'Authorization': this.pexelsKey
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Pexels API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.photos && data.photos.length > 0) {
                const imageUrls = data.photos.map(photo => photo.src.large);
                this.cache.set(cacheKey, imageUrls);
                
                const randomIndex = Math.floor(Math.random() * imageUrls.length);
                console.log(`✓ Found ${imageUrls.length} Pexels images for ${cityName}`);
                
                return imageUrls[randomIndex];
            } else {
                console.warn(`No Pexels images found for ${cityName}`);
            }
        } catch (error) {
            console.error('Pexels API error:', error);
        }

        const randomSeed = Math.floor(Math.random() * 10000);
        const fallbackUrl = `https://picsum.photos/seed/${randomSeed}/800/600`;
        console.log(`Using fallback random image`);
        return fallbackUrl;
    }

    async preloadCityImages(cityName, count = 30) {
        const cacheKey = cityName.toLowerCase();
        
        if (this.cache.has(cacheKey)) {
            console.log(`Images for ${cityName} already cached`);
            return;
        }

        try {
            const query = `luxury hotel ${cityName}`;
            console.log(`Preloading ${count} images for ${cityName}...`);
            
            const response = await fetch(
                `${this.baseUrl}/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
                {
                    headers: {
                        'Authorization': this.pexelsKey
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Pexels API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.photos && data.photos.length > 0) {
                const imageUrls = data.photos.map(photo => photo.src.large);
                this.cache.set(cacheKey, imageUrls);
                console.log(`✓ Preloaded ${imageUrls.length} images for ${cityName}`);
            }
        } catch (error) {
            console.error('Error preloading images:', error);
        }
    }

    clearCache() {
        this.cache.clear();
        console.log('Image cache cleared');
    }
}

export default new ImageService();
