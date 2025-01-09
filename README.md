# Geolonia 住所データツール v2

[![NPM Version](https://img.shields.io/npm/v/%40geolonia%2Fjapanese-addresses-v2)](https://www.npmjs.com/package/@geolonia/japanese-addresses-v2)

全国の住所データを HTTP API として公開するためのツールを公開いたします。

本データは、デジタル庁が整備する「[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address)」を元に加工し、様々なアプリケーションから便利に使えるように整理したものとなります。

以前、「[Geolonia 住所データ](https://github.com/geolonia/japanese-addresses)」を管理しましたが、v2は従来版と比べて下記の違いがあります。

* 住居表示住所データと対応（番地・号までのデータが含まれる）
* 地番住所のデータと対応（住居表示住所が導入されていない地域のデータが含まれる）

[リリースノート](https://github.com/geolonia/japanese-addresses-v2/releases)

## API

このデータを使用した API をご提供しています。現在、制限無しの無料公開をしていますが、様子見ながら公開を停止や変更など行うことがあります。商用稼働は、ご自身でデータを作成しホスティングすることを強くおすすめします。 Geolonia は有償で管理・ホスティングするサービスありますので、ご利用の方はお問い合わせてください。

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

例: [https://japanese-addresses-v2.geoloniamaps.com/api/ja/%E6%9D%B1%E4%BA%AC%E9%83%BD/%E6%96%B0%E5%AE%BF%E5%8C%BA.json](https://japanese-addresses-v2.geoloniamaps.com/api/ja/%E6%9D%B1%E4%BA%AC%E9%83%BD/%E6%96%B0%E5%AE%BF%E5%8C%BA.json)

```
{ "meta": { "updated": 00000 }, "data": [
  ...
  // 地番情報なしの住居表示未実施大字「新宿区北町」
  {"machiaza_id":"0001000","oaza_cho":"北町","point":[139.735037,35.69995]},

  // 地番情報ありの住居表示実施「新宿区新宿三丁目」
  {"machiaza_id":"0020003","oaza_cho":"新宿","chome":"三丁目","rsdt":true,"point":[139.703563,35.691227],"csv_ranges":{"住居表示":{"start":151421,"length":19193},"地番":{"start":189779,"length":8895}}},
  ...
```

### 注意

* 町丁目エンドポイントは、すべての地名を網羅しているわけではありません。
* アドレス・ベース・レジストリの整備状況によって住居表示が実施されている町字でも住居表示住所のデータが無いや、地番住所のデータが無いなどのことがあります。また、住居表示や地番の文字列が存在しても位置情報データがまだ存在しないケースもあります。

## 住所データ・ API のビルド

```shell
$ git clone git@github.com:geolonia/japanese-addresses-v2.git
$ cd japanese-addresses-v2
$ npm install
$ npm run run:all # APIを全て生成する

# オプション
$ npm run run:01_make_prefecture_city # 都道府県・市区町村のみ作成
$ npm run run:02_make_machi_aza # 町字API作成
$ npm run run:03_make_rsdt # 住居表示住所API作成 (町字APIが先に作らないとエラーになります)
$ npm run run:04_make_chiban # 地番住所API作成 (町字APIが先に作らないとエラーになります)
```

#### APIビルド設定

`settings.json` に設定を入れてください。内容は `src/lib/settings.ts` を参照してください。

例えば、出力を北海道にしぼりたい場合は下記のように設定してください。

```json
{
	"lgCodes": ["^01"]
}
```

#### アーカイブファイル作成

`deploy/01a_create_archive.sh` を参照してください

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

また、 `api/ja/{都道府県名}/{市区町村名}.json` エンドポイントにも、 `csv_ranges` にヘッダーの start / length 情報入っているので、市区町村エンドポイントを既に読み込まれている場合はそのまま利用することをおすすめしております。

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
