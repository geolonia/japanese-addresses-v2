# Geolonia 住所データ v2

全国の町丁目、大字、小字レベルの住所データ（277,543件）をオープンデータとして公開いたします。

本データは、デジタル庁が整備する「[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address)」を元に加工し、様々なアプリケーションから便利に使えるように整理したものとなります。

以前、「[Geolonia 住所データ](https://github.com/geolonia/japanese-addresses-v2)」を管理しましたが、v2は従来版と比べて下記の違いがあります。

* 住居表示住所データと対応（番地・号までのデータが含まれる）
* 地番住所のデータと対応（住居表示住所が導入されていない地域のデータが含まれる）

なお、データ量が多いため `latest.csv` や `latest.db` の提供は見合わせております。

[リリースノート](https://github.com/geolonia/japanese-addresses-v2-v2/releases)

## API

このデータを使用した API をご提供しています。

#### 都道府県 - 市町村エンドポイント

```
https://geolonia.github.io/japanese-addresses-v2/api/ja.json
```

例: [https://geolonia.github.io/japanese-addresses/api/ja.json](https://geolonia.github.io/japanese-addresses/api/ja.json)

```
{
  "北海道": [
    "札幌市中央区",
    "札幌市北区",
    "札幌市東区",
    ...
  ],
  "青森県": [
    "青森市",
    "弘前市",
    "八戸市",
    ...
  ],
  "岩手県": [
    "盛岡市",
    "宮古市",
    "大船渡市",
    ...
  ],
```

#### 町丁目エンドポイント

```
https://geolonia.github.io/japanese-addresses/api/ja/<都道府県名>/<市区町村名>.json
```

※ 都道府県名及び市区町村名は URL エンコードを行ってください。

例: [https://geolonia.github.io/japanese-addresses/api/ja/%E9%95%B7%E9%87%8E%E7%9C%8C/%E9%95%B7%E9%87%8E%E5%B8%82.json](https://geolonia.github.io/japanese-addresses/api/ja/%E9%95%B7%E9%87%8E%E7%9C%8C/%E9%95%B7%E9%87%8E%E5%B8%82.json)

```
[
  ...
  {
    "town": "篠ノ井塩崎",
    "koaza": "四之宮",
    "lat": 36.555444,
    "lng": 138.10524
  },
  {
    "town": "篠ノ井塩崎",
    "koaza": "越",
    "lat": 36.544766,
    "lng": 138.104657
  },
  {
    "town": "篠ノ井塩崎",
    "koaza": "長谷",
    "lat": 36.548163,
    "lng": 138.101997
  },
  {
    "town": "篠ノ井塩崎",
    "koaza": "明戸",
    "lat": 36.549686,
    "lng": 138.106612
  },
  ...
```

### 注意

* 町丁目エンドポイントは、すべての地名を網羅しているわけではありません。

## 住所データ・ API のビルド

```shell
$ git clone git@github.com:geolonia/japanese-addresses-v2.git
$ cd japanese-addresses
$ npm install
$ npm run build # 元データのダウンロードと latest.csv 及び latest_gaiku.csv の作成を行います
$ npm run build:api # latest.csv から API を作成します

# オプション
$ node bin/build-gaiku-api.mjs # 街区レベルの API を追加で作成します
$ sh bin/download-residential.sh # ベースレジストリのデータのダウンロードを行います
$ node bin/build-jyukyo-api.mjs # 住居符号レベルの API を追加で作成します
```

### API の構成

```shell
└── api
    ├── ja
    │   │── {都道府県名}
    │   │   ├── {市区町村名}
    │   │   │   └── {町丁目名}
    │   │   │       ├── 住居表示.json # 住居表示住所
    │   │   │       └── 地番.json    # 地番
    │   │   └── {市区町村名}.json     # 町字一覧
    │   └── {都道府県名}.json         # 市区町村一覧
    └── ja.json                     # 都道府県一覧
```

```typescript
/// 注意: [経度, 緯度] の順
type LngLat = [number, number];

/*
 * @file api/ja.json
 * 都道府県
 */
{
  /// 全国地方公共団体コード
  code: number;
  /// 都道府県名
  pref: string;

  /// 代表点 (県庁の位置)
  point: LngLat;
}[]

/*
 * @file api/ja/{都道府県名}.json
 * 市区町村
 */
{
  /// 全国地方公共団体コード
  code: number;
  /// 郡名
  county?: string;
  /// 市区町村名
  city: string;
  /// 政令市区名
  ward?: string;

  /// 代表点 (自治体役場の位置)
  point: LngLat;
}[]

/*
 * @file api/ja/{都道府県名}/{市区町村名}.json
 * 町字
 */
{
  /// ABR上の「町字ID」
  machiaza_id: string;

  /// 大字・町名
  oaza_cho?: string;
  /// 丁目名
  chome?: string;
  /// 小字名
  koaza?: string;

  /// 住居表示住所の情報の存在
  rsdt: boolean;
  /// 地番の情報の存在
  chiban: boolean;

  /// 代表点
  point?: LngLat;
}[]

/*
 * @file api/ja/{都道府県名}/{市区町村名}/{町丁目名}/住居表示.json
 * 住居表示住所リスト
 */
{
  /// 街区符号
  blk_num: string;
  /// 住居番号
  rsdt_num: string;
  /// 住居番号2
  rsdt_num2: string;

  /// 代表点
  point?: LngLat;
}[]

/*
 * @file api/ja/{都道府県名}/{市区町村名}/{町丁目名}/地番.json
 * 地番リスト
 */
{
  /// 地番1
  prc_num1: string;
  /// 地番2
  prc_num2?: string;
  /// 地番3
  prc_num3?: string;

  /// 代表点
  point?: LngLat;
}[]
```

## 出典

本データは、以下のデータを元に、毎月 Geolonia にて更新作業を行っています。

「アドレス・ベース・レジストリ」（デジタル庁）[住居表示住所・住居マスターデータセット](https://catalog.registries.digital.go.jp/) をもとに株式会社 Geolonia が作成したものです。

## 貢献方法

* 本データに不具合がある場合には、[Issue](https://github.com/geolonia/japanese-addresses-v2/issues) または[プルリクエスト](https://github.com/geolonia/japanese-addresses-v2/pulls)にてご報告ください。

## japanese-addresses-v2を使っているプロジェクト

* [normalize-japanese-addresses](https://github.com/geolonia/normalize-japanese-addresses) 日本の住所を正規化するライブラリ

## スポンサー

* [一般社団法人 不動産テック協会](https://retechjapan.org/)

## 関連情報

* [【プレスリリース】不動産テック協会、Geolonia と共同で不動産情報の共通 ID 付与の取り組みを開始](https://retechjapan.org/news/archives/pressrelease-20200731/)
* [【プレスリリース】日本全国の住所マスターデータをオープンデータとして無料公開](https://geolonia.com/pressrelease/2020/08/05/japanese-addresses.html)

## ライセンス

Geolonia 住所データのライセンスは以下のとおりです。

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)

注: リポジトリに同梱されているデータ生成用のスクリプトのライセンスは MIT ライセンスとします。
