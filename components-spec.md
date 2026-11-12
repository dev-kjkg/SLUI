# components.js 規格書

汎用 UI Web Component ライブラリ（単一ファイル・Shadow DOM・`<slot>`・CSS変数・CustomEvent）。バージョン `1.0.0`。

---

## 1. 導入

```html
<script src="components.js"></script>
```

- 読み込むだけで全タグが `customElements.define` される。二重読み込みは無視される。
- Google Fonts（Material Symbols Outlined / Roboto / Roboto Condensed）の `<link>` を自動で `<head>` に追加する。無効にするには `components.js` より前に `window.UI_NO_FONTS = true` を定義する。
- `window.UIComponents` に `{ version, tags }` が入る。

## 2. 共通規約

### 2.1 部品の共通性質
| 項目 | 内容 |
|---|---|
| Shadow DOM | 全要素 `mode: 'open'`。内部で `box-sizing:border-box; margin:0; padding:0` をリセット |
| `hidden` 属性 | `display:none` になる |
| `focusable` 属性 | 付けた要素が `ui-stage` のフォーカス移動・クリック対象になる |
| `focused` 属性 | `ui-stage` がフォーカス中の要素に付け外しする。各部品はこれに反応して見た目を変える |
| `disabled` 属性 | 付けた要素はフォーカス・決定の対象外になる（対応部品は半透明化） |
| `variant` 属性 | 見た目のバリエーション切替 |
| `toggle` / `checked` | `ui-card`, `ui-list-item` のみ。§5.4 参照 |

### 2.2 CSS変数の方針
- 各部品の既定値はすべて `:host` の `--ui-<部品>-*` に定義されている。利用側CSSで要素ごと・クラスごとに上書きできる。
- 上書きは**要素自身**に対して行う（例: `.my-card { --ui-card-width: 400px }`）。親要素で設定しても効かない変数が多い（例外は §2.3 と各部品の「親から継承する変数」）。
- `ui-button` の既定形（`round`）は `var()` のフォールバックで既定値を持つため、親からの継承も効く。

### 2.3 グローバルトークン
| 変数 | 既定 | 用途 |
|---|---|---|
| `--ui-font` | `Roboto,"Noto Sans JP",system-ui,sans-serif` | `ui-stage` の本文フォント |
| `--ui-font-condensed` | `"Roboto Condensed","Roboto","Noto Sans JP",sans-serif` | 見出し・ラベル用 |
| `--ui-accent` | `#50e3c2` | 強調色（リストヘッダ、進行バー、テキストボタン等） |
| `--ui-accent-2` | `#ffab40` | 第2強調色（`ui-card` の `dim` フォーカス） |
| `--ui-nav` | `#a6a6a6` | `ui-rail` の背景色 |
| `--ui-icon-fill` | `1` | アイコンの FILL 軸 |
| `--ui-icon-weight` | `500` | アイコンの wght 軸 |

### 2.4 `ui-activate` を出す仕組み
- `ui-stage` の中: Enter / Space / クリックで、`ui-stage` が**フォーカス中の要素**に `ui-activate` を発火する。
- `ui-stage` の外: 操作可能な部品（button, card, rail-item, list-item, key, field, tile）は自身のクリックで `ui-activate` を発火する（`disabled` 時を除く）。

---

## 3. イベント一覧
すべて `CustomEvent`、`bubbles: true`, `composed: true`。

| イベント | 発火元 | detail | 備考 |
|---|---|---|---|
| `ui-focus` | フォーカスを得た要素 | `{ element, previous }` | `ui-stage` が発火。スクロールより前に発火する |
| `ui-blur` | フォーカスを失った要素 | `{ element, next }` | 同上 |
| `ui-activate` | 決定された要素 | `{ element }` | §2.4 |
| `ui-back` | `ui-stage` | `{ key, originalEvent }` | Escape / Backspace / GoBack。`ui-keypress` が取り消されなかった場合のみ |
| `ui-keypress` | `ui-stage` | `{ key, code, originalEvent }` | **cancelable**。`keydown` ごとに最初に発火。`preventDefault()` で以降の標準処理を止める |
| `ui-key-press` | `ui-key` | `{ value, element }` | `ui-key` が `ui-activate` を受けたとき |
| `ui-select` | `ui-rail` | `{ item, index }` | 項目決定による選択変更 |
| `ui-change` | `ui-card` / `ui-list-item` | `{ checked, element }` | `toggle` による反転時 |
| `ui-change` | `ui-field` | `{ value, element }` | `value` 属性が変わったとき（接続後） |
| `ui-state-change` | 該当要素 | `{ name, value, oldValue, element }` | `selected` `checked` `active` `collapsed` `disabled` `open` `value` 属性が変わったとき（接続後） |

