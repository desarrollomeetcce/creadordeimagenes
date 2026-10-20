ALTER TABLE "LibraryDocument" DROP CONSTRAINT "LibraryDocument_size_check";
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_size_check" CHECK (size > 0 AND size <= 1073741824);
