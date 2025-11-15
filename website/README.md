# RevOps Website

Public-facing marketing website for the RevOps data analytics platform.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **TypeScript**: Full type safety
- **Deployment**: Vercel

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The development server runs on [http://localhost:3000](http://localhost:3000).

## Project Structure

```
website/
├── app/
│   ├── layout.tsx       # Root layout with metadata
│   ├── page.tsx         # Home page
│   └── globals.css      # Global styles
├── public/              # Static assets
└── package.json
```

## Deployment to Vercel

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/revops)

### Manual Deploy

1. Install Vercel CLI:

   ```bash
   npm i -g vercel
   ```

2. Deploy:

   ```bash
   cd website
   vercel
   ```

3. Follow the prompts to link your project

### Environment Variables

No environment variables are required for the static website. The app links point to `http://localhost:5173` for local development - update these in production to point to your deployed app URL.

## Customization

### Update App URLs

In `app/page.tsx`, update the app links from `http://localhost:5173` to your production app URL:

```typescript
// Find and replace
href = "http://localhost:5173";
// with
href = "https://app.yourrevopsdomain.com";
```

### Branding

- Logo and brand colors are defined in `app/page.tsx`
- Global styles in `app/globals.css`
- Metadata (title, description) in `app/layout.tsx`

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

## Features

- 🎨 Modern, responsive design
- 🌙 Dark mode support
- ⚡ Optimized performance
- 📱 Mobile-first approach
- ♿ Accessible components
- 🔍 SEO optimized

## Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
