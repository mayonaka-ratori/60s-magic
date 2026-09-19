/* 手の認識だけを別の処理場所で行い、画面の更新を止めません。 */
self.exports = {};
importScripts('/vision/vision_bundle.js');
let detector;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, HandLandmarker } = self.exports;
      const files = await FilesetResolver.forVisionTasks('/vision/wasm');
      detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/vision/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', reason: String(error) }); }
  } else if (data.type === 'frame') {
    try {
      const result = detector.detectForVideo(data.bitmap, data.timestamp);
      const palms = result.landmarks.map((landmarks, i) => {
        const indices = [0, 5, 9, 13, 17];
        return {
          // 鏡の向きへの変換はここで一度だけ行います。
          x: 1 - indices.reduce((v, n) => v + landmarks[n].x, 0) / indices.length,
          y: indices.reduce((v, n) => v + landmarks[n].y, 0) / indices.length,
          label: result.handedness[i]?.[0]?.categoryName,
        };
      });
      self.postMessage({ type: 'hands', palms, timestamp: data.timestamp });
    } catch (error) { self.postMessage({ type: 'error', reason: String(error) }); }
    finally { data.bitmap.close(); }
  }
};
