# FinanceTracker — Family

A private personal finance tracker for you and your family. Built with plain HTML/CSS/JS + Supabase.

## Files

| File | Purpose |
|---|---|
| `index.html` | App structure and all pages |
| `styles.css` | All styling and dark mode |
| `app.js` | All logic — auth, data, charts, render |
| `setup.sql` | Run once in Supabase SQL Editor |

## Setup

### 1. Supabase
1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste contents of `setup.sql` → Run
3. Go to **Project Settings → API** → copy your **Project URL** and **anon public key**

### 2. Configure credentials
Open `app.js` and fill in the two lines at the top:
```js
const APP_SUPABASE_URL = 'https://your-project.supabase.co';
const APP_SUPABASE_KEY = 'eyJhbGci...';
```

### 3. hCaptcha (optional but recommended)
1. Sign up at [hcaptcha.com](https://hcaptcha.com) → add your site → get Site Key + Secret Key
2. In Supabase → **Authentication → Settings → Bot Protection** → enable hCaptcha → paste Secret Key
3. In Supabase → **Table Editor → app_config** → update `hcaptcha_sitekey` value with your Site Key

### 4. Deploy to GitHub Pages
1. Create a GitHub repo
2. Upload all 4 files (`index.html`, `styles.css`, `app.js`, `setup.sql`)
3. Go to repo **Settings → Pages → Deploy from branch → main / root**
4. Your URL: `https://your-username.github.io/your-repo-name`
5. Add this URL to Supabase → **Authentication → URL Configuration → Redirect URLs**

## Features
- Dashboard with net worth, charts, insights
- Transactions (income / expense / savings)
- **Salary** — earnings breakdown + deductions (PF, TDS, 80C, 80D etc.)
- **Investments** — stocks, mutual funds, FD, RD, PPF, EPF, NPS, bonds, SGB, gold, crypto
  - Instrument-specific fields: interest rate, tenure, compounding, bank, PRAN, UAN etc.
  - Standard rates pre-filled: PPF 7.1%, EPF 8.25%, SGB 2.5%
- Allocation analysis — equity/debt/liquid/fixed breakdown
- Per-user data isolation via Supabase Row Level Security
- Excel export (5 sheets including Salary)
- JSON backup and restore
- Dark mode

## Adding family members
Share your GitHub Pages URL. Family members click **Create account** and sign up with their own email and password. Their data is completely separate from yours.
