import React, { useMemo, useState } from "react";
import { Badge, Box, Button, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { MantineReactTable, type MRT_ColumnDef } from "mantine-react-table";
import type { TransactionsHook } from "../hooks/useTransactions";
import type { TaxonomyHook } from "../hooks/useTaxonomy";
import { currency, monthKeyFromStart, monthStart, parseISODate } from "../utils/finance";
import TaxonomyManagerModal from "./TaxonomyManagerModal";

export default function TransactionsPanel(props: {
  txns: TransactionsHook;
  taxonomy: TaxonomyHook;
  monthFilterKey: string | null;
  setMonthFilterKey: (v: string | null) => void;
  monthFilterOptions: { value: string; label: string }[];
  showUncodedOnly: boolean;
  setShowUncodedOnly: (v: boolean) => void;
  uncodedSummary: { count: number; amount: number };
  readOnly?: boolean;
}) {
  const {
    txns,
    taxonomy,
    monthFilterKey,
    setMonthFilterKey,
    monthFilterOptions,
    showUncodedOnly,
    setShowUncodedOnly,
    uncodedSummary,
    readOnly = false,
  } = props;

  const [manageOpen, setManageOpen] = useState(false);

  /**
   * Count invalid transaction dates so the UI can surface problems early.
   * We keep this local (UI concern) rather than making the store reject rows,
   * because CSV imports and manual edits can be messy during prototyping.
   */
  const invalidDateCount = useMemo(() => {
    let bad = 0;
    for (const t of txns.transactions) {
      try {
        parseISODate(t.date);
      } catch {
        bad += 1;
      }
    }
    return bad;
  }, [txns.transactions]);


  const filteredTxns = useMemo(() => {
    let out = txns.transactions;
    if (monthFilterKey) {
      out = out.filter((t) => {
        try {
          const mk = monthKeyFromStart(monthStart(parseISODate(t.date)));
          return mk === monthFilterKey;
        } catch {
          // Invalid dates never match a specific month filter.
          return false;
        }
      });
    }
    if (showUncodedOnly) out = out.filter((t) => !t.subCategoryId || !taxonomy.validSubIds.has(t.subCategoryId));
    return out;
  }, [txns.transactions, monthFilterKey, showUncodedOnly, taxonomy.validSubIds]);

  const txnColumns = useMemo<MRT_ColumnDef<(typeof txns.transactions)[number]>[]>(
    () => [
      { accessorKey: "date", header: "Date", size: 110 },
      { accessorKey: "item", header: "Item", size: 160 },
      { accessorKey: "description", header: "Description", size: 360 },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 130,
        Cell: ({ cell }) => <Text className="table-body-right-bold">{currency(cell.getValue<number>())}</Text>,
        mantineTableBodyCellProps: { className: "table-body-right" },
        mantineTableHeadCellProps: { className: "table-head-cell table-head-right" },
      },
      {
        id: "category",
        header: "Category",
        size: 220,
        enableEditing: !readOnly,
        Edit: ({ row }) => {
          const current = row.original.categoryId ?? null;
          return (
            <Select
              data={taxonomy.categoryOptions}
              value={current}
              placeholder="Select category"
              searchable
              clearable
              disabled={readOnly}
              onChange={(v) => {
                txns.updateTxn(row.original.id, { categoryId: v ?? undefined, subCategoryId: undefined });
              }}
            />
          );
        },
        Cell: ({ row }) => {
          const cat = taxonomy.getCategoryName(row.original.categoryId);
          return <Text>{cat}</Text>;
        },
      },
      {
        id: "subCategory",
        header: "Subcategory",
        size: 260,
        enableEditing: !readOnly,
        Edit: ({ row }) => {
          const catId = row.original.categoryId;
          const options = catId ? taxonomy.subCategoryOptionsForCategory(catId) : [];
          const current = row.original.subCategoryId ?? null;
          return (
            <Select
              data={options}
              value={current}
              placeholder={catId ? "Select subcategory" : "Pick category first"}
              searchable
              clearable
              disabled={!catId || readOnly}
              onChange={(v) => {
                txns.updateTxn(row.original.id, { subCategoryId: v ?? undefined });
              }}
            />
          );
        },
        Cell: ({ row }) => {
          const sub = taxonomy.getSubCategoryName(row.original.subCategoryId);
          const ok = !!row.original.subCategoryId && taxonomy.validSubIds.has(row.original.subCategoryId);
          return (
            <Group gap="xs" wrap="nowrap">
              <Text>{sub}</Text>
              {!ok && (
                <Badge color="red" variant="light">
                  Uncoded
                </Badge>
              )}
            </Group>
          );
        },
      },
    ],
    [taxonomy, txns]
  );

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={4}>
            <Title order={5}>Transaction coding</Title>
            <Text size="sm" c="dimmed">
              Filter a month, then assign category + subcategory
            </Text>
            {invalidDateCount > 0 && (
              <Text size="sm" c="dimmed">
                ⚠️ {invalidDateCount} transaction(s) have invalid dates. They may be excluded from month filters/rollups.
              </Text>
            )}
          </Stack>

          <Group gap="sm" align="flex-end">
            <Select
              label="Month"
              placeholder="All months"
              data={monthFilterOptions}
              value={monthFilterKey}
              clearable
              onChange={setMonthFilterKey}
            />
            <Select
              label="View"
              data={[
                { value: "all", label: "All" },
                { value: "uncoded", label: "Uncoded only" },
              ]}
              value={showUncodedOnly ? "uncoded" : "all"}
              onChange={(v) => setShowUncodedOnly(v === "uncoded")}
            />
            <Button variant="light" disabled={readOnly} onClick={() => setManageOpen(true)}>
              Manage categories
            </Button>
          </Group>
        </Group>

        <Group mt="sm">
          <Badge size="lg" variant="light" color={uncodedSummary.count ? "red" : "gray"}>
            Uncoded: {uncodedSummary.count} ({currency(uncodedSummary.amount)})
          </Badge>
        </Group>
      </Paper>

      <MantineReactTable
        columns={txnColumns}
        data={filteredTxns}
        enableEditing={!readOnly}
        editDisplayMode="cell"
        enableColumnResizing
        enableSorting
        enableGlobalFilter
        enablePagination
        initialState={{ density: "xs", pagination: { pageIndex: 0, pageSize: 10 } }}
        mantineTableContainerProps={{ className: "financeTable txnTable" }}
        mantineTableProps={{ highlightOnHover: true }}
        mantineTableBodyRowProps={({ row }) => {
          const ok = !!row.original.subCategoryId && taxonomy.validSubIds.has(row.original.subCategoryId);
          return !ok ? { style: { outline: "1px solid rgba(255,0,0,0.20)" } } : {};
        }}
      />

      <TaxonomyManagerModal opened={manageOpen} onClose={() => setManageOpen(false)} taxonomy={taxonomy} />
    </Stack>
  );
}