#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

/**
 * Lead Enricher - Adds business intelligence to scraped leads
 * Extracts contact info, calculates trends, enriches data
 */

class LeadEnricher {
  constructor() {
    this.contactPatterns = {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      phone: /(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    };
  }

  /**
   * Enrich all leads with additional intelligence
   */
  enrichLeads(leads) {
    console.log(`\n🔧 Enriching ${leads.length} leads...\n`);

    const enriched = leads.map((lead, idx) => {
      if ((idx + 1) % 10 === 0) {
        console.log(`   Processed ${idx + 1}/${leads.length}...`);
      }

      return {
        ...lead,
        enrichment: {
          contactInfo: this.enrichContactInfo(lead),
          reviewTrend: this.calculateReviewTrend(lead.reviews),
          businessSize: this.estimateBusinessSize(lead),
          responseRate: this.calculateResponseRate(lead.reviews),
          negativeReviewKeywords: this.extractNegativeKeywords(lead.reviews),
          lastNegativeReview: this.getLastNegativeReviewDate(lead.reviews),
        },
      };
    });

    console.log(`✅ Enrichment complete!\n`);
    return enriched;
  }

  /**
   * Enrich contact information
   */
  enrichContactInfo(lead) {
    const contact = {
      phone: lead.phone || null,
      email: lead.email || null,
      website: lead.website || null,
      hasContact: false,
    };

    // Try to extract phone from various fields
    if (!contact.phone && lead.address) {
      const phoneMatch = lead.address.match(this.contactPatterns.phone);
      if (phoneMatch) contact.phone = phoneMatch[0];
    }

    // Validate email or generate likely pattern
    if (!contact.email && contact.website) {
      const domain = this.extractDomain(contact.website);
      if (domain) {
        contact.email = `info@${domain}`;
        contact.emailType = 'estimated';
      }
    }

    contact.hasContact = !!(contact.phone || contact.email || contact.website);

    return contact;
  }

  /**
   * Calculate review trend (getting better or worse?)
   */
  calculateReviewTrend(reviews) {
    if (!reviews || reviews.length < 5) {
      return { trend: 'insufficient_data', change: 0 };
    }

    // Sort by date (newest first)
    const sorted = [...reviews].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );

    // Compare recent half vs older half
    const mid = Math.floor(sorted.length / 2);
    const recentAvg = this.averageRating(sorted.slice(0, mid));
    const olderAvg = this.averageRating(sorted.slice(mid));

    const change = recentAvg - olderAvg;

    return {
      trend: change < -0.3 ? 'worsening' : change > 0.3 ? 'improving' : 'stable',
      change: parseFloat(change.toFixed(2)),
      recentAvg: parseFloat(recentAvg.toFixed(2)),
      olderAvg: parseFloat(olderAvg.toFixed(2)),
      trendScore: change < -0.5 ? 'critical' : change < -0.3 ? 'high' : 'moderate',
    };
  }

  /**
   * Estimate business size based on review count
   */
  estimateBusinessSize(lead) {
    const total = lead.totalReviews || 0;

    let size, category;

    if (total < 10) {
      size = 'very_small';
      category = 'Micro (<10 reviews)';
    } else if (total < 50) {
      size = 'small';
      category = 'Small (10-50 reviews)';
    } else if (total < 200) {
      size = 'medium';
      category = 'Medium (50-200 reviews)';
    } else if (total < 500) {
      size = 'large';
      category = 'Large (200-500 reviews)';
    } else {
      size = 'very_large';
      category = 'Very Large (500+ reviews)';
    }

    return {
      size,
      category,
      totalReviews: total,
      sizeScore: Math.min(total / 10, 100), // 0-100 scale
    };
  }

  /**
   * Calculate how often the business responds to reviews
   */
  calculateResponseRate(reviews) {
    if (!reviews || reviews.length === 0) {
      return { rate: 0, responded: 0, total: 0, percentage: '0%' };
    }

    // Count reviews with owner responses (if available)
    // Note: This data might not be in scraped reviews, using placeholder logic
    const responded = reviews.filter(r => r.ownerResponse || r.response).length;
    const total = reviews.length;
    const rate = responded / total;

    return {
      rate: parseFloat(rate.toFixed(2)),
      responded,
      total,
      percentage: `${Math.round(rate * 100)}%`,
      engagement: rate > 0.7 ? 'high' : rate > 0.3 ? 'moderate' : 'low',
    };
  }

  /**
   * Extract common keywords from negative reviews
   */
  extractNegativeKeywords(reviews) {
    const negativeReviews = reviews.filter(r => r.rating <= 2 || r.sentiment?.sentiment === 'negative');
    
    if (negativeReviews.length === 0) return [];

    // Common complaint keywords
    const keywords = [
      'slow', 'rude', 'dirty', 'cold', 'wait', 'poor', 'terrible', 'worst',
      'disappointed', 'never', 'avoid', 'bad', 'horrible', 'disgusting',
      'unprofessional', 'delayed', 'broken', 'outdated', 'overpriced'
    ];

    const found = new Map();

    negativeReviews.forEach(review => {
      const text = (review.text || '').toLowerCase();
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          found.set(keyword, (found.get(keyword) || 0) + 1);
        }
      });
    });

    // Return top 5 most common keywords
    return Array.from(found.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ word, count }));
  }

  /**
   * Get the date of the most recent negative review
   */
  getLastNegativeReviewDate(reviews) {
    const negative = reviews
      .filter(r => r.rating <= 2)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (negative.length === 0) return null;

    const date = new Date(negative[0].date);
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

    return {
      date: negative[0].date,
      daysAgo,
      recency: daysAgo < 7 ? 'very_recent' : daysAgo < 30 ? 'recent' : 'old',
    };
  }

  /**
   * Helper: Calculate average rating
   */
  averageRating(reviews) {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return sum / reviews.length;
  }

  /**
   * Helper: Extract domain from URL
   */
  extractDomain(url) {
    if (!url) return null;
    try {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    } catch {
      return null;
    }
  }

  /**
   * Load leads from JSON file
   */
  loadLeads(filepath) {
    try {
      const data = readFileSync(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to load ${filepath}:`, error.message);
      return [];
    }
  }

  /**
   * Save enriched leads
   */
  saveEnrichedLeads(leads, filepath) {
    writeFileSync(filepath, JSON.stringify(leads, null, 2));
    console.log(`💾 Saved ${leads.length} enriched leads to ${filepath}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const enricher = new LeadEnricher();
  
  console.log('🔧 LeadMiner Enricher\n');
  
  const leads = enricher.loadLeads('output/scraped-leads.json');
  
  if (leads.length === 0) {
    console.error('❌ No leads found. Run scraper first: npm run scrape');
    process.exit(1);
  }

  const enriched = enricher.enrichLeads(leads);
  enricher.saveEnrichedLeads(enriched, 'output/enriched-leads.json');
  
  console.log('✅ Enrichment complete!');
}

export default LeadEnricher;
