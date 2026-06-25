import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type TaxonomyEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadTaxonomyEndpoints = () =>
  loadAppEndpointModule<TaxonomyEndpointsModule>('taxonomyEndpoints');

export const listCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTaxonomyEndpoints, 'listCategoriesEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'listCategoriesEndpoint'
    )
  );

export const getCompanyDefaultsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'getCompanyDefaultsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'getCompanyDefaultsEndpoint'
    )
  );

export const listCompanyDefaultCategoriesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'listCompanyDefaultCategoriesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'listCompanyDefaultCategoriesEndpoint'
    )
  );

export const listCompanyDefaultSubCategoriesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'listCompanyDefaultSubCategoriesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'listCompanyDefaultSubCategoriesEndpoint'
    )
  );

export const listCompanyDefaultMappingRulesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'listCompanyDefaultMappingRulesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'listCompanyDefaultMappingRulesEndpoint'
    )
  );

export const listSubCategoriesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'listSubCategoriesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'listSubCategoriesEndpoint'
    )
  );

export const createCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTaxonomyEndpoints, 'createCategoryEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'createCategoryEndpoint'
    )
  );

export const updateCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTaxonomyEndpoints, 'updateCategoryEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'updateCategoryEndpoint'
    )
  );

export const deleteCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTaxonomyEndpoints, 'deleteCategoryEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'deleteCategoryEndpoint'
    )
  );

export const createSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'createSubCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'createSubCategoryEndpoint'
    )
  );

export const updateSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'updateSubCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'updateSubCategoryEndpoint'
    )
  );

export const deleteSubCategoryServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'deleteSubCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'deleteSubCategoryEndpoint'
    )
  );

export const createCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'createCompanyDefaultCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'createCompanyDefaultCategoryEndpoint'
    )
  );

export const updateCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'updateCompanyDefaultCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'updateCompanyDefaultCategoryEndpoint'
    )
  );

export const deleteCompanyDefaultCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'deleteCompanyDefaultCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'deleteCompanyDefaultCategoryEndpoint'
    )
  );

export const createCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'createCompanyDefaultSubCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'createCompanyDefaultSubCategoryEndpoint'
    )
  );

export const updateCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'updateCompanyDefaultSubCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'updateCompanyDefaultSubCategoryEndpoint'
    )
  );

export const deleteCompanyDefaultSubCategoryServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'deleteCompanyDefaultSubCategoryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'deleteCompanyDefaultSubCategoryEndpoint'
    )
  );

export const createCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'createCompanyDefaultMappingRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'createCompanyDefaultMappingRuleEndpoint'
    )
  );

export const updateCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'updateCompanyDefaultMappingRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'updateCompanyDefaultMappingRuleEndpoint'
    )
  );

export const deleteCompanyDefaultMappingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'deleteCompanyDefaultMappingRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'deleteCompanyDefaultMappingRuleEndpoint'
    )
  );

export const applyCompanyStandardsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'applyCompanyStandardsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'applyCompanyStandardsEndpoint'
    )
  );

export const bulkRecodeProjectTransactionsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'bulkRecodeProjectTransactionsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'bulkRecodeProjectTransactionsEndpoint'
    )
  );

export const promoteProjectSubCategoryToCompanyDefaultServerFn = createServerFn(
  {
    method: 'POST',
  }
)
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTaxonomyEndpoints,
      'promoteProjectSubCategoryToCompanyDefaultEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTaxonomyEndpoints,
      'promoteProjectSubCategoryToCompanyDefaultEndpoint'
    )
  );
