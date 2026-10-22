ALTER TABLE "MetaConnection" ADD COLUMN "encryptedAppSecret" TEXT;
ALTER TABLE "MetaConnection" ADD COLUMN "appSecretConfiguredAt" TIMESTAMPTZ;
ALTER TABLE "MetaConnection" ADD COLUMN "loginConfigId" TEXT;
ALTER TABLE "MetaConnection" ADD COLUMN "authMethod" TEXT;
ALTER TABLE "MetaConnection" ADD COLUMN "tokenExpiresAt" TIMESTAMPTZ;
ALTER TABLE "MetaConnection" ADD COLUMN "metaUserId" TEXT;
ALTER TABLE "MetaOAuthState" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'MCP';
