ALTER TABLE "MetaAdvisorTarget"
  DROP CONSTRAINT "MetaAdvisorTarget_basis_check",
  ADD CONSTRAINT "MetaAdvisorTarget_basis_check"
    CHECK ("basis" IN ('BC', 'BM', 'B'));
