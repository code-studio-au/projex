import { z } from 'zod';

import {
  bulkRecodeProjectTransactionsInputSchema,
  categoryIdSchema,
  companyDefaultCategoryIdSchema,
  companyDefaultMappingRuleIdSchema,
  companyDefaultSubCategoryIdSchema,
  companyIdSchema,
  createCategoryInputSchema,
  createCompanyDefaultCategoryInputSchema,
  createCompanyDefaultMappingRuleInputSchema,
  createCompanyDefaultSubCategoryInputSchema,
  createSubCategoryInputSchema,
  projectIdSchema,
  promoteProjectSubCategoryToCompanyDefaultInputSchema,
  subCategoryIdSchema,
  updateCategoryInputSchema,
  updateCompanyDefaultCategoryInputSchema,
  updateCompanyDefaultMappingRuleInputSchema,
  updateCompanyDefaultSubCategoryInputSchema,
  updateSubCategoryInputSchema,
} from '../../validation/apiSchemas';
import {
  applyCompanyStandardsServer,
  bulkRecodeProjectTransactionsServer,
  createCategoryServer,
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  createSubCategoryServer,
  deleteCategoryServer,
  deleteCompanyDefaultCategoryServer,
  deleteCompanyDefaultMappingRuleServer,
  deleteCompanyDefaultSubCategoryServer,
  deleteSubCategoryServer,
  getCompanyDefaultsServer,
  listCategoriesServer,
  listCompanyDefaultCategoriesServer,
  listCompanyDefaultMappingRulesServer,
  listCompanyDefaultSubCategoriesServer,
  listSubCategoriesServer,
  promoteProjectSubCategoryToCompanyDefaultServer,
  updateCategoryServer,
  updateCompanyDefaultCategoryServer,
  updateCompanyDefaultMappingRuleServer,
  updateCompanyDefaultSubCategoryServer,
  updateSubCategoryServer,
} from '../fns/taxonomy';
import { defineAppEndpoint } from './shared';

export const listCategoriesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listCategoriesServer({
      context,
      projectId: input.projectId,
    }),
});

export const getCompanyDefaultsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    getCompanyDefaultsServer({
      context,
      companyId: input.companyId,
    }),
});

export const listCompanyDefaultCategoriesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listCompanyDefaultCategoriesServer({
      context,
      companyId: input.companyId,
    }),
});

export const listCompanyDefaultSubCategoriesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listCompanyDefaultSubCategoriesServer({
      context,
      companyId: input.companyId,
    }),
});

export const listCompanyDefaultMappingRulesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listCompanyDefaultMappingRulesServer({
      context,
      companyId: input.companyId,
    }),
});

export const listSubCategoriesEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listSubCategoriesServer({
      context,
      projectId: input.projectId,
    }),
});

export const createCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    createCategoryServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: updateCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    updateCategoryServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const deleteCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    categoryId: categoryIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteCategoryServer({
      context,
      projectId: input.projectId,
      categoryId: input.categoryId,
    }),
});

export const createSubCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createSubCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    createSubCategoryServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const updateSubCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: updateSubCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    updateSubCategoryServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const deleteSubCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    subCategoryId: subCategoryIdSchema,
    replacementSubCategoryId: subCategoryIdSchema.optional(),
  }),
  execute: ({ context, input }) =>
    deleteSubCategoryServer({
      context,
      projectId: input.projectId,
      subCategoryId: input.subCategoryId,
      replacementSubCategoryId: input.replacementSubCategoryId,
    }),
});

export const createCompanyDefaultCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: createCompanyDefaultCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    createCompanyDefaultCategoryServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const updateCompanyDefaultCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: updateCompanyDefaultCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    updateCompanyDefaultCategoryServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const deleteCompanyDefaultCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    categoryId: companyDefaultCategoryIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteCompanyDefaultCategoryServer({
      context,
      companyId: input.companyId,
      categoryId: input.categoryId,
    }),
});

export const createCompanyDefaultSubCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: createCompanyDefaultSubCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    createCompanyDefaultSubCategoryServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const updateCompanyDefaultSubCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: updateCompanyDefaultSubCategoryInputSchema,
  }),
  execute: ({ context, input }) =>
    updateCompanyDefaultSubCategoryServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const deleteCompanyDefaultSubCategoryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    subCategoryId: companyDefaultSubCategoryIdSchema,
    replacementSubCategoryId: companyDefaultSubCategoryIdSchema.optional(),
  }),
  execute: ({ context, input }) =>
    deleteCompanyDefaultSubCategoryServer({
      context,
      companyId: input.companyId,
      subCategoryId: input.subCategoryId,
      replacementSubCategoryId: input.replacementSubCategoryId,
    }),
});

export const createCompanyDefaultMappingRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: createCompanyDefaultMappingRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    createCompanyDefaultMappingRuleServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const updateCompanyDefaultMappingRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: updateCompanyDefaultMappingRuleInputSchema,
  }),
  execute: ({ context, input }) =>
    updateCompanyDefaultMappingRuleServer({
      context,
      companyId: input.companyId,
      input: input.payload,
    }),
});

export const deleteCompanyDefaultMappingRuleEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    ruleId: companyDefaultMappingRuleIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteCompanyDefaultMappingRuleServer({
      context,
      companyId: input.companyId,
      ruleId: input.ruleId,
    }),
});

export const applyCompanyStandardsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    applyCompanyStandardsServer({
      context,
      projectId: input.projectId,
    }),
});

export const bulkRecodeProjectTransactionsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: bulkRecodeProjectTransactionsInputSchema,
  }),
  execute: ({ context, input }) =>
    bulkRecodeProjectTransactionsServer({
      context,
      projectId: input.projectId,
      input: input.payload,
    }),
});

export const promoteProjectSubCategoryToCompanyDefaultEndpoint =
  defineAppEndpoint({
    inputSchema: z.object({
      projectId: projectIdSchema,
      payload: promoteProjectSubCategoryToCompanyDefaultInputSchema,
    }),
    execute: ({ context, input }) =>
      promoteProjectSubCategoryToCompanyDefaultServer({
        context,
        projectId: input.projectId,
        input: input.payload,
      }),
  });
