ALTER TABLE "MetaInventoryItem" ADD COLUMN syllabi JSONB NOT NULL DEFAULT '[]', ADD COLUMN "syllabusRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MetaInventoryItem" ADD CONSTRAINT "MetaInventoryItem_syllabi_array" CHECK (jsonb_typeof(syllabi) = 'array');
