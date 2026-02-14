#!/usr/bin/env node
import { config } from 'dotenv';
import LeadEnricher from './enricher.js';
import LeadScorer from './scorer.js';
import LeadExporter from './exporter.js';
import runDemo from './demo.js';

config();

function isDemoMode() {
  return process.env.DEMO_MODE === '1'
    || process.env.DEMO_MODE === 'true'
    || process.argv.includes('--demo');
}

async function runPipeline() {
  console.log('🚀 LeadMiner Full Pipeline\n');

  if (isDemoMode()) {
    console.log('🧪 Demo mode enabled (set `DEMO_MODE=1` or pass `--demo`).\n');
    await runDemo();
    return;
  }

  const apiToken = process.env.APIFY_TOKEN;

  if (!apiToken) {
    console.error('❌ APIFY_TOKEN not found in .env file');
    console.error('👉 Add your Apify token or run: npm run demo');
    process.exit(1);
  }

  const query = process.env.SEARCH_QUERY || 'restaurants';
  const location = process.env.SEARCH_LOCATION || 'New York, NY';
  const maxResults = parseInt(process.env.MAX_RESULTS || '50', 10);

  const { default: ReviewScraper } = await import('./review-scraper.js');
  const scraper = new ReviewScraper(apiToken);
  const enricher = new LeadEnricher();
  const scorer = new LeadScorer();
  const exporter = new LeadExporter();

  const scraped = await scraper.scrapeAll(query, location, maxResults);

  if (scraped.length === 0) {
    console.error('❌ No leads scraped. Try a different query/location.');
    process.exit(1);
  }

  const enriched = enricher.enrichLeads(scraped);
  enricher.saveEnrichedLeads(enriched, 'output/enriched-leads.json');

  const scored = scorer.scoreAllLeads(enriched);
  scorer.saveScoredLeads(scored, 'output/scored-leads.json');
  scorer.saveTopLeads(scored, 'output/top-leads.json', 10);

  await exporter.exportToCsv(scored, 'output/leads.csv');

  const digest = exporter.generateDigest(scored);
  const result = await exporter.sendWhatsappAlert(digest);

  if (result.sent) {
    console.log('✅ WhatsApp digest sent');
  } else {
    console.log(`ℹ️ WhatsApp digest not sent (${result.reason}). Saved locally instead.`);
  }

  exporter.saveDigest(digest, 'output/whatsapp-digest.txt');

  console.log('✅ LeadMiner pipeline complete!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline().catch(error => {
    console.error('\n❌ Pipeline failed:', error);
    process.exit(1);
  });
}

export default runPipeline;
