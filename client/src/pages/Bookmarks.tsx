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
import { Loader2, Trash2, ExternalLink } from "lucide-react";
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

        {/* Filter */}
        <Card className="mb-6">
          <CardContent className="pt-6">
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
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : filteredBookmarks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500">
                  {bookmarksQuery.data?.length === 0
                    ? "No bookmarks yet. Start saving products from the discovery page!"
                    : "No bookmarks match this filter."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
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
