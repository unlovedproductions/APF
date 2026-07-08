import { Link } from "wouter";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Bookmarks() {
  const bookmarksQuery = trpc.bookmarks.list.useQuery();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const exportMutation = trpc.products.exportToShadowCast.useMutation({
    onSuccess: (data: any) => {
      const count = data?.count ?? selected.size;
      toast.success(`Sent ${count} bookmarked products to ShadowCast.`);
      if (data?.firstOpenUrl) window.open(data.firstOpenUrl, "_blank", "noopener,noreferrer");
      setSelected(new Set());
    },
    onError: (error) => toast.error(error.message || "Failed to send bookmarks to ShadowCast"),
  });

  if (bookmarksQuery.isLoading) {
    return (
      <main className="container mx-auto p-6">
        <p>Loading bookmarks...</p>
      </main>
    );
  }

  if (bookmarksQuery.error) {
    return (
      <main className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Bookmarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">
              Failed to load bookmarks: {bookmarksQuery.error.message}
            </p>
            <Link href="/">
              <Button className="mt-4">Back to products</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const bookmarks = bookmarksQuery.data ?? [];
  const exportable = useMemo(
    () => bookmarks.filter((bookmark: any) => bookmark.productId && bookmark.product).map((bookmark: any) => bookmark.productId),
    [bookmarks]
  );
  const toggleSelection = (productId: number) => {
    const next = new Set(selected);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === exportable.length) setSelected(new Set());
    else setSelected(new Set(exportable));
  };

  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookmarked Products</h1>
        <div className="flex items-center gap-2">
          {bookmarks.length > 0 && (
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate({ productIds: Array.from(selected) })}
              disabled={selected.size === 0 || exportMutation.isPending}
            >
              {exportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Send {selected.size} to ShadowCast
            </Button>
          )}
          <Link href="/">
            <Button variant="outline">Back to products</Button>
          </Link>
        </div>
      </div>

      {bookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p>No bookmarked products yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === exportable.length}
              onChange={toggleAll}
            />
            <span className="text-sm text-slate-600">Select all</span>
          </div>
          {bookmarks.map((bookmark: any) => {
            const product = bookmark.product;
            const productId = Number(bookmark.productId);

            return (
              <Card key={bookmark.id ?? `${bookmark.productId}-${bookmark.createdAt}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(productId)}
                      onChange={() => toggleSelection(productId)}
                    />
                    {product?.name ?? `Product #${bookmark.productId}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {product?.vendor && <p>Vendor: {product.vendor}</p>}
                  {product?.platform && <p>Platform: {product.platform}</p>}

                  <div className="flex gap-2">
                    {bookmark.status && <Badge>{bookmark.status}</Badge>}
                    {product?.commissionRate && (
                      <Badge variant="secondary">
                        Commission: {product.commissionRate}
                      </Badge>
                    )}
                  </div>

                  {bookmark.notes && (
                    <p className="text-sm text-muted-foreground">
                      Notes: {bookmark.notes}
                    </p>
                  )}

                  {product?.affiliateLink && (
                    <a
                      href={product.affiliateLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Open affiliate link
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