---

## 4. 部品リファレンス

### 4.1 `ui-stage` — 操作の中枢コンテナ
設計解像度への自動スケーリング、空間（十字キー）フォーカス移動、キー入力の集約を行う。

| 項目 | 内容 |
|---|---|
| 属性 | `design-width`（既定 1920）, `design-height`（既定 1080）, `no-fit`（スケーリング無効）, `no-scroll`（フォーカス時の `scrollIntoView` 無効） |
| CSS変数 | `--ui-stage-bg`（`#969696`）, `--ui-stage-width`（`1920px`）, `--ui-stage-height`（`1080px`） |
| 既定スタイル | `position:absolute; left:0; top:0; overflow:clip; color:#fff; user-select:none` |
| プロパティ | `current`: 現在フォーカス中の要素 |
| メソッド | `focusables()`, `focusElement(el, { scroll })`, `move('l'｜'r'｜'u'｜'d')`, `activate()` |

**スケーリング**: `scale = min(innerWidth/designWidth, innerHeight/designHeight)`。幅・高さを `innerWidth/scale`・`innerHeight/scale` にして `transform: scale()` を適用（`transform-origin: 0 0`）。`resize` で再計算。

**フォーカス可能要素**: ステージ配下の `[focusable]` で、`disabled` でなく、表示中（`getClientRects().length > 0`）のもの。ライトDOM内のみ検索する（他部品のShadow DOM内は対象外）。

**移動アルゴリズム**: 現在要素の中心から、移動方向の軸の差 `p`（8px 未満は除外）と直交方向の差 `q` で `score = p + q×2.5` を計算し、最小のものへ移動。

**キー処理の順序**:
1. `ui-keypress` を発火。キャンセルされたら終了
2. 矢印キー → `move()`
3. Enter / Space → `activate()`
4. Escape / Backspace / GoBack → `ui-back`

**クリック**: `[focusable]` 要素のクリックで、その要素へフォーカス → `activate()`。

### 4.2 `ui-screen` — 切替可能な面
| 項目 | 内容 |
|---|---|
| 属性 | `active` |
| 挙動 | 既定 `display:none`、`active` で `display:block`。`position:absolute; inset:0` |
| 背景 | 利用側CSSで `background` を指定する |

画面切替ロジックは持たない。利用側が `active` 属性を付け替える。

### 4.3 `ui-icon` — アイコン
| 項目 | 内容 |
|---|---|
| 属性 | `name`（アイコン名）。省略時は要素内テキストを名前として使う |
| サイズ・色 | `font-size` と `color` は親から継承 |
| CSS変数 | `--ui-icon-fill`, `--ui-icon-weight` |

### 4.4 `ui-button` — ボタン
slot: 既定（アイコンやテキスト）。属性: `variant`, `disabled`, `focusable`。

**CSS変数**: `--ui-button-` + `width`, `height`, `radius`, `bg`, `color`, `font-size`, `font-family`, `letter-spacing`, `line-height`, `padding`, `shadow`, `transition`, `focus-transform`, `focus-shadow`, `focus-bg`, `focus-color`

