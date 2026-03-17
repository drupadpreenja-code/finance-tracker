# FinanceTracker — Family

A private personal finance tracker for you and your family. Built with plain HTML/CSS/JS + Supabase.

## Files

| File | Purpose |
|---|---|
| `index.html` | App structure and all pages |
| `styles.css` | All styling and dark mode |
| `app.js` | All logic — auth, data, charts, render |
| `setup.sql` | Run once in Supabase SQL Editor |

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
