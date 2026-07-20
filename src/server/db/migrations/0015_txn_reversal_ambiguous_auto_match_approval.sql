alter table txn_reversals
  drop constraint if exists txn_reversals_status_check;

alter table txn_reversals
  add constraint txn_reversals_status_check
  check (
    status in (
      'pending_reversal',
      'auto_matched_pending_approval',
      'auto_matched_ambiguous_pending_approval',
      'reversed_matched',
      'reversal_exception'
    )
  );

alter table txn_reversals
  drop constraint if exists txn_reversals_matched_consistency_check;

alter table txn_reversals
  add constraint txn_reversals_matched_consistency_check
  check (
    (
      status = 'reversed_matched'
      and matched_reversal_txn_public_id is not null
      and matched_reversal_txn_public_id <> source_txn_public_id
      and matched_at is not null
      and matched_by_user_id is not null
    )
    or (
      status in (
        'auto_matched_pending_approval',
        'auto_matched_ambiguous_pending_approval'
      )
      and matched_reversal_txn_public_id is not null
      and matched_reversal_txn_public_id <> source_txn_public_id
      and matched_at is null
      and matched_by_user_id is null
    )
    or (
      status in ('pending_reversal', 'reversal_exception')
      and matched_reversal_txn_public_id is null
      and matched_at is null
      and matched_by_user_id is null
    )
  );
