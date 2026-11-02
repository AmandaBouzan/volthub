# ADR — Framework, estado e organização do VoltHub Mobile

**Status:** Proposto para revisão do grupo; documenta a implementação existente.  
**Data:** 02/11/2026  
**Escopo:** `apps/mobile`

## Contexto

O VoltHub precisa oferecer um app mobile com lista de eletropostos, detalhe, busca, filtros e favoritos persistentes, consumindo o BFF do ecossistema de recarga. O projeto final exige separação entre dados, lógica e interface, testes próprios e uma demonstração reproduzível. O repositório já utiliza TypeScript em parte dos serviços, permitindo compartilhar a linguagem e conceitos sem acoplar o app às implementações do servidor.

## Decisão

Adotar **React Native com Expo e TypeScript**, com **Expo Router** para navegação e **Zustand** para o estado das telas. O Expo concentra a configuração e geração dos projetos nativos; o Router organiza as rotas de lista, detalhe, favoritos, login, mapa e recarga. A versão Web serve como apoio ao desenvolvimento, mas o build e a validação Android continuam necessários.

O Zustand mantém sessão, lista/filtros, favoritos e recarga em stores específicas. Seu modelo de ações e seletores atende ao escopo atual com pouca configuração. Chamadas HTTP, mapeamento de DTOs e persistência ficam em repositórios da infraestrutura, acessados pelos casos de uso. Os componentes consomem o estado e disparam ações.

Organizar o código em **domain**, **application**, **infrastructure** e **presentation**, com rotas em **app** e utilitários em **core**. Entidades e objetos de valor concentram regras como disponibilidade, conectores, valores e distância; interfaces de repositório separam os casos de uso dos detalhes de HTTP e armazenamento. As stores atuais também compõem repositórios concretos; não há contêiner de injeção de dependência.

Persistir IDs de favoritos por meio da abstração de storage baseada em **AsyncStorage**. Consumir HTTP e WebSocket pelo BFF, com endereço configurável em `EXPO_PUBLIC_API_URL`.

## Alternativas consideradas

| Alternativa | Motivo de não adoção neste escopo |
|---|---|
| Flutter | Atende ao multiplataforma, mas acrescentaria Dart e outro ecossistema ao projeto que já possui TypeScript. Não justificamos a troca da implementação existente. |
| KMP com Compose | Permite compartilhar lógica e UI, mas adicionaria Kotlin e configuração multiplataforma ao trabalho atual. Não há requisito específico que compense essa mudança neste prazo. |
| Android e iOS nativos separados | Dariam maior controle por plataforma, ao custo de duas interfaces e esforço de manutenção maior para o escopo acadêmico. |
| Redux Toolkit | Oferece convenções fortes e ferramentas de depuração, mas exigiria mais estrutura para o estado atual. Reavaliar se os fluxos compartilhados crescerem. |
| Apenas Context API | Adequada para contexto simples; para lista, filtros, sessão e recarga, preferimos stores com ações e seleção de estado explícitas. |

Estas justificativas formalizam a proposta para o código atual e devem ser confirmadas pelo grupo; não constituem registro de uma discussão anterior.

## Consequências e limites

A linguagem comum e a base compartilhada reduzem duplicação, mas não eliminam testes por plataforma nem a configuração de SDK/JDK para gerar Android. A separação de regras permite testes sem interface, enquanto as stores e os adapters exigem validação de integração.

Zustand não fornece cache remoto, expiração ou cancelamento de requisições automaticamente; essas políticas precisam ser implementadas quando necessárias. AsyncStorage atende aos favoritos, mas não é armazenamento seguro para credenciais: a sessão atual também passa por essa abstração, ponto a revisar antes de uso fora da demonstração.

O seed local de estações e a telemetria calculada no cliente são recursos de demonstração/degradação. Não comprovam integração com serviços reais; a apresentação deve distinguir esses modos. Falhas de autenticação/rede não liberam acesso. A demonstração é uma escolha explícita sem token. O BFF implementa o contrato mobile de login usando o Direct Access Grant já habilitado no realm acadêmico; o SPA mantém PKCE. Para evoluir a autenticação do mobile, a alternativa é Authorization Code com PKCE, com fluxo de redirecionamento próprio. Na sessão integrada, energia vem do WebSocket e a fatura vem do billing. O gateway de desenvolvimento mantém HTTP e WS na mesma origem privada do Codespaces.

## Validação da decisão

Executar `npm test`, `npm run lint` e o build Android descrito no [README](./README.md). No dispositivo, verificar as cinco features, persistência após reabertura, estados de erro/vazio e integração HTTP/WebSocket. Resultados devem ser registrados no PR, sem apresentar o roteiro como teste já executado.
