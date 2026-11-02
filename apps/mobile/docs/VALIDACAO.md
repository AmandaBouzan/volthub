# Validação do VoltHub Mobile

Contribuição de Amanda — 02/11/2026. Base: `feat/mobile-app`, commit `6dc7428c188d65ba6c360b90e446a02e0af609ea`.

## Verificações executadas

| Verificação | Ambiente / resultado |
|---|---|
| Instalação pelo lockfile | `npm ci --no-audit --no-fund`: concluída; npm apontou aviso de peer dependency de worklets |
| Lógica existente | `npm test`: 14 casos passaram, 0 falhas |
| TypeScript | `npm run lint`: passou (`tsc --noEmit`) |
| Runtime da verificação | Node v24.22.1, npm 11.9.0, Linux |
| Interface Web | Amanda abriu mapa e concluiu uma sessão local; capturas no README mostram modo offline |
| Preflight local do BFF | Amanda executou OPTIONS para `/api/v1/auth/login`: HTTP 404, sem cabeçalhos CORS |
| Build Android / Maestro | Não executados nesta contribuição |
| Integração completa com os serviços | Não validada; bloqueios abaixo |

Os 14 testes já pertenciam ao grupo: 4 de domínio/filtros, 4 de login e 6 de sessão de recarga. Esta contribuição documenta e executa a suíte; não atribui a autoria desses testes a Amanda. Testes com repositórios falsos não comprovam conexão com o backend.

## Bloqueios encontrados no contrato app ↔ BFF

| Ponto | Evidência no código / efeito | Próxima ação |
|---|---|---|
| CORS | `services/bff-web/src/main.ts` não registra CORS; OPTIONS retornou 404 | Configurar origens permitidas e preflight no BFF, com testes, antes de testar pelo Expo Web em outra porta |
| Login | `HttpAuthRepository` chama POST `/api/v1/auth/login`, ausente no BFF; o SPA do BFF usa Authorization Code com PKCE | Alinhar o fluxo de autenticação do mobile com o Keycloak e o grupo; configurar a URL pública/callbacks para Codespaces |
| Detalhe | App chama GET `/api/v1/stations/:id`, ausente no BFF; `GetStationByIdUseCase` não encaminha o token opcional | Alinhar o endpoint e propagar a sessão até o repositório |
| Filtros remotos | `setActiveFilter` chama a API sem token; BFF exige autenticação na lista e não encaminha os filtros para o downstream | Corrigir a propagação de token e definir o contrato dos filtros, ou declarar explicitamente a filtragem local |
| Origem dos dados | Repositório retorna seed quando a API falha, inclusive em erros HTTP | Conferir respostas da rede e `dataSource`; não usar a lista fixa como evidência de dados reais |
| Recarga e faturamento | Medidor e resumo podem ser calculados no cliente | Conferir eventos WebSocket e fatura persistida no billing-service; o resumo local não comprova faturamento |

Esses pontos não foram alterados por este PR de documentação. Habilitar CORS isoladamente não cria a rota de login nem conclui a integração. O login pode entrar em demonstração em caso de erro de rede/CORS, mas mantém erros HTTP, incluindo 404.

## Reproduzir a verificação do navegador

1. Iniciar os serviços na raiz: `docker compose up -d --build` e conferir `docker compose ps -a`.
2. Usar a porta 8081 para Keycloak e 8083 para Expo. Em `apps/mobile`, configurar `.env.local` a partir de `.env.example`, apontando para o BFF (porta 3000).
3. Executar `npm run web -- --host lan --port 8083 --clear` e abrir a porta encaminhada indicada.
4. No DevTools, selecionar **Network → No throttling**, desativar qualquer simulação de Offline e recarregar.
5. Conferir OPTIONS, login e stations. Não basta o app abrir; uma sessão de demonstração possui token vazio.

Na raiz do Codespace, testar o preflight sem a camada de encaminhamento do GitHub:

```bash
curl -i -X OPTIONS http://localhost:3000/api/v1/auth/login \
  -H "Origin: https://${CODESPACE_NAME}-8083.app.github.dev" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Depois de corrigir o BFF, o preflight deve responder com sucesso e autorizar a origem e os cabeçalhos usados pelo app. Se funcionar localmente e falhar apenas pela URL encaminhada, verificar também a autenticação da porta privada do Codespaces.

## Pendências para a entrega do grupo

- [x] ADR do app com framework, estado, alternativas e consequências; proposta sujeita à revisão do grupo.
- [x] README com `cd`, comandos de execução e link da ADR.
- [x] Três screenshots reais da versão Web incluídos no README e identificados como offline.
- [x] Executar testes de lógica existentes (mais de 3 casos) e checagem de tipos.
- [ ] Concluir e testar os contratos de integração acima com dados retornados pelos serviços.
- [ ] Testar lista, detalhe, busca, filtros, favoritos e estados carregando/vazio/erro.
- [ ] Favoritar, fechar e reabrir sem limpar dados; verificar persistência e remoção.
- [ ] Gerar build Android, instalar e demonstrar em dispositivo; validar acesso ao Metro no build debug.
- [ ] Registrar capturas das cinco features e resultados no PR, com dispositivo e versão.
- [ ] Revisar a ADR e integrar esta contribuição na `feat/mobile-app` do repositório do grupo.
- [ ] Confirmar reserva do tema por issue, integrantes colaboradores, URL no Canvas e apresentação de até 20 minutos.

O enunciado exige dados reais e build mobile; a demonstração Web offline e os testes unitários não substituem essas etapas.
