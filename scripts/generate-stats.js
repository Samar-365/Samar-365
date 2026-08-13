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

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

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
  const firstDay = days[0]?.date;

  // --- Longest streak (and its date range) ---
  let longest = 0;
  let running = 0;
  let runStart = null;
  let longestStart = null;
  let longestEnd = null;

  for (const day of days) {
    if (day.contributionCount > 0) {
      if (running === 0) runStart = day.date;
      running += 1;
      if (running > longest) {
        longest = running;
        longestStart = runStart;
        longestEnd = day.date;
      }
    } else {
      running = 0;
    }
  }

  // --- Current streak (walk backwards from most recent day) ---
  let streak = 0;
  let streakEnd = null;
  let streakStart = null;

  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      if (streak === 0) streakEnd = days[i].date;
      streak += 1;
      streakStart = days[i].date;
    } else {
      if (i === days.length - 1) continue; // today may not have contributions yet
      break;
    }
  }

  const totalRange = firstDay ? `${formatDateFull(firstDay)} - Present` : '';
  const streakRange = streak > 0 ? `${formatDate(streakStart)} - ${formatDate(streakEnd)}` : 'No streak yet';
  const longestRange = longest > 0 ? `${formatDate(longestStart)} - ${formatDate(longestEnd)}` : '';

  const svg = renderSVG({ username, total, totalRange, streak, streakRange, longest, longestRange });

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync('output/stats.svg', svg);
  console.log('Wrote output/stats.svg');
}

function renderSVG({ username, total, totalRange, streak, streakRange, longest, longestRange }) {
  const width = 700;
  const height = 200;
  const colX = [117, 350, 583]; // total / streak / longest column centers

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .value { font: 700 32px 'Segoe UI', sans-serif; fill: #ffffff; }
    .value-sm { font: 700 26px 'Segoe UI', sans-serif; fill: #ffffff; }
    .label { font: 400 14px 'Segoe UI', sans-serif; fill: #c9d1d9; }
    .label-bold { font: 700 14px 'Segoe UI', sans-serif; fill: #ffffff; }
    .range { font: 400 12px 'Segoe UI', sans-serif; fill: #56d364; }
  </style>

  <rect width="${width}" height="${height}" rx="12" fill="#0d1117" stroke="#30363d" stroke-width="1"/>

  <!-- dividers -->
  <line x1="${(colX[0] + colX[1]) / 2}" y1="30" x2="${(colX[0] + colX[1]) / 2}" y2="170" stroke="#30363d" stroke-width="1"/>
  <line x1="${(colX[1] + colX[2]) / 2}" y1="30" x2="${(colX[1] + colX[2]) / 2}" y2="170" stroke="#30363d" stroke-width="1"/>

  <!-- Total Contributions -->
  <text x="${colX[0]}" y="72" text-anchor="middle" class="value">${total}</text>
  <text x="${colX[0]}" y="100" text-anchor="middle" class="label">Total Contributions</text>
  <text x="${colX[0]}" y="122" text-anchor="middle" class="range">${totalRange}</text>

  <!-- Current Streak (circle + flame) -->
  <circle cx="${colX[1]}" cy="72" r="46" fill="none" stroke="#56d364" stroke-width="3"/>
  <path d="M${colX[1]} 20 c-2 6 -6 8 -6 13 c0 3 3 5 6 5 c3 0 6 -2 6 -5 c0 -5 -4 -7 -6 -13 z"
        fill="#58a6ff"/>
  <text x="${colX[1]}" y="82" text-anchor="middle" class="value-sm">${streak}</text>
  <text x="${colX[1]}" y="138" text-anchor="middle" class="label-bold">Current Streak</text>
  <text x="${colX[1]}" y="158" text-anchor="middle" class="range">${streakRange}</text>

  <!-- Longest Streak -->
  <text x="${colX[2]}" y="72" text-anchor="middle" class="value">${longest}</text>
  <text x="${colX[2]}" y="100" text-anchor="middle" class="label">Longest Streak</text>
  <text x="${colX[2]}" y="122" text-anchor="middle" class="range">${longestRange}</text>
</svg>`.trim();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
