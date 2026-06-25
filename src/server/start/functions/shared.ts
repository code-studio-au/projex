import {
  parseAppEndpointInput,
  type AppEndpoint,
} from '../../../api/appEndpoints';
import type { StartApiMiddlewareContext } from '../middleware';

type AppEndpointModule = Record<string, AppEndpoint<unknown, unknown>>;

type EndpointInput<
  TModule extends AppEndpointModule,
  TExport extends keyof TModule,
> =
  TModule[TExport] extends AppEndpoint<infer TInput, unknown> ? TInput : never;

type EndpointOutput<
  TModule extends AppEndpointModule,
  TExport extends keyof TModule,
> =
  TModule[TExport] extends AppEndpoint<unknown, infer TOutput>
    ? TOutput
    : never;

export function createServerFnEndpointHandler<TInput, TOutput>(
  endpoint: AppEndpoint<TInput, TOutput>
) {
  return async ({
    context,
    data,
  }: {
    context: StartApiMiddlewareContext;
    data: TInput;
  }): Promise<TOutput> => {
    return endpoint.execute({
      context: context.serverContext,
      input: data,
    });
  };
}

export function createLazyServerFnEndpointHandler<
  TModule extends AppEndpointModule,
  TExport extends keyof TModule,
>(loadModule: () => Promise<TModule>, exportName: TExport) {
  return async ({
    context,
    data,
  }: {
    context: StartApiMiddlewareContext;
    data: EndpointInput<TModule, TExport>;
  }): Promise<EndpointOutput<TModule, TExport>> => {
    const endpoint = await loadServerFnEndpoint(loadModule, exportName);
    const typedEndpoint = endpoint as AppEndpoint<
      EndpointInput<TModule, TExport>,
      EndpointOutput<TModule, TExport>
    >;
    return typedEndpoint.execute({
      context: context.serverContext,
      input: data,
    });
  };
}

export function lazyServerFnInputValidator<
  TModule extends AppEndpointModule,
  TExport extends keyof TModule,
>(loadModule: () => Promise<TModule>, exportName: TExport) {
  return async (input: unknown): Promise<EndpointInput<TModule, TExport>> => {
    const endpoint = await loadServerFnEndpoint(loadModule, exportName);
    return parseAppEndpointInput(
      endpoint as Pick<
        AppEndpoint<EndpointInput<TModule, TExport>, unknown>,
        'inputSchema'
      >,
      input
    );
  };
}

async function loadServerFnEndpoint<
  TModule extends AppEndpointModule,
  TExport extends keyof TModule,
>(
  loadModule: () => Promise<TModule>,
  exportName: TExport
): Promise<TModule[TExport]> {
  const mod = await loadModule();
  const endpoint = mod[exportName];
  if (!endpoint) {
    throw new Error(`Missing server function endpoint "${String(exportName)}"`);
  }
  return endpoint;
}
