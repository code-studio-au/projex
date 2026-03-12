import { z } from 'zod';

const maxLength = (value: string, label: string, max: number, ctx: z.RefinementCtx) => {
  if (value.length > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} must be at most ${max} characters`,
    });
  }
};

const nonEmptyTrimmed = (label: string, max?: number) =>
  z.string().superRefine((value, ctx) => {
    if (!value.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
      return;
    }
    if (typeof max === 'number') {
      maxLength(value, label, max, ctx);
    }
  });

const nonNegativeInt = (label: string) =>
  z.number().superRefine((value, ctx) => {
    if (!Number.isInteger(value) || value < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must be a non-negative integer`,
      });
    }
  });

const isoDateOnly = (label: string) =>
  z.string().superRefine((value, ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: label });
    }
  });

export const txnInputSchema = z.object({
  date: isoDateOnly('Transaction date must be YYYY-MM-DD'),
  item: nonEmptyTrimmed('Transaction item', 160),
  description: nonEmptyTrimmed('Transaction description', 500),
  amountCents: nonNegativeInt('Transaction amount'),
});

export const categoryNameSchema = nonEmptyTrimmed('Category name', 120);
export const subCategoryNameSchema = nonEmptyTrimmed('Subcategory name', 120);
export const projectNameSchema = nonEmptyTrimmed('Project name', 120);
export const companyNameSchema = nonEmptyTrimmed('Company name', 120);
export const userNameSchema = nonEmptyTrimmed('User name', 120);

export const budgetAllocatedCentsSchema = nonNegativeInt('Budget allocated amount');
export const projectBudgetTotalCentsSchema = nonNegativeInt('Project budget total');

export const emailSchema = z.string().superRefine((value, ctx) => {
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Email is invalid' });
  }
});
