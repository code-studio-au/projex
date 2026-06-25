import { getBetterAuthInstance } from '../auth/betterAuthInstance';

export async function handleAuthRouteRequest(
  request: Request
): Promise<Response> {
  const auth = getBetterAuthInstance();
  return auth.handler(request);
}
