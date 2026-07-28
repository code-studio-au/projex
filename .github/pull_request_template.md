## Summary

- what changed
- why it changed

## Verification

- [ ] `pnpm run verify:app`
- [ ] Relevant database and smoke lanes pass, or are noted below
- [ ] GitHub Code Quality has no unresolved findings
- [ ] Maintainability and reliability remain **Excellent**

## Risk

- user-facing impact
- migration or deploy considerations
- follow-up work if any

## Database migration review

Complete these when the pull request changes the database schema; otherwise
mark them not applicable in the summary.

- [ ] The migration follows the documented expand/migrate/contract sequence.
- [ ] The upgraded schema remains compatible with the immediately previous
      application release.
- [ ] Rollback evidence confirms the previous release can run after the
      forward migration remains applied.
- [ ] Any destructive contract step identifies the earlier compatibility
      release and proves that release is no longer a rollback candidate.
