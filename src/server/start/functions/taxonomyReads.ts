import { createServerFn } from '@tanstack/react-start';

import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
} from '../../../types';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../../../api/contract';
import {
  applyCompanyDefaultTaxonomyServer,
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
  updateCategoryServer,
  updateCompanyDefaultCategoryServer,
  updateCompanyDefaultMappingRuleServer,
  updateCompanyDefaultSubCategoryServer,
  updateSubCategoryServer,
} from '../../fns/taxonomy';
import { startApiMiddleware } from '../middleware';

export const listCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return listCategoriesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const getCompanyDefaultsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
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
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
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
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
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
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return listCompanyDefaultMappingRulesServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listSubCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return listSubCategoriesServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const createCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: CategoryCreateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return createCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: CategoryUpdateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return updateCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; categoryId: string }) => ({
    projectId: asProjectId(input.projectId),
    categoryId: asCategoryId(input.categoryId),
  }))
  .handler(async ({ context, data }) => {
    return deleteCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      categoryId: data.categoryId,
    });
  });

export const createSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: SubCategoryCreateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return createSubCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: SubCategoryUpdateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return updateSubCategoryServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; subCategoryId: string }) => ({
    projectId: asProjectId(input.projectId),
    subCategoryId: asSubCategoryId(input.subCategoryId),
  }))
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
    (input: {
      companyId: string;
      payload: CompanyDefaultCategoryCreateInput;
    }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
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
    (input: {
      companyId: string;
      payload: CompanyDefaultCategoryUpdateInput;
    }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
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
  .inputValidator((input: { companyId: string; categoryId: string }) => ({
    companyId: asCompanyId(input.companyId),
    categoryId: asCompanyDefaultCategoryId(input.categoryId),
  }))
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
    (input: {
      companyId: string;
      payload: CompanyDefaultSubCategoryCreateInput;
    }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
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
    (input: {
      companyId: string;
      payload: CompanyDefaultSubCategoryUpdateInput;
    }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
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
  .inputValidator((input: { companyId: string; subCategoryId: string }) => ({
    companyId: asCompanyId(input.companyId),
    subCategoryId: asCompanyDefaultSubCategoryId(input.subCategoryId),
  }))
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
    (input: {
      companyId: string;
      payload: CompanyDefaultMappingRuleCreateInput;
    }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
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
    (input: {
      companyId: string;
      payload: CompanyDefaultMappingRuleUpdateInput;
    }) => ({
      companyId: asCompanyId(input.companyId),
      payload: input.payload,
    })
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
  .inputValidator((input: { companyId: string; ruleId: string }) => ({
    companyId: asCompanyId(input.companyId),
    ruleId: asCompanyDefaultMappingRuleId(input.ruleId),
  }))
  .handler(async ({ context, data }) => {
    return deleteCompanyDefaultMappingRuleServer({
      context: context.serverContext,
      companyId: data.companyId,
      ruleId: data.ruleId,
    });
  });

export const applyCompanyDefaultTaxonomyServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return applyCompanyDefaultTaxonomyServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });
