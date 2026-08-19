# Docker 部署

這個容器提供兩個入口：

- `web`：在瀏覽器內使用專案附帶的圖片／影片處理介面。
- `cli`：透過掛載的 `/data` 目錄執行 `gwr` 指令。

> 上游公開網站的原始碼位於另一個 repository。這裡的 Web 容器使用本 repository 內建的 `dev-preview.html`，不是 `geminiwatermarkremover.io` 官網的完整複製品。

## Web UI

建置並在背景啟動：

```bash
docker compose up -d --build web
```

瀏覽器開啟 <http://localhost:4173>。圖片與影片由瀏覽器本機處理，不會上傳至容器。

若要更換對外連接埠：

```bash
GWR_PORT=8080 docker compose up -d --build web
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

## CLI

先建立資料目錄，並把待處理檔案放進去：

```bash
mkdir -p data
docker compose build cli
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
