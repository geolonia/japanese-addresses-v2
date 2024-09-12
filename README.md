# Geolonia 住所データ v2

全国の町丁目、大字、小字レベルの住所データ（277,543件）をオープンデータとして公開いたします。

本データは、デジタル庁が整備する「[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address)」を元に加工し、様々なアプリケーションから便利に使えるように整理したものとなります。

以前、「[Geolonia 住所データ](https://github.com/geolonia/japanese-addresses-v2)」を管理しましたが、v2は従来版と比べて下記の違いがあります。

* 住居表示住所データと対応（番地・号までのデータが含まれる）
* 地番住所のデータと対応（住居表示住所が導入されていない地域のデータが含まれる）

なお、データ量が多いため `latest.csv` や `latest.db` の提供は見合わせております。

[リリースノート](https://github.com/geolonia/japanese-addresses-v2/releases)

## API

このデータを使用した API をご提供しています。

#### 都道府県エンドポイント

```
https://geolonia.github.io/japanese-addresses-v2/api/ja.json
```

例: [https://geolonia.github.io/japanese-addresses-v2/api/ja.json](https://geolonia.github.io/japanese-addresses-v2/api/ja.json)

```
[
  {
    "code": 10006,
    "pref": "北海道",
    "point": [
      141.347906782,
      43.0639406375
    ]
    "cities": [
      {
        "code": 11011,
        "city": "札幌市",
        "ward": "中央区",
        "point": [
          141.35389,
          43.061414
        ]
      },
      ...
    ]
  },
  ...
```

#### 町字エンドポイント

```
https://geolonia.github.io/japanese-addresses-v2/api/ja/<都道府県名>/<市区町村名>.json
```

※ 都道府県名及び市区町村名は URL エンコードを行ってください。

例: [https://geolonia.github.io/japanese-addresses-v2/api/ja/%E9%95%B7%E9%87%8E%E7%9C%8C/%E9%95%B7%E9%87%8E%E5%B8%82.json](https://geolonia.github.io/japanese-addresses-v2/api/ja/%E9%95%B7%E9%87%8E%E7%9C%8C/%E9%95%B7%E9%87%8E%E5%B8%82.json)

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
$ cd japanese-addresses-v2
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
    └── ja.json                     # 都道府県と市区町村の一覧
```

各ファイルの詳細な仕様は、 `src/data.ts` の型定義を参照してください。

## 出典

本データは、以下のデータを元に、毎月 Geolonia にて更新作業を行っています。

「アドレス・ベース・レジストリ」（デジタル庁）[住居表示住所・住居マスターデータセット](https://catalog.registries.digital.go.jp/) をもとに株式会社 Geolonia が作成したものです。

## 貢献方法

* 本データに不具合がある場合には、[Issue](https://github.com/geolonia/japanese-addresses-v2/issues) または[プルリクエスト](https://github.com/geolonia/japanese-addresses-v2/pulls)にてご報告ください。

## japanese-addresses-v2を使っているプロジェクト

* [normalize-japanese-addresses-v2](https://github.com/geolonia/normalize-japanese-addresses-v2) 日本の住所を正規化するライブラリ

## スポンサー

* [一般社団法人 不動産テック協会](https://retechjapan.org/)

## 関連情報

* [【プレスリリース】不動産テック協会、Geolonia と共同で不動産情報の共通 ID 付与の取り組みを開始](https://retechjapan.org/news/archives/pressrelease-20200731/)
* [【プレスリリース】日本全国の住所マスターデータをオープンデータとして無料公開](https://geolonia.com/pressrelease/2020/08/05/japanese-addresses-v2.html)

## ライセンス

Geolonia 住所データのライセンスは以下のとおりです。

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)

注: リポジトリに同梱されているデータ生成用のスクリプトのライセンスは MIT ライセンスとします。
