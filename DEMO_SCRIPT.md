# LeadMiner Demo Script (3 Minutes)

## Goal
Show how LeadMiner automatically finds businesses with bad reviews, enriches them, scores opportunities, and exports a ready-to-use lead list.

## 3-Minute Walkthrough
1. 0:00–0:20 — Problem framing. “Finding high-intent leads manually takes hours. We automate discovery of businesses with poor reviews so agencies can act fast.”
2. 0:20–0:50 — What LeadMiner does. “LeadMiner scrapes review sites, enriches business data, scores urgency, and exports a CSV for outreach.”
3. 0:50–1:30 — Run the demo pipeline. Command: `npm start -- --demo`. “This runs the full pipeline in demo mode without API keys.”
4. 1:30–2:20 — Show outputs. `output/demo-leads.csv` (50 leads, scores 22–95). `output/top-leads.json` (top 10 priorities). “We also generate a daily digest for notifications.”
5. 2:20–3:00 — Value & impact. “In seconds, we generate 50 prioritized leads. A human researcher might spend 4–6 hours to find and qualify the same list.”

## Key Talking Points
- Automates discovery of businesses that are actively struggling with reviews.
- Prioritization based on recent negative reviews, response rate, and business size.
- Fast, repeatable pipeline; outputs are ready for outreach.
- Demo mode works offline; production mode uses Apify for live data.

## Impressive Stats to Mention
- 50 qualified leads generated in <10 seconds (demo mode).
- Scores span 22–95 with clear priority buckets.
- Top 10 leads surfaced automatically for immediate follow-up.

## Optional Live Commands
```bash
npm run demo
npm start -- --demo
```
