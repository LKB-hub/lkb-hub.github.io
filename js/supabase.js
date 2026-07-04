/**
 * Supabase 初始化配置
 *
 * 使用前请替换为你的 Supabase 项目配置：
 * 1. 前往 https://supabase.com 注册并创建项目
 * 2. 在 Settings → API 中获取 Project URL 和 anon key
 * 3. 在 SQL Editor 中运行建表语句（见 README.md）
 */

const SUPABASE_URL = 'https://rmldikbneukaaobnjpzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_q-Vb_8q6iEFcoPJOnSb5Ig_52OFeNM1';

// 安全创建 Supabase 客户端（CDN 加载失败时优雅降级）
let supabaseClient = null;
try {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error('[Supabase] SDK 未加载成功，请检查网络连接');
  }
} catch (e) {
  console.error('[Supabase] 初始化失败:', e.message);
}
