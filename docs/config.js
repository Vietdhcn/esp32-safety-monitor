// Firebase web config is public. This project uses ESP32 Safety Monitor.
// Access is protected by Realtime Database Rules and Firebase Authentication.
export const firebaseConfig = {
  apiKey: 'AIzaSyC-6SuTuQNGGtoQ5AOL7-cinBiZEXp6OK0',
  authDomain: 'esp32-safety-monitor-68725.firebaseapp.com',
  databaseURL: 'https://esp32-safety-monitor-68725-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'esp32-safety-monitor-68725',
  appId: '1:924888604512:web:c06bd5d6147bb0e3d64805'
};

export const deviceId = 'esp32s-30p-01';

// UI visibility only; Firebase Rules enforce the Admin identity.
export const adminUid = "NK23PFt0RAe14EKVUiFFNjDXMsv2";
