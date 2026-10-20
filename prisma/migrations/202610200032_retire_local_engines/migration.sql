-- Retire local/hybrid generation without changing jobs, images or encrypted credentials.
UPDATE "GenerationEngineConfiguration"
SET "aiEnabled"=true, "propioxEnabled"=false, "defaultEngine"='ai',
    revision=revision+1, "updatedAt"=CURRENT_TIMESTAMP
WHERE NOT "aiEnabled" OR "propioxEnabled" OR "defaultEngine" <> 'ai';
