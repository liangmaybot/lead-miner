#!/usr/bin/env node
import { ApifyClient } from 'apify-client';
import { config } from 'dotenv';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import Sentiment from 'sentiment';

config();

const sentiment = new Sentiment();

/**
 * Review Scraper - Finds businesses with bad reviews
 * Uses Apify actors for Google Maps and TripAdvisor
 */

class ReviewScraper {
  constructor(apiToken) {
    this.client = new ApifyClient({ token: apiToken });
    this.badReviewThreshold = 3.0; // Reviews 1-3 stars
  }

  /**
   * Scrape Google Maps for businesses with bad reviews
   */
  async scrapeGoogleMaps(query, location, maxResults = 50) {
    console.log(`🔍 Scraping Google Maps: "${query}" in ${location}`);

    try {
      // Using Google Maps Scraper actor
      const run = await this.client.actor('nwua9Gu5YrADL7ZDj').call({
        searchStringsArray: [`${query} in ${location}`],
        maxCrawledPlacesPerSearch: maxResults,
        language: 'en',
        includeReviews: true,
        maxReviews: 20, // Get recent reviews for analysis
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      console.log(`✅ Found ${items.length} businesses on Google Maps`);
      
      // Filter for businesses with low ratings
      const badReviewBusinesses = items
        .filter(place => place.totalScore && place.totalScore <= this.badReviewThreshold)
        .map(place => this.normalizeGoogleMapsData(place));

      console.log(`🎯 ${badReviewBusinesses.length} businesses with rating ≤ ${this.badReviewThreshold}`);
      
      return badReviewBusinesses;
    } catch (error) {
      console.error('❌ Google Maps scraping error:', error.message);
      return [];
    }
  }

  /**
   * Scrape TripAdvisor for businesses with bad reviews
   */
  async scrapeTripAdvisor(query, location, maxResults = 50) {
    console.log(`🔍 Scraping TripAdvisor: "${query}" in ${location}`);

    try {
      // Using TripAdvisor Scraper actor
      const run = await this.client.actor('maxcopell/tripadvisor').call({
        locationFullName: location,
        searchQuery: query,
        maxItems: maxResults,
        includeReviews: true,
        maxReviews: 20,
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      console.log(`✅ Found ${items.length} businesses on TripAdvisor`);
      
      // Filter for businesses with low ratings
      const badReviewBusinesses = items
        .filter(place => place.rating && place.rating <= this.badReviewThreshold)
        .map(place => this.normalizeTripAdvisorData(place));

      console.log(`🎯 ${badReviewBusinesses.length} businesses with rating ≤ ${this.badReviewThreshold}`);
      
      return badReviewBusinesses;
    } catch (error) {
      console.error('❌ TripAdvisor scraping error:', error.message);
      return [];
    }
  }

  /**
   * Normalize Google Maps data to common format
   */
  normalizeGoogleMapsData(place) {
    const recentReviews = (place.reviews || []).slice(0, 10);
    
    return {
      id: `gm_${place.placeId}`,
      source: 'google_maps',
      name: place.title,
      rating: place.totalScore,
      totalReviews: place.reviewsCount || 0,
      category: place.categoryName || place.categories?.[0] || 'Business',
      address: place.address,
      phone: place.phoneUnformatted || place.phone,
      website: place.website,
      email: this.extractEmail(place.website),
      reviews: recentReviews.map(r => ({
        rating: r.stars,
        text: r.text,
        date: r.publishedAtDate,
        sentiment: this.analyzeSentiment(r.text),
      })),
      url: place.url,
      scrapedAt: new Date().toISOString(),
    };
  }

  /**
   * Normalize TripAdvisor data to common format
   */
  normalizeTripAdvisorData(place) {
    const recentReviews = (place.reviews || []).slice(0, 10);
    
    return {
      id: `ta_${place.id || place.locationId}`,
      source: 'tripadvisor',
      name: place.name || place.title,
      rating: place.rating,
      totalReviews: place.numberOfReviews || 0,
      category: place.category || 'Business',
      address: place.address,
      phone: place.phone,
      website: place.website,
      email: this.extractEmail(place.website),
      reviews: recentReviews.map(r => ({
        rating: r.rating,
        text: r.text || r.title,
        date: r.publishedDate,
        sentiment: this.analyzeSentiment(r.text || r.title),
      })),
      url: place.url,
      scrapedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyze sentiment of review text
   */
  analyzeSentiment(text) {
    if (!text) return { score: 0, sentiment: 'neutral' };
    
    const result = sentiment.analyze(text);
    
    return {
      score: result.score,
      comparative: result.comparative,
      sentiment: result.score > 0 ? 'positive' : result.score < 0 ? 'negative' : 'neutral',
      positive: result.positive,
      negative: result.negative,
    };
  }

  /**
   * Extract email from website URL (basic pattern matching)
   */
  extractEmail(website) {
    if (!website) return null;
    
    // Common patterns for business emails
    const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    // Generate likely email patterns
    return `info@${domain}`; // Placeholder - in production, would crawl website
  }

  /**
   * Run full scraping pipeline
   */
  async scrapeAll(query, location, maxResults = 50) {
    console.log('\n🚀 Starting LeadMiner Scraper...\n');
    
    const [googleMaps, tripAdvisor] = await Promise.all([
      this.scrapeGoogleMaps(query, location, maxResults),
      this.scrapeTripAdvisor(query, location, maxResults),
    ]);

    const allLeads = [...googleMaps, ...tripAdvisor];
    
    // Remove duplicates by name
    const uniqueLeads = this.deduplicateLeads(allLeads);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total leads found: ${uniqueLeads.length}`);
    console.log(`   Google Maps: ${googleMaps.length}`);
    console.log(`   TripAdvisor: ${tripAdvisor.length}`);
    
    // Save raw scraped data
    this.saveResults(uniqueLeads, 'output/scraped-leads.json');
    
    return uniqueLeads;
  }

  /**
   * Remove duplicate businesses (same name + similar address)
   */
  deduplicateLeads(leads) {
    const seen = new Map();
    
    return leads.filter(lead => {
      const key = `${lead.name.toLowerCase()}_${(lead.address || '').slice(0, 20).toLowerCase()}`;
      
      if (seen.has(key)) {
        // Keep the one with more reviews
        const existing = seen.get(key);
        if (lead.totalReviews > existing.totalReviews) {
          seen.set(key, lead);
          return true;
        }
        return false;
      }
      
      seen.set(key, lead);
      return true;
    });
  }

  /**
   * Save results to JSON file
   */
  saveResults(data, filepath) {
    if (!existsSync('output')) {
      mkdirSync('output', { recursive: true });
    }
    
    writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved ${data.length} leads to ${filepath}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const apiToken = process.env.APIFY_TOKEN;
  
  if (!apiToken) {
    console.error('❌ APIFY_TOKEN not found in .env file');
    console.error('👉 Get your token from https://console.apify.com/account/integrations');
    process.exit(1);
  }

  const scraper = new ReviewScraper(apiToken);
  const query = process.env.SEARCH_QUERY || 'restaurants';
  const location = process.env.SEARCH_LOCATION || 'New York, NY';
  const maxResults = parseInt(process.env.MAX_RESULTS || '50');

  scraper.scrapeAll(query, location, maxResults)
    .then(() => console.log('\n✅ Scraping complete!'))
    .catch(err => {
      console.error('\n❌ Scraping failed:', err);
      process.exit(1);
    });
}

export default ReviewScraper;
