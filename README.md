# Affiliate Product Finder

A powerful web application for discovering high-converting "hidden gem" affiliate products from WarriorPlus and Digistore24 marketplaces. Uses intelligent scoring algorithms to surface undermarketed products with high potential before the competition finds them.

## Features

**Multi-Marketplace Support**
- Discover products from WarriorPlus and Digistore24
- Switch between marketplaces with a single click
- Unified product discovery experience across platforms

**Hidden Gem Discovery**
- Intelligent scoring algorithm that weights recency, sales growth, low competition, and quality
- Identifies undermarketed products with high conversion potential
- Real-time score updates as marketplace data changes

**Product Discovery & Filtering**
- Browse products in a sortable, searchable table
- Filter by category (Affiliate Marketing, AI Tools, Software, E-commerce, etc.)
- Sort by Hidden Gem Score, sales volume, or launch date
- Full-text search across product names, vendors, and keywords

**Product Details & Analysis**
- Detailed product modal with key metrics
- Sales data and conversion indicators
- Score breakdown showing recency, growth, competition, and quality components
- Direct affiliate links and sales page preview

**Bookmark & Tracking System**
- Save promising products to your bookmarks
- Track product status (interested, researching, promoting, archived)
- Add notes to bookmarked products for future reference
- Dedicated bookmarks page for managing your product pipeline

**Data Management**
- Manual data refresh to fetch latest products
- Automatic caching to reduce API calls
- Refresh history and status tracking
- Error handling with clear user feedback

## Tech Stack

**Frontend**
- React 19 with TypeScript
- Tailwind CSS 4 for styling
- shadcn/ui components for consistent design
- tRPC for type-safe API calls
- Wouter for client-side routing

**Backend**
- Express.js server
- tRPC for API procedures
- Drizzle ORM for database
- MySQL/TiDB database
- Cheerio for web scraping (Digistore24)

**Testing**
- Vitest for unit tests
- Comprehensive test coverage for scoring algorithms

## Getting Started

### Prerequisites

- Node.js 22.13.0 or higher
- pnpm package manager
- WarriorPlus API key (for WarriorPlus marketplace)
- MySQL/TiDB database connection

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/affiliate-product-finder.git
cd affiliate-product-finder
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Configure your database connection in `.env`:
```
DATABASE_URL=mysql://user:password@localhost:3306/affiliate_finder
```

5. Apply database migrations:
```bash
pnpm db:push
```

6. Start the development server:
```bash
pnpm dev
```

The app will be available at `http://localhost:3000`

## Usage

### Connecting to WarriorPlus

