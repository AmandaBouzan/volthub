import { Platform } from 'react-native';
import { resolveApiUrls } from './apiUrls';

const getBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // Android Emulator uses 10.0.2.2 to access host machine localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

export const env = resolveApiUrls(getBaseUrl(), typeof window !== 'undefined' ? window.location?.origin : 'http://localhost:8084');