| variant | 形 | 寸法 | 背景 / 文字色 | フォーカス時 |
|---|---|---|---|---|
| `round`（既定） | 円 | 104px | `#e9e9e9` / `#757575`, 60px | scale(1.18), 影 `0 12px 28px #0008`, 背景 `#fff` |
| `round-lg` | 円 | 124px | `#e9e9e9` / `#6f6f6f`, 76px | scale(1.12), 影 `0 12px 26px #0009`, 背景は不変 |
| `round-accent` | 円 | 110px | `#4285f4` / `#fff`, 62px | scale(1.12), 影 `0 12px 26px #0009`, 背景は不変 |
| `round-sm` | 円 | 84px | `#e9e9e9` / `#777`, 50px, 影なし | scale(1.15), 背景 `#fff` |
| `filled` | 角丸4px | 幅 auto × 高さ 64px | `#3d444d` / 継承, 35px, padding `0 28px` | scale(1.08), 背景 `#fff`, 文字 `#111` |
| `filled-primary` | `filled` と同じ | 同上 | 背景 `#0057b8` | 同上 |
| `text` | 角丸6px | 幅・高さ auto | 透明 / `--ui-accent`, 36px, padding `14px 28px`, 字間 1px | 背景 `--ui-accent`, 文字 `#fff`, 変形なし |
| `control` | 円 | 180px | 透明 / 継承, 76px | 背景 `#ffffff66`, 変形なし |
| `control-sm` | 円 | 72px | `#555` / 継承, 40px | scale(1.2), 背景 `#fff`, 文字 `#333` |

### 4.5 `ui-card` — カード
属性: `variant`, `active`（`wide` の強調）, `toggle`, `checked`, `disabled`, `focusable`。

| slot | 配置 |
|---|---|
| `media` | 画像領域（`.im`）の中身 |
| `badge` | 画像領域の右下（時間表示など） |
| `title` | タイトル（1行省略表示。`light` は2行折返し） |
| `subtitle` | サブ情報 |
| 既定 | 情報領域の末尾に追加される任意要素 |

**色相**: 画像領域の既定背景は `linear-gradient(135deg, hsl(H 55% 48%), hsl(H+60 65% 24%))`。`H` は `--ui-card-hue`（既定 200）。要素ごとに `style="--ui-card-hue:..."` で指定する。

**CSS変数**: `--ui-card-` + 
`width`, `bg`, `shadow`, `transition`, `filter`, `focus-filter`, `focus-transform`, `focus-shadow`, `focus-z`, `hue`,
`media-height`, `media-bg`, `focus-media-bg`, `media-display`, `media-place`,
`badge-display`, `badge-color`,
`info-height`, `info-padding`, `info-bg`, `focus-info-bg`, `info-color`, `focus-info-color`, `info-font-family`,
`title-size`, `title-color`, `title-font-family`, `title-white-space`, `title-line-height`, `title-max-height`,
`subtitle-size`, `subtitle-color`, `focus-subtitle-color`, `subtitle-margin-top`

| variant | 幅 | 主な特徴 |
|---|---|---|
| （既定） | auto | 白カード。フォーカス scale(1.07)・影 `0 18px 36px #0009`・`z-index:5` |
| `wide` | 528px | 画像 296px / 情報 104px。通常は灰色。`active` で画像 `#fff`・情報背景 `--ui-accent`・文字 `#fff` |
| `dark` | 313px | 背景 `#3a3a3a`。画像 176px / 情報 104px。タイトル 34px。フォーカス scale(1.1)。バッジ非表示 |
| `light` | 395px | 背景 `#f2f2f2`。画像 222px / 情報 178px。タイトル 30px 2行。フォーカス scale(1.1)。バッジ非表示 |
| `lift` | 440px | 画像 250px / 情報 76px。フォーカスで上に 14px 浮き scale(1.12)、画像 `#fff`・情報 `--ui-accent` |
| `dim` | 312px | 全体が `brightness(.55)`。フォーカスで明るくなり scale(1.18)、情報背景 `--ui-accent-2` |
| `select` | 320px | 背景 `#272d30`・影なし。画像 238px で中央寄せ。フォーカスは白い 5px 枠 |