1. Go to the app and select "WarriorPlus" from the marketplace dropdown
2. Get your API key from [WarriorPlus Account Settings](https://warriorplus.com/user/api-access.php)
3. Paste your API key and click "Connect"
4. Click "Refresh Data" to fetch products

### Using Digistore24

1. Select "Digistore24" from the marketplace dropdown
2. No API key required - the app scrapes the marketplace directly
3. Click "Connect" to proceed
4. Click "Refresh Data" to fetch products

### Discovering Hidden Gems

1. Use the category filter to narrow down by niche
2. Search for specific keywords or product names
3. Sort by "Hidden Gem Score" to see the most undermarketed products
4. Click "View" on any product to see detailed metrics
5. Bookmark promising products for later review

### Managing Bookmarks

1. Click "View Bookmarks" in the top right
2. See all your saved products with their status
3. Update status (interested → researching → promoting → archived)
4. Add notes to track your thoughts on each product

## Hidden Gem Scoring Algorithm

The scoring algorithm evaluates products on four key dimensions:

**Recency (0-30 points)**
- Newer products score higher
- Products less than 30 days old get maximum points
- Helps identify emerging trends before saturation

**Growth (0-30 points)**
- Based on sales volume and customer ratings
- Higher sales and ratings indicate market momentum
- Identifies products with proven demand

**Competition (0-25 points)**
- Lower review/comment count = less competition
- Products with fewer reviews are less saturated
- Indicates undermarketed opportunities

**Quality (0-15 points)**
- Based on customer ratings
- Higher ratings indicate quality products
- Ensures you're promoting products customers love

**Total Score: 0-100**
- Scores above 60 are "Hot" opportunities
- Scores 40-60 are "Warm" prospects
- Scores below 40 are "Cold" but may have niche appeal

## Database Schema

The app uses the following main tables:

- **users**: User authentication and profiles
- **api_credentials**: Stored API keys for each marketplace
- **products**: Cached product data with scores
- **bookmarks**: User-saved products with status tracking
- **data_refresh_log**: History of marketplace data refreshes

## API Endpoints

All endpoints are tRPC procedures under `/api/trpc`:

**Credentials**
- `credentials.save`: Store API key for a marketplace
- `credentials.get`: Retrieve stored credentials

**Products**
- `products.list`: Get cached products with pagination
- `products.search`: Search products by name/keyword
- `products.getByCategory`: Filter products by category
- `products.getDetail`: Get single product details
- `products.refresh`: Fetch latest products from marketplace

**Bookmarks**
- `bookmarks.add`: Save a product to bookmarks
- `bookmarks.remove`: Remove from bookmarks
- `bookmarks.list`: Get user's bookmarked products
- `bookmarks.updateStatus`: Update bookmark status

## Testing

Run the test suite:
```bash
pnpm test
```

Tests cover:
- Hidden Gem scoring algorithm for both marketplaces
- API credential management
- Authentication flows
- Data refresh logic

## Project Structure

```
affiliate-product-finder/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx          # Main discovery dashboard
│   │   │   └── Bookmarks.tsx     # Bookmarks management
│   │   ├── components/
│   │   │   └── ProductDetailModal.tsx
│   │   ├── lib/
│   │   │   └── trpc.ts           # tRPC client setup
│   │   └── App.tsx               # Routes and layout
│   └── index.html
├── server/
│   ├── routers.ts                # tRPC procedure definitions
│   ├── db.ts                     # Database helpers
│   ├── warriorplus.ts            # WarriorPlus API client
│   ├── digistore24.ts            # Digistore24 scraper
│   └── _core/                    # Framework internals
├── drizzle/
│   ├── schema.ts                 # Database schema
│   └── migrations/               # SQL migrations
├── shared/
│   └── const.ts                  # Shared constants
└── package.json
```

## Deployment

### Manus Platform (Recommended)

The app is built for Manus platform deployment:

1. Click "Publish" in the Manus Management UI
2. Configure custom domain if desired
3. App will be available at your Manus URL

### External Hosting

To deploy to external platforms (Railway, Render, Vercel):

1. Build the project:
```bash
pnpm build
```

2. Start the production server:
```bash
pnpm start
```

**Note**: External hosting may have compatibility issues. Manus platform is recommended for best results.

## Configuration

### Environment Variables

Key environment variables:

- `DATABASE_URL`: MySQL connection string
- `JWT_SECRET`: Session signing secret
- `VITE_APP_ID`: Manus OAuth app ID
- `OAUTH_SERVER_URL`: OAuth server URL

### Customization

**Scoring Algorithm**: Edit `calculateHiddenGemScore()` in `server/warriorplus.ts` and `server/digistore24.ts`

**Categories**: Update `CATEGORIES` array in `client/src/pages/Home.tsx`

**Styling**: Modify Tailwind config and CSS variables in `client/src/index.css`

## Troubleshooting

**"No products found" after refresh**
- Verify your API key is correct (for WarriorPlus)
- Check that marketplace is accessible
- Try refreshing again in a few moments

**Slow data refresh**
- First refresh may take longer as it fetches all products
- Subsequent refreshes are faster due to caching
- Consider increasing the refresh interval for large datasets

**Database connection errors**
- Verify DATABASE_URL is correct
- Ensure database server is running
- Check network connectivity to database

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Roadmap

- [ ] Affiliate link generation and tracking
- [ ] CSV export of bookmarks
- [ ] Analytics dashboard
- [ ] Email notifications for new hidden gems
- [ ] Mobile app
- [ ] Advanced filtering (price range, refund rate, etc.)
- [ ] Product comparison tool

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review existing [GitHub Issues](https://github.com/yourusername/affiliate-product-finder/issues)
3. Create a new issue with detailed information

## Acknowledgments

- WarriorPlus for marketplace API access
- Digistore24 for marketplace data
- Manus platform for hosting and infrastructure
- shadcn/ui for beautiful components
- Tailwind CSS for styling utilities

---

**Happy hunting for hidden gems!** 🎯

For the latest updates and features, follow this repository or check the [Releases](https://github.com/yourusername/affiliate-product-finder/releases) page.
