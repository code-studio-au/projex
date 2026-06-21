import type { ProjectRuleSuggestionPrompt } from '../../../api/types';
import type { ProjectAutoCodingRule, ProjectId, Txn } from '../../../types';
import { deriveRuleSuggestionPattern } from '../../../utils/ruleSuggestions';
import { findMatchingProjectAutoCodingRule } from '../../../utils/projectAutoCodingRules';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { listProjectRules, listProjectTransactions } from './shared';

const PROJECT_RULE_PROMPT_THRESHOLD = 3;

export async function listProjectAutoCodingRulesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ProjectAutoCodingRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    return listProjectRules(db, args.projectId);
  });
}

export async function getProjectRuleSuggestionPromptServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: Txn['id'];
}): Promise<ProjectRuleSuggestionPrompt | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const txns = await listProjectTransactions(db, args.projectId);
    const txn = txns.find((row: Txn) => row.id === args.txnId);
    if (
      !txn ||
      txn.codingSource !== 'manual' ||
      !txn.categoryId ||
      !txn.subCategoryId
    ) {
      return null;
    }

    const pattern = deriveRuleSuggestionPattern(txn);
    if (!pattern) return null;

    const rules = await listProjectRules(db, args.projectId);
    const alreadyCovered = findMatchingProjectAutoCodingRule(txn, rules);
    if (alreadyCovered) return null;

    const supportingCount = txns.filter((candidate: Txn) => {
      if (
        candidate.codingSource !== 'manual' ||
        candidate.categoryId !== txn.categoryId ||
        candidate.subCategoryId !== txn.subCategoryId
      ) {
        return false;
      }
      const candidatePattern = deriveRuleSuggestionPattern(candidate);
      return candidatePattern?.normalized === pattern.normalized;
    }).length;

    if (supportingCount < PROJECT_RULE_PROMPT_THRESHOLD) {
      return null;
    }

    return {
      txnId: txn.id,
      suggestedMatchText: pattern.proposedMatchText,
      categoryId: txn.categoryId,
      subCategoryId: txn.subCategoryId,
      supportingCount,
    };
  });
}
