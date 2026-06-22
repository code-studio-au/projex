import { createServerFn } from '@tanstack/react-start';
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
} from '../../../validation/apiSchemas';
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
} from '../../fns/taxonomy';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const companyIdInputSchema = z.object({
  companyId: companyIdSchema,
});

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const projectCategoryIdInputSchema = z.object({
  projectId: projectIdSchema,
  categoryId: categoryIdSchema,
});

const projectSubCategoryIdInputSchema = z.object({
  projectId: projectIdSchema,
  subCategoryId: subCategoryIdSchema,
});

const companyCategoryIdInputSchema = z.object({
  companyId: companyIdSchema,
  categoryId: companyDefaultCategoryIdSchema,
});

const companySubCategoryIdInputSchema = z.object({
  companyId: companyIdSchema,
  subCategoryId: companyDefaultSubCategoryIdSchema,
});

const companyRuleIdInputSchema = z.object({
  companyId: companyIdSchema,
  ruleId: companyDefaultMappingRuleIdSchema,
});

const createCategoryServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createCategoryInputSchema,
});

const updateCategoryServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: updateCategoryInputSchema,
});

const createSubCategoryServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createSubCategoryInputSchema,
});

const updateSubCategoryServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: updateSubCategoryInputSchema,
});

const createCompanyDefaultCategoryServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: createCompanyDefaultCategoryInputSchema,
});

const updateCompanyDefaultCategoryServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: updateCompanyDefaultCategoryInputSchema,
});

const createCompanyDefaultSubCategoryServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: createCompanyDefaultSubCategoryInputSchema,
});

const updateCompanyDefaultSubCategoryServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: updateCompanyDefaultSubCategoryInputSchema,
});

const createCompanyDefaultMappingRuleServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: createCompanyDefaultMappingRuleInputSchema,
});

const updateCompanyDefaultMappingRuleServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: updateCompanyDefaultMappingRuleInputSchema,
});

const bulkRecodeProjectTransactionsServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: bulkRecodeProjectTransactionsInputSchema,
});

const promoteProjectSubCategoryToCompanyDefaultServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: promoteProjectSubCategoryToCompanyDefaultInputSchema,
});

export const listCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listCategoriesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const getCompanyDefaultsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return getCompanyDefaultsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listCompanyDefaultCategoriesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listCompanyDefaultCategoriesServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listCompanyDefaultSubCategoriesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listCompanyDefaultSubCategoriesServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listCompanyDefaultMappingRulesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listCompanyDefaultMappingRulesServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listSubCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listSubCategoriesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const createCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createCategoryServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateCategoryServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return updateCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectCategoryIdInputSchema))
  .handler(async ({ context, data }) => {
    return deleteCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      categoryId: data.categoryId,
    });
  });

export const createSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createSubCategoryServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createSubCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateSubCategoryServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return updateSubCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectSubCategoryIdInputSchema))
  .handler(async ({ context, data }) => {
    return deleteSubCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      subCategoryId: data.subCategoryId,
    });
  });

export const createCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createCompanyDefaultCategoryServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return createCompanyDefaultCategoryServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const updateCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCompanyDefaultCategoryServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return updateCompanyDefaultCategoryServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const deleteCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyCategoryIdInputSchema))
  .handler(async ({ context, data }) => {
    return deleteCompanyDefaultCategoryServer({
      context: context.serverContext,
      companyId: data.companyId,
      categoryId: data.categoryId,
    });
  });

export const createCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createCompanyDefaultSubCategoryServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return createCompanyDefaultSubCategoryServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const updateCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCompanyDefaultSubCategoryServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return updateCompanyDefaultSubCategoryServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const deleteCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companySubCategoryIdInputSchema))
  .handler(async ({ context, data }) => {
    return deleteCompanyDefaultSubCategoryServer({
      context: context.serverContext,
      companyId: data.companyId,
      subCategoryId: data.subCategoryId,
    });
  });

export const createCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createCompanyDefaultMappingRuleServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return createCompanyDefaultMappingRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const updateCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCompanyDefaultMappingRuleServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return updateCompanyDefaultMappingRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const deleteCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyRuleIdInputSchema))
  .handler(async ({ context, data }) => {
    return deleteCompanyDefaultMappingRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      ruleId: data.ruleId,
    });
  });

export const applyCompanyStandardsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return applyCompanyStandardsServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const bulkRecodeProjectTransactionsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(bulkRecodeProjectTransactionsServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return bulkRecodeProjectTransactionsServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const promoteProjectSubCategoryToCompanyDefaultServerFn = createServerFn(
  {
    method: 'POST',
  }
)
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(
      promoteProjectSubCategoryToCompanyDefaultServerFnInputSchema
    )
  )
  .handler(async ({ context, data }) => {
    return promoteProjectSubCategoryToCompanyDefaultServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });
