# Website Setup Summary

## Overview

A Next.js 16 marketing website has been successfully scaffolded for the RevOps project. The website is separate from the main application and is designed to be deployed on Vercel.

## What Was Created

### Directory Structure

```
website/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Landing page with hero, features, integrations
│   ├── globals.css         # Global Tailwind styles
│   └── favicon.ico
├── public/                 # Static assets
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── next.config.ts          # Next.js config
├── tailwind.config.ts      # Tailwind config (v4)
├── vercel.json             # Vercel deployment config
├── .gitignore              # Git ignore rules
├── README.md               # Website-specific documentation
└── DEPLOYMENT.md           # Deployment guide for Vercel
```

### Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **TypeScript**: Full type safety
- **Fonts**: Geist Sans & Geist Mono
- **Deployment**: Vercel (configured)

### Landing Page Features

The landing page includes:

1. **Navigation Bar**
   - RevOps branding
   - Links to Features, Integrations, Documentation
   - "Launch App" CTA button

2. **Hero Section**
   - Bold headline with gradient text
   - Value proposition
   - Dual CTAs (Get Started, Learn More)

3. **Features Section**
   - 6 feature cards with icons:
     - Multi-Source Sync
     - Natural Language Queries
     - Real-Time Analytics
     - Secure & Encrypted
     - Atomic Updates
     - Multi-Workspace

4. **Integrations Section**
   - Current integrations: Close.com, Stripe, MongoDB, GraphQL
   - Mention of upcoming integrations

5. **CTA Section**
   - Gradient background
   - Final call-to-action

6. **Footer**
   - Company branding
   - Links organized by category
   - Copyright notice

### Design Features

- ✅ Responsive design (mobile-first)
- ✅ Dark mode support
- ✅ Gradient accents (blue to cyan)
- ✅ Smooth transitions and hover effects
- ✅ Modern, clean aesthetic
- ✅ Accessible components

## Development

### Local Development

```bash
# From project root
pnpm run website:dev

# Or from website directory
cd website
npm run dev
```

The website runs on **http://localhost:3000** (different from the app which runs on 5173).

### Build

```bash
# From project root
pnpm run website:build

# Or from website directory
cd website
npm run build
```

### Production Preview

```bash
cd website
npm run build
npm start
```

## Deployment to Vercel

### Quick Deploy

1. Push code to GitHub
2. Import project to Vercel
3. Set **Root Directory** to `website`
4. Deploy

Vercel will auto-detect Next.js and configure everything automatically.

### Configuration

The `vercel.json` file is already configured with:
- Build command
- Output directory
- Framework preset
- Auto-deployment from main branch

See `website/DEPLOYMENT.md` for detailed deployment instructions.

## Workspace Integration

### pnpm Workspace

The website has been added to the pnpm workspace configuration:

```yaml
# pnpm-workspace.yaml
packages:
  - .
  - app
  - api
  - website  # ← Added
```

### Root Scripts

New scripts added to root `package.json`:

```json
{
  "website:dev": "pnpm --filter website run dev",
  "website:build": "pnpm --filter website run build",
  "website:start": "pnpm --filter website run start",
  "website:lint": "pnpm --filter website run lint"
}
```

## Customization Guide

### Update App URLs

Before deploying to production, update the app links in `website/app/page.tsx`:

```typescript
// Replace all instances of
href="http://localhost:5173"

// With your production app URL
href="https://app.yourrevopsdomain.com"
```

### Branding

- **Logo**: Update the "RevOps" text in the nav and footer
- **Colors**: Modify gradient colors in Tailwind classes
- **Metadata**: Update title and description in `app/layout.tsx`

### Add More Pages

Create new pages by adding files in the `app/` directory:

```
app/
├── about/
│   └── page.tsx         # /about
├── pricing/
│   └── page.tsx         # /pricing
└── docs/
    └── page.tsx         # /docs
```

### Custom Domain

After deploying to Vercel:
1. Go to project settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed

## Next Steps

1. **Review the landing page** at http://localhost:3000
2. **Customize content** to match your branding
3. **Add more pages** as needed (About, Pricing, Docs, etc.)
4. **Deploy to Vercel** when ready
5. **Configure custom domain** for production

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)
- Website README: `website/README.md`
- Deployment Guide: `website/DEPLOYMENT.md`

## Notes

- The website is completely independent from the main app
- It uses different ports (3000 vs 5173) to avoid conflicts
- All dependencies are managed separately within the website directory
- The website can be deployed independently to Vercel
- No environment variables are required for the static website

