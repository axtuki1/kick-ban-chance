# Kick BAN Chance

## 概要

VRChat Groupにおいて、一定の確率でKickやBANを行う仕組みを実現します。  
全プレイヤーに対して行うものではなく、"する"か"しない"かを確率で決定します。

## 抽選方法
環境変数 `BAN_CHANCE_PERCENT`、`Kick_CHANCE_PERCENT`を合計し、  
0.00 ～ (< 100)の乱数を生成、合計値との比較をし乱数が小さい場合に成立とします。  

成立後、合計値のBANの割合を計算し再度0.00　～ (< 1)の乱数を生成、
BANの割合と比較し、乱数が小さい場合にはBAN、大きい場合にはKickとしてアクションを決定します。

プレイヤーの選出にはメンバー合計値からランダムに選択、  
除外プレイヤーであれば再抽選、100回試行しても再抽選になった場合は最後に参加したプレイヤーを対象とします。

このことから「n%の確率で追放するグループ」の名称はあくまで  
「グループ全体に対するアクション実施確率」のことを示しているため、  
実際にKickやBANで自分が選ばれる確率は小さくなると予想されます。

## 環境変数

GitHub Actionにおいては、Settings > Security > Secrets and variables > Actionsの  
Repository secrets, Repository variablesで設定します。

### Secret

| 名称 | 説明 |
| --- | --- |
| `APIKEY` | VRChat APIで使用するAPIKEY |
| `CLOUDFLARE_ACCOUNT_ID` | CloudFlareのアカウントID |
| `CLOUDFLARE_API_TOKEN` | CloudFlareで発行したAPI Token |
| `CLOUDFLARE_DATABASE_ID` | CloudFlareで作成したDataBase ID |
| `CONTACT` | VRChat APIへ接続する際にUser-Agentに設定する連絡先 |
| `DISCORD_WEBHOOK_URL` | Discordへ投稿する際に使用するWebHook |
| `EMAIL` | VRChatアカウントのメールアドレス |
| `PASSWORD` | VRChatアカウントのパスワード |
| `TWOFACTOR` | VRChatアカウントの2要素認証URL<br>`otpauth://totp/VRChat:<メールアドレス>?secret=<VRChatから発行されたトークン>&issuer=VRChat` |

### Variables

| 名称 | 説明 | 運用中の設定値 |
| --- | --- | --- |
| `GROUP_ID` | 対象グループID | <例のグループID> |
| `BAN_CHANCE_PERCENT` | BANを選択する確率(%) | 0.1 |
| `KICK_CHANCE_PERCENT` | Kickを選択する確率(%) | 2.9 |
| `EXCLUDE_USER_ID` | 除外するプレイヤーID(1行1ID)<br>※全員参加している必要があります | <管理用アカウント x 3> |
| `REQUIRED_PLAYER_COUNT` | 必要な抽選人数 | 50 |
| `LOGLEVEL` | 出力するログレベル | <運用によって随時変更> |
