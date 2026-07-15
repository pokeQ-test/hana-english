# Hana English

英単語・英熟語を学習し、Firebaseへユーザー別の学習履歴を保存するWebアプリです。

## Firebaseの準備

1. Firebaseコンソールで新しいプロジェクトを作成します。
2. Webアプリを登録し、表示された `firebaseConfig` の値を `firebase-config.js` に入力します。
3. Authenticationのログイン方法で「メール/パスワード」を有効にします。
4. Authenticationの承認済みドメインへ `pokeq-test.github.io` を追加します。
5. Cloud Firestoreデータベースを作成します。
6. Firestoreの「ルール」に `firestore.rules` の内容を貼り付けて公開します。
7. Authenticationのパスワードポリシーで、最低8文字以上を設定します。

`firebase-config.js` の値はブラウザへ配信される接続情報であり、秘密鍵ではありません。サービスアカウントの秘密鍵や利用者のパスワードは絶対に書かないでください。

## 保存されるデータ

- Firebase Authentication: メールアドレス、表示名、認証情報
- Cloud Firestore: 単語・熟語ごとの解答回数、正解数、間違い数、最終回答日時
- localStorage: ログイン中ユーザー専用の端末内キャッシュ

Firestoreのセキュリティルールにより、利用者は自分の学習履歴だけを読み書きできます。

## 起動

VS CodeのLive Server、またはGitHub Pagesから開きます。Firebase設定前はログイン画面に設定案内が表示されます。
