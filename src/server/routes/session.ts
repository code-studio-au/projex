import { resolveCurrentSession } from '../auth/currentSession';
import { getBetterAuthInstance } from '../auth/betterAuthInstance';
import { clearDevSessionSetCookie } from '../dev/devSession';

export async function getSessionRouteResponse(
  request: Request
): Promise<Response> {
  const session = await resolveCurrentSession(request);
  return Response.json(session, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

export async function deleteSessionRouteResponse(
  request: Request
): Promise<Response> {
  const auth = getBetterAuthInstance();
  const signOutResponse = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });

  const headers = new Headers(signOutResponse.headers);
  headers.set('cache-control', 'no-store');
  headers.append('set-cookie', clearDevSessionSetCookie());

  return new Response(signOutResponse.body, {
    status: signOutResponse.status,
    statusText: signOutResponse.statusText,
    headers,
  });
}
