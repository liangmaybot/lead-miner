#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

/**
 * Lead Exporter - CSV export + optional WhatsApp digest
 */

class LeadExporter {
  ensureOutputDir() {
    if (!existsSync('output')) {
      mkdirSync('output', { recursive: true });
    }
  }

  /**
   * Load scored leads from JSON
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
   * Convert a lead to a flat CSV-friendly record
   */
  flattenLeadForCsv(lead) {
    const trend = lead.enrichment?.reviewTrend || {};
    const responseRate = lead.enrichment?.responseRate || {};
    const businessSize = lead.enrichment?.businessSize || {};
    const lastNegative = lead.enrichment?.lastNegativeReview || {};
    const negativeKeywords = (lead.enrichment?.negativeReviewKeywords || [])
      .map(k => `${k.word}:${k.count}`)
      .join(', ');

    return {
      id: lead.id,
      name: lead.name,
      source: lead.source,
      category: lead.category,
      rating: lead.rating,
      totalReviews: lead.totalReviews,
      score: lead.score,
      priority: lead.priority,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      url: lead.url,
      reviewTrend: trend.trend,
      trendChange: trend.change,
      responseRate: responseRate.percentage || null,
      businessSize: businessSize.category,
      lastNegativeReviewDate: lastNegative.date || null,
      lastNegativeReviewDaysAgo: lastNegative.daysAgo ?? null,
      negativeKeywords,
      scrapedAt: lead.scrapedAt,
    };
  }

  /**
   * Export scored leads to CSV
   */
  async exportToCsv(leads, filepath) {
    this.ensureOutputDir();

    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'name', title: 'Business Name' },
        { id: 'source', title: 'Source' },
        { id: 'category', title: 'Category' },
        { id: 'rating', title: 'Rating' },
        { id: 'totalReviews', title: 'Total Reviews' },
        { id: 'score', title: 'Lead Score' },
        { id: 'priority', title: 'Priority' },
        { id: 'address', title: 'Address' },
        { id: 'phone', title: 'Phone' },
        { id: 'email', title: 'Email' },
        { id: 'website', title: 'Website' },
        { id: 'url', title: 'Listing URL' },
        { id: 'reviewTrend', title: 'Review Trend' },
        { id: 'trendChange', title: 'Trend Change' },
        { id: 'responseRate', title: 'Response Rate' },
        { id: 'businessSize', title: 'Business Size' },
        { id: 'lastNegativeReviewDate', title: 'Last Negative Review' },
        { id: 'lastNegativeReviewDaysAgo', title: 'Days Since Negative' },
        { id: 'negativeKeywords', title: 'Negative Keywords' },
        { id: 'scrapedAt', title: 'Scraped At' },
      ],
    });

    const records = leads.map(lead => this.flattenLeadForCsv(lead));
    await csvWriter.writeRecords(records);
    console.log(`💾 Exported ${records.length} leads to ${filepath}`);
  }

  /**
   * Create a short daily digest for WhatsApp or SMS
   */
  generateDigest(leads, topCount = 5) {
    const priorityCounts = {
      critical: leads.filter(l => l.priority === 'critical').length,
      high: leads.filter(l => l.priority === 'high').length,
      medium: leads.filter(l => l.priority === 'medium').length,
      low: leads.filter(l => l.priority === 'low').length,
    };

    const top = leads.slice(0, topCount);

    const lines = [
      'LeadMiner Daily Digest',
      `Total leads: ${leads.length}`,
      `Critical: ${priorityCounts.critical} | High: ${priorityCounts.high} | Medium: ${priorityCounts.medium} | Low: ${priorityCounts.low}`,
      '',
      `Top ${topCount} Leads:`,
      ...top.map((lead, idx) => (
        `${idx + 1}. ${lead.name} — Score ${lead.score} (${lead.priority})`
      )),
    ];

    return lines.join('\n');
  }

  /**
   * Send digest via webhook (optional)
   */
  async sendWhatsappAlert(message) {
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;

    if (!webhookUrl) {
      return { sent: false, reason: 'WHATSAPP_WEBHOOK_URL not set' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { sent: true };
    } catch (error) {
      return { sent: false, reason: error.message };
    }
  }

  /**
   * Save digest to a local file for reference
   */
  saveDigest(message, filepath) {
    this.ensureOutputDir();
    writeFileSync(filepath, message, 'utf8');
    console.log(`💾 Saved digest to ${filepath}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const exporter = new LeadExporter();
  console.log('📤 LeadMiner Exporter\n');

  const leads = exporter.loadLeads('output/scored-leads.json');

  if (leads.length === 0) {
    console.error('❌ No scored leads found. Run scorer first: npm run score');
    process.exit(1);
  }

  await exporter.exportToCsv(leads, 'output/leads.csv');

  const digest = exporter.generateDigest(leads);
  const result = await exporter.sendWhatsappAlert(digest);

  if (result.sent) {
    console.log('✅ WhatsApp digest sent');
  } else {
    console.log(`ℹ️ WhatsApp digest not sent (${result.reason}). Saved locally instead.`);
  }

  exporter.saveDigest(digest, 'output/whatsapp-digest.txt');
}

export default LeadExporter;
