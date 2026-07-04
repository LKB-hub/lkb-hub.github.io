/**
 * Supabase 初始化配置
 *
 * 使用前请替换为你的 Supabase 项目配置：
 * 1. 前往 https://supabase.com 注册并创建项目
 * 2. 在 Settings → API 中获取 Project URL 和 anon key
 * 3. 在 SQL Editor 中运行建表语句（见 README.md）
 */

const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // 例如: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';       // 例如: eyJhbGciOiJIUzI1NiIs...

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
