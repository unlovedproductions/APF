import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, ExternalLink, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ProductDetailModal } from "@/components/ProductDetailModal";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  interested: { bg: "bg-blue-100", text: "text-blue-800" },
  researching: { bg: "bg-purple-100", text: "text-purple-800" },
  promoting: { bg: "bg-green-100", text: "text-green-800" },
  archived: { bg: "bg-slate-100", text: "text-slate-800" },
};

export default function Bookmarks() {
  const { isAuthenticated } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());

  // Queries
  const bookmarksQuery = trpc.bookmarks.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Mutations
  const removeBookmarkMutation = trpc.bookmarks.remove.useMutation({
    onSuccess: () => {
      toast.success("Bookmark removed");
      bookmarksQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove bookmark");
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Please sign in to view your bookmarks.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter bookmarks
  const filteredBookmarks = (bookmarksQuery.data || []).filter((bookmark) => {
    if (filterStatus === "all") return true;
    return bookmark.status === filterStatus;
  });

  const handleRemove = (productId: number) => {
    removeBookmarkMutation.mutate({ productId });
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
    if (selectedProducts.size === filteredBookmarks.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredBookmarks.map(b => b.product?.id).filter(Boolean) as number[]));
    }
  };

  const exportAllToShadowCast = () => {
    const productsToExport = filteredBookmarks
      .map(b => b.product)
      .filter(Boolean) as any[];
    
    if (productsToExport.length === 0) {
      toast.error("No products to export");
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
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Saved Products</h1>
            <p className="text-slate-600">Your bookmarked affiliate products</p>
          </div>
          <Button asChild variant="outline">
            <a href="/">Back to Discovery</a>
          </Button>
        </div>

        {/* Filter and Export */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center justify-between flex-wrap">
              <div className="flex gap-4 items-center">
                <label className="text-sm font-medium">Filter by Status:</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="interested">Interested</SelectItem>
                    <SelectItem value="researching">Researching</SelectItem>
                    <SelectItem value="promoting">Promoting</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {filteredBookmarks.length > 0 && (
                <Button
                  onClick={exportAllToShadowCast}
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export All to ShadowCast
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bookmarks List */}
        <Card>
          <CardHeader>
            <CardTitle>
              Bookmarks ({filteredBookmarks.length})
            </CardTitle>
            <CardDescription>
              {filterStatus !== "all" && `Filtered by: ${filterStatus}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookmarksQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Loading bookmarks...</p>
                </div>
              </div>
            ) : bookmarksQuery.isError ? (
              <div className="text-center py-12">
                <p className="text-red-600 font-medium mb-2">Failed to load bookmarks</p>
                <p className="text-slate-500 text-sm">There was an error loading your saved products</p>
              </div>
            ) : filteredBookmarks.length === 0 ? (
              <div className="text-center py-12">
                {bookmarksQuery.data?.length === 0 ? (
                  <>
                    <p className="text-slate-600 font-medium mb-2">No bookmarks yet</p>
                    <p className="text-slate-500 text-sm mb-4">Start saving products from the discovery page to track your hidden gems</p>
                    <Button asChild>
                      <a href="/">Go to Discovery</a>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-slate-600 font-medium mb-2">No bookmarks match this filter</p>
                    <p className="text-slate-500 text-sm">Try selecting a different status</p>
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
                          checked={selectedProducts.size === filteredBookmarks.length && filteredBookmarks.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookmarks.map((bookmark) => {
                      const product = bookmark.product;
                      if (!product) return null;

                      const colors = STATUS_COLORS[bookmark.status] || STATUS_COLORS.interested;

                      return (
                        <TableRow key={bookmark.id} className="hover:bg-slate-50">
                          <TableCell className="w-10">
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={() => toggleProductSelection(product.id)}
                              className="rounded"
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>
                              <p className="font-semibold text-slate-900">{product.name}</p>
                              <p className="text-sm text-slate-500">{product.vendor}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{product.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${colors.bg} ${colors.text}`}>
                              {bookmark.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-slate-600 max-w-xs truncate">
                              {bookmark.notes || "-"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-semibold text-slate-900">
                              {Number(product.hiddenGemScore).toFixed(0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-2 justify-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedProductId(product.id)}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemove(product.id)}
                                disabled={removeBookmarkMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
