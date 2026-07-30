import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import type {
  CompanyDefaultCategoryId,
  CompanyDefaultSubCategoryId,
  CompanyId,
  RuleSuggestionAcceptanceAction,
  RuleSuggestionDismissReason,
  RuleSuggestionReviewItem,
} from '../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
} from '../types';
import { useCompanyDefaultsQuery } from '../queries/taxonomy';
import {
  useAcceptRuleSuggestionMutation,
  useDismissRuleSuggestionMutation,
  useRuleSuggestionsQuery,
} from '../queries/ruleSuggestions';
import { formatUtcDateTime } from '../utils/dateTime';
import { formatCurrencyFromCents } from '../utils/money';
import { firefoxSafeModalSelectProps } from './modalSelectProps';
import classes from '../styles/ui.module.css';

const UPDATE_ACTION_OPTIONS = [
  {
    value: 'create_narrower',
    label: 'Create a narrower, higher-priority rule',
  },
  {
    value: 'update_existing',
    label: 'Update the existing rule everywhere',
  },
] satisfies Array<{ value: RuleSuggestionAcceptanceAction; label: string }>;

const DISMISS_REASON_OPTIONS = [
  { value: 'noise', label: 'Not a reliable pattern' },
  { value: 'one_off', label: 'One-off coding case' },
  { value: 'too_broad', label: 'Suggested match is too broad' },
  { value: 'intentional_manual', label: 'Should remain manual' },
  { value: 'other', label: 'Other reason' },
] satisfies Array<{ value: RuleSuggestionDismissReason; label: string }>;

function confidenceColor(confidence: RuleSuggestionReviewItem['confidence']) {
  if (confidence === 'high') return 'green';
  if (confidence === 'medium') return 'blue';
  return 'orange';
}

function actionLabel(action: RuleSuggestionAcceptanceAction) {
  if (action === 'update_existing') return 'Update existing rule';
  if (action === 'create_narrower') return 'Create narrower rule';
  return 'Create rule';
}