### 4.6 `ui-section` — 見出し付き横並び行
| 項目 | 内容 |
|---|---|
| 属性 | `active` |
| slot | `title`（見出し）, 既定（行の中身。フレックス横並び） |
| 挙動 | `active` の付け外しを、**直下の `ui-card`** の `active` に同期する |
| CSS変数 | `--ui-section-` + `title-size`(48px), `title-height`(62px), `title-color`(`#bcbcbc`), `title-active-color`(`#fff`), `title-gap`(26px), `row-gap`(12px), `row-padding`(`30px 0`), `row-margin`(`-30px 0 40px`) |

行は `overflow:hidden`。フォーカス時の `scrollIntoView` で横スクロールされる。

### 4.7 `ui-rail` / `ui-rail-item` — 折りたたみ可能なナビゲーション

**`ui-rail`**
| 項目 | 内容 |
|---|---|
| 属性 | `collapsed`（折りたたみ）, `manual-select`（項目決定時の自動選択を無効化） |
| slot | `leading`（先頭の丸ボタン等。絶対配置）, 既定（項目群） |
| メソッド | `select(item)`: その項目だけ `selected` にし `ui-select` を発火 |
| 自動選択 | 子の `ui-rail-item` が `ui-activate` を受けると排他的に `selected` を移す |
| CSS変数 | `--ui-rail-` + `width`(570px), `collapsed-width`(150px), `bg`(`--ui-nav`), `shadow`(`0 0 12px #0004`), `items-left`(98px), `items-top`(236px), `collapsed-items-left`(52px), `leading-left`(112px), `leading-top`(62px), `collapsed-leading-left`(35px), `collapsed-leading-top`(70px) |

`collapsed` 時: 幅が `collapsed-width` に変わり（0.25s）、`leading` の `ui-button` は 80px・フォント 46px になり、項目のラベルが隠れる。

**`ui-rail-item`**
| 項目 | 内容 |
|---|---|
| 属性 | `selected`, `disabled`, `focusable` |
| slot | `icon`, 既定（ラベル） |
| CSS変数 | `--ui-rail-item-` + `height`(68px), `font-size`(38px), `color`(`#d4d4d4`), `padding`(`0 14px`), `margin-left`(-14px), `radius`(6px), `text-shadow`, `transition`(.15s), `focus-bg`(`#ffffff33`), `focus-color`(`#fff`), `selected-height`(84px), `selected-font-size`(46px), `selected-color`(`#fff`), `icon-width`(48px), `icon-size`(36px), `icon-gap`(18px), `icon-color`(`#ffffffa8`), `icon-selected-color`(`#fff`) |
| 親から継承する変数 | `--ui-rail-item-label-max-width`（既定 420px）, `--ui-rail-item-label-opacity`（既定 1）, `--ui-rail-item-selected-bg`（既定 transparent）。`ui-rail[collapsed]` が `0px` / `0` / `#ffffff26` を設定する |

### 4.8 `ui-list` / `ui-list-item` — リスト

**`ui-list`**: slot `header`, 既定（行）。
CSS変数 `--ui-list-` + `width`(1393px), `shadow`(`0 8px 30px #0006`), `header-height`(97px), `header-bg`(`--ui-accent`), `header-font-size`(31px), `header-padding`(`0 0 0 64px`), `body-height`(760px), `body-bg`(`#b4b4b4`)。本体は `overflow:hidden`。

**`ui-list-item`**
| 項目 | 内容 |
|---|---|
| 属性 | `variant`（`stacked`）, `toggle`, `checked`, `disabled`, `focusable` |
| slot | `leading`, 既定, `trailing`。`stacked` では `title`, `subtitle` |
| CSS変数 | `--ui-list-item-` + `display`, `align`, `height`(96px), `font-size`(31px), `padding`(`0 64px`), `border`(`1px solid #c6c6c6`), `transition`, `highlight-bg`(`#d5d5d5`), `highlight-width`(69%), `highlight-display`, `focus-bg`, `leading-width`(105px), `leading-weight`(400), `title-size`(38px), `subtitle-size`(24px), `subtitle-color`(`#bdbdbd`) |

- 既定: 横並び。フォーカス時に左から 69% の位置までハイライト帯が出る。
- `stacked`: 高さ 130px、縦に `title` / `subtitle`。フォーカス時は背景 `#ffffff2a`（ハイライト帯なし）。

