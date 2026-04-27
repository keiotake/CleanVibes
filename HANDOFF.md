# CleanVibes 引き継ぎ指示書

最終更新: 2026年4月27日

---

## 1. プロジェクト概要

**CleanVibes活動記録アプリ**
- 伊東市の美化ボランティア団体「CleanVibes」の活動を記録するWebアプリ
- 公開URL: https://keiotake.github.io/CleanVibes/
- リポジトリ: https://github.com/keiotake/CleanVibes
- ホスティング: GitHub Pages（mainブランチ自動デプロイ）

---

## 2. アーキテクチャ

```
[ブラウザ] ──▶ [GitHub Pages: index.html (単一HTML)]
                    │
                    ├── JSONP GET ──▶ [Google Apps Script]
                    │                    │
                    │                    └── [Google スプレッドシート: "Clean Vibes" シート A1セルにJSON]
                    │                                                  ↑
                    └── no-cors POST ──▶ [Google Apps Script (Code.gs)]
                                              │
                                              └── 写真は [Google Drive]
```

- フロントエンド: 単一の `index.html`（HTML+CSS+JS全部入り）
- バックエンド: GAS（`Code.gs`）
- データベース: スプレッドシート A1セルにJSON文字列で保存
- 写真: Google Drive

---

## 3. 引き継ぎ手順（新PC側）

### A. リポジトリをクローン
```bash
cd C:\Users\<ユーザー名>
git clone https://github.com/keiotake/CleanVibes.git
cd CleanVibes
```

### B. プレビューサーバ設定（任意）
`.claude/launch.json` を作成:
```json
{
  "version": "0.0.1",
  "configurations": [{
    "name": "cleanvibes",
    "runtimeExecutable": "npx",
    "runtimeArgs": ["http-server", "C:/Users/<ユーザー名>/CleanVibes", "-p", "8090", "-c-1"],
    "port": 8090
  }]
}
```

### C. 編集→デプロイの流れ
1. `index.html` を編集
2. ローカル確認（任意）: `npx http-server -p 8090 -c-1` → http://localhost:8090
3. コミット&プッシュ:
   ```bash
   git add index.html
   git commit -m "変更内容"
   git push
   ```
4. 1〜2分でGitHub Pagesに自動反映

---

## 4. 重要なURL・定数

| 項目 | 値 |
|------|-----|
| 公開URL | https://keiotake.github.io/CleanVibes/ |
| GAS URL | `https://script.google.com/macros/s/AKfycbyCHg6qLzpttcBDAAiAIFxBCreZ4ZVk0WdEQ-YVGNWMKYooWY4Wgsti2gGWSdZTRvVK0Q/exec` |
| スプレッドシート | "Clean Vibes" シートのA1セル（JSON） |
| バックアップシート | "Backups" シート（30世代保持） |
| 削除パスワード | `0325` |
| 管理者モード | `isAdmin = true`（常に管理者、ログイン不要） |

`index.html` 上部の重要定数:
```javascript
const TOTAL_HISTORY_OFFSET      = 409; // 通算 = state.records.length + 409
const CLEANVIBES_HISTORY_OFFSET = 392; // CleanVibes結成以降のオフセット（現状未使用）
const DELETE_PASSWORD = '0325';
const excludeFromRanking = ['大竹']; // ランキング除外
```

---

## 5. データ構造

スプレッドシート A1セル内のJSON:
```json
{
  "records": [
    {
      "id": 1234567890123,
      "date": "2026-04-25",
      "place": "さくらの里",
      "work": "除草",
      "memo": "",
      "members": ["大竹","小泉","小林"],
      "photos": ["https://drive.google.com/...sz=w800"]
    }
  ],
  "members": ["なみ","ひなた","ゆかこ","れみ","安達","坂本","小泉","小林","松田","川畑","大川","大竹","猪瀬","土谷","藤原","日吉","白鳥","府川","片桐","牧本","勇月"],
  "supports": [
    {"id":..., "name":"E様", "date":"2026-04-01", "type":"item", "value":"ガラ袋50枚", "memo":""}
  ],
  "accounting": [
    {"id":..., "date":"...", "type":"income|expense", "amount":1000, "category":"...", "memo":""}
  ]
}
```

