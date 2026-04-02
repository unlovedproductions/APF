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
- [ ] Create bookmarks list view (separate page)

## Phase 6: Frontend - Data Management
- [x] Create API credentials setup page
- [x] Add "Connect WarriorPlus" button with API key input
- [x] Create manual data refresh button
- [x] Display refresh status (loading, success, error)
- [x] Add loading states and error handling

## Phase 7: Testing & Polish
- [x] Write vitest tests for Hidden Gem scoring algorithm
- [x] All tests passing
- [ ] Test product filtering and search (manual)
- [ ] Test bookmark functionality (manual)
- [ ] Handle edge cases (no API key, no products, network errors)
- [ ] Add empty states and loading skeletons

## Phase 8: Delivery
- [ ] Final UI polish and responsive design check
- [ ] Create checkpoint
- [ ] Deliver to user with documentation
