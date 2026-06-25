export type AuthRouteModule = {
  handleAuthRouteRequest(request: Request): Promise<Response>;
};

export type SessionRouteModule = {
  getSessionRouteResponse(request: Request): Promise<Response>;
  deleteSessionRouteResponse(request: Request): Promise<Response>;
};

export type ReadyRouteModule = {
  getReadyRouteResponse(): Promise<Response>;
};

export type DevSessionRouteModule = {
  createDevSessionRouteResponse(request: Request): Promise<Response>;
  deleteDevSessionRouteResponse(): Response;
};

export function serverRouteModuleSpecifier(fileStem: string): string {
  return ['..', 'server', 'routes', fileStem].join('/');
}
