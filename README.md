# Minimal UI to search NYC restaurants and see inspection risk.
## Live demo
**▶ https://hicc-web-kalle-georgievs-projects.vercel.app/**

**API docs:** https://hicc-api-srf7acimsa-uc.a.run.app/docs
API base: https://hicc-api-srf7acimsa-uc.a.run.app

> Type a NYC restaurant name, click a result, and view the Risk Summary (last inspection date, last points, last grade, probability of B/C, predicted points, and likely next violations).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Local development
### Node 20+
```node -v   # should be v20.x```

### Set API base for the UI
```echo 'NEXT_PUBLIC_API_BASE=https://hicc-api-srf7acimsa-uc.a.run.app' > .env.local```

```npm install
npm run dev
# Open: http://localhost:3000
# Try:  http://localhost:3000/?camis=50117047
```

### Features
- Fast search with typo softening (e.g., “cooffee” → “coffee”)
- Keyboard nav: ↑/↓ to move selection, Enter to score
- Deep links: ?camis=50117047 opens a specific restaurant
- Share / Copy: deep link, CAMIS, or raw JSON
- Scrollable results with highlight + “Back to results”
- Local Rat Pressure badge with tooltip explaining the metric
- Clear loading and empty states


Deploy (Vercel)

In Vercel, Add New Project → import kallenicole/hicc-web.

Add Environment Variable:
```NEXT_PUBLIC_API_BASE = https://hicc-api-srf7acimsa-uc.a.run.app```

Deploy. 
You’ll get a URL like the live site above.

Optional custom domain:
Create a CNAME record per Vercel’s instructions (e.g., ```dinesafe.kallenicole.com``` → ```*.vercel-dns-*.com```) and attach it in the Vercel project.

## How to use
- Type part of a restaurant’s name (e.g., “pizza”, “coffee”).
- Use ↑/↓ to highlight results, Enter to fetch a score.
- Share a direct link using the Share button (or ?camis= in the URL).

### The Prediction card shows:
- Probability of B or C
- “Next Inspection Predicted Points”
- Local Rat Pressure with tooltip (311 rodent complaints in last 180d + DOHMH rat fails in last 365d; combined into rat_index 0–1).
- The Latest Results card shows the last inspection date/points/grade.

## Accessibility
- Keyboard accessible controls
- Tooltips open on hover and focus
- High contrast on light background


## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

License: MIT

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
