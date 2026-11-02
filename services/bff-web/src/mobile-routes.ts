import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { createAuth } from './auth.js';
import { Downstream, ServiceUnavailableError, UpstreamError } from './downstream.js';

interface Charger { connector: string; status: string; powerKw: number }
interface Station { id: string; name: string; address?: string; chargers: Charger[] }
interface Options {
  oidc: { issuer: string; jwksUri: string; audience: string; tokenUri: string; clientId: string };
  corsOrigins: string[];
  stations: Downstream;
}

/** Contrato usado pelo app. Não inicia Kafka nem depende do processo HTTP principal. */
export async function registerMobileRoutes(app: FastifyInstance, opts: Options) {
  await app.register(cors, {
    origin: opts.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  const auth = createAuth(opts.oidc);

  // O realm acadêmico já habilita Direct Access Grants para volthub-web.
  // Mantém o contrato e a tela atuais do mobile; o SPA continua usando PKCE.
  app.post<{ Body: { email: string; password: string } }>('/api/v1/auth/login', {
    schema: { body: {
      type: 'object', required: ['email', 'password'], additionalProperties: false,
      properties: { email: { type: 'string', minLength: 1, maxLength: 254 }, password: { type: 'string', minLength: 1, maxLength: 1024 } },
    } },
  }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      const response = await fetch(opts.oidc.tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'password', client_id: opts.oidc.clientId, username: req.body.email.trim(), password: req.body.password }),
        signal: AbortSignal.timeout(4000),
      });
      const data = await response.json() as { access_token?: string; expires_in?: number; error?: string };
      if (!response.ok) {
        if (data.error === 'invalid_grant') return reply.code(401).send({ title: 'E-mail ou senha inválidos' });
        return reply.code(502).send({ title: 'Serviço de autenticação indisponível' });
      }
      if (!data.access_token) return reply.code(502).send({ title: 'Resposta de autenticação inválida' });
      const principal = await auth.verify(data.access_token);
      return {
        accessToken: data.access_token, expiresIn: data.expires_in,
        user: { sub: principal.sub, name: principal.name, roles: principal.roles },
      };
    } catch {
      return reply.code(502).send({ title: 'Não foi possível autenticar no Keycloak' });
    }
  });

  const relay = (reply: import('fastify').FastifyReply, err: unknown) => {
    if (err instanceof UpstreamError) return reply.code(err.status).send(err.body);
    if (err instanceof ServiceUnavailableError) return reply.code(503).send({ title: err.message });
    throw err;
  };

  // O station-service retorna o catálogo; filtros e detalhe são adaptados no BFF.
  app.get<{ Querystring: { q?: string; status?: string; connector?: string; fastOnly?: string } }>('/api/v1/stations', { preHandler: auth.guard() }, async (req, reply) => {
    try {
      const stations = await opts.stations.call<Station[]>({ path: '/v1/stations', token: req.principal!.token });
      const q = req.query.q?.trim().toLocaleLowerCase();
      return stations.filter(s => {
        const textMatches = !q || `${s.name} ${s.address ?? ''}`.toLocaleLowerCase().includes(q);
        // Todos os critérios estruturados devem ser satisfeitos pelo mesmo conector.
        return textMatches && (!(req.query.status || req.query.connector || req.query.fastOnly === 'true') || s.chargers.some(c =>
          (!req.query.status || c.status === req.query.status) &&
          (!req.query.connector || c.connector === req.query.connector) &&
          (req.query.fastOnly !== 'true' || c.powerKw > 50)));
      });
    } catch (err) { return relay(reply, err); }
  });

  app.get<{ Params: { id: string } }>('/api/v1/stations/:id', { preHandler: auth.guard() }, async (req, reply) => {
    try {
      const stations = await opts.stations.call<Station[]>({ path: '/v1/stations', token: req.principal!.token });
      const station = stations.find(s => s.id === req.params.id);
      return station ?? reply.code(404).send({ title: 'Estação não encontrada' });
    } catch (err) { return relay(reply, err); }
  });
  return auth;
}
