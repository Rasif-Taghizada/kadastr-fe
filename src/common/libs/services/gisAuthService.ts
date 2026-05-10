import gisAxios from '@/common/libs/gisAxiosInstance';
import { gisEndpoints } from '@/common/libs/constants';
import type { GisLoginData, GisRegisterData, GisAuthResponse } from '@/common/types';

const gisLoginService = async (data: GisLoginData): Promise<GisAuthResponse> => {
  const response = await gisAxios.post(gisEndpoints.login, data);
  return response.data;
};

const gisRegisterService = async (data: GisRegisterData): Promise<GisAuthResponse> => {
  const response = await gisAxios.post(gisEndpoints.register, data);
  return response.data;
};

const gisGetMeService = async (): Promise<GisAuthResponse['user']> => {
  const response = await gisAxios.get(gisEndpoints.me);
  return response.data;
};

const gisLogoutService = async (): Promise<void> => {
  await gisAxios.post(gisEndpoints.logout);
};

export { gisLoginService, gisRegisterService, gisGetMeService, gisLogoutService };