---

## 6. 主要機能（完成済み）

- ✅ 活動記録のCRUD（写真添付対応・最大5枚）
- ✅ メンバー管理（21名登録済み）
- ✅ 集計タブ（年間ランキング、ヒートマップ、環境インパクト）
- ✅ 支援タブ（金銭/物品の支援記録、サマリー集計）
- ✅ 経理タブ（収入/支出、収支バランス、フィルタ）
- ✅ キャラクター成長（メンバーごと、奉仕活動テーマ・10段階）
  - 🧹はじめの一歩 → 🧤見習い → 🪣サポーター → 🌿GreenKeeper → 💪リーダー → 🌊守り手 → 🏅達人 → 🌸誇り → 🏆マイスター → ✨星
- ✅ トップカウンター（通算442 / 今年33）※2026/04/27時点
- ✅ 年間ロードマップ（🚶→🏃→🚴→🏆→👑→🌟と通算で進化、右向きに進行）
- ✅ 削除時パスワード保護（0325）
- ✅ モバイルレスポンシブ（375px幅最適化）

---

## 7. 未完了タスク

### 🔴 GAS自動バックアップのトリガー設定
- `Code.gs` に `dailyBackup()` と `setupDailyBackup()` を追加済み（ローカル）
- **未対応**: Code.gsをGASエディタにペーストし、`setupDailyBackup()` を1回実行する必要あり
- 手順:
  1. GASエディタ（https://script.google.com/）で該当プロジェクトを開く
  2. `Code.gs` の内容をローカルファイル `C:\Users\ka\CleanVibes\Code.gs` で置き換え
  3. 保存
  4. 関数選択ドロップダウンで `setupDailyBackup` を選び実行
  5. 初回は権限承認が必要
  6. トリガー一覧（時計アイコン）で「dailyBackup を毎日3時」が登録されたことを確認

### 🟡 オフセット値の管理
- `TOTAL_HISTORY_OFFSET = 409` は今後の活動でズレが生じたら手動調整
- 「2026/04/27時点 通算442回目」が基準

### 🟢 改善候補（任意）
- カスタムドメイン（現在 `keiotake.github.io` のkeiotake部分は変更不可。リネーム or カスタムドメイン購入で対応）
- 写真のサムネイル最適化（現状はGoogle Driveの`sz=w800`パラメータ使用）

---

## 8. よくあるトラブル

| 症状 | 対処 |
|------|------|
| メンバーチェックボックスが空 | 修正済み（`renderAll`で毎回更新）。それでも出ない場合はChromeを再起動 |
| 通算カウントがズレた | `TOTAL_HISTORY_OFFSET` を調整 |
| 写真がアップロードされない | ポーリング失敗。再度試す（GAS側のレートリミット可能性あり） |
| データ消失？と心配 | スプレッドシートA1の値を確認。Backupsシートに過去30日分あり |

---

## 9. 直近のコミット履歴

```
94f62c7 Reorder tabs (記録→集計→メンバー→支援→経理) and remove team total banner
6b95105 Streamline counters + grow walker + flip roadmap direction
e641274 Add top counters and yearly roadmap to records page
c8f4650 Fix member checkboxes not updating after cloud data loads
ff25516 Set total activity count to 420 (include pre-app history)
1d93f89 Revamp character system + fix mobile support cards + remove badges
2d0fffd Fix mobile responsiveness
3bdc1e6 セキュリティ強化: 削除パスワード制 + 自動バックアップ
84483c7 月間目標セクションを削除
cf75b2c 支援リスト・経理情報タブを追加
```

---

## 10. 連絡・参考

- 作者: 大竹圭（伊東市議会議員）
- AI: Claude Code（CLI版）で開発
- 開発環境: Windows + PowerShell、Chrome（プレビュー用）
- メモリ参照: `C:\Users\ka\.claude\projects\C--Users-ka\memory\MEMORY.md`

新PCで作業を始める時は、Claude Codeに以下のように伝えると引き継ぎがスムーズです:

> 「CleanVibesの開発を別のPCから引き継いだ。`C:\Users\<新ユーザー名>\CleanVibes\HANDOFF.md` を読んで現状を把握して。」