export default function RuleSuggestionsModal(props: {
  opened: boolean;
  onClose: () => void;
  companyId: CompanyId;
  readOnly?: boolean;
}) {
  const { opened, onClose, companyId, readOnly = false } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const suggestionsQ = useRuleSuggestionsQuery(companyId);
  const companyDefaultsQ = useCompanyDefaultsQuery(companyId);
  const acceptSuggestion = useAcceptRuleSuggestionMutation(companyId);
  const dismissSuggestion = useDismissRuleSuggestionMutation(companyId);

  const suggestions = suggestionsQ.data ?? [];
  const categories = useMemo(
    () => companyDefaultsQ.data?.categories ?? [],
    [companyDefaultsQ.data?.categories]
  );
  const subCategories = useMemo(
    () => companyDefaultsQ.data?.subCategories ?? [],
    [companyDefaultsQ.data?.subCategories]
  );
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories]
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<
    Record<string, CompanyDefaultCategoryId>
  >({});
  const [subCategoryDrafts, setSubCategoryDrafts] = useState<
    Record<string, CompanyDefaultSubCategoryId>
  >({});
  const [actionDrafts, setActionDrafts] = useState<
    Record<string, RuleSuggestionAcceptanceAction>
  >({});
  const [dismissReasonDrafts, setDismissReasonDrafts] = useState<
    Record<string, RuleSuggestionDismissReason>
  >({});

  function categoryIdForSuggestion(suggestion: RuleSuggestionReviewItem) {
    return categoryDrafts[suggestion.id] ?? suggestion.companyDefaultCategoryId;
  }

  function subCategoryOptionsFor(
    categoryId: CompanyDefaultCategoryId | undefined
  ) {
    return subCategories.flatMap((subCategory) =>
      subCategory.companyDefaultCategoryId === categoryId
        ? [{ value: subCategory.id, label: subCategory.name }]
        : []
    );
  }

  function defaultPath(
    categoryId: CompanyDefaultCategoryId,
    subCategoryId: CompanyDefaultSubCategoryId
  ) {
    const categoryName =
      categories.find((category) => category.id === categoryId)?.name ??
      'Unknown category';
    const subCategoryName =
      subCategories.find((subCategory) => subCategory.id === subCategoryId)
        ?.name ?? 'Unknown subcategory';
    return `${categoryName} / ${subCategoryName}`;
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Rule Suggestions"
      fullScreen={isMobile}
      centered={!isMobile}
      size="xl"
      styles={{
        body: {
          maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 10rem)',
          overflowY: 'auto',
        },
      }}
    >
      <Stack className={classes.modalStack}>
        {error ? <Alert color="red">{error}</Alert> : null}
        {success ? <Alert color="green">{success}</Alert> : null}
        {readOnly ? (
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            You do not have permission to action rule suggestions.
          </Text>
        ) : null}

        <Stack gap={4}>
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            Projex identifies repeated manual coding and repeated corrections to
            existing company rules. Every recommendation remains subject to
            admin review.
          </Text>
          <Text size="xs" c="dimmed" className="panelHelperText">
            Suggestions appear after 3 supporting transactions. Dismissed
            patterns stay quiet for 30 days unless 3 more examples are recorded.
          </Text>
          <Group gap="sm" wrap="wrap">
            <Badge variant="light">{suggestions.length} ready for review</Badge>
            <Badge variant="light" color="gray">
              Matching method: contains transaction text
            </Badge>
          </Group>
        </Stack>

        {suggestionsQ.isPending && !suggestionsQ.data ? (
          <Text className={classes.emptyState}>
            Loading rule suggestions...
          </Text>
        ) : suggestions.length === 0 ? (
          <Text className={classes.emptyState}>
            No rule suggestions are ready for review yet.
          </Text>
        ) : (
          <Stack gap="md">
            {suggestions.map((suggestion) => {
              const selectedCategoryId = categoryIdForSuggestion(suggestion);
              const selectedSubCategoryId =
                subCategoryDrafts[suggestion.id] ??
                suggestion.companyDefaultSubCategoryId;
              const subCategoryOptions =
                subCategoryOptionsFor(selectedCategoryId);
              const draftMatchText =
                matchDrafts[suggestion.id] ?? suggestion.proposedMatchText;
              const selectedAction =
                actionDrafts[suggestion.id] ?? suggestion.recommendedAction;
              const dismissReason = dismissReasonDrafts[suggestion.id];
              const isUpdateSuggestion =
                suggestion.suggestionType === 'update_rule';

              return (
                <Paper
                  key={suggestion.id}
                  withBorder
                  radius="md"
                  p="md"
                  className={classes.modalCard}
                >
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={5}>
                        <Group gap="xs" wrap="wrap">
                          <Badge
                            variant="light"
                            color={isUpdateSuggestion ? 'orange' : 'teal'}
                          >
                            {isUpdateSuggestion
                              ? 'Existing rule correction'
                              : 'New rule'}
                          </Badge>
                          <Badge
                            variant="light"
                            color={confidenceColor(suggestion.confidence)}
                          >
                            {suggestion.confidence} confidence (
                            {suggestion.confidenceScore}%)
                          </Badge>
                          <Badge variant="outline">
                            {suggestion.sampleCount} examples
                          </Badge>
                        </Group>
                        <Text fw={650}>{suggestion.proposedMatchText}</Text>
                        <Text size="xs" c="dimmed">
                          {suggestion.confidenceReasons.join(' | ')}. Last seen{' '}
                          {formatUtcDateTime(suggestion.lastSeenAt)}.
                        </Text>
                      </Stack>
                    </Group>

                    {isUpdateSuggestion && suggestion.sourceRule ? (
                      <Paper
                        radius="md"
                        p="sm"
                        className={classes.surfaceMuted}
                      >
                        <Stack gap={3}>
                          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                            Rule being corrected
                          </Text>
                          <Text size="sm" fw={600}>
                            Contains "{suggestion.sourceRule.matchText}"
                          </Text>
                          <Text size="sm" c="dimmed">
                            Currently codes to{' '}
                            {defaultPath(
                              suggestion.sourceRule.companyDefaultCategoryId,
                              suggestion.sourceRule.companyDefaultSubCategoryId
                            )}
                          </Text>
                        </Stack>
                      </Paper>
                    ) : null}

                    {isUpdateSuggestion ? (
                      <Stack gap={6}>
                        <Select
                          label="How should this correction be applied?"
                          description="Creating a narrower rule is safer because the current broader rule remains available for other transactions."
                          data={UPDATE_ACTION_OPTIONS}
                          value={selectedAction}
                          disabled={readOnly}
                          {...firefoxSafeModalSelectProps}
                          onChange={(value) => {
                            if (!value) return;
                            setError(null);
                            setSuccess(null);
                            setActionDrafts((prev) => ({
                              ...prev,
                              [suggestion.id]:
                                value as RuleSuggestionAcceptanceAction,
                            }));
                          }}
                        />
                        {selectedAction === 'update_existing' ? (
                          <Alert color="orange" variant="light">
                            This changes the existing company rule and every
                            synced project that inherits it.
                          </Alert>
                        ) : (
                          <Alert color="blue" variant="light">
                            The new rule will be placed immediately before the
                            current rule so the more specific match wins first.
                          </Alert>
                        )}
                      </Stack>
                    ) : null}

                    <TextInput
                      label="Text the transaction must contain"
                      description={`Detected from the transaction ${suggestion.patternBasis.replace('_', ' + ')}.`}
                      value={draftMatchText}
                      disabled={readOnly}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setError(null);
                        setSuccess(null);
                        setMatchDrafts((prev) => ({
                          ...prev,
                          [suggestion.id]: value,
                        }));
                      }}
                    />

                    {suggestion.matchTextAlternatives.length > 1 ? (
                      <Stack gap={5}>
                        <Text size="xs" c="dimmed">
                          Suggested alternatives
                        </Text>
                        <Group gap="xs" wrap="wrap">
                          {suggestion.matchTextAlternatives.flatMap((option) =>
                            option.toLowerCase() !==
                            draftMatchText.trim().toLowerCase()
                              ? [
                                  <Button
                                    key={option}
                                    size="compact-sm"
                                    variant="default"
                                    disabled={readOnly}
                                    onClick={() => {
                                      setError(null);
                                      setSuccess(null);
                                      setMatchDrafts((prev) => ({
                                        ...prev,
                                        [suggestion.id]: option,
                                      }));
                                    }}
                                  >
                                    Use "{option}"
                                  </Button>,
                                ]
                              : []
                          )}
                        </Group>
                      </Stack>
                    ) : null}

                    <Group grow align="flex-end">
                      <Select
                        label="Company default category"
                        data={categoryOptions}
                        value={selectedCategoryId}
                        disabled={readOnly}
                        {...firefoxSafeModalSelectProps}
                        onChange={(value) => {
                          setError(null);
                          setSuccess(null);
                          setCategoryDrafts((prev) => ({
                            ...prev,
                            [suggestion.id]: value
                              ? asCompanyDefaultCategoryId(value)
                              : suggestion.companyDefaultCategoryId,
                          }));
                          setSubCategoryDrafts((prev) => {
                            const next = { ...prev };
                            delete next[suggestion.id];
                            return next;
                          });
                        }}
                      />
                      <Select
                        label="Company default subcategory"
                        data={subCategoryOptions}
                        value={selectedSubCategoryId}
                        disabled={readOnly || !selectedCategoryId}
                        {...firefoxSafeModalSelectProps}
                        onChange={(value) => {
                          setError(null);
                          setSuccess(null);
                          if (!value) return;
                          setSubCategoryDrafts((prev) => ({
                            ...prev,
                            [suggestion.id]:
                              asCompanyDefaultSubCategoryId(value),
                          }));
                        }}
                      />
                    </Group>

                    <Stack gap={6}>
                      <Text size="sm" fw={600}>
                        Supporting transactions
                      </Text>
                      {suggestion.evidence.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          No evidence samples available.
                        </Text>
                      ) : (
                        suggestion.evidence.map((evidence) => (
                          <Paper
                            key={`${suggestion.id}-${evidence.txnId}`}
                            radius="md"
                            p="sm"
                            className={classes.surfaceMuted}
                          >
                            <Group justify="space-between" align="flex-start">
                              <Stack gap={2}>
                                <Text size="sm" fw={600}>
                                  {evidence.item}
                                </Text>
                                <Text size="sm" c="dimmed">
                                  {evidence.description || 'No description'}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {evidence.projectName} | {evidence.txnDate}
                                </Text>
                              </Stack>
                              <Text size="sm" fw={600}>
                                {formatCurrencyFromCents(
                                  evidence.amountCents,
                                  evidence.currency
                                )}
                              </Text>
                            </Group>
                          </Paper>
                        ))
                      )}
                    </Stack>

                    <Group justify="space-between" align="flex-end" wrap="wrap">
                      <Group align="flex-end" gap="xs" wrap="wrap">
                        <Select
                          label="Dismiss reason"
                          placeholder="Choose a reason"
                          data={DISMISS_REASON_OPTIONS}
                          value={dismissReason ?? null}
                          disabled={readOnly}
                          w={230}
                          {...firefoxSafeModalSelectProps}
                          onChange={(value) => {
                            if (!value) return;
                            setDismissReasonDrafts((prev) => ({
                              ...prev,
                              [suggestion.id]:
                                value as RuleSuggestionDismissReason,
                            }));
                          }}
                        />
                        <Button
                          variant="subtle"
                          color="red"
                          disabled={
                            readOnly ||
                            dismissSuggestion.isPending ||
                            !dismissReason
                          }
                          onClick={async () => {
                            if (!dismissReason) return;
                            try {
                              setError(null);
                              setSuccess(null);
                              await dismissSuggestion.mutateAsync({
                                id: suggestion.id,
                                reason: dismissReason,
                              });
                              setSuccess(
                                'Dismissed the suggestion and started its cooldown.'
                              );
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not dismiss rule suggestion.'
                              );
                            }
                          }}
                        >
                          Dismiss
                        </Button>
                      </Group>

                      <Button
                        disabled={
                          readOnly ||
                          acceptSuggestion.isPending ||
                          !draftMatchText.trim() ||
                          !selectedCategoryId ||
                          !selectedSubCategoryId
                        }
                        onClick={async () => {
                          try {
                            setError(null);
                            setSuccess(null);
                            await acceptSuggestion.mutateAsync({
                              id: suggestion.id,
                              action: selectedAction,
                              proposedMatchText: draftMatchText.trim(),
                              companyDefaultSubCategoryId:
                                selectedSubCategoryId,
                            });
                            setSuccess(
                              `${actionLabel(selectedAction)} accepted and synced to eligible projects.`
                            );
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Could not accept rule suggestion.'
                            );
                          }
                        }}
                      >
                        {actionLabel(selectedAction)}
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
