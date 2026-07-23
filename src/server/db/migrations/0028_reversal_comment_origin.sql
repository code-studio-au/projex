alter table txn_comments
  add column if not exists comment_origin text not null default 'user';

update txn_comments
set comment_origin = 'reversal_workflow'
where body ~ '^\[(Pending reversal|Pending reversal cleared|Reversal exception|Reversal exception returned to pending|Reversal matched|Matched as reversal|Reversal match removed|Removed as reversal match|Reversal match suggested|Suggested as reversal|Default reversal match selected|Defaulted as reversal|Suggested reversal rejected|Removed as suggested reversal|Default reversal match rejected|Removed as defaulted reversal)\]';

alter table txn_comments
  drop constraint if exists txn_comments_origin_check;

alter table txn_comments
  add constraint txn_comments_origin_check
  check (comment_origin in ('user', 'reversal_workflow'));

create index if not exists idx_txn_comments_open_reversal_workflow
  on txn_comments(project_id, txn_public_id)
  where comment_origin = 'reversal_workflow' and resolved_at is null;
