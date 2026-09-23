/* 手の認識だけを別の処理場所で行い、画面の更新を止めません。
   まずGPUで試し、使えなければCPUへ戻します。どちらで動いたかは記録へ残します。 */
self.exports = {};
importScripts('/vision/vision_bundle.js');
let detector, files, delegate = '';

async function build(kind) {
  const { HandLandmarker } = self.exports;
  const built = await HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/vision/hand_landmarker.task', delegate: kind },
    runningMode: 'VIDEO', numHands: 2,
    // 見失いにくくするため、しきい値を低めにする。取り違えより、線が途切れる方が遊ぶ人には分かりやすい。
    minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.3, minTrackingConfidence: 0.3,
  });
  // 一コマ目は処理の組み立てに時間がかかります。本編が始まる前にここで済ませます。
  // GPUが使えないことも、ここで分かります。
  const canvas = new OffscreenCanvas(640, 480);
  const context = canvas.getContext('2d');
  context.fillStyle = '#808080';
  context.fillRect(0, 0, 640, 480);
  built.detectForVideo(canvas.transferToImageBitmap(), 0);
  return built;
}

function palmsOf(result) {
  return result.landmarks.map((landmarks, i) => {
    const indices = [0, 5, 9, 13, 17];
    return {
      // 鏡の向きへの変換はここで一度だけ行います。
      x: 1 - indices.reduce((v, n) => v + landmarks[n].x, 0) / indices.length,
      y: indices.reduce((v, n) => v + landmarks[n].y, 0) / indices.length,
      label: result.handedness[i]?.[0]?.categoryName,
    };
  });
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver } = self.exports;
      files = await FilesetResolver.forVisionTasks('/vision/wasm');
      const wanted = data.delegate === 'CPU' ? 'CPU' : 'GPU';
      const started = performance.now();
      try {
        detector = await build(wanted);
        delegate = wanted;
      } catch (error) {
        if (wanted === 'CPU') throw error;
        detector = await build('CPU');
        delegate = 'CPU';
        self.postMessage({ type: 'delegate', delegate, reason: String(error).slice(0, 200) });
      }
      self.postMessage({ type: 'ready', delegate, warmupMs: Math.round(performance.now() - started) });
    } catch (error) { self.postMessage({ type: 'error', reason: String(error) }); }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    const started = performance.now();
    let result;
    try {
      result = detector.detectForVideo(data.bitmap, data.timestamp);
    } catch (error) {
      // GPUは最初の一回目で使えないと分かることがあります。そのときはCPUで作り直します。
      if (delegate !== 'GPU') throw error;
      try { detector.close(); } catch { /* 閉じられなくても作り直します */ }
      detector = await build('CPU');
      delegate = 'CPU';
      self.postMessage({ type: 'delegate', delegate, reason: String(error).slice(0, 200) });
      // 作り直しに使ったこの一コマは捨て、次のコマからCPUで続けます。
      self.postMessage({ type: 'hands', palms: [], timestamp: data.timestamp, detectMs: 0, delegate });
      return;
    }
    self.postMessage({
      type: 'hands', palms: palmsOf(result), timestamp: data.timestamp,
      detectMs: Math.round((performance.now() - started) * 10) / 10, delegate,
    });
  } catch (error) { self.postMessage({ type: 'error', reason: String(error) }); }
  finally { data.bitmap.close(); }
};
