import type { ProjexApi } from '../types';
import { LocalApi } from './localApi';

export function createApi(): ProjexApi {
  return new LocalApi();
}
