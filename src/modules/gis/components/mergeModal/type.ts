import type { GisFeatureInfo } from '@/modules/gis/types';

export interface MergeModalProps {
  open: boolean;
  features: GisFeatureInfo[];
  onConfirm: (targetFeatureId: string) => void;
  onCancel: () => void;
}
