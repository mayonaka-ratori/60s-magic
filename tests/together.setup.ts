import { vi } from 'vitest';
// 既存の試験は、今までどおり描きながら唱える遊び方を確かめる。
vi.stubGlobal('location', { search: '?flow=together' });
