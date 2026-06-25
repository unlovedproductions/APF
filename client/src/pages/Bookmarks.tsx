import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Bookmarks() {
  const bookmarksQuery = trpc.bookmarks.list.useQuery();

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

  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookmarked Products</h1>
        <Link href="/">
          <Button variant="outline">Back to products</Button>
        </Link>
      </div>

      {bookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p>No bookmarked products yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bookmarks.map((bookmark: any) => {
            const product = bookmark.product;

            return (
              <Card key={bookmark.id ?? `${bookmark.productId}-${bookmark.createdAt}`}>
                <CardHeader>
                  <CardTitle>
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
