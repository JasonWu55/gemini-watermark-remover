# Docker 部署

這個 repository 提供三個獨立的 Docker image：

- `web`：在瀏覽器內使用專案附帶的圖片／影片處理介面。
- `api`：接受圖片的 HTTP API，適合 iOS 捷徑或其他自動化工具。
- `cli`：透過掛載的 `/data` 目錄執行 `gwr` 指令。

> 上游公開網站的原始碼位於另一個 repository。這裡的 Web 容器使用本 repository 內建的 `dev-preview.html`，不是 `geminiwatermarkremover.io` 官網的完整複製品。

## Web UI

從 GHCR 拉取已建置的 image，並在背景啟動：

```bash
docker compose pull web
docker compose up -d web
```

瀏覽器開啟 <http://localhost:4173>。圖片與影片由瀏覽器本機處理，不會上傳至容器。

若要更換對外連接埠：

```bash
GWR_PORT=8080 docker compose up -d web
```

查看狀態與紀錄：

```bash
docker compose ps
docker compose logs -f web
```

停止服務：

```bash
docker compose down
```

若要從目前 checkout 的原始碼自行建置：

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build web
```

## HTTP API

建議先設定一個長且隨機的 Bearer token，再啟動 API：

```bash
export GWR_API_TOKEN='replace-with-a-long-random-token'
docker compose pull api
docker compose up -d api
```

上傳 PNG、JPEG 或 WebP 圖片；處理結果固定回傳 PNG：

```bash
curl --fail-with-body \
  -X POST http://localhost:3000/v1/remove \
  -H "Authorization: Bearer $GWR_API_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @input.png \
  --output output.png
```

健康檢查不需要 token：

```bash
curl http://localhost:3000/healthz
```

環境變數：

| 變數 | 預設值 | 用途 |
| --- | --- | --- |
| `GWR_API_PORT` | `3000` | 主機對外連接埠 |
| `GWR_API_TOKEN` | 空字串 | Bearer token；對外部署務必設定 |
| `GWR_API_MAX_BYTES` | `20971520` | 單張圖片大小上限（bytes） |

如果 `GWR_API_TOKEN` 留空，API 不會驗證身分，只適合受信任的本機或內網環境。若服務會暴露到 Internet，請同時使用 HTTPS reverse proxy，避免 token 與圖片以明文傳輸。

### iOS 捷徑設定

1. 加入「選取照片」，並關閉多選。
2. 加入「取得 URL 的內容」，URL 填入 `https://你的網域/v1/remove`。
3. 方法選 `POST`，要求本文選「檔案」，值選前一步的照片。
4. 加入標頭 `Content-Type: image/jpeg`；若捷徑傳入的是 PNG，需改為 `image/png`。
5. 加入標頭 `Authorization: Bearer 你的-token`。
6. 加入「儲存到照片相簿」或「儲存檔案」，輸入使用 API 的回傳結果。

API 會回傳 `X-GWR-Applied`、`X-GWR-Decision-Tier`、`X-GWR-Quality-Status` 與 `X-Request-Id` 標頭，方便除錯或後續自動化判斷。

## CLI

先建立資料目錄，並把待處理檔案放進去：

```bash
mkdir -p data
docker compose pull cli
docker compose run --rm cli remove /data/input.png --output /data/output.png
```

批次處理目錄時，可以使用 `--out-dir`：

```bash
docker compose run --rm cli remove /data/input --out-dir /data/output
```

預設掛載目前目錄下的 `./data`。若要使用其他位置：

```bash
GWR_DATA_DIR=/absolute/path/to/files \
  docker compose run --rm cli remove /data/input.png --output /data/output.png
```

查看完整 CLI 說明：

```bash
docker compose run --rm cli --help
```

## GitHub Container Registry

`.github/workflows/docker-publish.yml` 會在以下時機建置 Docker image：

- `main` 有新 commit，包括自動同步上游後的 commit
- 推送 `v*` tag
- 從 GitHub Actions 手動執行
- Pull request 會進行建置驗證，但不推送 image

每次發布會同時產生 `linux/amd64` 與 `linux/arm64` image：

```text
ghcr.io/jasonwu55/gemini-watermark-remover-web:latest
ghcr.io/jasonwu55/gemini-watermark-remover-api:latest
ghcr.io/jasonwu55/gemini-watermark-remover-cli:latest
```

GHCR 第一次建立的 package 預設為 Private。第一次 Action 成功後，請到 GitHub 個人頁面的 **Packages**，分別開啟三個 package 的 **Package settings**，把 **Change visibility** 設為 Public，之後 Compose 才能免登入直接拉取。

若暫時維持 Private，部署主機必須先登入：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u JasonWu55 --password-stdin
```

## 同步上游

`.github/workflows/sync-upstream.yml` 每天會把
`GargantuaX/gemini-watermark-remover:main` 合併到 fork 的 `main`，也可以在 GitHub Actions 頁面手動執行。

GitHub fork 第一次使用 Actions 時，可能需要先在 repository 的 **Actions** 頁面按下啟用。若上游與 Docker 自訂檔案出現合併衝突，工作流會停止且不會強制覆寫，需要人工處理衝突。

本機也可以手動同步：

```bash
git remote add upstream https://github.com/GargantuaX/gemini-watermark-remover.git
git fetch upstream main
git switch main
git merge upstream/main
git push origin main
```
