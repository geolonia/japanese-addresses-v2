# Geolonia 住所データ v2

全国の住所データを HTTP API として公開いたします。

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
https://japanese-addresses-v2.geoloniamaps.com/api/ja.json
```

例: [https://japanese-addresses-v2.geoloniamaps.com/api/ja.json](https://japanese-addresses-v2.geoloniamaps.com/api/ja.json)

```
{ "meta": { "updated": 00000 }, "data": [
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
https://japanese-addresses-v2.geoloniamaps.com/api/ja/<都道府県名>/<市区町村名>.json
```

※ 都道府県名及び市区町村名は URL エンコードを行ってください。

例: [https://japanese-addresses-v2.geoloniamaps.com/api/ja/%E9%95%B7%E9%87%8E%E7%9C%8C/%E9%95%B7%E9%87%8E%E5%B8%82.json](https://japanese-addresses-v2.geoloniamaps.com/api/ja/%E9%95%B7%E9%87%8E%E7%9C%8C/%E9%95%B7%E9%87%8E%E5%B8%82.json)

```
{ "meta": { "updated": 00000 }, "data": [
  ...
  {"machiaza_id":"0000101","koaza":"い気","point":[138.184886,36.595508]},
  {"machiaza_id":"0000102","koaza":"くぬぎ平","point":[137.986942,36.551842]},
  {"machiaza_id":"0000103","koaza":"阿弥陀堂","point":[138.141331,36.603314]},
  {"machiaza_id":"0000104","koaza":"旭町","point":[138.182414,36.654925]},
  {"machiaza_id":"0000105","koaza":"芦ノ尻","point":[137.977664,36.487992]},
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
    │   │   ├── {市区町村名}-住居表示.txt
    │   │   ├── {市区町村名}-地番.txt
    │   │   └── {市区町村名}.json     # 町字一覧
    │   └── {都道府県名}.json         # 市区町村一覧
    └── ja.json                     # 都道府県と市区町村の一覧
```

各ファイルの詳細な仕様は、 `src/data.ts` の型定義を参照してください。

#### `txt` ファイル内のフォーマットについて

`-地番.txt` と `-住居表示.txt` は容量節約のため、市区町村の住所を全て一つのファイルに集約するものです。そのテキストファイルのフォーマットは下記となります。


```
<町字1>,<start byte position>,<length in bytes>
<町字2>,<start byte position>,<length in bytes>
...
=END=
<padding>地番,<町字1>
prc_num1,prc_num2,prc_num3,lng,lat
1,,,<経度>,<緯度>
...
```

論理的な構造としては

1. ファイル全体のヘッダー
  1. ファイル内の町字（丁目、小字含む）一覧
    1. それぞれのデータのバイトレンジ（開始バイト数、容量バイト数）
1. 町字データ（ループ）
  1. 町字データのヘッダー
    1. 地番・住居表示か
    1. カラム名定義
  1. 住所・位置情報データ

ヘッダーは5万バイトの倍数となります。末尾に `=END=` を挿入し、残りまで `0x20` (半角スペース)で埋めます。クライアントは `=END=` を確認できるまで、5万バイトずつ読み込むことをおすすめします。

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