### 4.9 `ui-check` — チェック表示
| 項目 | 内容 |
|---|---|
| 属性 | `variant`（`box`）, `checked` |
| slot | 既定（通常は `<ui-icon name="check">`） |
| CSS変数 | `--ui-check-` + `size`, `radius`, `bg`, `color`, `font-size`, `checked-bg`, `checked-color`, `unchecked-icon-display` |

- 既定（円）: 96px。未チェック `#5a5f66`／アイコン `#9aa0a5`、チェック時 `#00bfff`／`#fff`。アイコンは常に表示。
- `box`: 56px・角丸2px・白地。アイコン色 `#1fa88c`。**チェック時のみアイコンを表示**。

### 4.10 `ui-keyboard` / `ui-key-row` / `ui-key` — 画面キーボード
- `ui-keyboard`: ブロック容器。
- `ui-key-row`: フレックス横並び。変数 `--ui-key-row-height`（72px）。
- `ui-key`

| 項目 | 内容 |
|---|---|
| 属性 | `variant`（`label` / `space`）, `value`, `disabled`, `focusable` |
| slot | 既定（文字またはアイコン） |
| イベント | `ui-activate` を受けると `ui-key-press` `{ value, element }`。`value` は `value` 属性、なければ要素のテキスト |
| CSS変数 | `--ui-key-` + `width`(81px), `height`(72px), `font-size`(40px), `font-weight`(300), `radius`(6px), `transition`(.1s), `focus-bg`(`#ffffff40`), `focus-transform`(scale(1.12)), `icon-size`(36px), `margin-left`(0), `font-family`, `bar-width`(380px), `bar-height`(12px), `bar-top`(30px), `bar-display` |

| variant | 内容 |
|---|---|
| `label` | 文字 28px・Condensed。幅は既定 |
| `space` | 幅 432px・左余白 30px・内部に白い横棒（スペースバーの印）を描画 |

### 4.11 `ui-field` — 表示専用の入力欄
入力処理は持たない。`value` / `placeholder` を表示するだけ。

| 項目 | 内容 |
|---|---|
| 属性 | `variant`, `value`, `placeholder`, `caret`（点滅カーソル）, `focusable` |
| プロパティ | `value`（get / set。属性に反映） |
| 表示 | `value` があればそれ、なければ `placeholder`。`value` があるとき `filled` 属性が自動で付く |
| CSS変数 | `--ui-field-` + `width`, `height`, `bg`, `color`, `filled-color`, `font-size`, `font-weight`, `line-height`, `padding`, `transition`, `shadow`, `border-bottom`, `focus-bg`, `focus-shadow`, `caret-width`, `caret-height`, `caret-color` |

| variant | 内容 |
|---|---|
| （既定） | 1200×112px、背景 `#b3b3b3`、文字 `#8b8b8b`／入力後 `#222`、40px。フォーカスで背景 `#c9c9c9` + 白4px枠 |
| `box-light` | 1136×112px、背景 `#dcdcdc`、文字 `#999`／入力後 `#666`、38px。フォーカスで背景 `#eee` + `#4285f4` 4px枠 |
| `underline` | 384×84px、背景透明、文字白 60px・細字、下線 3px 白 |

### 4.12 `ui-progress` — 進行バー付きパネル
| 項目 | 内容 |
|---|---|
| 属性 | `value`（既定 0）, `max`（既定 100） |
| slot | `start`（左上の文字）, `end`（右上の文字）, 既定（中央に横並びで置く操作部品） |
| 挙動 | 上端のバーが `value / max` の割合（0〜100%に丸め）で伸びる |
| CSS変数 | `--ui-progress-` + `width`(1395px), `height`(138px), `bg`(`--ui-accent`), `track-height`(6px), `track-bg`(`#ffffff70`), `fill-bg`(`#fff`), `label-top`(30px), `label-size`(22px), `label-color`(`#ffffffa0`), `label-inset`(28px), `controls-gap`(20px) |

