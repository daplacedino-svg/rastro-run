# rodagem.run

Transforma uma corrida (GPX, FIT ou TCX) em um vídeo vertical curto (de 12 a 35 s, conforme a distância): um bonequinho correndo
sobre o trajeto num mapa de satélite 3D, com a câmera sobrevoando. Tudo roda no navegador, sem servidor.

## Rodando localmente

```bash
npm install
npm run dev
```

### Testar no celular (mesma Wi-Fi)

WebCodecs e Wake Lock só funcionam em HTTPS. Pelo IP da rede em HTTP o navegador cairia no
fallback MediaRecorder. Para medir o caminho principal no celular:

```bash
npm run dev:https
```

Abra no celular o endereço `https://192.168.x.x:5173` que aparecer como **Network** e aceite o aviso
de certificado (é autoassinado). Outra opção é usar a URL publicada no Cloudflare (já tem HTTPS).

## Páginas

- `index.html`: o app (upload → prévia → vídeo).
- `como-exportar.html`: passo a passo para baixar o GPX/FIT/TCX no celular (Strava, Garmin, Coros,
  Suunto, Polar, Apple Watch). No ar, fica em `/como-exportar`, e dá para abrir direto num app com
  âncora: `/como-exportar#garmin`. Os menus dos apps mudam com o tempo, então revise de vez em quando.

## Como o vídeo é gerado

1. **Trajeto** (`src/parsers`, `src/track`): lê o arquivo, remove pontos parados e suaviza o GPS.
2. **Câmera** (`src/map/camera.ts`): calcula a pose de *todos* os quadros de uma vez
   (abertura → corrida em velocidade constante → zoom-out final). É determinístico, então a prévia
   e o vídeo mostram a mesma coisa.
3. **Pré-carregamento** (`src/map/preload.ts`): lista, com `map.coveringTiles()`, todos os tiles que
   a câmera vai usar e baixa em paralelo para um cache em memória (`src/map/tile-cache.ts`).
4. **Render** (`src/render`): para cada quadro, posiciona o mapa, desenha de forma síncrona
   (`map.redraw()`) e junta mapa + rastro + bonequinho + km num canvas 1080×1920. O rastro é
   projetado pelo próprio compositor e não é uma camada do MapLibre: revelar a linha no MapLibre
   obrigava a reprocessar o trajeto a cada quadro, e a geração ficava ~10× mais lenta com GPX de 1 Hz.
