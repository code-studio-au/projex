import type { ProjexApi } from '../types';
import { ServerApi } from './serverApi';

export function createApi(): ProjexApi {
  return new ServerApi();
}
