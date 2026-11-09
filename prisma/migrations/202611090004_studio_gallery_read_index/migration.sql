-- @online-index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Variation_gallery_page_idx" ON "Variation" ("subproductId","createdAt" DESC,id DESC);
