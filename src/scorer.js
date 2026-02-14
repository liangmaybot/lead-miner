#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

/**
 * Lead Scorer - Ranks leads by opportunity potential
 * Higher score = better sales opportunity
 */

class LeadScorer {
  constructor() {
    this.weights = {
      recentNegatives: 40,
      lowResponseRate: 30,
      businessSize: 20,
      ratingDecline: 10,
    };
  }

  /**
   * Score a single lead (0-100 scale)
   */
  calculateLeadScore(lead) {
    let score = 0;
    const details = {};

    // 1. Recent negative spike = urgent opportunity
    const recentNegatives = this.countRecentNegatives(lead);
    if (recentNegatives >= 5) {
      score += this.weights.recentNegatives;
      details.recentNegatives = { count: recentNegatives, points: this.weights.recentNegatives };
    } else if (recentNegatives >= 3) {
      const partial = Math.round(this.weights.recentNegatives * 0.6);
      score += partial;
      details.recentNegatives = { count: recentNegatives, points: partial };
    } else if (recentNegatives >= 1) {
      const partial = Math.round(this.weights.recentNegatives * 0.3);
      score += partial;
      details.recentNegatives = { count: recentNegatives, points: partial };
    }

    // 2. Low response rate = not managing reputation
    const responseRate = lead.enrichment?.responseRate?.rate || 0;
    if (responseRate < 0.2) {
      score += this.weights.lowResponseRate;
      details.lowResponseRate = { rate: responseRate, points: this.weights.lowResponseRate };
    } else if (responseRate < 0.5) {
      const partial = Math.round(this.weights.lowResponseRate * 0.5);
      score += partial;
      details.lowResponseRate = { rate: responseRate, points: partial };
    }

    // 3. Large business = bigger contract potential
    const reviewCount = lead.totalReviews || 0;
    if (reviewCount > 100) {
      score += this.weights.businessSize;
      details.businessSize = { reviews: reviewCount, points: this.weights.businessSize };
    } else if (reviewCount > 50) {
      const partial = Math.round(this.weights.businessSize * 0.7);
      score += partial;
      details.businessSize = { reviews: reviewCount, points: partial };
    } else if (reviewCount > 20) {
      const partial = Math.round(this.weights.businessSize * 0.4);
      score += partial;
      details.businessSize = { reviews: reviewCount, points: partial };
    }

    // 4. Rating declining = getting worse
    const trend = lead.enrichment?.reviewTrend?.trend;
    const trendScore = lead.enrichment?.reviewTrend?.trendScore;
    
    if (trend === 'worsening' || trendScore === 'critical') {
      score += this.weights.ratingDecline;
      details.ratingDecline = { trend, trendScore, points: this.weights.ratingDecline };
    } else if (trendScore === 'high') {
      const partial = Math.round(this.weights.ratingDecline * 0.5);
      score += partial;
      details.ratingDecline = { trend, trendScore, points: partial };
    }

    return {
      score: Math.min(score, 100), // Cap at 100
      details,
      priority: this.getPriorityLevel(score),
    };
  }

  /**
   * Count negative reviews in the last 30 days
   */
  countRecentNegatives(lead) {
    if (!lead.reviews || lead.reviews.length === 0) return 0;

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    return lead.reviews.filter(review => {
      const reviewDate = new Date(review.date).getTime();
      const isRecent = reviewDate >= thirtyDaysAgo;
      const isNegative = review.rating <= 2;
      return isRecent && isNegative;
    }).length;
  }

  /**
   * Get priority level based on score
   */
  getPriorityLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Score all leads and sort by score
   */
  scoreAllLeads(leads) {
    console.log(`\n🎯 Scoring ${leads.length} leads...\n`);

    const scored = leads.map((lead, idx) => {
      const scoring = this.calculateLeadScore(lead);
      
      if ((idx + 1) % 10 === 0) {
        console.log(`   Scored ${idx + 1}/${leads.length}...`);
      }

      return {
        ...lead,
        score: scoring.score,
        scoringDetails: scoring.details,
        priority: scoring.priority,
      };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    console.log(`✅ Scoring complete!\n`);
    this.printScoreSummary(scored);

    return scored;
  }

  /**
   * Print score summary statistics
   */
  printScoreSummary(leads) {
    const critical = leads.filter(l => l.priority === 'critical').length;
    const high = leads.filter(l => l.priority === 'high').length;
    const medium = leads.filter(l => l.priority === 'medium').length;
    const low = leads.filter(l => l.priority === 'low').length;

    console.log('📊 Score Distribution:');
    console.log(`   🔴 Critical (80+): ${critical}`);
    console.log(`   🟠 High (60-79): ${high}`);
    console.log(`   🟡 Medium (40-59): ${medium}`);
    console.log(`   🟢 Low (<40): ${low}`);
    console.log('');

    // Show top 5
    console.log('🏆 Top 5 Leads:');
    leads.slice(0, 5).forEach((lead, idx) => {
      console.log(`   ${idx + 1}. ${lead.name} (Score: ${lead.score}, Priority: ${lead.priority})`);
    });
    console.log('');
  }

  /**
   * Load enriched leads from JSON
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
   * Save scored leads
   */
  saveScoredLeads(leads, filepath) {
    writeFileSync(filepath, JSON.stringify(leads, null, 2));
    console.log(`💾 Saved ${leads.length} scored leads to ${filepath}`);
  }

  /**
   * Save top leads separately for quick access
   */
  saveTopLeads(leads, filepath, count = 10) {
    const top = leads.slice(0, count);
    writeFileSync(filepath, JSON.stringify(top, null, 2));
    console.log(`💾 Saved top ${count} leads to ${filepath}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const scorer = new LeadScorer();
  
  console.log('🎯 LeadMiner Scorer\n');
  
  const leads = scorer.loadLeads('output/enriched-leads.json');
  
  if (leads.length === 0) {
    console.error('❌ No enriched leads found. Run enricher first: npm run enrich');
    process.exit(1);
  }

  const scored = scorer.scoreAllLeads(leads);
  scorer.saveScoredLeads(scored, 'output/scored-leads.json');
  scorer.saveTopLeads(scored, 'output/top-leads.json', 10);
  
  console.log('✅ Scoring complete!');
}

export default LeadScorer;
