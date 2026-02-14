#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import Sentiment from 'sentiment';
import LeadEnricher from './enricher.js';
import LeadScorer from './scorer.js';
import LeadExporter from './exporter.js';

const sentiment = new Sentiment();

function ensureOutputDir() {
  if (!existsSync('output')) {
    mkdirSync('output', { recursive: true });
  }
}

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generatePhone(rng) {
  const area = randInt(rng, 200, 989);
  const prefix = randInt(rng, 200, 999);
  const line = randInt(rng, 1000, 9999);
  return `(${area}) ${prefix}-${line}`;
}

function reviewTextForRating(rng, rating) {
  const negative = [
    'Long wait and the service was rude.',
    'Not worth the price. Very disappointed.',
    'Dirty tables and cold food.',
    'Terrible experience. Would not return.',
    'Staff was unhelpful and slow.',
  ];
  const neutral = [
    'Okay overall but nothing special.',
    'Average visit, some things could improve.',
    'Decent but the service was inconsistent.',
    'Fine for a quick stop.',
    'Mixed experience, some good some bad.',
  ];
  const positive = [
    'Friendly staff and quick service.',
    'Great value for the price.',
    'Pleasant atmosphere and tasty food.',
    'Solid experience, would come back.',
    'Good service and clean space.',
  ];

  if (rating <= 2) return pick(rng, negative);
  if (rating === 3) return pick(rng, neutral);
  return pick(rng, positive);
}

function generateReviews(rng, count, baseRating) {
  const reviews = [];
  const now = Date.now();

  for (let i = 0; i < count; i += 1) {
    let rating;

    if (baseRating < 2.0) {
      rating = pick(rng, [1, 1, 2, 2, 3]);
    } else if (baseRating < 2.6) {
      rating = pick(rng, [1, 2, 2, 3, 3]);
    } else {
      rating = pick(rng, [2, 3, 3, 3, 4]);
    }

    const daysAgo = randInt(rng, 1, 120);
    const date = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const text = reviewTextForRating(rng, rating);
    const analyzed = sentiment.analyze(text);

    reviews.push({
      rating,
      text,
      date,
      sentiment: {
        score: analyzed.score,
        comparative: analyzed.comparative,
        sentiment: analyzed.score > 0 ? 'positive' : analyzed.score < 0 ? 'negative' : 'neutral',
        positive: analyzed.positive,
        negative: analyzed.negative,
      },
    });
  }

  return reviews;
}

function generateDemoLeads(count = 50) {
  const rng = createRng(42);

  const adjectives = ['Sunrise', 'Maple', 'Silver', 'Golden', 'Copper', 'Urban', 'Coastal', 'Evergreen', 'River', 'Harbor'];
  const nouns = ['Bistro', 'Cafe', 'Auto', 'Dental', 'Fitness', 'Grill', 'Hotel', 'Salon', 'Bakery', 'Market'];
  const categories = ['Restaurant', 'Cafe', 'Auto Repair', 'Dentist', 'Gym', 'Hotel', 'Salon', 'Bakery', 'Market', 'Barber'];
  const cities = [
    'Austin, TX', 'Denver, CO', 'Seattle, WA', 'Miami, FL', 'Chicago, IL',
    'Portland, OR', 'San Diego, CA', 'Nashville, TN', 'Phoenix, AZ', 'Boston, MA',
  ];
  const streets = ['Main St', 'Market St', 'Broadway', '2nd Ave', 'Pine St', 'Oak St', 'Maple Ave', 'Sunset Blvd'];

  const leads = [];
  const usedNames = new Set();

  for (let i = 0; i < count; i += 1) {
    let name = `${pick(rng, adjectives)} ${pick(rng, nouns)}`;
    if (usedNames.has(name)) {
      name = `${name} ${i + 1}`;
    }
    usedNames.add(name);

    const baseRating = parseFloat((1.4 + rng() * 1.8).toFixed(1));
    const reviewCount = randInt(rng, 6, 18);
    const totalReviews = randInt(rng, Math.max(reviewCount, 10), 350);
    const category = pick(rng, categories);
    const city = pick(rng, cities);
    const address = `${randInt(rng, 100, 999)} ${pick(rng, streets)}, ${city}`;
    const website = `https://${slugify(name)}.com`;
    const reviews = generateReviews(rng, reviewCount, baseRating);

    leads.push({
      id: `demo_${i + 1}`,
      source: 'demo',
      name,
      rating: baseRating,
      totalReviews,
      category,
      address,
      phone: generatePhone(rng),
      website,
      email: `info@${slugify(name)}.com`,
      reviews,
      url: website,
      scrapedAt: new Date().toISOString(),
    });
  }

  return leads;
}

async function runDemo() {
  console.log('🧪 LeadMiner Demo\n');
  ensureOutputDir();

  const leads = generateDemoLeads(50);
  writeFileSync('output/scraped-leads.json', JSON.stringify(leads, null, 2));
  console.log(`💾 Saved ${leads.length} demo leads to output/scraped-leads.json`);

  const enricher = new LeadEnricher();
  const scorer = new LeadScorer();
  const exporter = new LeadExporter();

  const enriched = enricher.enrichLeads(leads);
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

  console.log('✅ Demo pipeline complete!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(error => {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  });
}

export default runDemo;
