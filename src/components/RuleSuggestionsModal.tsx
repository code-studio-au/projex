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
import classes from '../styles/ui.module.css';

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

  function categoryIdForSuggestion(suggestion: RuleSuggestionReviewItem) {
    return categoryDrafts[suggestion.id] ?? suggestion.companyDefaultCategoryId;
  }

  function subCategoryOptionsFor(
    categoryId: CompanyDefaultCategoryId | undefined
  ) {
    return subCategories
      .filter(
        (subCategory) => subCategory.companyDefaultCategoryId === categoryId
      )
      .map((subCategory) => ({
        value: subCategory.id,
        label: subCategory.name,
      }));
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
            You don’t have permission to action rule suggestions.
          </Text>
        ) : null}
        <Stack gap={4}>
          <Text size="sm" c="dimmed" className={classes.modalIntro}>
            These suggestions come from repeated manual coding on similar
            transactions. Accepting one creates a normal Auto-Categorise Rule.
          </Text>
          <Text size="xs" c="dimmed" className="panelHelperText">
            Only suggestions with at least 3 supporting transactions are shown
            for review.
          </Text>
          <Group gap="sm" wrap="wrap">
            <Badge variant="light">{suggestions.length} ready for review</Badge>
          </Group>
        </Stack>

        {suggestionsQ.isPending && !suggestionsQ.data ? (
          <Text className={classes.emptyState}>Loading rule suggestions…</Text>
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

              return (
                <Paper
                  key={suggestion.id}
                  withBorder
                  radius="md"
                  p="md"
                  className={classes.modalCard}
                >
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text fw={600}>{suggestion.proposedMatchText}</Text>
                        <Text size="xs" c="dimmed">
                          {suggestion.sampleCount} supporting transactions. Last
                          seen {formatUtcDateTime(suggestion.lastSeenAt)}.
                        </Text>
                      </div>
                      <Badge variant="light">Ready</Badge>
                    </Group>

                    <TextInput
                      label="Suggested match text"
                      value={draftMatchText}
                      disabled={readOnly}
                      onChange={(event) => {
                        setError(null);
                        setSuccess(null);
                        setMatchDrafts((prev) => ({
                          ...prev,
                          [suggestion.id]: event.currentTarget.value,
                        }));
                      }}
                    />

                    <Group grow align="flex-end">
                      <Select
                        label="Company default category"
                        data={categoryOptions}
                        value={selectedCategoryId}
                        disabled={readOnly}
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
                      <Text size="sm" fw={500}>
                        Example transactions
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
                            <Text size="sm" fw={500}>
                              {evidence.item}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {evidence.description || 'No description'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {evidence.txnDate} • {evidence.amountCents} cents
                            </Text>
                          </Paper>
                        ))
                      )}
                    </Stack>

                    <Group justify="flex-end">
                      <Button
                        variant="subtle"
                        color="red"
                        disabled={readOnly || dismissSuggestion.isPending}
                        onClick={async () => {
                          try {
                            setError(null);
                            setSuccess(null);
                            await dismissSuggestion.mutateAsync({
                              id: suggestion.id,
                            });
                            setSuccess('Dismissed rule suggestion.');
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
                              proposedMatchText: draftMatchText.trim(),
                              companyDefaultCategoryId: selectedCategoryId,
                              companyDefaultSubCategoryId:
                                selectedSubCategoryId,
                            });
                            setSuccess(
                              'Accepted rule suggestion and created Auto-Categorise Rule.'
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
                        Accept
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
