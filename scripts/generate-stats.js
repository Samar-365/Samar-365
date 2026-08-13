// scripts/generate-stats.js
// Fetches live contribution/streak stats from GitHub's GraphQL API and
// writes an SVG file to disk. Run by the GitHub Action on a schedule.

import fs from 'fs';

const username = process.env.GH_USERNAME || 'Samar-365';
const token = process.env.GH_TOKEN;

if (!token) {
  console.error('Missing GH_TOKEN environment variable');
  process.exit(1);
}

const query = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const ghRes = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  const json = await ghRes.json();

  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join(', '));
  }

  const days = json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const total = json.data.user.contributionsCollection.contributionCalendar.totalContributions;

  let longest = 0;
  let running = 0;
  for (const day of days) {
    if (day.contributionCount > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      streak += 1;
    } else {
      if (i === days.length - 1) continue; // today may not have contributions yet
      break;
    }
  }

  const svg = `
<svg width="495" height="150" viewBox="0 0 495 150" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: 600 16px 'Segoe UI', sans-serif; fill: #58a6ff; }
    .label { font: 400 13px 'Segoe UI', sans-serif; fill: #8b949e; }
    .value { font: 700 28px 'Segoe UI', sans-serif; fill: #c9d1d9; }
  </style>
  <rect width="495" height="150" rx="10" fill="#0d1117" stroke="#30363d"/>
  <text x="20" y="30" class="title">${username}'s GitHub Stats</text>

  <text x="40" y="80" class="value" text-anchor="middle">${total}</text>
  <text x="40" y="100" class="label" text-anchor="middle">Total</text>

  <text x="247" y="80" class="value" text-anchor="middle">${streak}</text>
  <text x="247" y="100" class="label" text-anchor="middle">Current Streak</text>

  <text x="455" y="80" class="value" text-anchor="middle">${longest}</text>
  <text x="455" y="100" class="label" text-anchor="middle">Longest Streak</text>
</svg>`.trim();

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync('output/stats.svg', svg);
  console.log('Wrote output/stats.svg');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
