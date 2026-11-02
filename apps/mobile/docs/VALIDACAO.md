# Validação e integração do VoltHub Mobile

Contribuição de Amanda — 02/11/2026. Inclui ADR, documentação, evidências Web e correções de integração sobre a `feat/mobile-app` do grupo.

## Como testar no Codespaces

1. Encerre o Expo anterior com **Ctrl+C**.
2. Na raiz do projeto: `docker compose up -d --build bff-web billing-service` e `docker compose ps -a`. A infraestrutura e os outros serviços também devem estar ativos; para subir tudo pela primeira vez, use `docker compose up -d --build`.
3. Em `apps/mobile`: `npm ci` e `npm run web:codespaces`.
4. Abra somente a porta **8084** pela aba Portas; mantenha-a privada. 8083 é o Metro interno e 8081 é o Keycloak.
5. Faça logout de uma sessão antiga, se necessário, e use **Entrar** com as credenciais acadêmicas pré-preenchidas do realm.
6. No DevTools, mantenha Network em **No throttling**. Confira login 200, lista 200 e o indicador **API Online**. As chamadas usam a mesma origem, pelo prefixo `/backend`.
7. Teste lista, detalhe, busca, filtros e favoritos após fechar/reabrir sem limpar dados.
8. Inicie recarga em um conector disponível. Aguarde eventos WS, encerramento pelo simulador e fatura persistida no histórico. Não espere sempre 48 kWh: esse era o alvo da demonstração local; a energia integrada depende do simulador.

O botão **Explorar demonstração offline** usa o seed e resumo calculado no cliente, identificado como demonstração. Não é autenticação e não comprova integração. Para usuário autenticado, falhas HTTP/rede não são substituídas por dados locais.

## Contratos corrigidos

| Ponto | Comportamento implementado |
|---|---|
| CORS | Preflight no BFF, com origens explícitas em `CORS_ORIGINS` e cabeçalhos Content-Type/Authorization |
| Portas privadas | Gateway Web em 8084 encaminha HTTP e WS ao BFF em 3000; encaminha interface/HMR ao Metro em 8083 |
| Login | POST `/api/v1/auth/login` troca credenciais no endpoint interno do Keycloak; valida assinatura, emissor e audiência do JWT antes de devolver identidade; resposta sem cache |
| Falhas de login | Credenciais recusadas → 401; serviço de autenticação indisponível → 502; falha de rede não abre sessão offline |
| Sessão persistida | Salva expiração e descarta sessão vencida ao inicializar; não implementa refresh automático |
| Estações | GET lista/detalhe exigem JWT; BFF adapta catálogo do station-service e aplica filtros; detalhe inexistente → 404; resultado vazio é preservado |
| Token no app | Encaminhado também em filtros e detalhe; usuário real não recebe seed ao falhar a API |
| Recarga | WS autenticado recebe `hello` antes de criar/iniciar a reserva; eventos correlacionados por conector e sessão; não inventa energia em ausência de leituras |
| Falha no start | Não marca a reserva como iniciada; tenta cancelar como compensação; sessão já IN_PROGRESS é reaproveitada sem novo start |
| Fatura | Resumo integrado só por evento do billing ou consulta do histórico; IDs e data de emissão preservados; resumo de demonstração é identificado |

O login mobile mantém o contrato de e-mail/senha e usa Direct Access Grants já habilitado no realm acadêmico (`volthub-web`). O SPA existente continua usando Authorization Code com PKCE. Não foi necessário alterar o realm ou expor Keycloak ao navegador do app.

## Verificações executadas

Ambiente Linux, Node v24.22.1 / npm 11.9.0.

| Comando | Resultado |
|---|---|
| `npm test --prefix apps/mobile` | 19 casos de domínio/casos de uso/URLs |
| `npm run test:integration --prefix apps/mobile` | 6 casos: gateway HTTP/WS e stores/repositórios de recarga |
| `npm run lint --prefix apps/mobile` | TypeScript sem erros |
| `EXPO_PUBLIC_API_URL=/backend npx expo export --platform web` em apps/mobile | Build Web gerado |
| `npm test --prefix services/bff-web` | 9 casos: resiliência, preflight, JWT, login, lista/detalhe e filtros |
| `npm run build --prefix services/bff-web` | Build TypeScript |
| `npm test --prefix services/billing-service` | 4 casos: regras de cobrança e timestamp do histórico |
| `npm run build --prefix services/billing-service` | Build TypeScript |
| `git diff --check` | Sem erros de whitespace |

Testes do BFF usam servidores HTTP locais com JWT realmente assinado/JWKS, em vez de Keycloak e station-service em Docker. Testes do gateway exercitam HTTP e upgrade WebSocket reais. Testes das stores usam os repositórios/casos de uso reais com HTTP/WS/storage substituídos por doubles para verificar falhas e ausência de simulação em sessão autenticada. Não equivalem à execução da stack completa.

O workflow CI também executa testes do mobile/gateway, TypeScript e build Web. As 14 regras originais já pertenciam ao grupo; esta contribuição acrescenta regressões para os contratos corrigidos.

## Limites e entrega

- A stack Docker completa não foi executada no ambiente desta contribuição (Docker indisponível). Validar os passos acima no Codespaces de Amanda.
- Parada manual de recarga IN_PROGRESS não existe no backend atual: cancelar só funciona com reserva CONFIRMED. Na interface integrada, o app aguarda encerramento pelo carregador e fatura. A demonstração permite parada local.
- Se o WS cair, energia não é simulada. Atualize o histórico para recuperar a fatura conhecida pela sessão; não há reconexão automática nem restauração completa de uma recarga após reiniciar o app/BFF.
- Token vencido requer novo login; não há fluxo de refresh automático. O gateway resolve a Web privada do Codespaces, mas um APK precisa de URL absoluta acessível pelo dispositivo.
- Maestro e build/instalação Android não foram executados. Os flows usam demonstração explícita por padrão (IDs do seed); login real é opcional com `LIVE_BACKEND=true` e dados compatíveis.
- Os três screenshots do README são reais, anteriores à correção e em modo offline. Complementar com cinco features, estados carregando/vazio/erro e execução Android.
- Revisar ADR com o grupo, integrar o PR no repositório do grupo, confirmar issue de reserva do tema/integrantes e entregar a URL no Canvas. A apresentação tem até 20 minutos.
