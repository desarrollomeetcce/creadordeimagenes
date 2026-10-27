-- Keep existing labels/IDs and permit explicitly chosen case variants as distinct definitions.
UPDATE "MetaInventoryCategory" SET key = name;
