/** Converte base relativa da Web em HTTP/WS da mesma origem; nativo usa URL absoluta. */
export function resolveApiUrls(base: string, origin?: string): { apiUrl: string; wsUrl: string } {
  const absolute = base.startsWith('/') ? new URL(base, origin).toString() : base;
  const apiUrl = absolute.replace(/\/$/, '');
  return { apiUrl, wsUrl: apiUrl.replace(/^http/, 'ws') + '/ws' };
}