5. **Exportação** (`src/export`):
   - **WebCodecs + [Mediabunny](https://mediabunny.dev)** → MP4 H.264, quadro a quadro. Não é em
     tempo real: em aparelho lento demora mais, mas o vídeo sai liso.
   - **Fallback MediaRecorder** → grava o canvas em tempo real (MP4 ou WebM, conforme o navegador).

> O `mp4-muxer` foi descontinuado pelo autor em favor do Mediabunny, por isso usamos o Mediabunny.

## Parâmetros

Tudo em `src/config.ts`: fps, bitrate, divisão abertura/corrida/fechamento, inclinação e
zoom da câmera, cores, tamanho do bonequinho.

**Duração:** cresce com a raiz da distância: `11 s + 3 s × √km`, limitada entre 12 e 35 s
(3 km ≈ 16 s, 10 km ≈ 20 s, 21 km ≈ 25 s, 42 km ≈ 30 s). Abertura (2 s) e fechamento (5 s) são
fixos; só o trecho da corrida estica. Ajuste em `DURATION` no `src/config.ts`.

**Cartão de dados no fechamento** (`src/overlay/end-card.ts`, `src/track/stats.ts`): nome, data,
distância, tempo em movimento, pace médio e elevação, entrando junto com a comemoração. Fica acima
dos 20% de baixo da tela (área que o Reels e os Stories cobrem) e o zoom-out enquadra o trajeto acima
dele (`END_CARD` no `src/config.ts`). Tempo e elevação vêm do relógio ou do Strava quando
disponíveis; no GPX são calculados, sem as paradas e com a altitude suavizada. Elevação 0 m não
aparece.

**Marca no vídeo:** "rodagem.run" pequeno no canto superior esquerdo durante todo o vídeo (abaixo dos
~14% de cima que o Stories cobre; `WATERMARK` no `src/config.ts`) e "feito com rodagem.run" no rodapé do
cartão de dados. O zoom-out final deixa livre a faixa da marca e a do cartão.

**Câmera:** ângulo fixo, alinhado ao eixo maior do trajeto. Ela segue o corredor sem girar. Modos que
giravam junto com o trajeto foram testados e descartados porque o vídeo girava demais.

**Forçar o fallback:** `?metodo=mediarecorder`.

## Trocar a fonte do satélite

Só o arquivo `src/map/tile-sources.ts` conhece os provedores. Configure no `.env` (veja `.env.example`)
ou nas variáveis de build do Worker no Cloudflare:

| Provedor | Variáveis |
| --- | --- |
| Esri World Imagery (padrão) | nenhuma — gratuito para protótipo, exige atribuição |
| Mapbox Satellite | `VITE_TILE_PROVIDER=mapbox`, `VITE_MAPBOX_TOKEN` |
| MapTiler Satellite | `VITE_TILE_PROVIDER=maptiler`, `VITE_MAPTILER_KEY` |

Tokens de front-end ficam públicos no bundle. Restrinja-os por domínio no painel do provedor.

## Conectar com Strava

O usuário entra pelo próprio Strava (OAuth), escolhe a atividade numa lista e o trajeto vem
direto da API, sem precisar de arquivo. O código fica em `worker/` (servidor) e
`src/strava/` + `src/ui/strava-panel.ts` (site).

- **Sem banco de dados:** os tokens do Strava ficam num cookie `HttpOnly` criptografado (AES-GCM)
  que só o Worker lê. O trajeto passa pelo Worker e não é guardado.
- **Permissão pedida:** `activity:read_all`, que inclui atividades "Só você".
- **Endpoints:** `/api/strava/status`, `/login`, `/callback`, `/activities?page=N`,
  `/activities/:id/track` e `/logout` (este revoga a autorização no Strava).
- **Quando o botão aparece:** com o Strava configurado **e** `STRAVA_PUBLIC=true`. Com `false`, só aparece
  abrindo o site com `?strava-beta=1` (vale para aquele navegador; `?strava-beta=0` desliga).

### Configuração

1. Crie o app em [strava.com/settings/api](https://www.strava.com/settings/api). Em
   **Authorization Callback Domain**, use `rodagem.run` (sem `https://`). `localhost` sempre funciona.
2. Coloque o **Client ID** em `vars.STRAVA_CLIENT_ID` no `wrangler.jsonc`.
3. No Cloudflare (Worker → Settings → Variables and Secrets), crie os segredos
   `STRAVA_CLIENT_SECRET` e `SESSION_SECRET` (texto aleatório longo).
4. Para desenvolver localmente: copie `.dev.vars.example` para `.dev.vars`, preencha e rode,
   em dois terminais:
   ```bash
   npm run build && npm run dev:api
   ```
   ```bash
   npm run dev
   ```
   O Vite repassa `/api/*` para o Worker local (porta 8787).

### Público e regras de marca

Liberado para todo mundo em 2026-10-07 (`STRAVA_PUBLIC=true`), depois que o Strava aprovou o app para
mais atletas. As regras de marca ([developers.strava.com/guidelines](https://developers.strava.com/guidelines/))
são seguidas assim:

- **Botão "Connect with Strava"** e **selo "Powered by Strava"** usam a arte oficial, sem modificação, em
  `public/strava/` (tirada de `1.1-Connect-with-Strava-Buttons.zip` e `1.2-Strava-API-Logos.zip`).
  O selo tem versão preta (tema claro) e branca (tema escuro).
- **Link para a atividade** com o texto exato **"View on Strava"**, em negrito e no laranja `#FC5200`.
- **Sem selo dentro do vídeo**: as regras só exigem a arte oficial *se* o selo aparecer.
- **Não fazer:** colocar "Strava" no nome do app, sugerir que o Strava patrocina ou endossa o app, alterar
  ou animar os logos, usar parte do logo como ícone.

## Deploy no Cloudflare Workers

O site é publicado como *static assets* de um Worker; o código em `worker/` só atende `/api/*`.
A configuração fica em `wrangler.jsonc`, que publica a pasta `dist/` no domínio **rodagem.run**
(comprado no Cloudflare Registrar; o deploy cria o DNS e o certificado sozinho).

1. No Cloudflare: **Workers & Pages → Create → Import a repository** e escolha este repositório.
2. Configuração:
   - Project name: `rastro-run` (precisa ser igual ao `name` do `wrangler.jsonc`; o nome interno
     continua o do projeto original, o que não aparece para o usuário)
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - A versão do Node vem do arquivo `.node-version` (22).
3. Cada push na `main` publica em produção. As outras branches geram versões de preview com URL própria.

Variáveis do Vite (`VITE_*`, como o token do Mapbox) entram no build. Configure-as em
**Settings → Build → Variables and secrets** do Worker, e não nas variáveis de runtime.

`public/_headers` define o cache dos assets com hash.

Para publicar direto do seu computador (opcional): `npm run build && npx wrangler deploy`.

## Exemplo

`public/samples/exemplo.gpx` é carregado pelo botão "testar com o exemplo".
**O arquivo atual é provisório** (uma volta sintética aproximada na Lagoa Rodrigo de Freitas).
Substitua pelo GPX definitivo.
