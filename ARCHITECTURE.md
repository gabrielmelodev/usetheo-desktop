# Theo --- arquitetura local-first

## Estado da análise

A implementação atual já tinha uma boa separação entre dados locais e
recursos online, mas havia uma divergência importante: o frontend
operacional usava IndexedDB, enquanto o projeto Rust descrevia SQLite
local + PostgreSQL remoto. O cliente também mantinha duas camadas locais
(`localdb.ts` e `local-db.ts`), o que aumentava o risco de
inconsistência.

A implementação entregue nesta versão mantém o comportamento existente
como fallback, mas coloca SQLite real no processo principal do Electron,
cria isolamento por conta, fila de eventos, coalescimento de alterações,
protocolo Cloudflare/D1 opcional e atualização explícita pelo GitHub
Releases.

## Arquitetura final

``` text
                         ┌──────────────────────────────┐
                         │          Theo Desktop        │
                         │ React + Electron             │
                         └──────────────┬───────────────┘
                                        │ IPC
                                        ▼
                         ┌──────────────────────────────┐
                         │ SQLite local                 │
                         │ profiles/<user>/theo-*.sqlite│
                         │ local_records                │
                         │ sync_queue                   │
                         │ sync_conflicts               │
                         │ local_meta                   │
                         └──────────────┬───────────────┘
                                        │ batch / delta
                                        ▼
                         ┌──────────────────────────────┐
                         │ Cloudflare Worker            │
                         │ auth + subscription + sync   │
                         └──────────────┬───────────────┘
                                        ▼
                         ┌──────────────────────────────┐
                         │ Cloudflare D1                 │
                         │ users / sessions / events     │
                         └──────────────────────────────┘

GitHub Releases ──► Electron updater ──► nova versão
                                      │
                                      └── SQLite permanece intacto
```

## O que foi implementado

-   SQLite real no desktop através de IPC, sem expor o arquivo ao
    renderer.
-   Migração única e não destrutiva do IndexedDB existente.
-   Perfis SQLite separados por `user_id`, evitando que logout/login
    entre contas misture dados.
-   Fila `sync_queue` com `event_id`, operação, entidade, versão, retry
    e payload.
-   Coalescimento de alterações pendentes do mesmo registro para reduzir
    D1 writes.
-   Cursor incremental e protocolo `POST /sync/push`, `GET /sync/pull` e
    `GET /sync/bootstrap`.
-   Idempotência por `event_id`.
-   Resolução determinística de conflitos por versão lógica +
    `device_id`.
-   Registro local de conflitos e métricas.
-   Trial de 7 dias no Worker.
-   Estados `trial`, `active`, `expired`, `cancelled` e `past_due`.
-   Backend como autoridade da assinatura.
-   Dados locais preservados após expiração.
-   `SubscriptionService` abstrato para conectar futuramente um provedor
    de pagamento.
-   Webhook genérico de assinatura, sem inventar integração de
    pagamento.
-   GitHub Releases configurado no Electron Builder.
-   Atualização não silenciosa: detectar → usuário clica → baixar →
    usuário instala.
-   SQLite não faz parte do diretório de instalação e fica no `appData`,
    portanto atualização do executável não substitui o banco.

## Arquivos principais

### Desktop

-   `electron/localDatabase.js`: SQLite, fila, métricas e isolamento por
    conta.
-   `electron/main.js`: IPC do banco e updater.
-   `electron/preload.cjs`: API segura de IPC.
-   `src/lib/localdb.ts`: camada local compatível com as APIs
    existentes.
-   `src/lib/cloudSync.ts`: sincronização incremental Cloudflare/D1.
-   `src/lib/sync.ts`: mantém o protocolo Rust legado e seleciona
    Cloudflare quando configurado.
-   `src/components/SubscriptionGate.tsx`: bloqueio de recursos após
    expiração.
-   `src/components/SubscriptionModal.tsx`: status da assinatura sem
    simular pagamento.

### Cloudflare

-   `cloudflare/src/index.ts`: Worker.
-   `cloudflare/src/subscription.ts`: `SubscriptionService`.
-   `cloudflare/schema.sql`: schema D1.
-   `cloudflare/wrangler.toml`: binding do D1.
-   `cloudflare/tsconfig.json`: tipos do Worker.

## Autenticação

O Worker usa: - senha com PBKDF2-SHA-256 + salt; - access token curto
assinado com HMAC; - refresh token aleatório armazenado somente como
hash SHA-256; - sessões revogáveis; - `user_id` derivado da sessão,
nunca aceito como autoridade de acesso; - isolamento de eventos por
`user_id`.

O segredo do JWT e o segredo do webhook devem ser configurados como
secrets do Worker, nunca no aplicativo.

## Trial e assinatura

No cadastro: - `trial_started_at = agora` -
`trial_expires_at = agora + 7 dias` - `subscription_status = trial`

O Worker recalcula o acesso em cada operação protegida.

Expirado: - bloqueia sincronização protegida; - não apaga SQLite; - não
apaga decks, cards, revisões, notas ou planejamento.

Pagamento ainda não foi conectado porque a especificação determina que
nenhuma integração de provedor deve ser inventada. O ponto de entrada é
`SubscriptionService` + webhook autenticado.

## Sincronização

Fluxo normal:

``` text
alteração
  ↓
SQLite
  ↓
sync_queue
  ↓
debounce/batch
  ↓
Worker /sync/push
  ↓
D1 sync_events
  ↓
outro dispositivo /sync/pull
  ↓
SQLite
```

