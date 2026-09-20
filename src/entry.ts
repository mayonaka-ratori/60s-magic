// 見た目の確認ではカメラ・マイク・通信を起動しない。
const view = new URLSearchParams(location.search).get('view');
if (view === 'look') {
  void import('./look');
} else if (view === 'effects') {
  void import('./effects-lab');
} else {
  void import('./main');
}
