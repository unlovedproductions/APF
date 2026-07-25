import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookmarkCheck, Bookmark, Copy, ExternalLink, Loader2, Download, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isEnrichmentExportReady } from "@/lib/utils";
import { toast } from "sonner";

interface ProductDetailModalProps {
  productId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function enrichmentBadgeClass(status: string) {
  if (status === "complete") return "bg-emerald-100 text-emerald-800";
  if (status === "complete_degraded") return "bg-amber-100 text-amber-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "pending_api_key") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-800";
}

export function ProductDetailModal({ productId, open, onOpenChange }: ProductDetailModalProps) {
  const [bookmarkNotes, setBookmarkNotes] = useState("");
  const [bookmarkStatus, setBookmarkStatus] = useState<"interested" | "researching" | "promoting" | "archived">("interested");
  const productQuery = trpc.products.getDetail.useQuery({ productId }, { enabled: open });
  const payloadQuery = trpc.products.shadowCastPayload.useQuery({ productId }, { enabled: open });
  const bookmarksQuery = trpc.bookmarks.list.useQuery(undefined, { enabled: open });
  const currentBookmark = bookmarksQuery.data?.find(b => b.productId === productId);
  const addBookmarkMutation = trpc.bookmarks.add.useMutation({
    onSuccess: () => {
      toast.success("Product bookmarked!");
      bookmarksQuery.refetch();
      setBookmarkNotes("");
    },
    onError: (error) => toast.error(error.message || "Failed to bookmark product"),
  });
  const removeBookmarkMutation = trpc.bookmarks.remove.useMutation({
    onSuccess: () => {
      toast.success("Bookmark removed");
      bookmarksQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Failed to remove bookmark"),
  });
  const updateStatusMutation = trpc.bookmarks.updateStatus.useMutation({
    onSuccess: () => toast.success("Status updated"),
    onError: (error) => toast.error(error.message || "Failed to update status"),
  });
  const exportMutation = trpc.products.exportToShadowCast.useMutation({
    onSuccess: (data: any) => {
      const first = data?.results?.[0];
      if (first?.openUrl) window.open(first.openUrl, "_blank", "noopener,noreferrer");
      toast.success("Sent to ShadowCast. Review draft before generating.");
    },
    onError: (error) => toast.error(error.message || "Failed to send to ShadowCast"),
  });
  const product = productQuery.data as any;
  const isBookmarked = !!currentBookmark;

  const handleBookmark = () => {
    if (isBookmarked) removeBookmarkMutation.mutate({ productId });
    else addBookmarkMutation.mutate({ productId, notes: bookmarkNotes });
  };
  const handleStatusChange = (status: string) => {
    setBookmarkStatus(status as any);
    updateStatusMutation.mutate({ productId, status: status as any });
  };
  const handleCopyLink = () => {
    if (!product?.affiliateLink) return;
    navigator.clipboard.writeText(product.affiliateLink);
    toast.success("Affiliate link copied!");
  };
  const handleDownloadPayload = () => {
    const payload = payloadQuery.data;
    if (!payload) return;
    const safe = String(payload?.product?.name || `product_${productId}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const filename = `${safe || "product"}_shadowcast_enriched.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isBookmarked && currentBookmark) setBookmarkStatus(currentBookmark.status as any);
  }, [isBookmarked, currentBookmark]);

  if (!product && productQuery.isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!product) return null;

  let scoreComponents: any = null;
  try {
    scoreComponents = product.scoreComponents ? JSON.parse(product.scoreComponents) : null;
  } catch {
    scoreComponents = null;
  }
  const enrichmentStatus = String(product.enrichmentStatus || payloadQuery.data?.review_enrichment?.status || "pending");
  const enrichmentComplete = isEnrichmentExportReady(enrichmentStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{product.name}</DialogTitle>
          <DialogDescription>{product.vendor}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-sm text-slate-500 mb-1">Category</p><Badge>{product.category}</Badge></div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Hidden Gem Score</p>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-slate-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(Number(product.hiddenGemScore), 100)}%` }} /></div>
                <span className="font-bold text-lg">{Number(product.hiddenGemScore).toFixed(1)}</span>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Sales Metrics</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div><p className="text-sm text-slate-500 mb-1">Sales Count</p><p className="text-2xl font-bold">{product.saleCount || 0}</p></div>
              <div><p className="text-sm text-slate-500 mb-1">Total Sales</p><p className="text-2xl font-bold">${Number(product.aggregateSales).toLocaleString()}</p></div>
              <div><p className="text-sm text-slate-500 mb-1">Refunds</p><p className="text-2xl font-bold">{product.refundCount || 0}</p></div>
            </CardContent>
          </Card>
          {scoreComponents && (
            <Card>
              <CardHeader><CardTitle className="text-base">Score Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><div className="flex justify-between mb-1"><span className="text-sm font-medium">Recency</span><span className="text-sm font-bold">{scoreComponents.recency}/20</span></div><div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(scoreComponents.recency / 20) * 100}%` }} /></div></div>
                <div><div className="flex justify-between mb-1"><span className="text-sm font-medium">Growth</span><span className="text-sm font-bold">{scoreComponents.growth}/30</span></div><div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${(scoreComponents.growth / 30) * 100}%` }} /></div></div>
                <div><div className="flex justify-between mb-1"><span className="text-sm font-medium">Low Competition</span><span className="text-sm font-bold">{scoreComponents.competition}/10</span></div><div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(scoreComponents.competition / 10) * 100}%` }} /></div></div>
                <div><div className="flex justify-between mb-1"><span className="text-sm font-medium">Quality</span><span className="text-sm font-bold">{scoreComponents.quality}/40</span></div><div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-orange-500 h-2 rounded-full" style={{ width: `${(scoreComponents.quality / 40) * 100}%` }} /></div></div>
              </CardContent>
            </Card>
          )}
          {product.affiliateLink && (
            <Card>
              <CardHeader><CardTitle className="text-base">Affiliate Link</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <input type="text" value={product.affiliateLink} readOnly className="flex-1 px-3 py-2 border border-slate-200 rounded-md bg-slate-50 text-sm font-mono truncate" />
                  <Button size="sm" variant="outline" onClick={handleCopyLink}><Copy className="w-4 h-4" /></Button>
                  <Button size="sm" variant="outline" asChild><a href={product.affiliateLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a></Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Export to ShadowCast</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Send as an enriched draft for review.</p>
                <Badge className={enrichmentBadgeClass(enrichmentStatus)}>Enrichment: {enrichmentStatus}</Badge>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={handleDownloadPayload} disabled={!payloadQuery.data || payloadQuery.isLoading}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Enriched JSON
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => exportMutation.mutate({ productIds: [productId] })}
                  disabled={exportMutation.isPending || !enrichmentComplete}
                  title={enrichmentComplete ? undefined : "Wait for review enrichment to complete before sending to ShadowCast."}
                >
                  {exportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send to ShadowCast
                </Button>
              </div>
              {!enrichmentComplete && (
                <p className="text-xs text-amber-700">Review enrichment must be complete before ShadowCast export.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Save Product</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isBookmarked && currentBookmark && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <Select value={bookmarkStatus} onValueChange={handleStatusChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="researching">Researching</SelectItem>
                      <SelectItem value="promoting">Promoting</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  {currentBookmark.notes && <p className="text-sm text-slate-600 mt-3 p-2 bg-slate-50 rounded">{currentBookmark.notes}</p>}
                </div>
              )}
              {!isBookmarked && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
                  <Textarea placeholder="Add notes about why this product interests you..." value={bookmarkNotes} onChange={(e) => setBookmarkNotes(e.target.value)} className="min-h-24" />
                </div>
              )}
              <Button className="w-full" variant={isBookmarked ? "destructive" : "default"} onClick={handleBookmark} disabled={addBookmarkMutation.isPending || removeBookmarkMutation.isPending}>
                {addBookmarkMutation.isPending || removeBookmarkMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isBookmarked ? "Removing..." : "Saving..."}</>
                ) : isBookmarked ? (
                  <><BookmarkCheck className="w-4 h-4 mr-2" />Remove Bookmark</>
                ) : (
                  <><Bookmark className="w-4 h-4 mr-2" />Save Product</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
