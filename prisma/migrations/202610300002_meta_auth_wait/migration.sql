-- Retire retries registered with a revoked/expired credential, retaining data and cursors.
UPDATE "MetaAdAccount"
SET "nextSyncAt"=NULL, "schedulerToken"=NULL, "schedulerRunId"=NULL
WHERE "syncError" ~* '(código|code)[[:space:]]*(190|102)([^0-9]|$)|HTTP[[:space:]]*401([^0-9]|$)';
