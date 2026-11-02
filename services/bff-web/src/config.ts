const env = (name: string, fallback: string): string => process.env[name] ?? fallback;

export const config = {
  port: Number(env('PORT', '8080')),
  kafkaBrokers: env('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9094').split(','),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:8083,http://localhost:8084').split(',').map(s => s.trim()).filter(Boolean),
  services: {
    station: env('STATION_SERVICE_URL', 'http://localhost:8001'),
    reservation: env('RESERVATION_SERVICE_URL', 'http://localhost:8002'),
    billing: env('BILLING_SERVICE_URL', 'http://localhost:8004'),
    simulator: env('SIMULATOR_URL', 'http://localhost:8005'),
  },
  oidc: {
    issuer: env('OIDC_ISSUER', 'http://localhost:8081/realms/volthub'),
    jwksUri: env('OIDC_JWKS_URI', 'http://localhost:8081/realms/volthub/protocol/openid-connect/certs'),
    audience: env('OIDC_AUDIENCE', 'bff-web'),
    publicUrl: env('KEYCLOAK_PUBLIC_URL', 'http://localhost:8081'),
    realm: 'volthub',
    clientId: 'volthub-web',
    tokenUri: env('OIDC_TOKEN_URI', 'http://localhost:8081/realms/volthub/protocol/openid-connect/token'),
  },
};
