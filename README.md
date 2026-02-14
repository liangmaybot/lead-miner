# LeadMiner 🎯

**Automated lead generation from businesses with bad reviews**

## What It Does

Finds businesses with negative reviews (1-3 stars) and enriches them with:
- Contact information (phone, email, website)
- Business category and size
- Review trends (getting worse?)
- Lead score (prioritization)

Perfect for agencies offering reputation management, customer service training, or business consulting.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Apify:**
   - Sign up at [apify.com](https://apify.com)
   - Get your API token from [Account > Integrations](https://console.apify.com/account/integrations)
   - Copy `.env.example` to `.env` and add your token

3. **Configure search:**
   Edit `.env` to set your target location and business type

## Usage

### Quick Demo
```bash
npm run demo
```

### Individual Steps
```bash
# 1. Scrape reviews from Google Maps & TripAdvisor
npm run scrape

# 2. Enrich leads with contact info
npm run enrich

# 3. Score and rank leads
npm run score

# 4. Export to CSV and send WhatsApp alert
npm run export
```

### Full Pipeline
```bash
npm start
```

### Full Pipeline (Demo Mode)
```bash
npm start -- --demo
# or: DEMO_MODE=1 npm start
```

## Output

- `output/leads.csv` - All discovered leads with scores
- `output/demo-leads.csv` - 50-lead demo CSV for judging
- `output/top-leads.json` - Top 10 high-priority leads
- WhatsApp notification with daily digest

## Lead Scoring Algorithm

**Score Components:**
- Recent negative reviews (0-40 pts): More recent = higher priority
- Business size (0-30 pts): More total reviews = bigger opportunity
- Response rate (0-30 pts): Low response = higher opportunity

**Total Score:** 0-100 (higher = better lead)

## Cron Setup

Run daily at 9 AM:
```bash
openclaw cron add "0 9 * * *" "cd /Users/liang/clawd/moltathon-projects/lead-miner && npm start"
```

## Architecture

```
src/
├── review-scraper.js   # Apify Google Maps + TripAdvisor scraper
├── enricher.js         # Extract contact info & trends
├── scorer.js           # Rank leads by opportunity
├── exporter.js         # CSV export + WhatsApp alerts
├── index.js            # Full pipeline runner
└── demo.js             # Demo with sample data
```

## Demo Data

Includes sample data for quick testing without API credits.

---

**Built for the Automate Your Life Track - Moltathon 2026**

## 📹 Demo Video

**Watch the 90-second demo:** [▶️ Play Video](https://github.com/liangmaybot/lead-miner/releases/download/v1.0.0/demo-video.mp4)

[![Demo Video](https://img.shields.io/badge/▶️_Watch_Demo-YouTube-red?style=for-the-badge)](https://github.com/liangmaybot/lead-miner/releases/download/v1.0.0/demo-video.mp4)

**Duration:** 90 seconds | **Size:** 1.5 MB  
**Highlights:**
- 50 demo leads generated
- Review scraping from multiple sources
- Lead scoring algorithm
- WhatsApp notification system

[View Release](https://github.com/liangmaybot/lead-miner/releases/tag/v1.0.0) | [Download MP4](https://github.com/liangmaybot/lead-miner/releases/download/v1.0.0/demo-video.mp4)
