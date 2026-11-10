# ADR — Decisões de arquitetura do VoltHub Mobile

**Status:** decisões adotadas na implementação

## Contexto

O VoltHub já possui um backend para gerenciar eletropostos. O trabalho da disciplina acrescenta um aplicativo em que o motorista pode listar estações, abrir detalhes, buscar, filtrar por critérios como o tipo de conector e salvar favoritos entre sessões. A interface também precisa tratar carregamento, ausência de resultados e falhas.

O aplicativo precisa consumir a API do VoltHub, persistir favoritos no dispositivo e ser demonstrável em Android. Uma versão web facilita a validação da interface durante o desenvolvimento.

## Decisões

### Framework — React Native com Expo e TypeScript

A experiência da equipe com TypeScript e o reaproveitamento de telas e regras entre Android, iOS e web orientaram a escolha. O projeto usa Expo para organizar o desenvolvimento multiplataforma. Flutter exigiria adotar Dart, e Kotlin Multiplatform com Compose exigiria configurar os alvos no Gradle e validar as bibliotecas por plataforma. A escolha exige manter o Expo SDK alinhado às dependências nativas e validar cada plataforma separadamente.

### Estado — Zustand

As stores concentram o estado de autenticação, estações, favoritos e recarga. A store de estações consegue ler o token diretamente da store de autenticação com `getState()`, inclusive fora de componentes. Redux Toolkit traria mais estrutura do que o escopo atual exige. Context API exigiria organizar providers e uma forma separada de consultar o estado fora da árvore React. Os casos de uso concentram as regras, e as stores coordenam as ações e o estado da interface.

### Navegação — Expo Router

As rotas seguem os arquivos em `src/app/`, incluindo a rota dinâmica de detalhe da estação. Isso facilita links diretos para telas específicas. As abas usam `Tabs.Protected` para liberar as telas de acordo com a sessão. A configuração manual com React Navigation exigiria manter explicitamente o mapa de rotas e a configuração de links. Com o Expo Router, a estrutura dos arquivos faz parte do contrato de navegação.

### Persistência — AsyncStorage

O app guarda os IDs das estações favoritas como dados de chave e valor usando AsyncStorage. No navegador, a implementação usa o armazenamento local. MMKV foi considerado pelo desempenho, mas esse ganho tem pouco impacto para um conjunto pequeno de IDs. SQLite faria sentido se houvesse consultas, relacionamentos ou um volume maior de dados. Os favoritos permanecem no dispositivo ou navegador em que foram salvos.

## Integração com o backend

A interface chama casos de uso, que dependem de contratos de repositório. A infraestrutura implementa esses contratos com chamadas HTTP ao BFF e armazenamento local. A listagem consulta `GET /api/v1/stations` e o login usa `POST /api/v1/auth/login`.

## Consequências

- As regras de busca e filtro podem ser testadas separadamente da interface. Os testes no dispositivo continuam necessários para validar navegação, layout e persistência entre sessões.
- Os favoritos persistem no ambiente em que foram salvos. O app usa armazenamento local por instalação ou navegador.
- A versão web pode ser usada para revisar as telas. O teste em Android cobre o comportamento no dispositivo, inclusive as áreas seguras da tela e a navegação do sistema.
- O conjunto de demonstração local permite exercitar a interface quando a API está indisponível. A validação da integração exige confirmar que o BFF respondeu à consulta e que a lista exibida veio dessa resposta.
- Atualizações do Expo SDK exigem verificar a compatibilidade das dependências e repetir o build e os testes nas plataformas usadas.

## Referências no repositório

- [README do aplicativo](apps/mobile/README.md)
- [Código do aplicativo](apps/mobile/src/)
- [Rotas do BFF](services/bff-web/src/main.ts)