### 4.13 `ui-tile` — 無地タイル
| 項目 | 内容 |
|---|---|
| 属性 | `variant`, `disabled`, `focusable` |
| slot | 既定 |
| CSS変数 | `--ui-tile-` + `width`, `height`, `bg`, `shadow`, `transition`, `focus-bg`, `focus-transform`, `focus-shadow`, `focus-outline`, `focus-z`, `hue` |

| variant | 内容 |
|---|---|
| （既定） | 高さ 128px、`#a9a9a9`。フォーカスで `#fff`・scale(1.1) |
| `lift` | 530×200px、`#a8a8a8`。フォーカスで `#c4c4c4`・上に 14px 浮く |
| `gradient` | 高さ 170px。`--ui-tile-hue` から作る斜めグラデーション。フォーカスで scale(1.1)・白4px枠 |

### 4.14 `ui-panel` — 中央寄せのコンテンツ枠
| 項目 | 内容 |
|---|---|
| 属性 | `variant`（`accent`） |
| slot | 既定（通常は `<ui-icon>`） |
| CSS変数 | `--ui-panel-` + `size`, `bg`, `color`, `font-size` |
| 既定 | 120px 正方形・白地・`#cfcfcf`・70px |
| `accent` | 279px 正方形・`--ui-accent` 地・`#ffffffcc`・150px |

### 4.15 `ui-toast` — 一時メッセージ
| 項目 | 内容 |
|---|---|
| 属性 | `open`, `duration`（ms。既定 1500） |
| slot | 既定（メッセージ） |
| メソッド | `show(text?, duration?)`: テキストを差し替えて表示し、時間後に自動で閉じる。`hide()` |
| 位置 | `position:absolute; left:50%; bottom:50px`（親の `ui-stage` 基準） |
| CSS変数 | `--ui-toast-` + `bg`(`#000d`), `padding`(`18px 40px`), `radius`(40px), `font-size`(30px), `bottom`(50px), `z`(99) |

---

## 5. 挙動の詳細

### 5.1 フォーカスと見た目
`ui-stage` が `focused` 属性を付けると、各部品が `:host([focused])` のスタイルを適用する。`ui-stage` の外では `focused` は自動では付かない（利用側が付けてもよい）。

### 5.2 `ui-section` と `ui-card` の `active`
`ui-section[active]` の直下にある `ui-card` に `active` が自動で付く（`wide` のとき色が変わる）。動的に追加されたカードにも同期される。

### 5.3 `ui-rail` の折りたたみ
`collapsed` の付け外しは利用側が行う（例: フォーカスがレール内にあるかで切替）。付けると幅・項目位置・先頭ボタンの大きさ・ラベル表示が連動して変わる。

### 5.4 `toggle` と `checked`
`ui-card` / `ui-list-item` に `toggle` を付けると、`ui-activate`（自身が対象のとき）で `checked` 属性が反転し、`ui-change` `{ checked, element }` が発火する。配下の `ui-check` の `checked` も同期される。`toggle` なしでも、`checked` 属性を付ければ配下の `ui-check` に反映される。

### 5.5 利用側が担う責務
- 画面切替（`ui-screen` の `active` の付け替え）
- テキスト入力の反映（`ui-keypress` / `ui-key-press` を受けて `ui-field.value` を更新）
- 決定時のアプリ処理（`ui-activate` を受けて分岐）
- データの生成・件数・文言

---

## 6. 最小例

```html
<script src="components.js"></script>
<ui-stage style="--ui-stage-bg:#323232">
  <ui-screen active>
    <ui-field id="q" placeholder="Search" focusable style="position:absolute;left:356px;top:58px"></ui-field>
    <ui-section active style="position:absolute;left:112px;top:262px">
      <span slot="title">Results</span>
      <ui-card variant="dark" focusable style="--ui-card-hue:200">
        <span slot="title">Title</span>
        <span slot="subtitle">Subtitle</span>
      </ui-card>
    </ui-section>
  </ui-screen>
</ui-stage>
<script>
  const stage = document.querySelector('ui-stage');
  stage.addEventListener('ui-activate', e => console.log('決定', e.target));
  stage.focusElement(document.querySelector('ui-card'));
</script>
```
