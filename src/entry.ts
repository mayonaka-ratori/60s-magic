// 見た目の確認ではカメラ・マイク・通信を起動しない。
if (new URLSearchParams(location.search).get('view') === 'look') {
  void import('./look');
} else {
  void import('./main');
}
