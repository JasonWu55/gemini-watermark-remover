# Docker 部署

這個容器提供兩個入口：

- `web`：在瀏覽器內使用專案附帶的圖片／影片處理介面。
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
ghcr.io/jasonwu55/gemini-watermark-remover-cli:latest
```

GHCR 第一次建立的 package 預設為 Private。第一次 Action 成功後，請到 GitHub 個人頁面的 **Packages**，分別開啟兩個 package 的 **Package settings**，把 **Change visibility** 設為 Public，之後 Compose 才能免登入直接拉取。

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
