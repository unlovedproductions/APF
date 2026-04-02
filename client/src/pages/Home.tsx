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
import { Loader2, RefreshCw, Search, Bookmark, BookmarkCheck } from "lucide-react";
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

  // tRPC queries and mutations
  const credentialsQuery = trpc.credentials.get.useQuery(
    { platform: "warriorplus" },
    { enabled: isAuthenticated }
  );

  const productsQuery = trpc.products.list.useQuery(
    { platform: "warriorplus", limit: 100 },
    { enabled: isAuthenticated && !!credentialsQuery.data }
  );

  const refreshMutation = trpc.products.refresh.useMutation({
    onSuccess: () => {
      toast.success("Products refreshed successfully!");
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
    if (!apiKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    saveCredentialsMutation.mutate({ platform: "warriorplus", apiKey });
  };

  const handleRefresh = () => {
    refreshMutation.mutate({ platform: "warriorplus" });
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

  // Show API key setup if no credentials
  if (!credentialsQuery.data?.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Connect WarriorPlus</CardTitle>
            <CardDescription>Add your API key to get started</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <Button
              className="w-full"
              onClick={handleSaveApiKey}
              disabled={saveCredentialsMutation.isPending}
            >
              {saveCredentialsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
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
            <p className="text-slate-600">Find hidden gem affiliate products from WarriorPlus</p>
          </div>
          <Button asChild variant="outline">
            <a href="/bookmarks">View Bookmarks</a>
          </Button>
        </div>

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

            <div className="flex gap-2">
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
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500">No products found. Try refreshing your data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      <TableRow key={product.id} className="hover:bg-slate-50 cursor-pointer">
                        <TableCell className="font-medium">
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
