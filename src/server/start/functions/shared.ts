import type { StartApiMiddlewareContext } from '../middleware';
import type { AppEndpoint } from '../../app/shared';

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
