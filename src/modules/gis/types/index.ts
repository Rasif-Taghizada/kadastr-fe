import type { GisUser } from '@/common/types';

export type ToolType = 'select' | 'merge' | 'cut' | 'edit' | 'selectByLocation' | 'drawPolygon' | 'drawLine' | 'drawPoint';

export interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

export interface GeoJSONFeatureProperties {
  id?: string;
  name?: string | null;
  color?: string;
  featureType?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface GeoJSONFeature {
  type: 'Feature';
  id?: string;
  geometry: GeoJSONGeometry;
  properties: GeoJSONFeatureProperties;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface GisFeatureInfo {
  id: string;
  name: string | null;
  color: string;
  featureType: string | null;
}

export interface MapViewRef {
  confirmMerge: (targetFeatureId: string) => void;
  setSelectedFeaturesColor: (color: string) => void;
  getSaveData: () => GeoJSONFeature[];
  deleteSelectedFeatures: () => void;
  getSelectedFeaturesInfo: () => GisFeatureInfo[];
  updateFeatureProperty: (id: string, props: Partial<GeoJSONFeatureProperties>) => void;
  exportGeoJSON: () => GeoJSONFeature[];
}

export interface MapViewProps {
  activeTool: ToolType;
  onSelectionChange: (count: number) => void;
  onCoordinateChange?: (coord: [number, number] | null) => void;
  onFeatureDrawn?: () => void;
}

export interface GisAuthState {
  user: GisUser | null;
  isAuthenticated: boolean;
}