O mesmo evento pode ser reenviado sem duplicação porque `event_id` é
único no D1.

O cliente não envia o banco inteiro no protocolo Cloudflare.

## Atualizações

O projeto passa a publicar pelo GitHub:

``` text
v1.0.0
v1.1.0
v1.2.0
```

`electron-builder` usa o repositório `gabrielmelodev/theo-frontend`.

`autoDownload` foi desativado. A sequência é:

``` text
verificar
  ↓
nova versão encontrada
  ↓
usuário clica
  ↓
download
  ↓
usuário clica para instalar
```

## Compatibilidade

O backend Rust/PostgreSQL atual não foi apagado. O protocolo legado
continua disponível.

O protocolo Cloudflare é ativado por:

``` text
VITE_SYNC_PROTOCOL=cloudflare
VITE_API_URL=https://SEU-WORKER.workers.dev/api
```

Quando `VITE_API_URL` aponta para `workers.dev`, o cliente também
identifica automaticamente o protocolo Cloudflare.

Isso permite migrar a infraestrutura sem destruir as funcionalidades
atuais.

## Deploy Cloudflare

1.  Criar D1.
2.  Colocar o `database_id` no `cloudflare/wrangler.toml`.
3.  Executar `npx wrangler d1 execute theo --remote --file=schema.sql`.
4.  Criar secrets:
    -   `JWT_SECRET`
    -   `WEBHOOK_SECRET`
5.  Definir `ALLOWED_ORIGIN` para o domínio/app permitido.
6.  `npm install` dentro de `cloudflare`.
7.  `npx wrangler deploy`.
8.  Configurar o frontend para o Worker.
9.  Publicar o instalador Electron em GitHub Releases.

## Custos e limites

O desenho foi feito para permanecer no Free Tier enquanto o uso for
pequeno/moderado.

Segundo a documentação vigente da Cloudflare consultada em setembro de
2026: - Workers Free: 100.000 requests/dia. - D1 Free: 5 milhões de rows
read/dia. - D1 Free: 100.000 rows written/dia. - D1 Free: 5 GB de
armazenamento total. - D1 Free: máximo de 500 MB por banco. - Workers
Free: 50 subrequests por invocation.

O push usa `D1.batch()` para não fazer uma chamada D1 por evento. Isso é
importante porque a própria documentação recomenda batch para reduzir
round trips e o limite de subrequests do Free é 50.

## Estimativa simples de consumo

Hipótese de referência, apenas para planejamento: - 10 ciclos de
sincronização por usuário/dia; - média de 5 eventos alterados por
ciclo; - cada ciclo = aproximadamente 1 request de sync; - não inclui
picos de login, cadastro, bootstrap ou recursos online.

    Usuários   Requests sync/dia   Eventos/dia
  ---------- ------------------- -------------
         100             \~1.000       \~5.000
       1.000            \~10.000      \~50.000
      10.000           \~100.000     \~500.000
     100.000         \~1.000.000   \~5.000.000

Essa tabela não é uma previsão de faturamento. Ela mostra onde os
limites gratuitos começam a ficar incompatíveis com o volume.

Em especial, 10.000 usuários nesse cenário já ultrapassariam o limite
diário de rows written do D1 Free, mesmo que o número de requests do
Worker esteja no limite.

## Pontos de risco de custo

1.  Histórico de eventos crescendo indefinidamente.
    -   Mitigação futura: compactação/snapshot por conta + retenção de
        eventos já materializados.
2.  Polling frequente.
    -   Mitigação: debounce, pull incremental e sincronização no
        foco/início/alteração.
3.  Muitas pequenas alterações.
    -   Mitigação: coalescimento da fila local.
4.  Bootstrap de contas grandes.
    -   Mitigação futura: snapshots compactados por entidade/conta.
5.  100.000+ usuários.
    -   O Free Tier deixa de ser uma meta realista com o cenário de
        sincronização acima.

## O que não foi implementado

-   Nenhum provedor de pagamento foi escolhido ou conectado.
-   Nenhum serviço pago foi adicionado.
-   Nenhum anexo foi enviado para a nuvem.
-   Nenhum Redis/Kafka/RabbitMQ/VPS foi adicionado.
-   O histórico remoto ainda precisa de uma política de
    compactação/retention antes de atingir grande escala.
-   O 2FA existente do backend Rust não foi reimplementado no Worker; o
    fallback Rust permanece para compatibilidade. Para migrar 100% da
    autenticação para o Worker, o 2FA precisa ser portado em uma etapa
    específica.

## Checklist antes de produção

-   [ ] Criar D1 e preencher `database_id`.
-   [ ] Configurar secrets do Worker.
-   [ ] Executar schema remoto.
-   [ ] Testar cadastro e trial.
-   [ ] Testar login em dois dispositivos.
-   [ ] Testar alteração offline e posterior sincronização.
-   [ ] Testar o mesmo evento duas vezes.
-   [ ] Testar conflito simultâneo.
-   [ ] Testar expiração do trial.
-   [ ] Confirmar que SQLite continua íntegro após atualização.
-   [ ] Publicar uma Release do GitHub.
-   [ ] Instalar a Release em uma máquina limpa.
-   [ ] Verificar restauração de dados locais.
-   [ ] Monitorar rows read/written no painel D1.
