import { createServerFn } from '@tanstack/react-start';

import {
  applyCompanyStandardsEndpoint,
  bulkRecodeProjectTransactionsEndpoint,
  createCategoryEndpoint,
  createCompanyDefaultCategoryEndpoint,
  createCompanyDefaultMappingRuleEndpoint,
  createCompanyDefaultSubCategoryEndpoint,
  createSubCategoryEndpoint,
  deleteCategoryEndpoint,
  deleteCompanyDefaultCategoryEndpoint,
  deleteCompanyDefaultMappingRuleEndpoint,
  deleteCompanyDefaultSubCategoryEndpoint,
  deleteSubCategoryEndpoint,
  getCompanyDefaultsEndpoint,
  listCategoriesEndpoint,
  listCompanyDefaultCategoriesEndpoint,
  listCompanyDefaultMappingRulesEndpoint,
  listCompanyDefaultSubCategoriesEndpoint,
  listSubCategoriesEndpoint,
  promoteProjectSubCategoryToCompanyDefaultEndpoint,
  updateCategoryEndpoint,
  updateCompanyDefaultCategoryEndpoint,
  updateCompanyDefaultMappingRuleEndpoint,
  updateCompanyDefaultSubCategoryEndpoint,
  updateSubCategoryEndpoint,
} from '../../app/taxonomyEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listCategoriesEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listCategoriesEndpoint));

export const getCompanyDefaultsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(getCompanyDefaultsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(getCompanyDefaultsEndpoint));

export const listCompanyDefaultCategoriesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listCompanyDefaultCategoriesEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listCompanyDefaultCategoriesEndpoint));

export const listCompanyDefaultSubCategoriesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listCompanyDefaultSubCategoriesEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(listCompanyDefaultSubCategoriesEndpoint)
  );

export const listCompanyDefaultMappingRulesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listCompanyDefaultMappingRulesEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(listCompanyDefaultMappingRulesEndpoint)
  );

export const listSubCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listSubCategoriesEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listSubCategoriesEndpoint));

export const createCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createCategoryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createCategoryEndpoint));

export const updateCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateCategoryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateCategoryEndpoint));

export const deleteCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteCategoryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteCategoryEndpoint));

export const createSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createSubCategoryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createSubCategoryEndpoint));

export const updateSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateSubCategoryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateSubCategoryEndpoint));

export const deleteSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteSubCategoryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteSubCategoryEndpoint));

export const createCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createCompanyDefaultCategoryEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(createCompanyDefaultCategoryEndpoint));

export const updateCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCompanyDefaultCategoryEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(updateCompanyDefaultCategoryEndpoint));

export const deleteCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteCompanyDefaultCategoryEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(deleteCompanyDefaultCategoryEndpoint));

export const createCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createCompanyDefaultSubCategoryEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(createCompanyDefaultSubCategoryEndpoint)
  );

export const updateCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCompanyDefaultSubCategoryEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(updateCompanyDefaultSubCategoryEndpoint)
  );

export const deleteCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteCompanyDefaultSubCategoryEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(deleteCompanyDefaultSubCategoryEndpoint)
  );

export const createCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createCompanyDefaultMappingRuleEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(createCompanyDefaultMappingRuleEndpoint)
  );

export const updateCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCompanyDefaultMappingRuleEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(updateCompanyDefaultMappingRuleEndpoint)
  );

export const deleteCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteCompanyDefaultMappingRuleEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(deleteCompanyDefaultMappingRuleEndpoint)
  );

export const applyCompanyStandardsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(applyCompanyStandardsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(applyCompanyStandardsEndpoint));

export const bulkRecodeProjectTransactionsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(bulkRecodeProjectTransactionsEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(bulkRecodeProjectTransactionsEndpoint)
  );

export const promoteProjectSubCategoryToCompanyDefaultServerFn = createServerFn(
  {
    method: 'POST',
  }
)
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(
      promoteProjectSubCategoryToCompanyDefaultEndpoint.inputSchema
    )
  )
  .handler(
    createServerFnEndpointHandler(
      promoteProjectSubCategoryToCompanyDefaultEndpoint
    )
  );
