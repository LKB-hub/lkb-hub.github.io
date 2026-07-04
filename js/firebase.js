/**
 * Firebase 初始化和配置
 *
 * 使用前请替换为你的 Firebase 项目配置：
 * 1. 前往 https://console.firebase.google.com/ 创建项目
 * 2. 在项目设置中添加 Web 应用
 * 3. 将配置信息填入下方 firebaseConfig
 */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// 启用离线持久化（可选，提升体验）
db.enablePersistence().catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore 离线持久化不可用（多标签页冲突）');
  } else if (err.code === 'unimplemented') {
    console.warn('当前浏览器不支持 Firestore 离线持久化');
  }
});
