ALTER TABLE "User" ADD COLUMN "menuVisibility" JSONB;
CREATE TABLE "RoleMenu" ("role" "Role" PRIMARY KEY, "menu" JSONB NOT NULL);
