import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ProductDetailModal } from "@/components/ProductDetailModal";

const CATEGORIES = [
  "All Categories",
  "Affiliate Marketing",
  "AI Tools",
  "Software",
  "E-commerce",
  "Content Creation",
  "SEO",
  "Email Marketing",
  "Social Media",
  "Paid Ads",
  "Personal Development",
  "Business",
  "Finance",
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "sales" | "date">("score");
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<"warriorplus" | "digistore24" | "clickbank" | "shareasale">("warriorplus");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());

  // tRPC queries and mutations
  const credentialsQuery = trpc.credentials.get.useQuery(
    { platform: selectedMarketplace },
    { enabled: isAuthenticated }
  );

  const productsQuery = trpc.products.list.useQuery(
    { platform: selectedMarketplace, limit: 100 },
    { enabled: isAuthenticated && (selectedMarketplace === "digistore24" || selectedMarketplace === "clickbank" || !!credentialsQuery.data) }
  );

  const refreshMutation = trpc.products.refresh.useMutation({
    onSuccess: () => {
      toast.success(`${selectedMarketplace === "warriorplus" ? "WarriorPlus" : "Digistore24"} products refreshed successfully!`);
      productsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to refresh products");
    },
  });

  const saveCredentialsMutation = trpc.credentials.save.useMutation({
    onSuccess: () => {
      toast.success("API credentials saved!");
      setApiKey("");
      setShowApiKeySetup(false);
      credentialsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save credentials");
    },
  });

  const handleSaveApiKey = () => {
    if (selectedMarketplace === "digistore24" || selectedMarketplace === "clickbank") {
      const platformName = selectedMarketplace === "digistore24" ? "Digistore24" : "ClickBank";
      toast.success(`${platformName} marketplace is ready to use!`);
      // For ClickBank, we can still save a dummy key to mark it as active in the DB
      saveCredentialsMutation.mutate({ platform: selectedMarketplace, apiKey: "PUBLIC_FEED" });
      setShowApiKeySetup(false);
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    saveCredentialsMutation.mutate({ platform: selectedMarketplace, apiKey });
  };

  const handleMarketplaceChange = (value: string) => {
    setSelectedMarketplace(value as "warriorplus" | "digistore24" | "clickbank" | "shareasale");
    setShowApiKeySetup(false);
    setApiKey("");
  };

  const handleRefresh = () => {
    refreshMutation.mutate({ platform: selectedMarketplace });
  };

  const toggleProductSelection = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const exportSelectedToShadowCast = () => {
    const productsToExport = filteredProducts.filter(p => selectedProducts.has(p.id));
    if (productsToExport.length === 0) {
      toast.error("Please select products to export");
      return;
    }

    const shadowCastProducts = productsToExport.map(product => ({
      product_name: product.name,
      niche: product.category,
      key_features: product.description
        ? product.description.split(/[,;.]/).map(f => f.trim()).filter(f => f && f.length > 0).slice(0, 5)
        : [],
      affiliate_link: product.affiliateLink || "[YOUR_AFFILIATE_LINK]",
      keywords: product.keywords ? (typeof product.keywords === 'string' ? JSON.parse(product.keywords) : product.keywords) : [],
      product_category: product.platform || product.category,
      competitors: product.vendor ? [product.vendor] : [],
      discount_info: product.commissionRate ? `${product.commissionRate}% commission` : "",
      unique_selling_point: product.hiddenGemScore ? `Hidden Gem Score: ${Number(product.hiddenGemScore).toFixed(1)}/50` : "",
      content_style: "honest_review",
      price: "$49.99",
      target_audience: "General consumers",
      coupon_code: "",
      common_complaints: "",
      common_praises: "",
      who_not_for: "",
      series_name: "",
      price_comparison: "",
    }));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `shadowcast_import_${timestamp}.json`;
    const dataStr = JSON.stringify(shadowCastProducts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${productsToExport.length} products to ShadowCast JSON!`);
    setSelectedProducts(new Set());
  };

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = productsQuery.data || [];

    // Filter by category
    if (selectedCategory !== "All Categories") {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.vendor?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "score") {
        return (Number(b.hiddenGemScore) || 0) - (Number(a.hiddenGemScore) || 0);
      } else if (sortBy === "sales") {
        return (b.saleCount || 0) - (a.saleCount || 0);
      } else {
        return new Date(b.platformCreatedAt || 0).getTime() - new Date(a.platformCreatedAt || 0).getTime();
      }
    });

    return sorted;
  }, [productsQuery.data, selectedCategory, searchQuery, sortBy]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Affiliate Product Finder</CardTitle>
            <CardDescription>Discover hidden gem products before they get saturated</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              Sign in to start finding high-potential affiliate products from WarriorPlus.
            </p>
            <Button className="w-full" onClick={() => window.location.href = "/api/oauth/login"}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show setup screen if no credentials
  if (!credentialsQuery.data?.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Connect {selectedMarketplace === "warriorplus" ? "WarriorPlus" : "Digistore24"}</CardTitle>
            <CardDescription>
              {selectedMarketplace === "warriorplus"
                ? "Add your API key to get started"
                : "Ready to discover products"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Marketplace</label>
              <Select value={selectedMarketplace} onValueChange={handleMarketplaceChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warriorplus">WarriorPlus</SelectItem>
                  <SelectItem value="digistore24">Digistore24</SelectItem>
                  <SelectItem value="clickbank">ClickBank</SelectItem>
                  <SelectItem value="shareasale">ShareASale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedMarketplace === "warriorplus" && (
              <div>
                <label className="text-sm font-medium mb-2 block">WarriorPlus API Key</label>
                <Input
                  type="password"
                  placeholder="Paste your API key here"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-2">
                  Get your API key from{" "}
                  <a
                    href="https://warriorplus.com/user/api-access.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    WarriorPlus Account Settings
                  </a>
                </p>
              </div>
            )}

            {selectedMarketplace === "shareasale" && (
              <div>
                <label className="text-sm font-medium mb-2 block">ShareASale Credentials</label>
                <Input
                  type="password"
                  placeholder="affiliateId:token:secretKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-2">
                  Format: <strong>affiliateId:token:secretKey</strong>. Get these from your ShareASale API settings.
                </p>
              </div>
            )}

            {(selectedMarketplace === "digistore24" || selectedMarketplace === "clickbank") && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-900">
                  {selectedMarketplace === "digistore24" ? "Digistore24" : "ClickBank"} marketplace is ready to use. No API key required for public data.
                </p>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleSaveApiKey}
              disabled={saveCredentialsMutation.isPending}
            >
              {saveCredentialsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {selectedMarketplace === "warriorplus" ? "Saving..." : "Connecting..."}
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Product Discovery</h1>
            <p className="text-slate-600">Find hidden gem affiliate products from multiple marketplaces</p>
          </div>
          <Button asChild variant="outline">
            <a href="/bookmarks">View Bookmarks</a>
          </Button>
        </div>

        {/* Marketplace Selector */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-700 mb-2 block">Select Marketplace</label>
                <Select value={selectedMarketplace} onValueChange={handleMarketplaceChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warriorplus">WarriorPlus</SelectItem>
                    <SelectItem value="digistore24">Digistore24</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-600 mt-8">
                  {selectedMarketplace === "warriorplus"
                    ? "Requires WarriorPlus API key"
                    : "No API key needed - marketplace scraping enabled"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              {/* Search */}
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Hidden Gem Score</SelectItem>
                  <SelectItem value="sales">Sales Volume</SelectItem>
                  <SelectItem value="date">Newest First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleRefresh}
                disabled={refreshMutation.isPending}
                variant="outline"
                className="flex-1 md:flex-none"
              >
                {refreshMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Data
                  </>
                )}
              </Button>
              {selectedProducts.size > 0 && (
                <Button
                  onClick={exportSelectedToShadowCast}
                  variant="outline"
                  className="flex-1 md:flex-none"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export {selectedProducts.size} to ShadowCast
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>
              Products ({filteredProducts.length})
            </CardTitle>
            <CardDescription>
              {selectedCategory !== "All Categories" && `Filtered by: ${selectedCategory}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {productsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Loading products...</p>
                </div>
              </div>
            ) : productsQuery.isError ? (
              <div className="text-center py-12">
                <p className="text-red-600 font-medium mb-2">Failed to load products</p>
                <p className="text-slate-500 text-sm mb-4">There was an error fetching your products. Please try refreshing.</p>
                <Button onClick={handleRefresh} disabled={refreshMutation.isPending} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                {productsQuery.data?.length === 0 ? (
                  <>
                    <p className="text-slate-600 font-medium mb-2">No products in database</p>
                    <p className="text-slate-500 text-sm mb-4">Click "Refresh Data" to fetch products from WarriorPlus</p>
                    <Button onClick={handleRefresh} disabled={refreshMutation.isPending}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Now
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-slate-600 font-medium mb-2">No products match your filters</p>
                    <p className="text-slate-500 text-sm">Try adjusting your category or search query</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Hidden Gem Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id} className="hover:bg-slate-50">
                        <TableCell className="w-10">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProductSelection(product.id)}
                            className="rounded"
                          />
                        </TableCell>
                        <TableCell className="font-medium cursor-pointer" onClick={() => setSelectedProductId(product.id)}>
                          <div>
                            <p className="font-semibold text-slate-900">{product.name}</p>
                            <p className="text-sm text-slate-500">{product.vendor}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{product.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {product.saleCount || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-200 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{ width: `${Math.min(Number(product.hiddenGemScore) * 2, 100)}%` }}
                              />
                            </div>
                            <span className="font-semibold text-slate-900 w-8 text-right">
                              {Number(product.hiddenGemScore).toFixed(0)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {Number(product.hiddenGemScore) > 60 ? (
                            <Badge className="bg-green-100 text-green-800">Hot</Badge>
                          ) : Number(product.hiddenGemScore) > 40 ? (
                            <Badge className="bg-blue-100 text-blue-800">Warm</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-800">Cold</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedProductId(product.id)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Detail Modal */}
        {selectedProductId && (
          <ProductDetailModal
            productId={selectedProductId}
            open={!!selectedProductId}
            onOpenChange={(open) => {
              if (!open) setSelectedProductId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
