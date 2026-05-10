import gisAxios from '@/common/libs/gisAxiosInstance';
import { gisEndpoints } from '@/common/libs/constants';
import type { GeoJSONFeatureCollection } from '@/modules/gis/types';

const getFeaturesService = async (): Promise<GeoJSONFeatureCollection> => {
  const response = await gisAxios.get(gisEndpoints.features);
  return response.data;
};

const saveFeaturesService = async (features: GeoJSONFeatureCollection['features']): Promise<void> => {
  await gisAxios.post(gisEndpoints.featuresSave, { features });
};

const uploadFeaturesService = async (features: GeoJSONFeatureCollection['features']): Promise<void> => {
  await gisAxios.post(gisEndpoints.featuresUpload, { features });
};

const deleteFeatureService = async (id: string): Promise<void> => {
  await gisAxios.delete(gisEndpoints.featureById(id));
};

const deleteFeaturesService = async (ids: string[]): Promise<void> => {
  await gisAxios.delete(gisEndpoints.featuresBatchDelete, { data: { ids } });
};

export {
  getFeaturesService,
  saveFeaturesService,
  uploadFeaturesService,
  deleteFeatureService,
  deleteFeaturesService,
};
