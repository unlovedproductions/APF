# Affiliate Product Finder - Project TODO

## Phase 1: Database & Backend Setup
- [x] Generate and apply database migrations
- [x] Implement API credential storage (WarriorPlus API key management)
- [x] Create WarriorPlus API client with pagination support
- [x] Implement Hidden Gem scoring algorithm
- [x] Create data refresh mechanism with caching

## Phase 2: Backend API Procedures
- [x] Create tRPC procedure: `credentials.save` - Store WarriorPlus API key
- [x] Create tRPC procedure: `credentials.get` - Retrieve stored credentials
- [x] Create tRPC procedure: `products.refresh` - Fetch latest products from WarriorPlus
- [x] Create tRPC procedure: `products.list` - Get cached products with filtering
- [x] Create tRPC procedure: `products.search` - Search products by name/keyword
- [x] Create tRPC procedure: `products.getDetail` - Get single product details
- [x] Create tRPC procedure: `bookmarks.add` - Save a product to bookmarks
- [x] Create tRPC procedure: `bookmarks.remove` - Remove from bookmarks
- [x] Create tRPC procedure: `bookmarks.list` - Get user's bookmarked products
- [x] Create tRPC procedure: `bookmarks.updateStatus` - Update bookmark status

## Phase 3: Frontend - Dashboard & Layout
- [x] Design color scheme and typography (clean, data-focused)
- [x] Create main Dashboard page shell
- [x] Add navigation menu items

## Phase 4: Frontend - Product Discovery
- [x] Create category/topic filter dropdown (Affiliate Marketing, AI Tools, Software, etc.)
- [x] Create search bar component
- [x] Create sortable product table with columns: Name, Vendor, Category, Sales, Hidden Gem Score
- [x] Implement table sorting functionality
- [x] Implement table filtering by category
- [x] Implement search functionality

## Phase 5: Frontend - Product Details & Bookmarks
- [x] Create product detail modal
- [x] Display affiliate link in modal
- [x] Display sales metrics and hidden gem score breakdown
- [x] Create bookmark button (add/remove)
- [x] Show bookmark status (interested, researching, promoting, archived)
- [x] Create bookmarks list view (separate page)

## Phase 6: Frontend - Data Management
- [x] Create API credentials setup page
- [x] Add "Connect WarriorPlus" button with API key input
- [x] Create manual data refresh button
- [x] Display refresh status (loading, success, error)
- [x] Add loading states and error handling

## Phase 7: Testing & Polish
- [x] Write vitest tests for Hidden Gem scoring algorithm
- [x] All tests passing
- [x] Add navigation between pages (Discovery and Bookmarks)
- [x] Handle edge cases (no API key, no products, network errors)
- [x] Add empty states and loading indicators
- [x] Responsive design validation

## Phase 8: Delivery
- [x] Final UI polish and responsive design check
- [x] Create checkpoint
- [x] Deliver to user with documentation

## Phase 9: Digistore24 Integration
- [x] Research Digistore24 API and marketplace data access methods
- [x] Implement Digistore24 marketplace scraping client
- [x] Create Hidden Gem scoring algorithm for Digistore24 products
- [x] Integrate Digistore24 fetching into products.refresh procedure
- [x] Add marketplace selection state to Home page
- [x] Update API setup screen to support both marketplaces
- [x] Add marketplace selector card to main dashboard
- [x] Update product queries to support marketplace parameter
- [x] Write and pass tests for Digistore24 scoring algorithm
- [x] Verify all existing tests still pass
- [x] Update UI descriptions to mention "multiple marketplaces"

## Phase 10: GitHub Deployment
- [ ] Create GitHub repository
- [ ] Push all code to GitHub
- [ ] Add README with setup instructions
- [ ] Add GitHub Actions CI/CD (optional)
