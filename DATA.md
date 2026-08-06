# データ作成について

利用している元データとリンクは以下の通りです。

## デジタル庁 アドレス・ベース・レジストリ

* [全データセット](https://dataset.address-br.digital.go.jp/search) (位置参照拡張含む)
* [全国 都道府県マスター (`mt_pref_all`)](https://dataset.address-br.digital.go.jp/documents/45bcb60e4dc747b58def5493ab829825/about), [位置参照拡張 (`mt_pref_pos_all`)](https://dataset.address-br.digital.go.jp/documents/535e5c01f4af4f5bba72618472f07db9/about)
* [全国 市区町村マスター (`mt_city_all`)](https://dataset.address-br.digital.go.jp/documents/5e130d8117c6426fa1f53a5dbf90cb74/about), [位置参照拡張 (`mt_city_pos_all`)](https://dataset.address-br.digital.go.jp/documents/7108b74d9fad4e79997538ec40aa8015/about)
* 町字マスター (位置参照拡張とセットのものは全国データなし、それぞれの都道府県個別でダウンロード)
  * (都道府県) `mt_town_prefXX`, 位置参照拡張 `mt_town_pos_prefXX`
  * [北海道 町字マスター (`mt_town_pref01`)](https://dataset.address-br.digital.go.jp/documents/b9cfb40acf6d4986b49d3d467d491551/about), [位置参照拡張 (`mt_town_pos_pref01`)](https://dataset.address-br.digital.go.jp/documents/9cdc66c63cd44df0a76b8df4c95e1446/about)
* [全国 町字マスター (`mt_town_all`)](https://dataset.address-br.digital.go.jp/documents/b80e77a0e2d24e5692be4af885eb3de7/about)
  * ※以下の住居表示-住居マスター・地番マスター変換時に一時的に利用
* 住居表示-住居マスター (全国データなし、それぞれの都道府県個別でダウンロード)
  * (都道府県) `mt_rsdtdsp_rsdt_prefXX`, 位置参照拡張 `mt_rsdtdsp_rsdt_pos_prefXX`
  * [北海道 住居表示-住居マスター (`mt_rsdtdsp_rsdt_pref01`)](https://dataset.address-br.digital.go.jp/documents/0ebf085bd6354742b9755b36e20612d9/about), [位置参照拡張 (`mt_rsdtdsp_rsdt_pos_pref01`)](https://dataset.address-br.digital.go.jp/documents/2d3a458126c649d19d5f13cc90dc2a60/about)
* 地番マスター (全国データなし、それぞれの市区町村個別でダウンロード)
  * (都道府県)(市区町村) `mt_parcel_cityXXXXXX`, 位置参照拡張 `mt_parcel_pos_cityXXXXXX`
  * [北海道 札幌市中央区 地番マスター (`mt_parcel_city011011`)](https://dataset.address-br.digital.go.jp/documents/d457223f85d3496baad76e6d3eb21d21/about), [位置参照拡張 (`mt_parcel_pos_city011011`)](https://dataset.address-br.digital.go.jp/documents/c2ba90dcb6df494da9b5fddfd16c3e36/about)

## 国土交通省 位置参照情報

* [大字・町丁目レベル 都道府県単位 (令和5年度)](https://nlftp.mlit.go.jp/cgi-bin/isj/dls/_choose_method.cgi)
