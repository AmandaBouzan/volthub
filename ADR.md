# ADR — React Native com Expo para o VoltHub Mobile

**Status:** adotada na implementação

## Contexto

O VoltHub já possui um backend para gerenciar eletropostos. O trabalho da disciplina acrescenta um aplicativo em que o motorista pode listar estações, abrir detalhes, buscar, filtrar por critérios como o tipo de conector e salvar favoritos entre sessões. A interface também precisa tratar carregamento, ausência de resultados e falhas.

O aplicativo precisa consumir a API do VoltHub, persistir favoritos no dispositivo e ser demonstrável em Android. Uma versão web facilita a validação da interface durante o desenvolvimento.

## Opções avaliadas neste ADR

| Opção | Vantagens | Custos para este projeto |
|---|---|---|
| React Native com Expo | Compartilha telas e regras em TypeScript. O Expo Router organiza a navegação e o projeto pode rodar em Android e no navegador. | Exige alinhar as versões do Expo SDK e das dependências nativas. Algumas diferenças de plataforma precisam ser testadas separadamente. |
| Flutter | Permite compartilhar a interface e oferece componentes próprios para manter a consistência visual entre plataformas. | Introduz Dart e um conjunto de ferramentas específico para o app. |
| Kotlin Multiplatform com Compose | Permite compartilhar regras e interface em Kotlin e oferece integração com o ecossistema Android. | Introduz a configuração dos alvos do Gradle e exige validar o suporte das bibliotecas em cada plataforma escolhida. |

## Decisão

Adotar **React Native com Expo e TypeScript**. A mesma base atende à navegação, à busca, aos filtros e aos favoritos no Android e na web. O Expo Router organiza as telas e reduz o trabalho de configurar a navegação. Para este escopo, a equipe pode concentrar o desenvolvimento na jornada de consulta aos eletropostos e na integração com o backend existente.

A interface chama casos de uso, que dependem de contratos de repositório. A infraestrutura implementa esses contratos com chamadas HTTP ao BFF e armazenamento local. A listagem consulta `GET /api/v1/stations` e o login usa `POST /api/v1/auth/login`. Os favoritos guardam os identificadores das estações com AsyncStorage no Android e armazenamento local no navegador.

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
