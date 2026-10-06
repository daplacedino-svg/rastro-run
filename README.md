# rastro.run

Transforma uma corrida (GPX, FIT ou TCX) em um vídeo vertical de 25 s: um bonequinho correndo
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

## Como o vídeo é gerado

1. **Trajeto** (`src/parsers`, `src/track`): lê o arquivo, remove pontos parados e suaviza o GPS.
2. **Câmera** (`src/map/camera.ts`): calcula a pose de *todos* os 750 quadros de uma vez
   (abertura → corrida em velocidade constante → zoom-out final). É determinístico, então a prévia
   e o vídeo mostram a mesma coisa.
3. **Pré-carregamento** (`src/map/preload.ts`): lista, com `map.coveringTiles()`, todos os tiles que
   a câmera vai usar e baixa em paralelo para um cache em memória (`src/map/tile-cache.ts`).
4. **Render** (`src/render`): para cada quadro, posiciona o mapa, desenha de forma síncrona
   (`map.redraw()`) e junta mapa + bonequinho + km num canvas 1080×1920.
5. **Exportação** (`src/export`):
   - **WebCodecs + [Mediabunny](https://mediabunny.dev)** → MP4 H.264, quadro a quadro. Não é em
     tempo real: em aparelho lento demora mais, mas o vídeo sai liso.
   - **Fallback MediaRecorder** → grava o canvas em tempo real (MP4 ou WebM, conforme o navegador).

> O `mp4-muxer` foi descontinuado pelo autor em favor do Mediabunny, por isso usamos o Mediabunny.

## Parâmetros

Tudo em `src/config.ts`: duração, fps, bitrate, divisão abertura/corrida/fechamento, inclinação e
zoom da câmera, cores, tamanho do bonequinho.

**Modos de câmera (em teste):** `suave` (padrão), `direcao` e `fixa`. Dá para trocar pelo seletor
na tela ou pela URL: `?camera=direcao`.

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

## Deploy no Cloudflare Workers

O site é publicado como *static assets* de um Worker, sem código de servidor. A configuração
fica em `wrangler.jsonc`, que publica a pasta `dist/`.

1. No Cloudflare: **Workers & Pages → Create → Import a repository** e escolha este repositório.
2. Configuração:
   - Project name: `rastro-run` (precisa ser igual ao `name` do `wrangler.jsonc`)
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
